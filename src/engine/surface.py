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
    """
    2D Diffusive Wave Shallow Water Equations (SWE) Numerical Solver
    ================================================================
    Governing Mass Conservation (Continuity Equation):
      dh/dt + d(qx)/dx + d(qy)/dy = R(t) - I(t)
      where:
        h = water depth (m)
        qx, qy = unit width discharge fluxes (m^2/s)
        R(t) = rainfall intensity rate (m/s)
        I(t) = infiltration loss rate (m/s)

    Diffusive Wave Momentum Equation (Friction Slope balances Hydraulic Slope):
      Sf_x = -d(eta)/dx = -d(z + h)/dx
      Sf_y = -d(eta)/dy = -d(z + h)/dy
      where:
        eta = water surface elevation = z + h (m)
        z = ground bed elevation (m)

    Manning's 2D Shallow Water Discharge (Friction Law):
      qx = (1 / n) * h_interface^(5/3) * sqrt(|Sf_x|) * sgn(Sf_x)
      qy = (1 / n) * h_interface^(5/3) * sqrt(|Sf_y|) * sgn(Sf_y)
      where:
        n = Manning's roughness coefficient (0.013 road, 0.040 soil)
        h_interface = interface water depth = 0.5 * (h_i + h_{i+1}) (m)

    Numerical Stability & Flux Limiting:
      Flux_max = FLOW_CAP * h_source = 0.10 * h_source
      Prevents cell depletion and guarantees positive depth unconditionally.
    """
    ny, nx = h.shape
    new_h = h.copy()
    
    # 1 & 2: Rainfall, infiltration, and post-storm puddle drying
    for r in prange(ny):
        for c in range(nx):
            # Rainfall
            new_h[r, c] += rain_rate * dt
            
            # Infiltration on soil; natural micro-drainage/evaporation on roads when dry
            if not road_mask[r, c]:
                infil = min(new_h[r, c], infil_rate[r, c] * dt)
                new_h[r, c] -= infil
            elif rain_rate == 0.0 and new_h[r, c] > 0.0:
                # Road depression drying: gently clears shallow stagnant film/potholes
                dry_rate = min(new_h[r, c], 3e-6 * dt)
                new_h[r, c] -= dry_rate
                
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
            state._node_zrim  = np.array([state.elevation[state.nodes[nid].y, state.nodes[nid].x] for nid in nid_list])
        else:
            state._inlet_ix   = np.array([], dtype=np.int32)
            state._inlet_iy   = np.array([], dtype=np.int32)
            state._inlet_nidx = np.array([], dtype=np.int32)
            state._node_ids   = []
            state._node_zrim  = np.array([])

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
        cell_node_rim  = state._node_zrim[nidx]

        # ---------------------------------------------------------------------
        # Surcharge Backflow (Pressurized Urban Geysering):
        #   Q_surcharge = C_d * A_inlet * sqrt(2 * g * (H_node - eta_surf)) * F_damp
        # Active only when:
        #   1. Piezometric head exceeds street rim (H_node >= z_rim)
        #   2. Head exceeds surface water head (H_node >= eta_surf)
        #   3. Manhole shaft contains positive volume (V_node > 0)
        # Surcharge volume is damped by F_damp = 0.10 per step to prevent resonance.
        # ---------------------------------------------------------------------
        # Water can ONLY be pushed UP onto the street when the manhole shaft is
        # actually full to the rim (cell_node_head >= cell_node_rim), contains water,
        # and has greater piezometric head than the local street surface.
        back_mask  = (cell_node_head >= cell_node_rim) & (cell_node_head >= surf_head) & (cell_node_vol > 1e-6)
        excess     = np.where(back_mask, cell_node_head - surf_head, 0.0)
        back_vol_t = np.where(back_mask,
                              INLET_CD * INLET_AREA * np.sqrt(2.0 * G * excess + 1e-9) * dt,
                              0.0)

        # CRITICAL: multiple cells share the same node. Cap total backflow per
        # node strictly to the water volume that physically exceeds the ground rim.
        # Water trapped underground inside the shaft (head < z_rim) cannot spill.
        node_back_want = np.zeros(num_nodes)
        np.add.at(node_back_want, nidx, back_vol_t)
        # Limit total backflow per node to the water physically above the rim,
        # and apply a 10% per-step damping factor so the system reaches
        # equilibrium gradually instead of oscillating (fill → drain → fill → …).
        # Physically, the manhole grate limits how fast water can escape upward.
        node_back_limit = np.maximum(0.0, (node_heads - state._node_zrim) * state._node_area) * 0.10
        # Scale-down factor per node (1.0 if node can supply all, <1 if not)
        back_scale_node = np.where(node_back_want > 1e-12,
                                   np.minimum(node_back_limit, node_back_want) / (node_back_want + 1e-12),
                                   0.0)
        back_vol = back_vol_t * back_scale_node[nidx]   # apply per-cell scale

        # ---------------------------------------------------------------------
        # Curb Drain Inlet Intake (Surface-to-Underground Orifice Coupling):
        #   Q_inlet = min(C_d * A_inlet * sqrt(2 * g * (eta_surf - H_node)), Vol_cell / dt)
        # Gated by:
        #   1. Surface head exceeding node head (eta_surf >= H_node)
        #   2. Downstream pipe openness: Openness = 1.0 - Blockage
        #   3. Available manhole shaft storage capacity: Margin = z_rim - H_node
        # ---------------------------------------------------------------------
        # Prevent ping-pong resonance: an inlet can only accept inflow if:
        # 1. The surface hydraulic head is higher than the node's hydraulic head
        # 2. Total inflow per node is scaled to the node's available shaft capacity
        fwd_mask = (~back_mask) & (cell_h > 0.001) & (surf_head >= cell_node_head)
        head_diff = np.maximum(0.0, surf_head - cell_node_head)
        fwd_vol_raw = np.where(fwd_mask,
                            np.minimum(INLET_CD * INLET_AREA * np.sqrt(2.0 * G * head_diff + 1e-9) * dt,
                                       cell_h * dx * dx),
                            0.0)

        # Build per-node openness: 0.0 = all pipes 100% blocked, 1.0 = fully open
        node_openness = np.ones(num_nodes)
        for i, nid in enumerate(state._node_ids):
            node = state.nodes[nid]
            connected = [p for p in state.pipes if p.node_in == nid or p.node_out == nid]
            if connected:
                avg_blockage = sum(p.blockage for p in connected) / len(connected)
                node_openness[i] = max(0.0, 1.0 - avg_blockage)

        # Scale forward intake across all cells mapped to each node so they cannot
        # overfill the node beyond its ground rim in a single step
        node_fwd_want = np.zeros(num_nodes)
        np.add.at(node_fwd_want, nidx, fwd_vol_raw)
        node_head_margin = np.maximum(0.0, state._node_zrim - node_heads)
        node_fwd_limit = node_head_margin * state._node_area * 0.25 + 0.05 * dt
        fwd_scale_node = np.where(node_fwd_want > 1e-12,
                                  np.minimum(node_fwd_limit, node_fwd_want) / (node_fwd_want + 1e-12),
                                  0.0)
        fwd_vol = fwd_vol_raw * fwd_scale_node[nidx] * node_openness[nidx]

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
