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

    # ── 4. Drain Inlet Coupling (fully vectorised) ─────────────────────────────
    # Build index structures once and cache. Key trick: map every inlet cell to
    # a contiguous 0-based node index so all 237k-cell operations are numpy-only.
    # Only the 108-node volume read/write uses a Python loop (negligible cost).
    if not hasattr(state, '_inlet_nidx') or state._inlet_nidx is None:
        if state.inlet_mapping:
            pairs = list(state.inlet_mapping.items())
            state._inlet_ix   = np.array([p[0][0] for p in pairs], dtype=np.int32)
            state._inlet_iy   = np.array([p[0][1] for p in pairs], dtype=np.int32)
            # Contiguous node index (0..N-1) instead of arbitrary node_id
            nid_list          = sorted(state.nodes.keys())
            nid_to_idx        = {nid: i for i, nid in enumerate(nid_list)}
            state._inlet_nidx = np.array([nid_to_idx[p[1]] for p in pairs], dtype=np.int32)
            state._node_ids   = nid_list   # ordered list of node_ids
            state._node_zinv  = np.array([state.nodes[nid].z_invert for nid in nid_list])
            state._node_area  = np.array([state.nodes[nid].area     for nid in nid_list])
        else:
            state._inlet_ix   = np.array([], dtype=np.int32)
            state._inlet_iy   = np.array([], dtype=np.int32)
            state._inlet_nidx = np.array([], dtype=np.int32)
            state._node_ids   = []

    if len(state._inlet_ix) > 0:
        num_nodes = len(state._node_ids)

        # Read node state (108 iterations — negligible)
        node_vols  = np.array([state.nodes[nid].volume for nid in state._node_ids])
        node_heads = state._node_zinv + node_vols / state._node_area

        ix   = state._inlet_ix
        iy   = state._inlet_iy
        nidx = state._inlet_nidx

        cell_h         = new_h[iy, ix]
        surf_head      = state.elevation[iy, ix] + cell_h
        cell_node_head = node_heads[nidx]   # pure numpy fancy index
        cell_node_vol  = node_vols[nidx]

        # ── Surcharge backflow ────────────────────────────────────────────────
        # Node head > surface: water pushed UP onto street
        back_mask  = cell_node_head >= surf_head
        excess     = np.where(back_mask, cell_node_head - surf_head, 0.0)
        back_vol_t = np.where(back_mask,
                              INLET_CD * INLET_AREA * np.sqrt(2.0 * G * excess + 1e-9) * dt,
                              0.0)

        # CRITICAL: multiple cells share the same node. Cap total backflow per
        # node to node_vol * 0.5 — otherwise we create water from nothing.
        node_back_want = np.zeros(num_nodes)
        np.add.at(node_back_want, nidx, back_vol_t)
        node_back_limit = node_vols * 0.5
        # Scale-down factor per node (1.0 if node can supply all, <1 if not)
        back_scale_node = np.where(node_back_want > 1e-12,
                                   np.minimum(node_back_limit, node_back_want) / (node_back_want + 1e-12),
                                   0.0)
        back_vol = back_vol_t * back_scale_node[nidx]   # apply per-cell scale

        # ── Normal inflow ─────────────────────────────────────────────────────
        # Surface water drains into the node
        fwd_mask = (~back_mask) & (cell_h > 0)
        fwd_vol  = np.where(fwd_mask,
                            np.minimum(INLET_CD * INLET_AREA * np.sqrt(2.0 * G * cell_h + 1e-9) * dt,
                                       cell_h * dx * dx),
                            0.0)

        # ── Apply to surface ──────────────────────────────────────────────────
        np.add.at(new_h, (iy, ix), (back_vol - fwd_vol) / (dx * dx))
        new_h = np.maximum(new_h, 0.0)

        # ── Apply to nodes (108 iterations) ───────────────────────────────────
        vol_delta = fwd_vol - back_vol
        node_delta = np.zeros(num_nodes)
        np.add.at(node_delta, nidx, vol_delta)
        for i, nid in enumerate(state._node_ids):
            state.nodes[nid].volume = max(0.0, node_vols[i] + node_delta[i])

    state.water_depth = new_h
