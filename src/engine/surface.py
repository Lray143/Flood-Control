"""
surface.py  —  Shallow Water Equations (diffusive wave approximation)
--------------------------------------------------------------------
Physics modelled:
  1. Rainfall accumulation
  2. Infiltration (Green–Ampt simplified — zero on roads)
  3. Diffusive-wave surface flow driven by water-surface slope
     (accounts for momentum via Manning's equation for friction)
  4. Drain inlet coupling (surface ↔ underground nodes)
  5. Surcharge backflow (underground ↔ surface when pipe is full)
"""
import numpy as np
from numba import njit, prange
from src.engine.state import SimulationState

# Gravity
G = 9.81  # m/s²
MIN_FLOW_DEPTH = 0.02   # 2cm — below this, water is effectively stationary
FLOW_CAP = 0.10         # max fraction of depth that can leave a cell per step
INLET_CD    = 0.6      # discharge coefficient
INLET_AREA  = 0.05     # grate area (m²)

@njit(parallel=True, cache=True)
def _numba_surface_flow(h, z, roughness, road_mask, border_mask, rain_rate, infil_rate, dt, dx):
    ny, nx = h.shape
    new_h = h.copy()
    
    # 1 & 2: Rainfall and infiltration
    for r in prange(ny):
        for c in range(nx):
            # Rainfall
            new_h[r, c] += rain_rate * dt
            
            # Infiltration
            if not road_mask[r, c]:
                infil = min(new_h[r, c], infil_rate[r, c] * dt)
                new_h[r, c] -= infil
                
    # We need a stable copy to compute fluxes from
    h_flux = new_h.copy()
    eta = z + h_flux
                
    # 3. Diffusive wave flow
    for r in prange(ny):
        for c in range(nx):
            # Flux X (East)
            if c < nx - 1:
                hi_x = 0.5 * (h_flux[r, c] + h_flux[r, c+1])
                if hi_x > MIN_FLOW_DEPTH:
                    deta_x = eta[r, c] - eta[r, c+1]
                    n_if_x = 0.5 * (roughness[r, c] + roughness[r, c+1])
                    slope_x = abs(deta_x) / dx
                    
                    q_x = (hi_x ** (5.0/3.0)) * np.sqrt(max(slope_x, 1e-10)) / n_if_x
                    if deta_x < 0: q_x = -q_x
                    flux_x = q_x * dt
                    
                    if flux_x > 0:
                        flux_x = min(flux_x, FLOW_CAP * h_flux[r, c])
                    else:
                        flux_x = max(flux_x, -FLOW_CAP * h_flux[r, c+1])
                        
                    new_h[r, c] -= flux_x
                    new_h[r, c+1] += flux_x

            # Flux Y (South)
            if r < ny - 1:
                hi_y = 0.5 * (h_flux[r, c] + h_flux[r+1, c])
                if hi_y > MIN_FLOW_DEPTH:
                    deta_y = eta[r, c] - eta[r+1, c]
                    n_if_y = 0.5 * (roughness[r, c] + roughness[r+1, c])
                    slope_y = abs(deta_y) / dx
                    
                    q_y = (hi_y ** (5.0/3.0)) * np.sqrt(max(slope_y, 1e-10)) / n_if_y
                    if deta_y < 0: q_y = -q_y
                    flux_y = q_y * dt
                    
                    if flux_y > 0:
                        flux_y = min(flux_y, FLOW_CAP * h_flux[r, c])
                    else:
                        flux_y = max(flux_y, -FLOW_CAP * h_flux[r+1, c])
                        
                    new_h[r, c] -= flux_y
                    new_h[r+1, c] += flux_y

    # Ensure no negatives and apply border mask
    for r in prange(ny):
        for c in range(nx):
            if new_h[r, c] < 0:
                new_h[r, c] = 0.0
            if not border_mask[r, c]:
                new_h[r, c] = 0.0

    return new_h

def step_surface_water(state: SimulationState, dt: float):
    dx = state.dx

    if not hasattr(state, 'border_mask') or state.border_mask is None:
        border_mask = np.ones(state.grid_shape, dtype=bool)
    else:
        border_mask = state.border_mask

    # Run the Numba JIT-compiled surface flow physics
    new_h = _numba_surface_flow(
        state.water_depth, 
        state.elevation, 
        state.roughness, 
        state.road_mask, 
        border_mask, 
        state.rainfall_rate, 
        state.infiltration_rate, 
        dt, 
        dx
    )

    # ── 4. Drain Inlet Coupling ────────────────────────────────────────────────
    # We still do this in standard python because it involves dicts and object state.
    # It's only a few hundred nodes so it's very fast.
    z = state.elevation
    for (ix, iy), node_id in state.inlet_mapping.items():
        node = state.nodes[node_id]
        cell_h = new_h[iy, ix]
        if cell_h <= 0:
            continue

        surface_head = z[iy, ix] + cell_h
        if node.head >= surface_head:
            # Surcharge backflow
            excess = node.head - surface_head
            backflow_rate = INLET_CD * INLET_AREA * np.sqrt(2.0 * G * excess + 1e-9)
            backflow_vol  = min(backflow_rate * dt, node.volume * 0.5)
            new_h[iy, ix] += backflow_vol / (dx * dx)
            node.volume    -= backflow_vol
        else:
            # Normal inflow
            driving_h = cell_h
            q_in      = INLET_CD * INLET_AREA * np.sqrt(2.0 * G * driving_h)
            vol_in    = min(q_in * dt, cell_h * dx * dx)
            new_h[iy, ix] -= vol_in / (dx * dx)
            node.volume    += vol_in

    state.water_depth = new_h
