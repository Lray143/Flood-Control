"""
server.py — FastAPI backend for the Flood Control Simulation
============================================================
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
import numpy as np
from fastapi import FastAPI, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from src.engine.state     import SimulationState
from src.engine.simulator import Simulator
from src.utils.city_builder import build_procedural_city

app = FastAPI(title="Flood Control Simulation")

# ═══════════════════════════════════════════════════════════════════════════════
#  1. WORLD SETUP
# ═══════════════════════════════════════════════════════════════════════════════
city_data = build_procedural_city(nx=660, ny=360, dx=5.0)

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
state.infiltration_rate[~road_mask]  = 4e-6    # ~15 mm/hr

# Wire boundary mask from GeoJSON (if loaded)
if city_data.get("border_mask") is not None:
    state.border_mask = np.array(city_data["border_mask"], dtype=bool)

MAIN_BLOCKAGE_PIPE_ID = city_data["main_blockage_id"]

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

def _physics_batch() -> dict:
    """
    Synchronous physics batch. Runs in a thread-pool worker.
    """
    # Dynamic stability threshold for TRUE fast-forward speed
    if sim_speed >= 10000:
        max_dt = 10.0
    elif sim_speed >= 1000:
        max_dt = 5.0
    elif sim_speed >= 100:
        max_dt = 2.0
    else:
        max_dt = 0.5
        
    simulator.dt = 1.0   # 1s logical chunks for wall_budget checking

    wall_budget = 0.15          # seconds of real time we're allowed to use
    tick_start  = _time.perf_counter()
    mb_rain = mb_drain = 0.0
    n_cells = state.grid_shape[0] * state.grid_shape[1]
    area    = state.dx ** 2

    while _time.perf_counter() - tick_start < wall_budget:
        if reset_requested:
            break
            
        vol_before = float(state.water_depth.sum()) * area
        try:
            simulator.step(max_stable_dt=max_dt)
        except Exception:
            import traceback; traceback.print_exc()
            break
        vol_after  = float(state.water_depth.sum()) * area
        rain_vol   = state.rainfall_rate * area * n_cells * simulator.dt
        mb_rain   += rain_vol
        mb_drain  += max(0.0, vol_before - vol_after + rain_vol)

        if sim_speed < 25:      # at low speed, one step per tick is fine
            break

    return {"mb_rain": mb_rain, "mb_drain": mb_drain}


async def physics_loop():
    global is_running, sim_speed, rain_stop_at
    global snapshots, _last_snap_time
    global mb_rain_total, mb_drain_total, reset_requested

    while True:
        if reset_requested:
            state.water_depth[:] = 0.0
            state.time = 0.0
            for node in state.nodes.values(): node.volume = 0.0
            for pipe in state.pipes: pipe.current_flow = 0.0
            mb_rain_total = 0.0; mb_drain_total = 0.0
            snapshots.clear()
            reset_requested = False
            
        if is_running and not time_skip_running:
            # auto-stop rain
            if rain_stop_at is not None and state.time >= rain_stop_at:
                state.rainfall_rate = 0.0
                rain_stop_at = None

            # run physics in thread (Numba releases GIL → true parallelism)
            result = await asyncio.to_thread(_physics_batch)
            if not reset_requested:
                mb_rain_total  += result["mb_rain"]
                mb_drain_total += result["mb_drain"]

            # snapshot
            if state.time - _last_snap_time >= SNAPSHOT_INTERVAL:
                snap = {
                    "time":      round(state.time, 1),
                    "label":     _fmt_time(state.time),
                    "depth":     state.water_depth.copy(),
                    "node_vols": {k: v.volume for k, v in state.nodes.items()},
                    "rainfall":  state.rainfall_rate,
                    "mb_rain":   mb_rain_total,
                    "mb_drain":  mb_drain_total,
                }
                snapshots.append(snap)
                if len(snapshots) > MAX_SNAPSHOTS:
                    snapshots.pop(0)
                _last_snap_time = state.time
        else:
            await asyncio.sleep(0.02)

        # yield briefly so HTTP handlers can respond between batches
        await asyncio.sleep(0)



        # Sleep short at high speed so we get called ~200x/sec; longer at low speed
        await asyncio.sleep(0.005 if sim_speed >= 25 else 0.02)


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
        "nodes":            [{"id": n.id, "x": n.x, "y": n.y,
                              "z": n.z_invert, "is_outlet": n.is_outlet}
                             for n in state.nodes.values()],
        "pipes":            [{"id": p.id, "in": p.node_in, "out": p.node_out,
                              "blockage": p.blockage, "diameter": p.diameter}
                             for p in state.pipes],
        "main_blockage_id": MAIN_BLOCKAGE_PIPE_ID,
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


@app.get("/api/state")
def get_state():
    depth = state.water_depth
    max_d = float(depth.max())
    total_vol = float(depth.sum()) * state.dx ** 2
    flooded_cells = int((depth > 0.04).sum())

    # Mass-balance error
    expected_in_system = mb_rain_total - mb_drain_total
    mb_error = abs(total_vol - expected_in_system) / max(expected_in_system, 1e-9) * 100.0

    # Per-pipe live state (blockage + flow) — used by frontend pipe inspector
    pipes_live = [
        {
            "id":       p.id,
            "blockage": round(p.blockage * 100, 1),
            "flow":     round(p.current_flow, 5),
            "diameter": round(p.diameter, 3),
        }
        for p in state.pipes
    ]

    # Per-node live state (head + volume)
    nodes_live = [
        {
            "id":     n.id,
            "head":   round(n.head, 3),
            "volume": round(n.volume, 4),
        }
        for n in state.nodes.values()
    ]

    return {
        "time":           round(state.time, 2),
        "time_label":     _fmt_time(state.time),
        "running":        is_running,
        "speed":          sim_speed,
        "water_depth":    np.where(depth > 0.04, depth, 0.0).tolist(),
        "rainfall_mmhr":  round(state.rainfall_rate * 1000 * 3600, 1),
        "rain_stops_at":  rain_stop_at,
        "skip_progress":  time_skip_progress if time_skip_running else None,
        "telemetry": {
            "max_depth":    round(max_d, 3),
            "total_vol_m3": round(total_vol, 1),
            "flooded_cells": flooded_cells,
            "blockage":     round(state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage * 100, 1),
            "mb_error_pct": round(mb_error, 2),
        },
        "pipes":          pipes_live,
        "nodes":          nodes_live,
        "snapshots":      [{"time": s["time"], "label": s["label"]} for s in snapshots],
    }

# ── Play / Pause ──────────────────────────────────────────────────────────────
@app.post("/api/control")
def control():
    global is_running
    is_running = not is_running
    return {"running": is_running}

# ── Speed ─────────────────────────────────────────────────────────────────────
class SpeedRequest(BaseModel):
    multiplier: int   # sim-seconds per real tick × 20 ticks/s = sim-speed

@app.post("/api/speed")
def set_speed(req: SpeedRequest):
    global sim_speed
    sim_speed = max(1, min(10000, req.multiplier))
    return {"speed": sim_speed}

# ── Rainfall ──────────────────────────────────────────────────────────────────
class RainfallRequest(BaseModel):
    mm_per_hr:           float
    duration_sim_hours:  Optional[float] = None   # None = rain indefinitely

@app.post("/api/rainfall")
def set_rainfall(req: RainfallRequest):
    global rain_stop_at
    state.rainfall_rate = max(0.0, req.mm_per_hr) / 1_000 / 3600
    if req.duration_sim_hours is not None:
        rain_stop_at = state.time + req.duration_sim_hours * 3600
    else:
        rain_stop_at = None
    return {"ok": True, "stops_at": rain_stop_at}

# ── Pipe Blockage ─────────────────────────────────────────────────────────────
class BlockageRequest(BaseModel):
    blockage: float   # 0.0 – 1.0

@app.post("/api/pipe/{pipe_id}/blockage")
def set_pipe_blockage(pipe_id: int, req: BlockageRequest):
    for p in state.pipes:
        if p.id == pipe_id:
            p.blockage = max(0.0, min(1.0, req.blockage))
            return {"ok": True}
    return {"error": "not found"}, 404

class BulkBlockageRequest(BaseModel):
    pipe_ids: list[int]
    blockage: float

@app.post("/api/pipes/bulk_blockage")
def set_bulk_blockage(req: BulkBlockageRequest):
    block_val = max(0.0, min(1.0, req.blockage))
    updated = 0
    pipe_set = set(req.pipe_ids)
    for p in state.pipes:
        if p.id in pipe_set:
            p.blockage = block_val
            updated += 1
    return {"ok": True, "updated": updated}

# ── Configure Scenario ────────────────────────────────────────────────────────
class ScenarioRequest(BaseModel):
    rainfall_mm_hr:       float   = 100.0
    duration_sim_hours:   float   = 6.0
    pipe_blockage_pct:    float   = 95.0    # applied to main blockage pipe
    reset_first:          bool    = True

@app.post("/api/scenario")
def apply_scenario(req: ScenarioRequest):
    global rain_stop_at, reset_requested
    if req.reset_first:
        reset_requested = True

    state.rainfall_rate = req.rainfall_mm_hr / 1_000 / 3600
    rain_stop_at = state.time + req.duration_sim_hours * 3600
    state.pipes[MAIN_BLOCKAGE_PIPE_ID].blockage = req.pipe_blockage_pct / 100
    return {"ok": True}

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
    for nid, vol in best["node_vols"].items():
        int_id = int(nid)           # JSON turns int keys → strings; convert back
        if int_id in state.nodes:
            state.nodes[int_id].volume = vol
    # Pause so user can inspect the restored state
    global is_running
    is_running = False
    return {"ok": True, "restored_to": best["time"], "label": best["label"]}

# ── Reset ─────────────────────────────────────────────────────────────────────
@app.post("/api/reset")
def reset():
    global rain_stop_at, mb_rain_total, mb_drain_total
    state.water_depth[:] = 0.0
    if hasattr(state, 'velocity_x'): state.velocity_x[:] = 0.0
    if hasattr(state, 'velocity_y'): state.velocity_y[:] = 0.0
    state.time           = 0.0
    state.rainfall_rate  = 0.0
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
