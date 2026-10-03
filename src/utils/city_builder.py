import numpy as np
import random
from src.engine.underground import Node, Pipe

def build_procedural_city(nx=660, ny=360, dx=5.0):
    """
    Build a procedural city grid.
    Default dimensions match Barangay 168, Caloocan:
      nx=660, ny=360, dx=5m → 3300m × 1800m (real barangay is ~3230m × 1780m)
    """
    X, Y = np.meshgrid(np.linspace(0, 1, nx), np.linspace(0, 1, ny))

    # ── 1. TERRAIN — load from real SRTM DEM (barangay168_dem.tif) ──────────
    np.random.seed(42)
    random.seed(42)

    dem_loaded = False
    try:
        import rasterio
        from scipy.ndimage import zoom as scipy_zoom, gaussian_filter
        import os

        dem_path = os.path.join(os.path.dirname(__file__), '..', '..', 'barangay168_dem.tif')
        if os.path.exists(dem_path):
            with rasterio.open(dem_path) as ds:
                raw = ds.read(1).astype(np.float64)
                nodata = ds.nodata

            # Fill nodata with mean
            if nodata is not None:
                raw[raw == nodata] = np.nan
            raw = np.where(np.isnan(raw), np.nanmean(raw), raw)

            # Upsample from DEM resolution (65×112) → simulation grid (ny×nx = 360×660)
            zoom_y = ny / raw.shape[0]
            zoom_x = nx / raw.shape[1]
            elevation = scipy_zoom(raw, (zoom_y, zoom_x), order=3)   # bicubic

            # Gentle smoothing to reduce 30m→5m upsampling artifacts
            elevation = gaussian_filter(elevation, sigma=2.0)

            # Ensure minimum 1m above sea level, keep relative differences
            elevation -= elevation.min()
            elevation += 1.0

            dem_loaded = True
            print(f"[city_builder] Real DEM loaded: {elevation.shape}, "
                  f"elev {elevation.min():.1f}–{elevation.max():.1f} m")
    except Exception as e:
        print(f"[city_builder] DEM load error: {e} — falling back to procedural terrain")

    if not dem_loaded:
        # Fallback: procedural organic terrain
        elevation = 3.0 * X + 3.0 * Y
        for _ in range(10):
            cx, cy = np.random.rand(2)
            radius  = 0.08 + np.random.rand() * 0.18
            height  = (np.random.rand() - 0.25) * 10.0
            elevation += height * np.exp(-((X-cx)**2 + (Y-cy)**2) / radius)
        elevation -= elevation.min()
        elevation += 1.0
        try:
            from scipy.ndimage import gaussian_filter
            elevation = gaussian_filter(elevation, sigma=8.0)
        except ImportError:
            pass

    # ── 2. REAL ROADS (from OpenStreetMap via Overpass API) ──────────────────
    road_mask = np.zeros((ny, nx), dtype=bool)
    road_nodes = []

    # Barangay 168 real geographic bounding box
    LAT_MIN, LAT_MAX = 14.7307018, 14.7466954
    LON_MIN, LON_MAX = 121.0046237, 121.0347708

    def geo_to_grid(lat, lon):
        """Convert lat/lon to grid cell (col, row)."""
        c = int((lon - LON_MIN) / (LON_MAX - LON_MIN) * (nx - 1))
        r = int((1.0 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (ny - 1))
        return max(0, min(nx-1, c)), max(0, min(ny-1, r))

    def draw_road_segment(c1, r1, c2, r2, width):
        steps = max(abs(c2-c1), abs(r2-r1), 1) * 3
        for t in np.linspace(0, 1, steps):
            c = int(c1 + t*(c2-c1))
            r = int(r1 + t*(r2-r1))
            road_mask[max(0,r-width):min(ny,r+width+1),
                      max(0,c-width):min(nx,c+width+1)] = True

    # Highway type → road width in cells (dx=5m, so width=0 is 5m, width=1 is 15m)
    ROAD_WIDTHS = {
        'motorway': 1, 'trunk': 1, 'primary': 1, 'secondary': 1,
        'tertiary': 0, 'residential': 0, 'service': 0, 'unclassified': 0,
        'living_street': 0, 'footway': 0, 'path': 0, 'cycleway': 0,
    }

    use_real_roads = False
    try:
        import json, os
        osm_path = os.path.join(os.path.dirname(__file__), '..', '..', 'roads_osm.json')
        if os.path.exists(osm_path):
            with open(osm_path) as f:
                osm = json.load(f)

            for way in osm['elements']:
                if way.get('type') != 'way' or 'geometry' not in way:
                    continue
                hw = way.get('tags', {}).get('highway', 'residential')
                width = ROAD_WIDTHS.get(hw, 1)
                geom = way['geometry']
                for i in range(len(geom) - 1):
                    c1, r1 = geo_to_grid(geom[i]['lat'], geom[i]['lon'])
                    c2, r2 = geo_to_grid(geom[i+1]['lat'], geom[i+1]['lon'])
                    draw_road_segment(c1, r1, c2, r2, width)

            # Scatter road_nodes across the grid for building placement reference
            road_nodes = [(int(ny*f), int(nx*g))
                          for f in np.linspace(0.1, 0.9, 5)
                          for g in np.linspace(0.1, 0.9, 6)]
            use_real_roads = True
            print(f"[city_builder] Loaded {len(osm['elements'])} real OSM road segments")
    except Exception as e:
        print(f"[city_builder] OSM road load error: {e}")

    if not use_real_roads:
        # Fallback: procedural roads
        def draw_road(r1, c1, r2, c2, width=4):
            steps = max(abs(r2-r1), abs(c2-c1), 1) * 3
            for t in np.linspace(0, 1, steps):
                r = int(r1 + t*(r2-r1)); c = int(c1 + t*(c2-c1))
                road_mask[max(0,r-width):min(ny,r+width), max(0,c-width):min(nx,c+width)] = True

        def wp(ry, cx): return (int(ry*ny), int(cx*nx))
        waypoints = [wp(.11,.06), wp(.44,.36), wp(.50,.55), wp(.73,.48), wp(.93,.85)]
        for i in range(len(waypoints)-1):
            draw_road(waypoints[i][0], waypoints[i][1], waypoints[i+1][0], waypoints[i+1][1], width=3)
            road_nodes.append(waypoints[i])
        road_nodes.append(waypoints[-1])


    # ── KEY FIX: Set road elevation to local AVERAGE (no hard cliffs) ────────
    # For every road cell, replace its elevation with the mean of its neighbors
    # This makes roads follow the terrain gently rather than cutting into it
    from scipy.ndimage import gaussian_filter, uniform_filter

    # Step 1: Compute a heavily-smoothed reference for roads to follow
    road_target = uniform_filter(elevation, size=20)  # wide area average

    # Step 2: Blend: road cells get 80% smoothed average, 20% original → no cliffs
    elevation = np.where(road_mask, 
                         road_target * 0.80 + elevation * 0.20,
                         elevation)

    # Step 3: Final full-terrain smooth to blend road/grass boundary edges
    elevation = gaussian_filter(elevation, sigma=3.0)

    # 3. VARIED BUILDINGS  — 6 distinct types matching Barangay 168 satellite
    buildings = []

    BUILDING_TYPES = [
        # (type_name, weight, width_range, height_range, colors, roof_colors, roof_types)
        ("residential", 40, (0.8, 2.2), (0.7, 2.0),
            ["#f5f0e6","#fdebd0","#fadbd8","#fef9e7","#f9ebea","#fdfefe"],
            ["#963f35","#8b3a32","#a84b40","#b03a2e","#7d3c36"],
            ["pitched","pitched","flat"]),

        ("shanty",      25, (0.6, 1.4), (0.5, 1.0),
            ["#d5d8dc","#bfc9ca","#aab7b8","#d7dbdd","#ccd1d1"],
            ["#7f8c8d","#95a5a6","#808b96","#717d7e","#bdc3c7"],
            ["flat","flat","pitched"]),

        ("shop",        15, (1.5, 3.5), (0.6, 1.2),
            ["#d6eaf8","#d4efdf","#fdfefe","#fef9e7","#f4f6f7"],
            ["#2e86c1","#1a5276","#7f8c8d","#34495e","#a04000"],
            ["flat","flat","flat"]),

        ("concrete",    10, (2.0, 4.0), (1.5, 4.0),
            ["#eaecee","#d5d8dc","#cacfd2","#f2f3f4","#e8eaed"],
            ["#717d7e","#626567","#797d7f","#839192","#aab7b8"],
            ["flat"]),

        ("apartment",    7, (2.5, 5.0), (3.0, 6.0),
            ["#d6eaf8","#d5d8dc","#e8f8f5","#fdfefe","#ebf5fb"],
            ["#2e86c1","#1abc9c","#7f8c8d","#5d6d7e","#2980b9"],
            ["flat"]),

        ("warehouse",    3, (3.0, 6.0), (1.0, 2.0),
            ["#d5d8dc","#e8eaed","#f2f3f4"],
            ["#7f8c8d","#566573","#839192"],
            ["flat","flat"]),
    ]

    # Build weighted pool
    type_pool = []
    for entry in BUILDING_TYPES:
        type_pool.extend([entry] * entry[1])

    rng = np.random.default_rng(42)

    for _ in range(25000):
        r = int(rng.integers(5, ny - 5))
        c = int(rng.integers(5, nx - 5))

        if not road_mask[r, c]:
            btype = type_pool[int(rng.integers(0, len(type_pool)))]
            _, _, wr, hr, cols, rcols, rtypes = btype
            bname = btype[0]
            b_width  = float(rng.uniform(wr[0], wr[1]))
            b_height = float(rng.uniform(hr[0], hr[1]))

            # Ensure building doesn't completely block narrow roads nearby
            # (check a 1-cell ring — if ALL neighbors are road, skip)
            r0, c0 = max(0, r-1), max(0, c-1)
            r1, c1 = min(ny, r+2), min(nx, c+2)
            if road_mask[r0:r1, c0:c1].all():
                continue

            buildings.append({
                "x": c, "y": r,
                "width":      b_width,
                "height":     b_height,
                "color":      cols[int(rng.integers(0, len(cols)))],
                "roof_color": rcols[int(rng.integers(0, len(rcols)))],
                "roof_type":  rtypes[int(rng.integers(0, len(rtypes)))],
                "btype":      bname,
            })

    # ── 4. PIPE NETWORK (drainage nodes along road_nodes) ────────────────────
    nodes_list = []
    pipes      = []
    inlet_mapping = {}

    # Use a fixed set of 9 drain nodes spread across the grid for the network
    # (independent of whether roads come from OSM or procedural)
    def wp_frac(ry, cx):
        return (int(ry * ny), int(cx * nx))

    drain_positions = [
        wp_frac(.15, .15), wp_frac(.15, .50), wp_frac(.15, .85),
        wp_frac(.50, .15), wp_frac(.50, .50), wp_frac(.50, .85),
        wp_frac(.85, .15), wp_frac(.85, .50), wp_frac(.85, .85),
    ]

    for idx, (r, c) in enumerate(drain_positions):
        is_outlet = (idx == len(drain_positions) - 1)
        nodes_list.append(Node(
            node_id=idx, x=c, y=r, z_invert=-12.0 - (idx * 0.5), is_outlet=is_outlet
        ))
        # Each node captures a catchment radius
        for dy in range(-10, 11):
            for ddx in range(-10, 11):
                rr, cc = r + dy, c + ddx
                if 0 <= rr < ny and 0 <= cc < nx:
                    inlet_mapping[(cc, rr)] = idx

    # Connect nodes in a grid pattern (main trunk + cross links)
    pipe_id = 0
    connections = [
        (0,1),(1,2),                    # top row
        (3,4),(4,5),                    # middle row
        (6,7),(7,8),                    # bottom row
        (0,3),(3,6),                    # left column
        (1,4),(4,7),                    # center column
        (2,5),(5,8),                    # right column
    ]
    for n_in, n_out in connections:
        r1, c1 = drain_positions[n_in]
        r2, c2 = drain_positions[n_out]
        length = float(np.sqrt((r2-r1)**2 + (c2-c1)**2)) * dx  # in meters
        p = Pipe(pipe_id=pipe_id, node_in=n_in, node_out=n_out,
                 diameter=1.0, roughness_n=0.013, length=max(length, 1.0))
        if pipe_id == 6:
            p.blockage = 0.95   # intentionally clog one to cause flooding
        pipes.append(p)
        pipe_id += 1

    nodes = {n.id: n for n in nodes_list}
    MAIN_BLOCKAGE = 6


    # ── MAP TRACING (BARANGAY 168 BOUNDARY) ─────────────────────────────────
    # Store the mask but do NOT raise outside elevation.
    # Physics engine will zero water_depth outside the mask each step.
    border_mask = np.ones((ny, nx), dtype=bool)
    try:
        import json, os
        from matplotlib.path import Path
        
        geojson_path = os.path.join(os.path.dirname(__file__), '..', '..', 'brgy168.geojson')
        if os.path.exists(geojson_path):
            with open(geojson_path, 'r') as f:
                gj = json.load(f)
            
            coords = np.array(gj['coordinates'][0])
            lon = coords[:, 0]; lat = coords[:, 1]
            lon_norm = (lon - lon.min()) / (lon.max() - lon.min())
            lat_norm = (lat - lat.min()) / (lat.max() - lat.min())
            grid_coords = np.column_stack((lon_norm * nx, (1.0 - lat_norm) * ny))
            poly_path = Path(grid_coords)
            xg, yg = np.meshgrid(np.arange(nx), np.arange(ny))
            inside = poly_path.contains_points(np.column_stack((xg.flatten(), yg.flatten()))).reshape((ny, nx))
            border_mask = inside
            print(f"[city_builder] Barangay 168 boundary: {inside.sum()} cells ({inside.sum()*100/(ny*nx):.1f}% of grid)")
    except Exception as e:
        print(f"[city_builder] Boundary tracing error: {e}")

    return {
        "grid_shape": (ny, nx),
        "dx": dx,
        "elevation": elevation,
        "road_mask": road_mask.tolist(),
        "buildings": buildings,
        "nodes": nodes,
        "pipes": pipes,
        "inlet_mapping": inlet_mapping,
        "main_blockage_id": 6,
        "border_mask": border_mask.tolist()
    }
