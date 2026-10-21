"""
server.py — FastAPI backend for the Flood Simulation
====================================================
Architecture:
  - city_builder.py generates the terrain, roads, buildings, and pipe network
  - SimulationState holds all physics grids
  - physics_loop() runs in an asyncio background task at ~20 Hz
  - REST endpoints expose control + state to the Three.js frontend

Time System:
  sim_speed = N  means N seconds of simulation time advance per real 0.05 s tick
  Examples:
    sim_speed =      1  →  1 sim-sec / real-sec  (real-time)
    sim_speed =   3600  →  1 sim-hour / real-sec
    sim_speed =  86400  →  1 sim-day  / real-sec
  For very large skips, POST /api/timeskip runs offline (blocks briefly, reports %).
"""
import asyncio
import threading
import time as _time
import json as _json
import numpy as np
from fastapi import FastAPI, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from typing import Optional

from src.engine.state     import SimulationState
from src.engine.simulator import Simulator
from src.utils.city_builder import build_procedural_city

app = FastAPI(title="Flood Simulation")

# ═══════════════════════════════════════════════════════════════════════════════
#  1. WORLD SETUP
# ═══════════════════════════════════════════════════════════════════════════════
city_data = build_procedural_city(nx=690, ny=380, dx=5.0)

state = SimulationState(grid_shape=city_data["grid_shape"], dx=city_data["dx"])
state.elevation       = city_data["elevation"]
state.rainfall_rate   = 0.0         # start dry; UI sets rainfall
state.nodes           = city_data["nodes"]
state.pipes           = city_data["pipes"]
state.inlet_mapping   = city_data["inlet_mapping"]

road_mask = np.array(city_data["road_mask"], dtype=bool)
state.road_mask                      = road_mask
state.roughness[road_mask]           = 0.013   # asphalt
state.roughness[~road_mask]          = 0.040   # grass
state.infiltration_rate[road_mask]   = 0.0
state.infiltration_rate[~road_mask]  = 1.4e-6   # ~5 mm/hr — dense urban soil (compacted, concrete surrounds)

# Wire boundary mask from GeoJSON (if loaded)
if city_data.get("border_mask") is not None:
    state.border_mask = np.array(city_data["border_mask"], dtype=bool)
    state.brgy_cell_count = int(np.sum(state.border_mask))
else:
    state.brgy_cell_count = state.grid_shape[0] * state.grid_shape[1]

state.zones = city_data.get("zones", [])
state.zone_grid = city_data.get("zone_grid", None)
state.zone_masks = {}
for i, z in enumerate(state.zones):
    if state.zone_grid is not None:
        state.zone_masks[z["id"]] = (state.zone_grid == i)
    state.zone_peaks[z["id"]] = 0.0

MAIN_BLOCKAGE_PIPE_ID = city_data["main_blockage_id"]
_zero_depth_flat = [0.0] * (state.grid_shape[0] * state.grid_shape[1])
_last_water_depth_time = -1.0
_last_water_depth_flat = None
_last_pipes_time = -1.0
_pipes_live_cache = None
_nodes_live_cache = None

# Full /api/state JSON response cache — avoids re-encoding 1.3 MB every 50ms
_state_json_bytes: bytes = b""
_state_json_sim_time: float = -2.0   # sim time when cache was built
_state_json_wall_time: float = 0.0   # wall time when cache was built

# ═══════════════════════════════════════════════════════════════════════════════
#  2. SIMULATION LOOP STATE
# ═══════════════════════════════════════════════════════════════════════════════
simulator         = Simulator(state, dt=1.0)
is_running        = False
sim_speed         = 1              # sim-seconds advanced per real tick
rain_stop_at      = None           # sim time to auto-stop rain (None = no auto-stop)
time_skip_running = False          # True while an offline skip is in progress
time_skip_progress = 0.0           # 0.0 – 1.0

# Snapshots for rewind (stored every SNAPSHOT_INTERVAL sim-seconds)
MAX_SNAPSHOTS      = 20
SNAPSHOT_INTERVAL  = 30.0          # sim-seconds between snapshots (≈ 30 s real events)
snapshots: list    = []
_last_snap_time    = -9999.0

# Mass-balance accumulators (m³)
mb_rain_total     = 0.0
mb_drain_total    = 0.0

import time as _time

# Thread-safe reset flag
reset_requested = False
state_lock = threading.Lock()

def _physics_batch() -> dict:
    """
    Synchronous physics batch. Runs in a thread-pool worker.
    Maintains CFL numerical stability at any speed setting by capping max_dt <= 1.0s
    and executing multiple stable sub-steps within the allocated wall-time budget.
    """
    # Calibrated dt pacing maintains stability while delivering true physical speed acceleration
    if sim_speed >= 50:
        max_dt = 2.0
        step_dt = 2.0
        wall_budget = 0.16
    elif sim_speed >= 25:
        max_dt = 1.0
        step_dt = 1.0
        wall_budget = 0.12
    elif sim_speed >= 10:
        max_dt = 0.50
        step_dt = 0.50
        wall_budget = 0.08
    elif sim_speed >= 5:
        max_dt = 0.25
        step_dt = 0.25
        wall_budget = 0.06
    elif sim_speed >= 2:
        max_dt = 0.10
        step_dt = 0.10
        wall_budget = 0.05
    else:
        max_dt = 0.05
        step_dt = 0.05
        wall_budget = 0.04

    simulator.dt = step_dt
    tick_start  = _time.perf_counter()
    mb_rain = mb_drain = 0.0
    n_cells = state.grid_shape[0] * state.grid_shape[1]
    active_cells = state.brgy_cell_count if getattr(state, "border_mask", None) is not None else n_cells
    area    = state.dx ** 2

    steps_target = max(1, int(sim_speed * 0.05 / step_dt))
    steps_done = 0

    while (_time.perf_counter() - tick_start < wall_budget) and (steps_done < steps_target):
        if reset_requested:
            break
            
        with state_lock:
            vol_before = float(state.water_depth.sum()) * area + sum(n.volume for n in state.nodes.values())
            try:
                simulator.step(max_stable_dt=max_dt)
            except Exception:
                import traceback; traceback.print_exc()
                break
            vol_after  = float(state.water_depth.sum()) * area + sum(n.volume for n in state.nodes.values())

        rain_vol   = state.rainfall_rate * area * active_cells * simulator.dt
        mb_rain   += rain_vol
        mb_drain  += max(0.0, vol_before - vol_after + rain_vol)
        steps_done += 1

        if sim_speed <= 50:     # maintain true calibrated real-time pacing
            break

    return {"mb_rain": mb_rain, "mb_drain": mb_drain}


async def physics_loop():
    global is_running, sim_speed, rain_stop_at
    global snapshots, _last_snap_time
    global mb_rain_total, mb_drain_total, reset_requested
    global _last_water_depth_time, _last_water_depth_flat, _state_json_sim_time, _state_json_bytes

    while True:
        if reset_requested:
            state.water_depth[:] = 0.0
            state.time = 0.0
            state.rain_duration_sec = 0.0
            for z in state.zones: state.zone_peaks[z["id"]] = 0.0
            for node in state.nodes.values(): node.volume = 0.0
            for pipe in state.pipes: pipe.current_flow = 0.0
            mb_rain_total = 0.0; mb_drain_total = 0.0
            snapshots.clear()
            _last_water_depth_time = -1.0  # invalidate depth cache
            _last_water_depth_flat = None
            _state_json_sim_time   = -2.0  # invalidate full JSON cache
            _state_json_bytes      = None
            reset_requested = False
            
        batch_dur = 0.0
        if is_running and not time_skip_running:
            # auto-stop rain
            if rain_stop_at is not None and state.time >= rain_stop_at:
                state.rainfall_rate = 0.0
                rain_stop_at = None

            # run physics in thread (Numba releases GIL → true parallelism)
            t_batch_start = _time.perf_counter()
            result = await asyncio.to_thread(_physics_batch)
            batch_dur = _time.perf_counter() - t_batch_start
            if not reset_requested:
                mb_rain_total  += result["mb_rain"]
                mb_drain_total += result["mb_drain"]

            # snapshot (scaled by sim_speed so we take ~1 snapshot per 2 real seconds at high speed)
            snap_step = max(SNAPSHOT_INTERVAL, sim_speed * 2.0)
            if state.time - _last_snap_time >= snap_step:
                snap = {
                    "time":       round(state.time, 1),
                    "label":      _fmt_time(state.time),
                    "depth":      state.water_depth.copy(),
                    "node_vols":  {k: v.volume for k, v in state.nodes.items()},
                    "rainfall":   state.rainfall_rate,
                    "rain_dur":   state.rain_duration_sec,
                    "zone_peaks": dict(state.zone_peaks),
                    "mb_rain":    mb_rain_total,
                    "mb_drain":   mb_drain_total,
                }
                snapshots.append(snap)
                if len(snapshots) > MAX_SNAPSHOTS:
                    snapshots.pop(0)
                _last_snap_time = state.time
        else:
            await asyncio.sleep(0.02)

        # yield briefly so HTTP handlers can respond between batches
        await asyncio.sleep(0)

        # Precise pacing for 1x, 5x, 25x (~20 Hz tick), minimal sleep for fast-forward
        if is_running and not time_skip_running:
            if sim_speed <= 50:
                sleep_sec = max(0.002, 0.050 - batch_dur)
            else:
                sleep_sec = 0.005
            await asyncio.sleep(sleep_sec)


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


@app.on_event("startup")
async def startup():
    asyncio.create_task(physics_loop())


# ═══════════════════════════════════════════════════════════════════════════════
#  4. REST ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ── Terrain (loaded once by the frontend) ────────────────────────────────────
@app.get("/api/terrain")
def get_terrain():
    return {
        "shape":            list(state.grid_shape),
        "dx":               state.dx,
        "elevation":        state.elevation.tolist(),
        "road_mask":        city_data["road_mask"],
        "border_mask":      city_data.get("border_mask", None),
        "buildings":        city_data["buildings"],
        "trees":            city_data.get("trees", []),
        "nodes":            [{"id": n.id, "x": n.x, "y": n.y,
                              "z": n.z_invert, "is_outlet": n.is_outlet}
                             for n in state.nodes.values()],
        "pipes":            [{"id": p.id, "in": p.node_in, "out": p.node_out,
                              "blockage": p.blockage, "diameter": p.diameter}
                             for p in state.pipes],
        "main_blockage_id": MAIN_BLOCKAGE_PIPE_ID,
        "zones":            city_data.get("zones", []),
        "zone_grid":        city_data["zone_grid"].tolist() if "zone_grid" in city_data and city_data["zone_grid"] is not None else None,
        "brgy_border":      city_data.get("brgy_border", []),
        "zone_borders":     city_data.get("zone_borders", []),
        "map_labels":       city_data.get("map_labels", []),
    }

# ── Network summary (lightweight — no grid data) ──────────────────────────────
@app.get("/api/network")
def get_network():
    return {
        "node_count": len(state.nodes),
        "pipe_count":  len(state.pipes),
        "main_blockage_id": MAIN_BLOCKAGE_PIPE_ID,
        "nodes": [{"id": n.id, "x": n.x, "y": n.y, "z": round(n.z_invert,2),
                   "is_outlet": n.is_outlet}
                  for n in state.nodes.values()],
        "pipes": [{"id": p.id, "in": p.node_in, "out": p.node_out,
                   "diameter": p.diameter, "length": round(p.length,1),
                   "blockage": round(p.blockage*100,1)}
                  for p in state.pipes],
    }


def _build_state_payload() -> dict:
    """Build the state dict. Called by the HTTP route (cached) and directly by tests."""
    global _last_water_depth_time, _last_water_depth_flat
    global _last_pipes_time, _pipes_live_cache, _nodes_live_cache

    with state_lock:
        depth    = state.water_depth.copy()
        sim_time = state.time
        rain_sec = state.rain_duration_sec
        node_vols_total = sum(n.volume for n in state.nodes.values())

    now_wall = _time.monotonic()

    max_d         = float(depth.max())
    total_vol     = float(depth.sum()) * state.dx ** 2
    flooded_cells = int((depth > 0.04).sum())

    total_domain_vol = total_vol + node_vols_total
    expected_in      = mb_rain_total - mb_drain_total
    norm_base        = max(mb_rain_total, total_domain_vol, 1.0)
    mb_error         = abs(total_domain_vol - expected_in) / norm_base * 100.0

    brgy_total = max(1, state.brgy_cell_count)
    if state.border_mask is not None:
        brgy_flooded_cells = int(((depth > 0.10) & state.border_mask).sum())
    else:
        brgy_flooded_cells = int((depth > 0.10).sum())
    brgy_flooded_pct = round((brgy_flooded_cells / brgy_total) * 100.0, 1)

    zones_stat = []
    flooded_zones_count = 0
    worst_zone_name  = "None"
    worst_peak_depth = 0.0
    for z in state.zones:
        z_id = z["id"]
        mask = state.zone_masks.get(z_id)
        if mask is not None:
            z_depths  = depth[mask]
            cur_max   = float(z_depths.max())  if len(z_depths) > 0 else 0.0
            cur_mean  = float(z_depths.mean()) if len(z_depths) > 0 else 0.0
            peak      = max(state.zone_peaks.get(z_id, 0.0), cur_max)
            state.zone_peaks[z_id] = peak
            z_flood_count = int((z_depths > 0.10).sum())
            pct_flooded = round((z_flood_count / max(1, z["cell_count"])) * 100.0, 1)
        else:
            cur_max = cur_mean = peak = pct_flooded = 0.0
        # Status badge reflects CURRENT flood severity (not historical peak).
        # Peak depth is still tracked historically and shown in the Peak column.
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

    hrs  = int(rain_sec // 3600)
    mins = int((rain_sec % 3600) // 60)
    rain_dur_label = f"{hrs}h {mins:02d}m" if hrs > 0 else f"{mins}m"

    # Water depth flat 1D (cached per sim tick)
    if sim_time != _last_water_depth_time or _last_water_depth_flat is None:
        if max_d <= 0.01:
            _last_water_depth_flat = _zero_depth_flat
        else:
            _last_water_depth_flat = np.where(depth > 0.01, np.round(depth, 2), 0.0).ravel().tolist()
        _last_water_depth_time = sim_time

    # Pipes + nodes throttled to 2 Hz
    if _pipes_live_cache is None or (now_wall - _last_pipes_time) >= 0.5:
        _pipes_live_cache = [
            {"id": p.id, "blockage": round(p.blockage * 100, 1),
             "flow": round(p.current_flow, 5), "diameter": round(p.diameter, 3)}
            for p in state.pipes
        ]
        _nodes_live_cache = [
            {"id": n.id, "head": round(n.head, 3), "volume": round(n.volume, 4)}
            for n in state.nodes.values()
        ]
        _last_pipes_time = now_wall

    return {
        "time":          round(sim_time, 2),
        "time_label":    _fmt_time(sim_time),
        "running":       is_running,
        "speed":         sim_speed,
        "water_depth":   _last_water_depth_flat,
        "water_nx":      state.grid_shape[1],
        "water_ny":      state.grid_shape[0],
        "rainfall_mmhr": round(state.rainfall_rate * 1000 * 3600, 1),
        "rain_stops_at": rain_stop_at,
        "skip_progress": time_skip_progress if time_skip_running else None,
        "telemetry": {
            "max_depth":     round(max_d, 3),
            "total_vol_m3":  round(total_vol, 1),
            "flooded_cells": flooded_cells,
            "blockage":      round(state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage * 100, 1),
            "mb_error_pct":  round(mb_error, 2),
        },
        "sitrep": {
            "barangay_name":       "Barangay 168 (Deparo, Caloocan City)",
            "rain_duration_hours": round(state.rain_duration_sec / 3600.0, 2),
            "rain_duration_label": rain_dur_label,
            "is_raining":          state.rainfall_rate > 0.0,
            "brgy_flooded_pct":    brgy_flooded_pct,
            "brgy_flooded_cells":  brgy_flooded_cells,
            "flooded_zones_count": flooded_zones_count,
            "total_zones_count":   len(state.zones),
            "worst_zone":          worst_zone_name,
            "highest_peak_depth":  round(worst_peak_depth, 2),
            "zones":               zones_stat_sorted,
        },
        "pipes":     _pipes_live_cache,
        "nodes":     _nodes_live_cache,
        "snapshots": [{"time": s["time"], "label": s["label"]} for s in snapshots],
    }


@app.get("/api/state")
def get_state():
    """HTTP route — returns pre-built JSON bytes when sim tick hasn't changed or <80ms elapsed."""
    global _state_json_bytes, _state_json_sim_time, _state_json_wall_time
    now_wall = _time.monotonic()
    if (state.time != _state_json_sim_time or _state_json_bytes is None) and ((now_wall - _state_json_wall_time) >= 0.08 or _state_json_bytes is None):
        payload = _build_state_payload()
        _state_json_bytes     = _json.dumps(payload).encode()
        _state_json_sim_time  = state.time
        _state_json_wall_time = now_wall
    return Response(
        content=_state_json_bytes,
        media_type="application/json",
        headers={"X-Sim-Time": str(_state_json_sim_time)},
    )


# ── Play / Pause ──────────────────────────────────────────────────────────────
@app.post("/api/control")
def control():
    global is_running, _state_json_sim_time
    is_running = not is_running
    _state_json_sim_time = -2.0   # force cache rebuild so running state is fresh
    return {"running": is_running}

# ── Speed ─────────────────────────────────────────────────────────────────────
class SpeedRequest(BaseModel):
    multiplier: int   # sim-seconds per real tick × 20 ticks/s = sim-speed

@app.post("/api/speed")
def set_speed(req: SpeedRequest):
    global sim_speed, _state_json_sim_time
    sim_speed = max(1, min(10000, req.multiplier))
    _state_json_sim_time = -2.0
    return {"speed": sim_speed}

# ── Rainfall ──────────────────────────────────────────────────────────────────
class RainfallRequest(BaseModel):
    mm_per_hr:           float
    duration_sim_hours:  Optional[float] = None   # None = rain indefinitely

@app.post("/api/rainfall")
def set_rainfall(req: RainfallRequest):
    global rain_stop_at, _state_json_sim_time
    state.rainfall_rate = max(0.0, req.mm_per_hr) / 1_000 / 3600
    if req.duration_sim_hours is not None:
        rain_stop_at = state.time + req.duration_sim_hours * 3600
    else:
        rain_stop_at = None
    _state_json_sim_time = -2.0
    return {"ok": True, "stops_at": rain_stop_at}

# ── Pipe Blockage ─────────────────────────────────────────────────────────────
class BlockageRequest(BaseModel):
    blockage: float   # 0.0 – 1.0

@app.post("/api/pipe/{pipe_id}/blockage")
def set_pipe_blockage(pipe_id: int, req: BlockageRequest):
    global _state_json_sim_time, _last_pipes_time, _state_json_bytes
    for p in state.pipes:
        if p.id == pipe_id:
            p.blockage = max(0.0, min(1.0, req.blockage))
            _state_json_sim_time = -2.0
            _state_json_bytes = None
            _last_pipes_time = 0.0
            return {"ok": True}
    return {"error": "not found"}, 404

class BulkBlockageRequest(BaseModel):
    pipe_ids: list[int]
    blockage: float

@app.post("/api/pipes/bulk_blockage")
def set_bulk_blockage(req: BulkBlockageRequest):
    global _state_json_sim_time, _last_pipes_time, _state_json_bytes
    block_val = max(0.0, min(1.0, req.blockage))
    updated = 0
    pipe_set = set(req.pipe_ids)
    for p in state.pipes:
        if p.id in pipe_set:
            p.blockage = block_val
            updated += 1
    _state_json_sim_time = -2.0
    _state_json_bytes = None
    _last_pipes_time = 0.0
    return {"ok": True, "updated": updated}

# ── Pipe Diameter ─────────────────────────────────────────────────────────────
class DiameterRequest(BaseModel):
    diameter: float   # metres (0.1 – 5.0)

@app.post("/api/pipe/{pipe_id}/diameter")
def set_pipe_diameter(pipe_id: int, req: DiameterRequest):
    global _state_json_sim_time, _last_pipes_time, _state_json_bytes
    for p in state.pipes:
        if p.id == pipe_id:
            p.set_diameter(max(0.1, min(5.0, req.diameter)))
            _state_json_sim_time = -2.0
            _state_json_bytes = None
            _last_pipes_time = 0.0
            return {"ok": True, "diameter": p.diameter}
    return {"error": "not found"}, 404

class BulkDiameterRequest(BaseModel):
    pipe_ids: list[int]
    diameter: float   # metres

@app.post("/api/pipes/bulk_diameter")
def set_bulk_diameter(req: BulkDiameterRequest):
    global _state_json_sim_time, _last_pipes_time, _state_json_bytes
    diam_val = max(0.1, min(5.0, req.diameter))
    updated = 0
    pipe_set = set(req.pipe_ids)
    for p in state.pipes:
        if p.id in pipe_set:
            p.set_diameter(diam_val)
            updated += 1
    _state_json_sim_time = -2.0
    _state_json_bytes = None
    _last_pipes_time = 0.0
    return {"ok": True, "updated": updated}

# ── Configure Scenario ────────────────────────────────────────────────────────
SCENARIO_PRESETS = {
    "light": {
        "name": "Light Rain",
        "rainfall_mm_hr": 2.5,
        "duration_sim_hours": 24.0,
        "pipe_blockage_pct": 20.0,
        "description": "PAGASA Light Rain (<2.5 mm/hr). Intermittent light drizzle; green surface infiltration handles most runoff."
    },
    "moderate": {
        "name": "Moderate Rain",
        "rainfall_mm_hr": 5.0,
        "duration_sim_hours": 12.0,
        "pipe_blockage_pct": 40.0,
        "description": "PAGASA Moderate Rain (2.5–7.5 mm/hr). Steady precipitation; minor street puddles form."
    },
    "heavy": {
        "name": "Heavy Rain",
        "rainfall_mm_hr": 30.0,
        "duration_sim_hours": 6.0,
        "pipe_blockage_pct": 65.0,
        "description": "PAGASA Heavy / Torrential Warning (≥30 mm/hr, Red Warning threshold). Rapid runoff overwhelms infiltration."
    },
    "typhoon": {
        "name": "Typhoon",
        "rainfall_mm_hr": 55.0,
        "duration_sim_hours": 12.0,
        "pipe_blockage_pct": 85.0,
        "description": "Typhoon (e.g., Ondoy/Ketsana sustained rate ~55 mm/hr). Heavy flooding in low-lying zones, choked pipes."
    },
    "super_typhoon": {
        "name": "Super Typhoon",
        "rainfall_mm_hr": 100.0,
        "duration_sim_hours": 12.0,
        "pipe_blockage_pct": 100.0,
        "description": "Super Typhoon (e.g., Carina/Gaemi peak convective bands ~100 mm/hr). Complete drain failure and critical inundation."
    },
}
# Aliases for backwards compatibility and spelling variations
SCENARIO_PRESETS["s1"] = SCENARIO_PRESETS["heavy"]
SCENARIO_PRESETS["s2"] = SCENARIO_PRESETS["typhoon"]
SCENARIO_PRESETS["s3"] = SCENARIO_PRESETS["light"]
SCENARIO_PRESETS["typhone"] = SCENARIO_PRESETS["typhoon"]
SCENARIO_PRESETS["super_typhone"] = SCENARIO_PRESETS["super_typhoon"]

class ScenarioRequest(BaseModel):
    scenario_id:          Optional[str]   = None
    rainfall_mm_hr:       Optional[float] = None
    duration_sim_hours:   Optional[float] = None
    pipe_blockage_pct:    Optional[float] = None    # applied to main blockage pipe
    reset_first:          bool            = True

@app.get("/api/scenarios")
def get_scenarios():
    return {
        k: v for k, v in SCENARIO_PRESETS.items()
        if k not in ("s1", "s2", "s3", "typhone", "super_typhone")
    }

@app.post("/api/scenario")
def apply_scenario(req: ScenarioRequest):
    global rain_stop_at, reset_requested, _state_json_sim_time, _state_json_bytes, _last_pipes_time, _last_water_depth_time, _last_water_depth_flat

    # Resolve preset defaults if scenario_id provided
    preset = SCENARIO_PRESETS.get(req.scenario_id, {}) if req.scenario_id else {}
    rainfall_mm_hr = req.rainfall_mm_hr if req.rainfall_mm_hr is not None else preset.get("rainfall_mm_hr", 100.0)
    duration_sim_hours = req.duration_sim_hours if req.duration_sim_hours is not None else preset.get("duration_sim_hours", 6.0)
    pipe_blockage_pct = req.pipe_blockage_pct if req.pipe_blockage_pct is not None else preset.get("pipe_blockage_pct", 95.0)

    if req.reset_first:
        reset_requested = True
        state.water_depth[:] = 0.0
        if hasattr(state, 'velocity_x'): state.velocity_x[:] = 0.0
        if hasattr(state, 'velocity_y'): state.velocity_y[:] = 0.0
        state.time = 0.0
        state.rain_duration_sec = 0.0
        for z in state.zones: state.zone_peaks[z["id"]] = 0.0
        for node in state.nodes.values(): node.volume = 0.0
        for pipe in state.pipes: pipe.current_flow = 0.0
        snapshots.clear()
        _last_water_depth_time = -1.0
        _last_water_depth_flat = None
        rain_stop_at = duration_sim_hours * 3600
    else:
        rain_stop_at = state.time + duration_sim_hours * 3600

    state.rainfall_rate = rainfall_mm_hr / 1_000 / 3600
    state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage = pipe_blockage_pct / 100
    _state_json_sim_time = -2.0
    _state_json_bytes = None
    _last_pipes_time = 0.0
    return {
        "ok": True,
        "rainfall_mm_hr": rainfall_mm_hr,
        "duration_sim_hours": duration_sim_hours,
        "pipe_blockage_pct": pipe_blockage_pct
    }

# ── Time Skip (offline fast-forward) ─────────────────────────────────────────
@app.post("/api/timeskip/cancel")
def cancel_timeskip():
    global time_skip_running, time_skip_progress
    time_skip_running = False
    time_skip_progress = 0.0
    return {"ok": True}

class SkipRequest(BaseModel):
    target_sim_seconds: float

@app.post("/api/timeskip")
def time_skip(req: SkipRequest):
    global time_skip_running, time_skip_progress
    if time_skip_running:
        return {"error": "already running skip"}, 409

    target = float(req.target_sim_seconds)

    def _run():
        global time_skip_running, time_skip_progress
        time_skip_running = True
        start = state.time
        span  = max(target - start, 0.1)
        # Use dt=30s per step — CFL sub-stepping inside handles stability.
        # This reduces a 1-day skip from 86,400 steps to 2,880 (30× faster).
        local_sim = Simulator(state, dt=30.0)
        
        while state.time < target and time_skip_running:
            if state.time < start:
                break
                
            for _ in range(500):   # process 500 steps per progress update
                if state.time >= target or not time_skip_running: break
                local_sim.step()
                
            time_skip_progress = min((state.time - start) / span, 1.0)
            
        time_skip_running   = False
        time_skip_progress  = 0.0

    import threading
    threading.Thread(target=_run, daemon=True).start()
    return {"ok": True, "target": target}

# ── Rewind to snapshot ────────────────────────────────────────────────────────
class RewindRequest(BaseModel):
    time: float

@app.post("/api/rewind")
def rewind(req: RewindRequest):
    # Find closest snapshot at or before requested time
    best = None
    for s in snapshots:
        if s["time"] <= req.time:
            best = s
    if best is None:
        return {"error": "no snapshot available at or before that time"}, 404

    state.water_depth[:] = best["depth"]
    state.time           = best["time"]
    state.rainfall_rate  = best.get("rainfall", state.rainfall_rate)
    state.rain_duration_sec = best.get("rain_dur", 0.0)
    if "zone_peaks" in best:
        state.zone_peaks = dict(best["zone_peaks"])
    for nid, vol in best["node_vols"].items():
        int_id = int(nid)           # JSON turns int keys → strings; convert back
        if int_id in state.nodes:
            state.nodes[int_id].volume = vol
    # Pause so user can inspect the restored state
    global is_running, _last_water_depth_time, _last_water_depth_flat, _state_json_sim_time
    _last_water_depth_time = -1.0
    _last_water_depth_flat = None
    _state_json_sim_time   = -2.0
    is_running = False
    return {"ok": True, "restored_to": best["time"], "label": best["label"]}

# ── Reset ─────────────────────────────────────────────────────────────────────
@app.post("/api/reset")
def reset():
    global rain_stop_at, mb_rain_total, mb_drain_total, _last_water_depth_time, _last_water_depth_flat, _state_json_sim_time, _state_json_bytes, _last_pipes_time
    _last_water_depth_time = -1.0
    _last_water_depth_flat = None
    _state_json_sim_time   = -2.0
    _state_json_bytes      = None
    _last_pipes_time       = 0.0
    state.water_depth[:] = 0.0
    if hasattr(state, 'velocity_x'): state.velocity_x[:] = 0.0
    if hasattr(state, 'velocity_y'): state.velocity_y[:] = 0.0
    state.time           = 0.0
    state.rainfall_rate  = 0.0
    state.rain_duration_sec = 0.0
    state.running        = False   # always pause on reset
    for z in state.zones: state.zone_peaks[z["id"]] = 0.0
    rain_stop_at         = None
    mb_rain_total        = 0.0
    mb_drain_total       = 0.0
    snapshots.clear()
    for node in state.nodes.values(): node.volume = 0.0
    for pipe in state.pipes:          pipe.current_flow = 0.0
    return {"ok": True}

# ── Static files + index ──────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.server:app", host="0.0.0.0", port=8000, reload=False)
