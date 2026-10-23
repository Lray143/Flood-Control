"""
server.py — FastAPI backend for the Flood Simulation
====================================================
Architecture:
  - city_builder.py generates static terrain, roads, buildings, and pipe network topology
  - SimulationSession encapsulates an independent, isolated physics sandbox per user
  - SessionManager dynamically manages sessions with adaptive CPU budget balancing
  - master_physics_loop() runs physics steps concurrently across available CPU cores
  - REST endpoints expose session-aware control + state to the Three.js frontend
"""
import asyncio
import threading
import gzip as _gzip
import time as _time
import json as _json
import os as _os
import numpy as np
from fastapi import FastAPI, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, RedirectResponse
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from typing import Optional

from src.engine.state import SimulationState
from src.engine.simulator import Simulator
from src.engine.underground import Node, Pipe
from src.utils.city_builder import build_procedural_city

app = FastAPI(title="Flood Simulation")
app.add_middleware(GZipMiddleware, minimum_size=1024)

# ═══════════════════════════════════════════════════════════════════════════════
#  1. WORLD DATA (SHARED READ-ONLY TOPOLOGY)
# ═══════════════════════════════════════════════════════════════════════════════
city_data = build_procedural_city(nx=690, ny=380, dx=5.0)
MAIN_BLOCKAGE_PIPE_ID = city_data["main_blockage_id"]
road_mask = np.array(city_data["road_mask"], dtype=bool)

# Snapshots configuration
MAX_SNAPSHOTS = 20
SNAPSHOT_INTERVAL = 30.0  # sim-seconds between snapshots

def _fmt_time(t: float) -> str:
    """Format simulation seconds as human-readable label."""
    if t < 3600:
        return f"{t:.0f} s"
    elif t < 86400:
        return f"{t/3600:.1f} hr"
    elif t < 86400 * 30:
        return f"{t/86400:.1f} days"
    elif t < 86400 * 365:
        return f"{t/86400/30:.1f} mo"
    else:
        return f"{t/86400/365:.2f} yr"


# ═══════════════════════════════════════════════════════════════════════════════
#  2. SIMULATION SESSION (ISOLATED SANDBOX PER USER)
# ═══════════════════════════════════════════════════════════════════════════════
class SimulationSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.lock = threading.Lock()

        # State initialization
        self.state = SimulationState(grid_shape=city_data["grid_shape"], dx=city_data["dx"])
        self.state.elevation = city_data["elevation"]
        self.state.rainfall_rate = 0.0

        # Deep clone nodes and pipes for complete user isolation
        self.state.nodes = {
            nid: Node(n.id, n.x, n.y, n.z_invert, n.is_outlet, n.area)
            for nid, n in city_data["nodes"].items()
        }
        self.state.pipes = [
            Pipe(p.id, p.node_in, p.node_out, diameter=p.diameter, roughness_n=p.roughness_n, length=p.length)
            for p in city_data["pipes"]
        ]
        self.state.inlet_mapping = city_data["inlet_mapping"]

        self.state.road_mask = road_mask
        self.state.roughness[road_mask] = 0.013
        self.state.roughness[~road_mask] = 0.040
        self.state.infiltration_rate[road_mask] = 0.0
        self.state.infiltration_rate[~road_mask] = 1.4e-6

        if city_data.get("border_mask") is not None:
            self.state.border_mask = np.array(city_data["border_mask"], dtype=bool)
            self.state.brgy_cell_count = int(np.sum(self.state.border_mask))
        else:
            self.state.brgy_cell_count = self.state.grid_shape[0] * self.state.grid_shape[1]

        self.state.zones = city_data.get("zones", [])
        self.state.zone_grid = city_data.get("zone_grid", None)
        self.state.zone_masks = {}
        for i, z in enumerate(self.state.zones):
            if self.state.zone_grid is not None:
                self.state.zone_masks[z["id"]] = (self.state.zone_grid == i)
            self.state.zone_peaks[z["id"]] = 0.0

        # Runtime controls
        self.simulator = Simulator(self.state, dt=1.0)
        self.is_running = False
        self.sim_speed = 1
        self.rain_stop_at: Optional[float] = None
        self.time_skip_running = False
        self.time_skip_progress = 0.0

        # Rewind snapshots
        self.snapshots = []
        self.last_snap_time = -9999.0

        # Mass balance accumulators
        self.mb_rain_total = 0.0
        self.mb_drain_total = 0.0
        self.reset_requested = False
        self.last_active_time = _time.monotonic()
        self.last_poll_time = _time.monotonic()   # Updated on every /api/state poll

        # Serialization & response caching
        self._zero_depth_flat = [0.0] * (self.state.grid_shape[0] * self.state.grid_shape[1])
        self.last_water_depth_time = -1.0
        self.last_water_depth_flat = None
        self.last_pipes_time = -1.0
        self.pipes_live_cache = None
        self.nodes_live_cache = None

        self.state_json_bytes: bytes = b""
        self.state_json_gz_bytes: bytes = b""
        self.state_json_sim_time: float = -2.0
        self.state_json_wall_time: float = 0.0

    def physics_step(self, wall_budget: float):
        """Execute calibrated sub-steps within the allocated wall-budget."""
        if not self.is_running or self.time_skip_running:
            return

        if self.reset_requested:
            self.do_reset()
            return

        # Auto-stop rain timer
        if self.rain_stop_at is not None and self.state.time >= self.rain_stop_at:
            self.state.rainfall_rate = 0.0
            self.rain_stop_at = None

        # Calibrated dt pacing
        if self.sim_speed >= 50:
            max_dt = 2.0; step_dt = 2.0
        elif self.sim_speed >= 25:
            max_dt = 1.0; step_dt = 1.0
        elif self.sim_speed >= 10:
            max_dt = 0.50; step_dt = 0.50
        elif self.sim_speed >= 5:
            max_dt = 0.25; step_dt = 0.25
        elif self.sim_speed >= 2:
            max_dt = 0.10; step_dt = 0.10
        else:
            max_dt = 0.05; step_dt = 0.05

        self.simulator.dt = step_dt
        tick_start = _time.perf_counter()
        mb_rain = mb_drain = 0.0
        n_cells = self.state.grid_shape[0] * self.state.grid_shape[1]
        active_cells = self.state.brgy_cell_count if getattr(self.state, "border_mask", None) is not None else n_cells
        area = self.state.dx ** 2

        steps_target = max(1, int(self.sim_speed * 0.05 / step_dt))
        steps_done = 0

        while (_time.perf_counter() - tick_start < wall_budget) and (steps_done < steps_target):
            if self.reset_requested:
                break
            with self.lock:
                vol_before = float(self.state.water_depth.sum()) * area + sum(n.volume for n in self.state.nodes.values())
                try:
                    self.simulator.step(max_stable_dt=max_dt)
                except Exception:
                    import traceback; traceback.print_exc()
                    break
                vol_after = float(self.state.water_depth.sum()) * area + sum(n.volume for n in self.state.nodes.values())

            rain_vol = self.state.rainfall_rate * area * active_cells * self.simulator.dt
            mb_rain += rain_vol
            mb_drain += max(0.0, vol_before - vol_after + rain_vol)
            steps_done += 1

            if self.sim_speed <= 50:
                break

        if not self.reset_requested:
            self.mb_rain_total += mb_rain
            self.mb_drain_total += mb_drain

        # Snapshot recording
        snap_step = max(SNAPSHOT_INTERVAL, self.sim_speed * 2.0)
        if self.state.time - self.last_snap_time >= snap_step:
            snap = {
                "time": round(self.state.time, 1),
                "label": _fmt_time(self.state.time),
                "depth": self.state.water_depth.copy(),
                "node_vols": {k: v.volume for k, v in self.state.nodes.items()},
                "rainfall": self.state.rainfall_rate,
                "rain_dur": self.state.rain_duration_sec,
                "zone_peaks": dict(self.state.zone_peaks),
                "mb_rain": self.mb_rain_total,
                "mb_drain": self.mb_drain_total,
            }
            self.snapshots.append(snap)
            if len(self.snapshots) > MAX_SNAPSHOTS:
                self.snapshots.pop(0)
            self.last_snap_time = self.state.time

    def do_reset(self):
        """Thread-safe reset of simulation physics state."""
        with self.lock:
            self.state.water_depth[:] = 0.0
            if hasattr(self.state, 'velocity_x'): self.state.velocity_x[:] = 0.0
            if hasattr(self.state, 'velocity_y'): self.state.velocity_y[:] = 0.0
            self.state.time = 0.0
            self.state.rainfall_rate = 0.0
            self.state.rain_duration_sec = 0.0
            self.is_running = False
            for z in self.state.zones: self.state.zone_peaks[z["id"]] = 0.0
            for node in self.state.nodes.values(): node.volume = 0.0
            for pipe in self.state.pipes: pipe.current_flow = 0.0
            self.mb_rain_total = 0.0
            self.mb_drain_total = 0.0
            self.rain_stop_at = None
            self.snapshots.clear()
            self.last_water_depth_time = -1.0
            self.last_water_depth_flat = None
            self.last_pipes_time = -1.0
            self.pipes_live_cache = None
            self.nodes_live_cache = None
            self.state_json_sim_time = -2.0
            self.state_json_bytes = b""
            self.state_json_gz_bytes = b""
            self.reset_requested = False

    def build_state_payload(self) -> dict:
        """Build telemetry and state dictionary for serialization."""
        with self.lock:
            depth = self.state.water_depth.copy()
            sim_time = self.state.time
            rain_sec = self.state.rain_duration_sec
            node_vols_total = sum(n.volume for n in self.state.nodes.values())

        now_wall = _time.monotonic()
        max_d = float(depth.max())
        total_vol = float(depth.sum()) * self.state.dx ** 2
        flooded_cells = int((depth > 0.04).sum())

        total_domain_vol = total_vol + node_vols_total
        expected_in = self.mb_rain_total - self.mb_drain_total
        norm_base = max(self.mb_rain_total, total_domain_vol, 1.0)
        mb_error = abs(total_domain_vol - expected_in) / norm_base * 100.0

        brgy_total = max(1, self.state.brgy_cell_count)
        if self.state.border_mask is not None:
            brgy_flooded_cells = int(((depth > 0.10) & self.state.border_mask).sum())
        else:
            brgy_flooded_cells = int((depth > 0.10).sum())
        brgy_flooded_pct = round((brgy_flooded_cells / brgy_total) * 100.0, 1)

        zones_stat = []
        flooded_zones_count = 0
        worst_zone_name = "None"
        worst_peak_depth = 0.0
        for z in self.state.zones:
            z_id = z["id"]
            mask = self.state.zone_masks.get(z_id)
            if mask is not None:
                z_depths = depth[mask]
                cur_max = float(z_depths.max()) if len(z_depths) > 0 else 0.0
                cur_mean = float(z_depths.mean()) if len(z_depths) > 0 else 0.0
                peak = max(self.state.zone_peaks.get(z_id, 0.0), cur_max)
                self.state.zone_peaks[z_id] = peak
                z_flood_count = int((z_depths > 0.10).sum())
                pct_flooded = round((z_flood_count / max(1, z["cell_count"])) * 100.0, 1)
            else:
                cur_max = cur_mean = peak = pct_flooded = 0.0

            if cur_max >= 0.80:   status, status_desc = "CRITICAL", "Waist to Overhead"
            elif cur_max >= 0.30: status, status_desc = "WARNING",  "Knee to Waist"
            elif cur_max >= 0.10: status, status_desc = "ALERT",    "Ankle Deep"
            else:                 status, status_desc = "NORMAL",   "Passable"

            if pct_flooded > 5.0 or cur_max >= 0.25: flooded_zones_count += 1
            if peak > worst_peak_depth:
                worst_peak_depth = peak; worst_zone_name = z["name"]

            zones_stat.append({
                "id": z_id, "name": z["name"], "type": z["type"],
                "color": z["color"], "center_x": z["center_x"], "center_y": z["center_y"],
                "bounds": z.get("bounds", []), "area_ha": z["area_ha"],
                "current_depth": round(cur_max, 2), "mean_depth": round(cur_mean, 2),
                "peak_depth": round(peak, 2), "pct_flooded": pct_flooded,
                "status": status, "status_desc": status_desc,
            })
        zones_stat_sorted = sorted(zones_stat, key=lambda x: (x["peak_depth"], x["pct_flooded"]), reverse=True)

        hrs = int(rain_sec // 3600)
        mins = int((rain_sec % 3600) // 60)
        rain_dur_label = f"{hrs}h {mins:02d}m" if hrs > 0 else f"{mins}m"

        # Water depth flat 1D cache
        if sim_time != self.last_water_depth_time or self.last_water_depth_flat is None:
            if max_d <= 0.01:
                self.last_water_depth_flat = self._zero_depth_flat
            else:
                self.last_water_depth_flat = np.where(depth > 0.01, np.round(depth, 2), 0.0).ravel().tolist()
            self.last_water_depth_time = sim_time

        # Pipes + nodes throttled cache
        if self.pipes_live_cache is None or (now_wall - self.last_pipes_time) >= 0.5:
            self.pipes_live_cache = [
                {"id": p.id, "blockage": round(p.blockage * 100, 1),
                 "flow": round(p.current_flow, 5), "diameter": round(p.diameter, 3)}
                for p in self.state.pipes
            ]
            self.nodes_live_cache = [
                {"id": n.id, "head": round(n.head, 3), "volume": round(n.volume, 4)}
                for n in self.state.nodes.values()
            ]
            self.last_pipes_time = now_wall

        return {
            "time":          round(sim_time, 2),
            "time_label":    _fmt_time(sim_time),
            "running":       self.is_running,
            "speed":         self.sim_speed,
            "water_depth":   self.last_water_depth_flat,
            "water_nx":      self.state.grid_shape[1],
            "water_ny":      self.state.grid_shape[0],
            "rainfall_mmhr": round(self.state.rainfall_rate * 1000 * 3600, 1),
            "rain_stops_at": self.rain_stop_at,
            "skip_progress": self.time_skip_progress if self.time_skip_running else None,
            "telemetry": {
                "max_depth":     round(max_d, 3),
                "total_vol_m3":  round(total_vol, 1),
                "flooded_cells": flooded_cells,
                "blockage":      round(self.state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage * 100, 1),
                "mb_error_pct":  round(mb_error, 2),
            },
            "sitrep": {
                "barangay_name":       "Barangay 168 (Deparo, Caloocan City)",
                "rain_duration_hours": round(self.state.rain_duration_sec / 3600.0, 2),
                "rain_duration_label": rain_dur_label,
                "is_raining":          self.state.rainfall_rate > 0.0,
                "brgy_flooded_pct":    brgy_flooded_pct,
                "brgy_flooded_cells":  brgy_flooded_cells,
                "flooded_zones_count": flooded_zones_count,
                "total_zones_count":   len(self.state.zones),
                "worst_zone":          worst_zone_name,
                "highest_peak_depth":  round(worst_peak_depth, 2),
                "zones":               zones_stat_sorted,
            },
            "pipes":     self.pipes_live_cache,
            "nodes":     self.nodes_live_cache,
            "snapshots": [{"time": s["time"], "label": s["label"]} for s in self.snapshots],
        }

    def get_state_response(self, accept_encoding: str) -> Response:
        """Return cached pre-compressed JSON response."""
        now_wall = _time.monotonic()
        if (self.state.time != self.state_json_sim_time or not self.state_json_bytes) and \
           ((now_wall - self.state_json_wall_time) >= 0.08 or not self.state_json_bytes):
            payload = self.build_state_payload()
            self.state_json_bytes = _json.dumps(payload).encode()
            self.state_json_gz_bytes = _gzip.compress(self.state_json_bytes, compresslevel=4)
            self.state_json_sim_time = self.state.time
            self.state_json_wall_time = now_wall

        if "gzip" in accept_encoding and self.state_json_gz_bytes:
            return Response(
                content=self.state_json_gz_bytes,
                media_type="application/json",
                headers={
                    "Content-Encoding": "gzip",
                    "X-Sim-Time": str(self.state_json_sim_time),
                },
            )
        return Response(
            content=self.state_json_bytes,
            media_type="application/json",
            headers={"X-Sim-Time": str(self.state_json_sim_time)},
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  3. SESSION MANAGER & DYNAMIC SCHEDULER
# ═══════════════════════════════════════════════════════════════════════════════
class SessionManager:
    def __init__(self):
        self.sessions: dict[str, SimulationSession] = {}
        self.lock = threading.Lock()

    def get_or_create(self, session_id: str = "default") -> SimulationSession:
        sid = str(session_id).strip() or "default"
        with self.lock:
            if sid not in self.sessions:
                # Capacity guard: preserve max 30 sessions in memory
                if len(self.sessions) >= 30:
                    candidates = [k for k in self.sessions if k != "default" and not self.sessions[k].is_running]
                    if not candidates:
                        candidates = [k for k in self.sessions if k != "default"]
                    if candidates:
                        oldest = min(candidates, key=lambda k: self.sessions[k].last_active_time)
                        del self.sessions[oldest]
                self.sessions[sid] = SimulationSession(sid)
            session = self.sessions[sid]
            session.last_active_time = _time.monotonic()
            return session

    def cleanup_idle(self, pause_timeout: float = 120.0, remove_timeout: float = 600.0):
        """
        Two-stage cleanup for abandoned sessions:
          Stage 1 — PAUSE:  If a running simulation has received no /api/state poll
                            for >2 minutes, auto-pause it. The client clearly left.
          Stage 2 — REMOVE: Delete any non-default session (paused or running) that
                            has been completely quiet for >10 minutes.
        """
        now = _time.monotonic()
        with self.lock:
            for sid, s in list(self.sessions.items()):
                if sid == "default":
                    continue
                quiet_secs = now - s.last_poll_time

                # Stage 1: Auto-pause ghost simulations
                if s.is_running and quiet_secs > pause_timeout:
                    s.is_running = False  # stop consuming CPU budget

                # Stage 2: Fully evict sessions that have been silent long enough
                if quiet_secs > remove_timeout:
                    del self.sessions[sid]


session_manager = SessionManager()
default_session = session_manager.get_or_create("default")

# Backward compatibility module-level references
state = default_session.state
simulator = default_session.simulator

def get_session(request: Request = None) -> SimulationSession:
    """Extract session from Request headers, cookies, query params or fallback to default."""
    if request is not None:
        sid = (
            request.headers.get("x-session-id")
            or request.cookies.get("session_id")
            or request.query_params.get("session_id")
        )
        if sid:
            return session_manager.get_or_create(sid)
    return default_session

def _build_state_payload(session: Optional[SimulationSession] = None) -> dict:
    """Direct helper for tests."""
    s = session or default_session
    return s.build_state_payload()


# ═══════════════════════════════════════════════════════════════════════════════
#  4. MASTER DYNAMIC PHYSICS LOOP
# ═══════════════════════════════════════════════════════════════════════════════
async def physics_loop():
    """
    Dynamic master loop:
      - 0 running sessions: 0% CPU consumption
      - 1 running session:  100% server budget (~40ms wall time per tick, 20 Hz)
      - N running sessions: adaptive CPU budgeting executed concurrently across cores
    """
    last_cleanup = _time.monotonic()
    while True:
        now = _time.monotonic()
        if now - last_cleanup > 30.0:
            session_manager.cleanup_idle()
            last_cleanup = now

        running_sessions = [
            s for s in list(session_manager.sessions.values())
            if s.is_running and not s.time_skip_running
        ]

        if not running_sessions:
            await asyncio.sleep(0.05)
            continue

        n_running = len(running_sessions)
        # Dynamically scale wall budget per session (max 45ms total server budget)
        per_session_budget = max(0.012, 0.045 / n_running)

        # Run concurrent sub-batches across CPU cores (Numba JIT releases the GIL)
        tasks = [asyncio.to_thread(s.physics_step, per_session_budget) for s in running_sessions]
        t0 = _time.perf_counter()
        await asyncio.gather(*tasks)
        batch_dur = _time.perf_counter() - t0

        sleep_sec = max(0.005, 0.050 - batch_dur)
        await asyncio.sleep(sleep_sec)


@app.on_event("startup")
async def startup():
    asyncio.create_task(physics_loop())


# ═══════════════════════════════════════════════════════════════════════════════
#  5. REST ENDPOINTS (SESSION AWARE & BACKWARDS COMPATIBLE)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Terrain (Loaded once by frontend, shared static geometry) ─────────────────
@app.get("/api/terrain")
def get_terrain():
    return {
        "shape":            list(city_data["grid_shape"]),
        "dx":               city_data["dx"],
        "elevation":        city_data["elevation"].tolist(),
        "road_mask":        city_data["road_mask"],
        "border_mask":      city_data.get("border_mask", None),
        "buildings":        city_data["buildings"],
        "trees":            city_data.get("trees", []),
        "nodes":            [{"id": n.id, "x": n.x, "y": n.y,
                              "z": n.z_invert, "is_outlet": n.is_outlet}
                             for n in city_data["nodes"].values()],
        "pipes":            [{"id": p.id, "in": p.node_in, "out": p.node_out,
                              "blockage": p.blockage, "diameter": p.diameter}
                             for p in city_data["pipes"]],
        "main_blockage_id": MAIN_BLOCKAGE_PIPE_ID,
        "zones":            city_data.get("zones", []),
        "zone_grid":        city_data["zone_grid"].tolist() if "zone_grid" in city_data and city_data["zone_grid"] is not None else None,
        "brgy_border":      city_data.get("brgy_border", []),
        "zone_borders":     city_data.get("zone_borders", []),
        "map_labels":       city_data.get("map_labels", []),
    }

# ── Network Summary ───────────────────────────────────────────────────────────
@app.get("/api/network")
def get_network(request: Request = None):
    session = get_session(request)
    return {
        "node_count": len(session.state.nodes),
        "pipe_count": len(session.state.pipes),
        "main_blockage_id": MAIN_BLOCKAGE_PIPE_ID,
        "nodes": [{"id": n.id, "x": n.x, "y": n.y, "z": round(n.z_invert, 2), "is_outlet": n.is_outlet}
                  for n in session.state.nodes.values()],
        "pipes": [{"id": p.id, "in": p.node_in, "out": p.node_out,
                   "diameter": p.diameter, "length": round(p.length, 1),
                   "blockage": round(p.blockage * 100, 1)}
                  for p in session.state.pipes],
    }

# ── Live State ────────────────────────────────────────────────────────────────
@app.get("/api/state")
def get_state(request: Request = None):
    session = get_session(request)
    session.last_poll_time = _time.monotonic()   # ← heartbeat: client is alive
    enc = request.headers.get("accept-encoding", "").lower() if request else ""
    return session.get_state_response(enc)

# ── Play / Pause ──────────────────────────────────────────────────────────────
@app.post("/api/control")
def control(request: Request = None):
    session = get_session(request)
    session.is_running = not session.is_running
    session.state_json_sim_time = -2.0
    return {"running": session.is_running}

# ── Speed ─────────────────────────────────────────────────────────────────────
class SpeedRequest(BaseModel):
    multiplier: int

@app.post("/api/speed")
def set_speed(req: SpeedRequest, request: Request = None):
    session = get_session(request)
    session.sim_speed = max(1, min(10000, req.multiplier))
    session.state_json_sim_time = -2.0
    return {"speed": session.sim_speed}

# ── Rainfall ──────────────────────────────────────────────────────────────────
class RainfallRequest(BaseModel):
    mm_per_hr: float
    duration_sim_hours: Optional[float] = None

@app.post("/api/rainfall")
def set_rainfall(req: RainfallRequest, request: Request = None):
    session = get_session(request)
    session.state.rainfall_rate = max(0.0, req.mm_per_hr) / 1_000 / 3600
    if req.duration_sim_hours is not None:
        session.rain_stop_at = session.state.time + req.duration_sim_hours * 3600
    else:
        session.rain_stop_at = None
    session.state_json_sim_time = -2.0
    return {"ok": True, "stops_at": session.rain_stop_at}

# ── Pipe Blockage ─────────────────────────────────────────────────────────────
class BlockageRequest(BaseModel):
    blockage: float

@app.post("/api/pipe/{pipe_id}/blockage")
def set_pipe_blockage(pipe_id: int, req: BlockageRequest, request: Request = None):
    session = get_session(request)
    for p in session.state.pipes:
        if p.id == pipe_id:
            p.blockage = max(0.0, min(1.0, req.blockage))
            session.state_json_sim_time = -2.0
            session.state_json_bytes = b""
            session.last_pipes_time = 0.0
            return {"ok": True}
    return {"error": "not found"}, 404

class BulkBlockageRequest(BaseModel):
    pipe_ids: list[int]
    blockage: float

@app.post("/api/pipes/bulk_blockage")
def set_bulk_blockage(req: BulkBlockageRequest, request: Request = None):
    session = get_session(request)
    block_val = max(0.0, min(1.0, req.blockage))
    updated = 0
    pipe_set = set(req.pipe_ids)
    for p in session.state.pipes:
        if p.id in pipe_set:
            p.blockage = block_val
            updated += 1
    session.state_json_sim_time = -2.0
    session.state_json_bytes = b""
    session.last_pipes_time = 0.0
    return {"ok": True, "updated": updated}

# ── Pipe Diameter ─────────────────────────────────────────────────────────────
class DiameterRequest(BaseModel):
    diameter: float

@app.post("/api/pipe/{pipe_id}/diameter")
def set_pipe_diameter(pipe_id: int, req: DiameterRequest, request: Request = None):
    session = get_session(request)
    for p in session.state.pipes:
        if p.id == pipe_id:
            p.set_diameter(max(0.1, min(5.0, req.diameter)))
            session.state_json_sim_time = -2.0
            session.state_json_bytes = b""
            session.last_pipes_time = 0.0
            return {"ok": True, "diameter": p.diameter}
    return {"error": "not found"}, 404

class BulkDiameterRequest(BaseModel):
    pipe_ids: list[int]
    diameter: float

@app.post("/api/pipes/bulk_diameter")
def set_bulk_diameter(req: BulkDiameterRequest, request: Request = None):
    session = get_session(request)
    diam_val = max(0.1, min(5.0, req.diameter))
    updated = 0
    pipe_set = set(req.pipe_ids)
    for p in session.state.pipes:
        if p.id in pipe_set:
            p.set_diameter(diam_val)
            updated += 1
    session.state_json_sim_time = -2.0
    session.state_json_bytes = b""
    session.last_pipes_time = 0.0
# ── Drainage / Pipe Presets ───────────────────────────────────────────────────
PIPE_PRESETS = {
    "optimal":  {"name": "Optimal (0% Blockage)", "blockage": 0.0},
    "minor":    {"name": "Minor Clog (25% Blockage)", "blockage": 0.25},
    "half":     {"name": "Half Clogged (50% Blockage)", "blockage": 0.50},
    "heavy":    {"name": "Heavy Clog (75% Blockage)", "blockage": 0.75},
    "total":    {"name": "Total Jam (100% Blockage)", "blockage": 1.00},
    "assorted": {"name": "Assorted (Mixed Blockages)", "blockage": None},
}

class PipePresetRequest(BaseModel):
    preset_id: str

@app.get("/api/pipes/presets")
def get_pipe_presets():
    return PIPE_PRESETS

@app.post("/api/pipes/preset")
def apply_pipe_preset(req: PipePresetRequest, request: Request = None):
    session = get_session(request)
    pid = req.preset_id.lower().strip()
    if pid not in PIPE_PRESETS:
        return {"error": f"Unknown preset: {pid}"}, 400

    with session.lock:
        if pid == "assorted":
            # Realistic urban drainage distribution based on pipe hierarchy:
            # - Main trunk lines (diameter >= 1.0m): mostly clear with light silt (10-25%)
            # - Secondary branch pipes (0.7m <= diam < 1.0m): moderate debris (35-60%)
            # - Local residential / curb pipes (diam < 0.7m): heavy trash/silt (65-95%)
            for p in session.state.pipes:
                seed_val = ((p.id * 9301 + 49297) % 233280) / 233280.0
                if p.diameter >= 1.0:
                    p.blockage = round(0.10 + seed_val * 0.15, 2)
                elif p.diameter >= 0.7:
                    p.blockage = round(0.35 + seed_val * 0.25, 2)
                else:
                    p.blockage = round(0.65 + seed_val * 0.30, 2)
        else:
            blk = PIPE_PRESETS[pid]["blockage"]
            for p in session.state.pipes:
                p.blockage = blk

        session.pipes_live_cache = None
        session.nodes_live_cache = None
        session.last_pipes_time = -1.0
        session.state_json_sim_time = -2.0
        session.state_json_wall_time = 0.0
        session.state_json_bytes = b""
        session.state_json_gz_bytes = b""

    return {"ok": True, "preset": pid}

# ── Scenario Presets ──────────────────────────────────────────────────────────
SCENARIO_PRESETS = {
    "light": {
        "name": "Light Rain",
        "rainfall_mm_hr": 2.5,
        "duration_sim_hours": 24.0,
        "description": "PAGASA Light Rain (<2.5 mm/hr). Intermittent light drizzle; green surface infiltration handles most runoff."
    },
    "moderate": {
        "name": "Moderate Rain",
        "rainfall_mm_hr": 5.0,
        "duration_sim_hours": 12.0,
        "description": "PAGASA Moderate Rain (2.5–7.5 mm/hr). Steady precipitation; minor street puddles form."
    },
    "heavy": {
        "name": "Heavy Rain",
        "rainfall_mm_hr": 30.0,
        "duration_sim_hours": 6.0,
        "description": "PAGASA Heavy / Torrential Warning (≥30 mm/hr, Red Warning threshold). Rapid runoff overwhelms infiltration."
    },
    "typhoon": {
        "name": "Typhoon",
        "rainfall_mm_hr": 55.0,
        "duration_sim_hours": 12.0,
        "description": "Typhoon (e.g., Ondoy/Ketsana sustained rate ~55 mm/hr). Heavy flooding across low-lying zones."
    },
    "super_typhoon": {
        "name": "Super Typhoon",
        "rainfall_mm_hr": 100.0,
        "duration_sim_hours": 12.0,
        "description": "Super Typhoon (e.g., Carina/Gaemi peak convective bands ~100 mm/hr). Critical inundation across low-lying zones."
    },
}
SCENARIO_PRESETS["s1"] = SCENARIO_PRESETS["heavy"]
SCENARIO_PRESETS["s2"] = SCENARIO_PRESETS["typhoon"]
SCENARIO_PRESETS["s3"] = SCENARIO_PRESETS["light"]
SCENARIO_PRESETS["typhone"] = SCENARIO_PRESETS["typhoon"]
SCENARIO_PRESETS["super_typhone"] = SCENARIO_PRESETS["super_typhoon"]

class ScenarioRequest(BaseModel):
    scenario_id: Optional[str] = None
    rainfall_mm_hr: Optional[float] = None
    duration_sim_hours: Optional[float] = None
    pipe_blockage_pct: Optional[float] = None
    reset_first: bool = True

@app.get("/api/scenarios")
def get_scenarios():
    return {
        k: v for k, v in SCENARIO_PRESETS.items()
        if k not in ("s1", "s2", "s3", "typhone", "super_typhone")
    }

@app.post("/api/scenario")
def apply_scenario(req: ScenarioRequest, request: Request = None):
    session = get_session(request)
    preset = SCENARIO_PRESETS.get(req.scenario_id, {}) if req.scenario_id else {}
    rainfall_mm_hr = req.rainfall_mm_hr if req.rainfall_mm_hr is not None else preset.get("rainfall_mm_hr", 100.0)
    duration_sim_hours = req.duration_sim_hours if req.duration_sim_hours is not None else preset.get("duration_sim_hours", 6.0)

    if req.reset_first:
        session.do_reset()
        session.rain_stop_at = duration_sim_hours * 3600
    else:
        session.rain_stop_at = session.state.time + duration_sim_hours * 3600

    session.state.rainfall_rate = rainfall_mm_hr / 1_000 / 3600
    session.state_json_sim_time = -2.0
    session.state_json_bytes = b""
    session.state_json_gz_bytes = b""
    return {
        "ok": True,
        "rainfall_mm_hr": rainfall_mm_hr,
        "duration_sim_hours": duration_sim_hours
    }



# ── Time Skip ─────────────────────────────────────────────────────────────────
@app.post("/api/timeskip/cancel")
def cancel_timeskip(request: Request = None):
    session = get_session(request)
    session.time_skip_running = False
    session.time_skip_progress = 0.0
    return {"ok": True}

class SkipRequest(BaseModel):
    target_sim_seconds: float

@app.post("/api/timeskip")
def time_skip(req: SkipRequest, request: Request = None):
    session = get_session(request)
    if session.time_skip_running:
        return {"error": "already running skip"}, 409

    target = float(req.target_sim_seconds)

    def _run(s: SimulationSession, tgt: float):
        s.time_skip_running = True
        start = s.state.time
        span = max(tgt - start, 0.1)
        local_sim = Simulator(s.state, dt=30.0)

        while s.state.time < tgt and s.time_skip_running:
            if s.state.time < start:
                break
            for _ in range(500):
                if s.state.time >= tgt or not s.time_skip_running:
                    break
                local_sim.step()
            s.time_skip_progress = min((s.state.time - start) / span, 1.0)

        s.time_skip_running = False
        s.time_skip_progress = 0.0

    threading.Thread(target=_run, args=(session, target), daemon=True).start()
    return {"ok": True, "target": target}

# ── Rewind ────────────────────────────────────────────────────────────────────
class RewindRequest(BaseModel):
    time: float

@app.post("/api/rewind")
def rewind(req: RewindRequest, request: Request = None):
    session = get_session(request)
    best = None
    for s in session.snapshots:
        if s["time"] <= req.time:
            best = s
    if best is None:
        return {"error": "no snapshot available at or before that time"}, 404

    session.is_running = False  # Pause immediately so concurrent physics steps halt
    with session.lock:
        session.state.water_depth[:] = best["depth"]
        session.state.time = best["time"]
        session.state.rainfall_rate = best.get("rainfall", session.state.rainfall_rate)
        session.state.rain_duration_sec = best.get("rain_dur", 0.0)
        session.mb_rain_total = best.get("mb_rain", 0.0)
        session.mb_drain_total = best.get("mb_drain", 0.0)
        if hasattr(session.state, 'velocity_x'):
            session.state.velocity_x[:] = 0.0
        if hasattr(session.state, 'velocity_y'):
            session.state.velocity_y[:] = 0.0
        if "zone_peaks" in best:
            session.state.zone_peaks = dict(best["zone_peaks"])
        for nid, vol in best["node_vols"].items():
            int_id = int(nid)
            if int_id in session.state.nodes:
                session.state.nodes[int_id].volume = vol

        session.last_water_depth_time = -1.0
        session.last_water_depth_flat = None
        session.last_pipes_time = 0.0
        session.pipes_live_cache = None
        session.nodes_live_cache = None
        session.state_json_sim_time = -2.0
        session.state_json_bytes = b""
        session.state_json_gz_bytes = b""
        session.last_snap_time = best["time"]

    return {"ok": True, "restored_to": best["time"], "label": best["label"]}

# ── Reset ─────────────────────────────────────────────────────────────────────
@app.post("/api/reset")
def reset(request: Request = None):
    session = get_session(request)
    session.do_reset()
    return {"ok": True}

# ── Static Files & Routing ─────────────────────────────────────────────────────
@app.get("/static/index.html")
@app.get("/static")
@app.get("/static/")
@app.get("/index.html")
def redirect_to_landing():
    """Ensure any direct index.html or root static requests always route to landing page first."""
    return RedirectResponse(url="/", status_code=307)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/landing", StaticFiles(directory="landing"), name="landing")

@app.get("/")
def root():
    """1-page non-scrollable landing page with direct route to simulation."""
    return FileResponse("landing/index.html")

@app.get("/simulation")
@app.get("/sim")
def simulation_view():
    """Main 3D WebGL Hydrodynamic Digital Twin simulation system."""
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    import webbrowser
    import threading
    import time

    def _open_landing():
        time.sleep(1.2)
        webbrowser.open("http://localhost:8000/")

    if _os.environ.get("NO_BROWSER", "").lower() not in ("1", "true"):
        threading.Thread(target=_open_landing, daemon=True).start()

    uvicorn.run("src.server:app", host="0.0.0.0", port=8000, reload=False)
