import numpy as np

class SimulationState:
    """
    Holds the complete state of the simulation at a given point in time.
    """
    def __init__(self, grid_shape=(300, 300), dx=1.0):
        self.time = 0.0
        self.grid_shape = grid_shape
        self.dx = dx

        ny, nx = grid_shape

        # ── Surface ───────────────────────────────────────────────────────────
        self.elevation    = np.zeros(grid_shape, dtype=np.float64)
        self.water_depth  = np.zeros(grid_shape, dtype=np.float64)
        self.velocity_x   = np.zeros(grid_shape, dtype=np.float64)  # m/s eastward
        self.velocity_y   = np.zeros(grid_shape, dtype=np.float64)  # m/s southward
        self.rainfall_rate = 0.0   # m/s  (convert mm/hr → m/s in server)

        # ── Manning's n roughness (per cell) ─────────────────────────────────
        # Grass / open land ≈ 0.035, asphalt ≈ 0.013
        self.roughness = np.full(grid_shape, 0.035, dtype=np.float64)

        # ── Infiltration ──────────────────────────────────────────────────────
        # Green surfaces slowly absorb water (m/s). Roads = 0.
        self.infiltration_rate = np.full(grid_shape, 3e-6, dtype=np.float64)

        # ── Road Mask (set by city builder) ──────────────────────────────────
        self.road_mask   = np.zeros(grid_shape, dtype=bool)
        self.border_mask = None   # set from city_builder's GeoJSON boundary

        # ── Surface → Underground coupling ───────────────────────────────────
        # Maps grid (col, row) → node_id
        self.inlet_mapping = {}

        # ── Underground network ───────────────────────────────────────────────
        self.nodes = {}   # node_id → Node
        self.pipes = []   # list of Pipe

        # ── Zones & Subdivisions ──────────────────────────────────────────────
        self.zones = []               # list of zone metadata dicts
        self.zone_grid = None         # (ny, nx) int8 array of zone indices
        self.zone_masks = {}          # zone_id -> boolean mask
        self.brgy_cell_count = 0      # total cells inside barangay
        self.zone_peaks = {}          # zone_id -> historical peak depth (m)
        self.rain_duration_sec = 0.0  # seconds rainfall has been active

