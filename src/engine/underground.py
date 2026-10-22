"""
underground.py  –  1D Pipe Network (St Venant simplification)
-------------------------------------------------------------
Each Node is a manhole/junction with a storage volume.
Each Pipe carries flow driven by the hydraulic grade line (head difference)
using a Manning full-pipe equation (Darcy-Weisbach alternative).

Key physics modelled:
  • Gravity-driven full-pipe flow (Manning's equation for conduits)
  • Partial-flow (pipe not surcharged) using hydraulic radius reduction
  • Blockage → effective area/roughness degradation
  • Backwater: if downstream head > upstream head, flow reverses
  • Outlet freely drains to atmosphere (open channel)
"""
import math

G = 9.81  # m/s²

class Node:
    """
    Manhole / junction in the underground drainage network.
    Acts as a variable-level storage reservoir.
    """
    def __init__(self, node_id: int, x: int, y: int,
                 z_invert: float, is_outlet: bool = False,
                 shaft_area: float = 1.0):
        self.id       = node_id
        self.x        = x            # grid column
        self.y        = y            # grid row
        self.z_invert = z_invert     # pipe invert elevation (bottom of pipe, m)
        self.is_outlet = is_outlet

        # Storage: the manhole shaft cross-section (m²)
        self.area   = shaft_area
        self.volume = 0.0  # m³

    @property
    def head(self) -> float:
        """
        Hydraulic head at this node.
        = invert elevation + water height in shaft
        """
        depth = max(self.volume / self.area, 0.0)
        return self.z_invert + depth

    def __repr__(self):
        return f"Node({self.id}, head={self.head:.2f}m, vol={self.volume:.3f}m³)"


class Pipe:
    """
    Circular conduit connecting two nodes.
    Uses Manning's equation for full-pipe or partial-flow conditions.
    """
    def __init__(self, pipe_id: int, node_in: int, node_out: int,
                 diameter: float = 0.9,   # m  (typical PH municipal drain ≈ 600–1200 mm)
                 roughness_n: float = 0.013,  # Manning's n for concrete
                 length: float = 50.0):   # m  (distance between manholes)
        self.id       = pipe_id
        self.node_in  = node_in
        self.node_out = node_out

        # Physical properties (can be updated when real data is loaded)
        self.diameter   = diameter    # m
        self.roughness_n = roughness_n
        self.length     = length

        # Derived full-pipe capacity
        self.area       = math.pi * (diameter / 2) ** 2   # m²
        self.perimeter  = math.pi * diameter              # m
        self.R          = self.area / self.perimeter       # hydraulic radius (m)

        # State
        self.blockage     = 0.0   # 0 = clear, 1 = 100% blocked
        self.current_flow = 0.0   # m³/s  (+ = forward, - = reverse)

    def set_diameter(self, new_diameter: float):
        """Update pipe diameter and recalculate all derived hydraulic properties."""
        self.diameter  = max(0.1, float(new_diameter))  # minimum 10cm pipe
        self.area      = math.pi * (self.diameter / 2) ** 2
        self.perimeter = math.pi * self.diameter
        self.R         = self.area / self.perimeter

    @property
    def effective_area(self) -> float:
        """Blockage physically reduces the open cross-section."""
        return self.area * (1.0 - self.blockage)

    @property
    def max_flow(self) -> float:
        """Full-pipe Manning capacity (m³/s) at unit slope = 1."""
        # Actual max capacity is slope-dependent; we use it as an upper bound check.
        A_eff = self.effective_area
        R_eff = A_eff / (math.pi * self.diameter * (1.0 - self.blockage) + 1e-9)
        return (A_eff * R_eff**(2.0/3.0)) / self.roughness_n

    def __repr__(self):
        return (f"Pipe({self.id}, {self.node_in}→{self.node_out}, "
                f"D={self.diameter}m, block={self.blockage*100:.0f}%, "
                f"Q={self.current_flow:.4f}m³/s)")


def step_underground_network(state, dt: float):
    """
    One time step of the underground pipe network.
    
    Algorithm:
    1. For every pipe, compute flow using Manning's equation driven by
       the head difference between the two nodes.
    2. Apply the volume transfers.
    3. Drain outlets.
    """
    nodes = state.nodes

    # ── 1. Compute flows ─────────────────────────────────────────────────────
    for pipe in state.pipes:
        n_in  = nodes[pipe.node_in]
        n_out = nodes[pipe.node_out]

        dh = n_in.head - n_out.head   # head difference (m)
        L  = max(pipe.length, 1.0)

        # Hydraulic slope (absolute value; sign determines direction)
        Sf = abs(dh) / L

        # Effective area and hydraulic radius considering blockage
        A_eff = pipe.effective_area
        if A_eff < 1e-6:
            pipe.current_flow = 0.0
            continue

        R_eff = A_eff / (math.pi * pipe.diameter * (1.0 - pipe.blockage) + 1e-9)

        # ---------------------------------------------------------------------
        # ---------------------------------------------------------------------
        # FORMULA 6: Subsurface Conduit Hydraulics (Manning Pipe Equation & Backwater)
        # Purpose: Calculates gravity and backpressure flow between connected manholes
        #   Q = (A_eff * R_eff^(2/3) * Sf^(1/2)) / n_pipe
        # where:
        #   dh = H_in - H_out = (z_inv,in + V_in/A_shaft) - (z_inv,out + V_out/A_shaft)
        #   Sf = |dh| / L  (hydraulic friction slope)
        #   A_eff = (pi * D^2 / 4) * (1 - Blockage)
        #   R_eff = A_eff / P_eff = (D / 4)  (hydraulic radius)
        #   n_pipe = 0.013 (Manning's roughness for reinforced concrete culvert)
        # ---------------------------------------------------------------------
        Q_manning = (A_eff * R_eff**(2.0/3.0) * math.sqrt(Sf + 1e-9)) / pipe.roughness_n

        # Determine direction
        if dh >= 0:
            Q = Q_manning    # forward (in → out)
        else:
            Q = -Q_manning   # reverse (backwater flow)

        # We don't cap Q here yet, because multiple pipes might drain the same node.
        # We'll cap them proportionally in a second pass.
        pipe.current_flow = Q

    # -------------------------------------------------------------------------
    # FORMULA 7: Proportional Node Outflow Limiter (Depletion Prevention)
    # Purpose: Prevents unphysical negative storage volumes when multiple pipes draw from a node
    # -------------------------------------------------------------------------
    node_outflows = {nid: 0.0 for nid in nodes.keys()}
    
    # Sum up all proposed volume leaving each node
    for pipe in state.pipes:
        if pipe.current_flow > 0:
            node_outflows[pipe.node_in] += pipe.current_flow * dt
        elif pipe.current_flow < 0:
            node_outflows[pipe.node_out] += (-pipe.current_flow) * dt
            
    # Calculate scale factor per node
    node_scale = {}
    for nid, out_vol in node_outflows.items():
        if out_vol > nodes[nid].volume:
            node_scale[nid] = nodes[nid].volume / out_vol
        else:
            node_scale[nid] = 1.0
            
    # Apply scale factor to pipe flows
    for pipe in state.pipes:
        if pipe.current_flow > 0:
            pipe.current_flow *= node_scale[pipe.node_in]
        elif pipe.current_flow < 0:
            pipe.current_flow *= node_scale[pipe.node_out]

    # ── 2. Transfer volumes ───────────────────────────────────────────────────
    for pipe in state.pipes:
        vol = pipe.current_flow * dt
        nodes[pipe.node_in].volume  -= vol
        nodes[pipe.node_out].volume += vol

    # Guard against numerical negatives
    for node in nodes.values():
        if node.volume < 0.0:
            node.volume = 0.0

    # ── 3. Outlets drain freely & sump percolation when dry ───────────────────
    for node in nodes.values():
        if node.is_outlet:
            node.volume = 0.0
        elif getattr(state, "rainfall_rate", 0.0) == 0.0 and node.volume > 0.0:
            # Baseline sump subsoil percolation after rain has ended
            node.volume = max(0.0, node.volume - 0.005 * dt)
