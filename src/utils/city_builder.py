import numpy as np
import random
from src.engine.underground import Node, Pipe

def build_procedural_city(nx=690, ny=380, dx=5.0):
    """
    Build procedural city grid matching Google Maps boundary of Barangay 168 (Deparo), Caloocan.
      nx=690, ny=380, dx=5m -> 3450m x 1900m
      Bounds: LON 121.0050 to 121.0370, LAT 14.7315 to 14.7485
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

        dem_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'barangay168_dem.tif')
        if os.path.exists(dem_path):
            with rasterio.open(dem_path) as ds:
                from rasterio.windows import from_bounds
                win = from_bounds(121.0050, 14.7315, 121.0370, 14.7485, transform=ds.transform)
                raw = ds.read(1, window=win).astype(np.float64)
                nodata = ds.nodata

            # Fill nodata with mean
            if nodata is not None:
                raw[raw == nodata] = np.nan
            raw = np.where(np.isnan(raw), np.nanmean(raw), raw)

            # Upsample from DEM resolution to simulation grid (ny×nx)
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
    # road_mask stores road hierarchy levels:
    # 0 = non-road, 1 = residential/service, 2 = collector/avenue, 3 = major arterial
    road_mask = np.zeros((ny, nx), dtype=np.uint8)
    road_nodes = []

    # Barangay 168 (Deparo) accurate bounding box matching Google Maps with margins
    LAT_MIN, LAT_MAX = 14.7315, 14.7485
    LON_MIN, LON_MAX = 121.0050, 121.0370

    def geo_to_grid(lat, lon):
        """Convert lat/lon to grid cell (col, row)."""
        c = int((lon - LON_MIN) / (LON_MAX - LON_MIN) * (nx - 1))
        r = int((1.0 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (ny - 1))
        return max(0, min(nx-1, c)), max(0, min(ny-1, r))

    def draw_road_segment(c1, r1, c2, r2, width, level=1):
        steps = max(abs(c2-c1), abs(r2-r1), 1) * 3
        for t in np.linspace(0, 1, steps):
            c = int(c1 + t*(c2-c1))
            r = int(r1 + t*(r2-r1))
            r_min, r_max = max(0, r-width), min(ny, r+width+1)
            c_min, c_max = max(0, c-width), min(nx, c+width+1)
            road_mask[r_min:r_max, c_min:c_max] = np.maximum(road_mask[r_min:r_max, c_min:c_max], level)

    # Road hierarchy configuration matching real Barangay 168 geography:
    # - Level 3 (Arterials): Deparo Rd, Camarin Rd, Teofilo Samson Ave, Llano Rd (w=2 -> 25m corridor)
    # - Level 2 (Collectors): Kabatuhan Rd, Narra St, Alecon Drive (w=1 -> 15m avenue)
    # - Level 1 (Local): Subdivision streets inside BF Homes, Casimiro, Natividad, etc. (w=0 -> 5m street)
    ROAD_CONFIG = {
        'motorway':       {'width': 1, 'level': 3},
        'trunk':          {'width': 1, 'level': 3},
        'primary':        {'width': 1, 'level': 3},
        'secondary':      {'width': 1, 'level': 3},
        'tertiary':       {'width': 1, 'level': 2},
        'secondary_link': {'width': 1, 'level': 2},
        'tertiary_link':  {'width': 1, 'level': 2},
        'residential':    {'width': 0, 'level': 1},
        'unclassified':   {'width': 0, 'level': 1},
        'living_street':  {'width': 0, 'level': 1},
        'service':        {'width': 0, 'level': 1},
        'footway':        {'width': 0, 'level': 1},
        'path':           {'width': 0, 'level': 1},
        'cycleway':       {'width': 0, 'level': 1},
    }

    use_real_roads = False
    try:
        import json, os
        osm_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'roads_osm.json')
        if os.path.exists(osm_path):
            with open(osm_path) as f:
                osm = json.load(f)

            for way in osm['elements']:
                if way.get('type') != 'way' or 'geometry' not in way:
                    continue
                hw = way.get('tags', {}).get('highway', 'residential')
                cfg = ROAD_CONFIG.get(hw, {'width': 0, 'level': 1})
                width = cfg['width']
                level = cfg['level']
                geom = way['geometry']
                for i in range(len(geom) - 1):
                    c1, r1 = geo_to_grid(geom[i]['lat'], geom[i]['lon'])
                    c2, r2 = geo_to_grid(geom[i+1]['lat'], geom[i+1]['lon'])
                    draw_road_segment(c1, r1, c2, r2, width, level)

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
                road_mask[max(0,r-width):min(ny,r+width), max(0,c-width):min(nx,c+width)] = 1

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

    # Step 2: Smooth continuous blend weight (eliminates discrete staircase trenches and shadow teeth)
    road_weight = gaussian_filter((road_mask > 0).astype(float), sigma=2.0)
    elevation = (1.0 - road_weight * 0.4) * elevation + (road_weight * 0.4) * road_target

    # Step 3: Gentle full-terrain smooth to keep all transitions natural and smooth
    elevation = gaussian_filter(elevation, sigma=1.5)

    # ── MAP TRACING (BARANGAY 168 BOUNDARY & ZONES) ─────────────────────────
    border_mask = np.ones((ny, nx), dtype=bool)
    brgy_border = []
    zones = []
    zone_grid = np.full((ny, nx), -1, dtype=np.int8)
    zone_borders = []
    try:
        import json, os
        from matplotlib.path import Path
        from scipy.spatial import cKDTree
        geojson_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'brgy168.geojson')
        if os.path.exists(geojson_path):
            with open(geojson_path, 'r') as f:
                gj = json.load(f)
            coords = np.array(gj['coordinates'][0])
            grid_coords = np.array([geo_to_grid(lat, lon) for lon, lat in coords])
            poly_path = Path(grid_coords)
            xg, yg = np.meshgrid(np.arange(nx), np.arange(ny))
            inside = poly_path.contains_points(np.column_stack((xg.flatten(), yg.flatten()))).reshape((ny, nx))
            border_mask = inside
            brgy_border = [[round(float(pt[0]), 1), round(float(pt[1]), 1)] for pt in grid_coords]
            # Clip road network strictly inside Barangay 168 boundary
            road_mask[~border_mask] = 0
            print(f"[city_builder] Barangay 168 boundary: {inside.sum()} cells ({inside.sum()*100/(ny*nx):.1f}% of grid)")

            # ── SUBDIVISIONS & PUROK ZONING ─────────────────────────────────
            ZONES_CONFIG = [
                {
                    "id": "camella_altezza",
                    "name": "Camella Altezza",
                    "type": "Subdivision",
                    "seed_lat": 14.7460, "seed_lon": 121.0075,
                    "color": "#8e44ad"
                },
                {
                    "id": "nova_romania",
                    "name": "Nova Romania",
                    "type": "Subdivision",
                    "seed_lat": 14.7450, "seed_lon": 121.0118,
                    "color": "#9b59b6"
                },
                {
                    "id": "bf_homes_alecon",
                    "name": "BF Homes Phase III",
                    "type": "Subdivision",
                    "seed_lat": 14.7395, "seed_lon": 121.0112,
                    "color": "#3498db"
                },
                {
                    "id": "precious_ruby_natividad",
                    "name": "Precious Ruby & Natividad",
                    "type": "Subdivision",
                    "seed_lat": 14.7385, "seed_lon": 121.0160,
                    "color": "#e67e22"
                },
                {
                    "id": "deparo_proper",
                    "name": "Deparo Proper (Sentro)",
                    "type": "Purok / Sentro",
                    "seed_lat": 14.7395, "seed_lon": 121.0205,
                    "color": "#f1c40f"
                },
                {
                    "id": "sto_thomas_casimiro",
                    "name": "Sto. Thomas & Casimiro",
                    "type": "Subdivision",
                    "seed_lat": 14.7425, "seed_lon": 121.0210,
                    "color": "#1abc9c"
                },
                {
                    "id": "dolmar_golden_hills",
                    "name": "Dolmar Golden Hills",
                    "type": "Subdivision",
                    "seed_lat": 14.7395, "seed_lon": 121.0260,
                    "color": "#e74c3c"
                },
                {
                    "id": "camarin_metrogreen",
                    "name": "Metro Green & Camarin",
                    "type": "Sector / Subdivision",
                    "seed_lat": 14.7420, "seed_lon": 121.0315,
                    "color": "#2ecc71"
                }
            ]

            seeds_xy = []
            for z in ZONES_CONFIG:
                sc, sr = geo_to_grid(z["seed_lat"], z["seed_lon"])
                seeds_xy.append([sc, sr])

            kd = cKDTree(seeds_xy)
            all_rc = np.column_stack((xg.flatten(), yg.flatten()))
            _, nearest_idx = kd.query(all_rc)
            nearest_map = nearest_idx.reshape((ny, nx))

            zone_grid = np.full((ny, nx), -1, dtype=np.int8)
            zone_grid[inside] = nearest_map[inside]

            for i, z in enumerate(ZONES_CONFIG):
                z_mask = (zone_grid == i)
                cell_count = int(np.sum(z_mask))
                area_sqm = cell_count * (dx * dx)
                area_ha = area_sqm / 10000.0
                if cell_count > 0:
                    rows, cols = np.where(z_mask)
                    mean_c = float(np.mean(cols))
                    mean_r = float(np.mean(rows))
                else:
                    mean_c, mean_r = float(seeds_xy[i][0]), float(seeds_xy[i][1])

                zones.append({
                    "id": z["id"],
                    "name": z["name"],
                    "type": z["type"],
                    "color": z["color"],
                    "center_x": round(mean_c, 1),
                    "center_y": round(mean_r, 1),
                    "cell_count": cell_count,
                    "area_ha": round(area_ha, 2)
                })

            # --- Dense zone border segments via numpy diff (full resolution) ---
            # Horizontal transitions: left-cell vs right-cell differ → vertical edge at col+0.5
            h_diff = np.diff(zone_grid, axis=1)  # shape (ny, nx-1)
            h_rows, h_cols = np.where(
                (h_diff != 0)
                & (zone_grid[:, :-1] >= 0)
                & (zone_grid[:, 1:] >= 0)
            )
            # Vertical transitions: top-cell vs bottom-cell differ → horizontal edge at row+0.5
            v_diff = np.diff(zone_grid, axis=0)  # shape (ny-1, nx)
            v_rows, v_cols = np.where(
                (v_diff != 0)
                & (zone_grid[:-1, :] >= 0)
                & (zone_grid[1:, :] >= 0)
            )
            # Build segment list: each segment = [x1,z1, x2,z2]
            raw_segs = []
            for r2, c2 in zip(h_rows, h_cols):
                # Vertical short edge at x=c2+0.5, spanning z=r2 to z=r2+1
                raw_segs.append((float(c2 + 0.5), float(r2), float(c2 + 0.5), float(r2 + 1)))
            for r2, c2 in zip(v_rows, v_cols):
                # Horizontal short edge at z=r2+0.5, spanning x=c2 to x=c2+1
                raw_segs.append((float(c2), float(r2 + 0.5), float(c2 + 1), float(r2 + 0.5)))
            # Subsample to at most 3000 segments so the JSON payload stays reasonable
            MAX_SEGS = 3000
            if len(raw_segs) > MAX_SEGS:
                step_s = max(1, len(raw_segs) // MAX_SEGS)
                raw_segs = raw_segs[::step_s]
            for seg in raw_segs:
                zone_borders.extend(seg)

            print(f"[city_builder] Partitioned into {len(zones)} zones, {len(zone_borders)//4} border lines")
    except Exception as e:
        print(f"[city_builder] Boundary tracing error: {e}")

    # 3. VARIED BUILDINGS  — 6 distinct types matching Barangay 168 satellite
    buildings = []

    BUILDING_TYPES = [
        # (type_name, weight, width_range, height_range, colors, roof_colors, roof_types)
        ("residential", 40, (0.8, 2.2), (0.7, 2.0),
            ["#f5f0e6","#fdebd0","#fadbd8","#fef9e7","#f9ebea","#fdfefe"],
            ["#963f35","#8b3a32","#a84b40","#b03a2e","#7d3c36","#2e86c1","#1a5276","#27ae60","#1e8449","#7f8c8d","#839192","#b9770e","#873600"],
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

        if not road_mask[r, c] and border_mask[r, c]:
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

    # ── 4. ROAD-GEOMETRY-FOLLOWING PIPE NETWORK ───────────────────────────────
    # Manholes are placed at regular intervals ALONG each main road's OSM
    # centerline, then connected sequentially. This ensures pipes strictly
    # run parallel to and underneath the main road surfaces.
    nodes_list = []
    pipes      = []
    inlet_mapping = {}
    MAIN_BLOCKAGE = 0   # will be updated below

    # Precise geographic bounding box matching terrain and road_mask exactly
    def geo_to_grid_f(lat, lon):
        c = (lon - LON_MIN) / (LON_MAX - LON_MIN) * (nx - 1)
        r = (1.0 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (ny - 1)
        return c, r

    osm_network_ok = False
    try:
        import json as _json, os as _os, math as _math
        from scipy.spatial import cKDTree as _KDTree

        osm_path = _os.path.join(_os.path.dirname(__file__), '..', '..', 'data', 'roads_osm.json')
        with open(osm_path) as f:
            osm = _json.load(f)

        # Primary and secondary arterial roads
        MAIN_HW = {
            'primary':        {'diam': 1.40, 'spacing_m': 70},
            'trunk':          {'diam': 1.40, 'spacing_m': 70},
            'secondary':      {'diam': 1.20, 'spacing_m': 70},
            'secondary_link': {'diam': 1.00, 'spacing_m': 70},
            'tertiary':       {'diam': 0.90, 'spacing_m': 80},
            'tertiary_link':  {'diam': 0.80, 'spacing_m': 80},
        }

        # Key collector avenues & main subdivision access corridors
        COLLECTOR_KEYWORDS = [
            'main road', 'avenue', 'ave', 'drive', 'dr', 'blvd', 'boulevard',
            'saint mary', 'alecon', 'ruby', 'casimiro', 'thomas', 'dolmar', 'celina', 'narra',
            'joyville', 'don mariano', 'azucena'
        ]

        # Snap tolerance: merge nodes within ~50m (10 grid cells)
        SNAP_DIST = 10

        # Distance transform to snap boundary roads (e.g. Camarin Rd) directly to interior border
        from scipy.ndimage import distance_transform_edt as _edt
        dist_to_in, nearest_in_idx = _edt(~border_mask, return_indices=True)

        # Helper: Euclidean distance in metres between two (lat,lon) points
        def _haversine_m(lat1, lon1, lat2, lon2):
            R = 6_371_000.0
            dlat = _math.radians(lat2 - lat1)
            dlon = _math.radians(lon2 - lon1)
            a = (_math.sin(dlat / 2) ** 2 +
                 _math.cos(_math.radians(lat1)) *
                 _math.cos(_math.radians(lat2)) *
                 _math.sin(dlon / 2) ** 2)
            return 2 * R * _math.asin(_math.sqrt(a))

        # ── Pass 1: sample manholes along centerlines of main roads ──────────
        raw_nodes = []
        raw_segs  = []

        for way in osm['elements']:
            if way.get('type') != 'way':
                continue
            hw = way.get('tags', {}).get('highway', '')
            name = way.get('tags', {}).get('name', '')
            geom = way.get('geometry', [])
            if len(geom) < 2:
                continue

            is_main = hw in MAIN_HW
            is_collector = any(k in name.lower() for k in COLLECTOR_KEYWORDS) and (hw in {'residential', 'unclassified', 'service'})
            if not (is_main or is_collector):
                continue

            if is_main:
                cfg = MAIN_HW[hw]
                diam = cfg['diam']
                spacing = cfg['spacing_m']
            else:
                diam = 0.75
                spacing = 90

            def _emit(lat, lon):
                cx, cy = geo_to_grid_f(lat, lon)
                if 0 <= cx < nx and 0 <= cy < ny:
                    col = max(0, min(nx-1, int(round(cx))))
                    row = max(0, min(ny-1, int(round(cy))))
                    if border_mask[row, col]:
                        raw_nodes.append((cx, cy, lat, lon))
                        return len(raw_nodes) - 1
                    elif dist_to_in[row, col] <= 5.0:  # Within 25m of border (e.g. Camarin Rd)
                        snapped_r = int(nearest_in_idx[0, row, col])
                        snapped_c = int(nearest_in_idx[1, row, col])
                        snapped_lat = (1.0 - snapped_r / (ny - 1)) * (LAT_MAX - LAT_MIN) + LAT_MIN
                        snapped_lon = (snapped_c / (nx - 1)) * (LON_MAX - LON_MIN) + LON_MIN
                        raw_nodes.append((float(snapped_c), float(snapped_r), snapped_lat, snapped_lon))
                        return len(raw_nodes) - 1
                return None

            last_idx = _emit(geom[0]['lat'], geom[0]['lon'])
            acc = 0.0
            prev_lat, prev_lon = geom[0]['lat'], geom[0]['lon']

            for pt in geom[1:]:
                lat, lon = pt['lat'], pt['lon']
                seg_dist = _haversine_m(prev_lat, prev_lon, lat, lon)
                acc += seg_dist

                while acc >= spacing:
                    frac = 1.0 - (acc - spacing) / max(seg_dist, 1e-3)
                    mid_lat = prev_lat + frac * (lat - prev_lat)
                    mid_lon = prev_lon + frac * (lon - prev_lon)
                    new_idx = _emit(mid_lat, mid_lon)
                    if new_idx is not None and last_idx is not None and new_idx != last_idx:
                        seg_len = _haversine_m(
                            raw_nodes[last_idx][2], raw_nodes[last_idx][3],
                            mid_lat, mid_lon)
                        raw_segs.append((last_idx, new_idx, diam, max(seg_len, 1.0)))
                    if new_idx is not None:
                        last_idx = new_idx
                    acc -= spacing

                prev_lat, prev_lon = lat, lon

            end_idx = _emit(geom[-1]['lat'], geom[-1]['lon'])
            if end_idx is not None and last_idx is not None and end_idx != last_idx:
                seg_len = _haversine_m(
                    raw_nodes[last_idx][2], raw_nodes[last_idx][3],
                    geom[-1]['lat'], geom[-1]['lon'])
                raw_segs.append((last_idx, end_idx, diam, max(seg_len, 1.0)))

        # ── Pass 2: merge nearby nodes at intersections ──────────────────────
        if not raw_nodes:
            raise RuntimeError("No road nodes sampled — check boundary/road data")

        coords_arr = np.array([(n[0], n[1]) for n in raw_nodes])
        snap_kd    = _KDTree(coords_arr)

        merge_map  = list(range(len(raw_nodes)))
        visited    = [False] * len(raw_nodes)
        merged_pts = []

        for i in range(len(raw_nodes)):
            if visited[i]:
                continue
            idxs = snap_kd.query_ball_point(coords_arr[i], SNAP_DIST)
            group = [j for j in idxs if not visited[j]]
            cx = sum(raw_nodes[j][0] for j in group) / len(group)
            cy = sum(raw_nodes[j][1] for j in group) / len(group)
            lat = sum(raw_nodes[j][2] for j in group) / len(group)
            lon = sum(raw_nodes[j][3] for j in group) / len(group)
            mid = len(merged_pts)
            merged_pts.append((cx, cy, lat, lon))
            for j in group:
                merge_map[j] = mid
                visited[j] = True

        seen_pairs = set()
        final_segs = []
        for (a, b, diam, length_m) in raw_segs:
            ma, mb = merge_map[a], merge_map[b]
            if ma == mb:
                continue
            key = (min(ma, mb), max(ma, mb))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            final_segs.append((ma, mb, diam, length_m))

        # ── Pass 3: designate outlets at lowest boundary exit points ─────────
        # Find all nodes near boundary edge
        edge_candidates = []
        for idx, (cx, cy, lat, lon) in enumerate(merged_pts):
            col = max(0, min(nx-1, int(round(cx))))
            row = max(0, min(ny-1, int(round(cy))))
            near_edge = False
            for dr in (-3, -2, -1, 0, 1, 2, 3):
                for dc in (-3, -2, -1, 0, 1, 2, 3):
                    rr = max(0, min(ny-1, row+dr))
                    cc = max(0, min(nx-1, col+dc))
                    if not border_mask[rr, cc]:
                        near_edge = True
                        break
                if near_edge:
                    break
            if near_edge or col <= 3 or col >= nx-4 or row <= 3 or row >= ny-4:
                edge_candidates.append((idx, float(elevation[row, col])))

        outlet_ids = set()
        if edge_candidates:
            # Sort by elevation to choose the lowest elevation drainage outlets
            edge_candidates.sort(key=lambda item: item[1])
            # Pick top 4 lowest distinct outlets along the edges
            for c_id, _ in edge_candidates[:4]:
                outlet_ids.add(c_id)
        else:
            outlet_ids.add(0)

        # Build Node objects
        for idx, (cx, cy, lat, lon) in enumerate(merged_pts):
            col = max(0, min(nx-1, int(round(cx))))
            row = max(0, min(ny-1, int(round(cy))))
            z_surf = float(elevation[row, col])
            z_inv  = z_surf - 1.5
            nodes_list.append(Node(
                node_id    = idx,
                x          = col,
                y          = row,
                z_invert   = z_inv,
                is_outlet  = (idx in outlet_ids),
                shaft_area = 2.0,
            ))

        # ── Pass 4: build Pipe objects ───────────────────────────────────────
        pipe_id = 0
        for (ma, mb, diam, length_m) in final_segs:
            pipes.append(Pipe(
                pipe_id     = pipe_id,
                node_in     = ma,
                node_out    = mb,
                diameter    = diam,
                roughness_n = 0.013,
                length      = max(length_m, 1.0),
            ))
            pipe_id += 1

        # ── Pass 5: connect any disjoint components into unified network ─────
        adj = {i: [] for i in range(len(merged_pts))}
        for p in pipes:
            adj[p.node_in].append(p.node_out)
            adj[p.node_out].append(p.node_in)

        visited_comp = set()
        components = []
        for i in range(len(merged_pts)):
            if i in visited_comp:
                continue
            comp = []
            queue = [i]
            visited_comp.add(i)
            while queue:
                curr = queue.pop()
                comp.append(curr)
                for nb in adj[curr]:
                    if nb not in visited_comp:
                        visited_comp.add(nb)
                        queue.append(nb)
            components.append(comp)

        # Sort components largest first
        components.sort(key=len, reverse=True)
        if len(components) > 1:
            main_comp = set(components[0])
            for secondary in components[1:]:
                # Find closest pair between secondary and main_comp
                best_dist = float('inf')
                best_pair = None
                for u in secondary:
                    u_x, u_y = merged_pts[u][0], merged_pts[u][1]
                    for v in main_comp:
                        v_x, v_y = merged_pts[v][0], merged_pts[v][1]
                        dist_sq = (u_x - v_x)**2 + (u_y - v_y)**2
                        if dist_sq < best_dist:
                            best_dist = dist_sq
                            best_pair = (u, v)
                if best_pair is not None:
                    u, v = best_pair
                    dist_m = float(_math.sqrt(best_dist)) * dx
                    pipes.append(Pipe(
                        pipe_id     = pipe_id,
                        node_in     = u,
                        node_out    = v,
                        diameter    = 0.75,
                        roughness_n = 0.013,
                        length      = max(dist_m, 1.0),
                    ))
                    pipe_id += 1
                    main_comp.update(secondary)

        # Demo blockage: first non-outlet secondary/trunk pipe (diameter >= 0.90)
        MAIN_BLOCKAGE = 0
        SECONDARY_DIAM = 0.90
        for p in pipes:
            ni = nodes_list[p.node_in]
            no = nodes_list[p.node_out]
            if not ni.is_outlet and not no.is_outlet and p.diameter >= SECONDARY_DIAM:
                MAIN_BLOCKAGE = p.id
                p.blockage = 0.95
                break

        print(f"[city_builder] OSM pipe network: {len(nodes_list)} manhole nodes "
              f"({len(outlet_ids)} outlets)")
        print(f"[city_builder] {len(pipes)} pipes. Demo blockage -> pipe #{MAIN_BLOCKAGE}")
        osm_network_ok = True

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[city_builder] OSM pipe network failed ({e}), using 3x3 fallback")


    if not osm_network_ok:
        # 3x3 fallback
        def wp_frac(ry, cx):
            return (int(ry * ny), int(cx * nx))
        drain_positions = [
            wp_frac(.15,.15), wp_frac(.15,.50), wp_frac(.15,.85),
            wp_frac(.50,.15), wp_frac(.50,.50), wp_frac(.50,.85),
            wp_frac(.85,.15), wp_frac(.85,.50), wp_frac(.85,.85),
        ]
        for idx, (r, c) in enumerate(drain_positions):
            nodes_list.append(Node(node_id=idx, x=c, y=r,
                                   z_invert=-12.0 - idx*0.5,
                                   is_outlet=(idx == 8)))
        pipe_id = 0
        for n_in, n_out in [(0,1),(1,2),(3,4),(4,5),(6,7),(7,8),
                             (0,3),(3,6),(1,4),(4,7),(2,5),(5,8)]:
            r1,c1 = drain_positions[n_in]; r2,c2 = drain_positions[n_out]
            length = float(np.sqrt((r2-r1)**2+(c2-c1)**2))*dx
            p = Pipe(pipe_id=pipe_id, node_in=n_in, node_out=n_out,
                     diameter=1.0, roughness_n=0.013, length=max(length,1.0))
            if pipe_id == 6:
                p.blockage = 0.95
            pipes.append(p); pipe_id += 1
        MAIN_BLOCKAGE = 6

    # ── 4f. Inlet mapping: every cell -> nearest INTERIOR manhole (KD-tree) ──
    # IMPORTANT: Outlet nodes (blue circles) are pipe exits into rivers/canals.
    # They have NO street grates. Surface water must only drain into orange
    # interior manholes. Outlet nodes only receive water via the pipe network.
    try:
        from scipy.spatial import cKDTree as _KDT2
        # Build KD-tree using ONLY non-outlet (interior manhole) nodes
        interior_nodes = [n for n in nodes_list if not n.is_outlet]
        if not interior_nodes:
            interior_nodes = nodes_list  # fallback: use all if no interior found
        interior_coords = np.array([[n.x, n.y] for n in interior_nodes], dtype=np.float32)
        interior_ids    = [n.id for n in interior_nodes]
        kd2 = _KDT2(interior_coords)
        MAX_INLET_DIST = 60   # cells = 300 m
        all_rc = np.array([[c, r] for r in range(ny) for c in range(nx)], dtype=np.float32)
        dists2, idxs2 = kd2.query(all_rc)
        for idx_flat, (c, r) in enumerate([(c, r) for r in range(ny) for c in range(nx)]):
            if dists2[idx_flat] <= MAX_INLET_DIST:
                # Map to the real node ID (not the interior_nodes array index)
                inlet_mapping[(c, r)] = interior_ids[int(idxs2[idx_flat])]
    except Exception as e:
        print(f"[city_builder] inlet_mapping KD fallback: {e}")
        for r in range(ny):
            for c in range(nx):
                inlet_mapping[(c, r)] = 0

    nodes = {n.id: n for n in nodes_list}


    RAW_MAP_LABELS = [
        # ── Major Road Labels ──
        {'name': 'Kabatuhan Rd', 'type': 'road', 'icon': '🛣️', 'lat': 14.7410, 'lon': 121.0150, 'color': '#34495e'},
        {'name': 'Deparo Rd (Sentro)', 'type': 'road', 'icon': '🛣️', 'lat': 14.7402, 'lon': 121.0252, 'color': '#34495e'},
        {'name': 'Camarin Rd', 'type': 'road', 'icon': '🛣️', 'lat': 14.7420, 'lon': 121.0333, 'color': '#34495e'},
        {'name': 'Teofilo Samson Ave', 'type': 'road', 'icon': '🛣️', 'lat': 14.7370, 'lon': 121.0225, 'color': '#34495e'},
        {'name': 'Narra Street', 'type': 'road', 'icon': '🛣️', 'lat': 14.7372, 'lon': 121.0135, 'color': '#34495e'},
        {'name': 'Saint Mary St (Altezza)', 'type': 'road', 'icon': '🛣️', 'lat': 14.7460, 'lon': 121.0075, 'color': '#34495e'},
        {'name': 'Nova Romania Main Rd', 'type': 'road', 'icon': '🛣️', 'lat': 14.7450, 'lon': 121.0118, 'color': '#34495e'},
        {'name': 'Sto. Thomas Extension', 'type': 'road', 'icon': '🛣️', 'lat': 14.7415, 'lon': 121.0200, 'color': '#34495e'},

        # ── Civic, Commercial & Institutional Landmarks ──
        {'name': 'BARANGAY 168 HALL', 'type': 'hall', 'icon': '🏛️', 'lat': 14.7392, 'lon': 121.0185, 'color': '#8e44ad'},
        {'name': 'Deparo High School', 'type': 'school', 'icon': '🏫', 'lat': 14.7408, 'lon': 121.0102, 'color': '#27ae60'},
        {'name': 'La Consolacion College Area', 'type': 'school', 'icon': '🎓', 'lat': 14.7436, 'lon': 121.0255, 'color': '#27ae60'},
        {'name': 'Puregold Deparo', 'type': 'commercial', 'icon': '🛒', 'lat': 14.7412, 'lon': 121.0235, 'color': '#e67e22'},
        {'name': 'Vicas Market / Cedar Corner', 'type': 'commercial', 'icon': '🏪', 'lat': 14.7450, 'lon': 121.0345, 'color': '#e67e22'},
        {'name': '168 Firing Range', 'type': 'commercial', 'icon': '🎯', 'lat': 14.7418, 'lon': 121.0085, 'color': '#c0392b'},

        # ── Residential Communities & Subdivisions ──
        {'name': 'Camella Altezza', 'type': 'residential', 'icon': '🏘️', 'lat': 14.7462, 'lon': 121.0082, 'color': '#2980b9'},
        {'name': 'Nova Romania', 'type': 'residential', 'icon': '🏘️', 'lat': 14.7445, 'lon': 121.0122, 'color': '#2980b9'},
        {'name': 'BF Homes Phase 3', 'type': 'residential', 'icon': '🏘️', 'lat': 14.7395, 'lon': 121.0115, 'color': '#2980b9'},
        {'name': 'Precious Ruby Homes', 'type': 'residential', 'icon': '🏘️', 'lat': 14.7390, 'lon': 121.0165, 'color': '#2980b9'},
        {'name': 'Sto. Thomas Village', 'type': 'residential', 'icon': '🏘️', 'lat': 14.7422, 'lon': 121.0205, 'color': '#2980b9'},
        {'name': 'Casimiro Townhomes', 'type': 'residential', 'icon': '🏘️', 'lat': 14.7428, 'lon': 121.0225, 'color': '#2980b9'},
        {'name': 'Dolmar Golden Hills', 'type': 'residential', 'icon': '🏘️', 'lat': 14.7410, 'lon': 121.0268, 'color': '#2980b9'},
        {'name': 'Metro Green Village', 'type': 'residential', 'icon': '🏘️', 'lat': 14.7435, 'lon': 121.0318, 'color': '#2980b9'},
    ]

    map_labels = []
    for item in RAW_MAP_LABELS:
        c = (item['lon'] - LON_MIN) / (LON_MAX - LON_MIN) * (nx - 1)
        r = (1.0 - (item['lat'] - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (ny - 1)
        map_labels.append({
            "name": item["name"],
            "type": item["type"],
            "icon": item["icon"],
            "color": item["color"],
            "x": round(float(c), 1),
            "y": round(float(r), 1),
            "lat": item["lat"],
            "lon": item["lon"]
        })

    ensure_terrain_textures(nx=nx, ny=ny, lat_min=LAT_MIN, lat_max=LAT_MAX, lon_min=LON_MIN, lon_max=LON_MAX, force=False)

    return {
        "grid_shape": (ny, nx),
        "dx": dx,
        "elevation": elevation,
        "road_mask": road_mask.tolist(),
        "buildings": buildings,
        "nodes": nodes,
        "pipes": pipes,
        "inlet_mapping": inlet_mapping,
        "main_blockage_id": MAIN_BLOCKAGE,
        "border_mask": border_mask.tolist(),
        "zones": zones,
        "zone_grid": zone_grid,
        "brgy_border": brgy_border,
        "zone_borders": zone_borders,
        "map_labels": map_labels,
    }


def ensure_terrain_textures(nx=690, ny=380, lat_min=14.7315, lat_max=14.7485, lon_min=121.0050, lon_max=121.0370, force=False):
    """
    Generate high-resolution anti-aliased vector road and grass textures for Three.js.
    Uses exact bounds and GeoJSON boundary matching the simulation grid.
    """
    import os
    static_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'static')
    roads_tex = os.path.join(static_dir, 'terrain_roads.png')
    grass_tex = os.path.join(static_dir, 'terrain_grass.png')
    if not force and os.path.exists(roads_tex) and os.path.exists(grass_tex):
        return

    try:
        from PIL import Image, ImageDraw
        import json

        data_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
        geojson_path = os.path.join(data_dir, 'brgy168.geojson')
        osm_path = os.path.join(data_dir, 'roads_osm.json')
        if not os.path.exists(geojson_path) or not os.path.exists(osm_path):
            return

        scale = 4
        w, h = nx * scale, ny * scale
        LAT_MIN, LAT_MAX = lat_min, lat_max
        LON_MIN, LON_MAX = lon_min, lon_max

        def geo_to_grid(lat, lon):
            c = (lon - LON_MIN) / (LON_MAX - LON_MIN) * (nx - 1)
            r = (1.0 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (ny - 1)
            return c, r

        # Background grass for outside barangay
        img_grass = Image.new("RGBA", (w, h), (138, 154, 112, 255))
        draw_grass = ImageDraw.Draw(img_grass)

        with open(geojson_path, 'r') as f:
            gj = json.load(f)
        coords = np.array(gj['coordinates'][0])
        poly_pts = [geo_to_grid(lat, lon) for lon, lat in coords]
        poly_pts_scaled = [(pt[0] * scale, pt[1] * scale) for pt in poly_pts]

        # Fill inside barangay with rich green grass
        draw_grass.polygon(poly_pts_scaled, fill=(107, 147, 77, 255))

        rng = np.random.default_rng(42)
        noise = rng.integers(-5, 6, (h, w), dtype=np.int16)
        base_arr = np.array(img_grass, dtype=np.int16)
        for ch in range(3):
            base_arr[:, :, ch] = np.clip(base_arr[:, :, ch] + noise, 0, 255)
        img_grass = Image.fromarray(base_arr.astype(np.uint8))
        img_grass.save(grass_tex, optimize=True)

        img_roads = img_grass.copy()
        draw_roads = ImageDraw.Draw(img_roads)

        with open(osm_path, 'r') as f:
            osm = json.load(f)

        ROAD_STYLES = {
            'motorway':       {'width': int(2.5 * scale), 'color': (68, 79, 92, 255)},
            'trunk':          {'width': int(2.5 * scale), 'color': (68, 79, 92, 255)},
            'primary':        {'width': int(2.5 * scale), 'color': (68, 79, 92, 255)},
            'secondary':      {'width': int(2.2 * scale), 'color': (70, 81, 93, 255)},
            'tertiary':       {'width': int(1.6 * scale), 'color': (78, 91, 105, 255)},
            'secondary_link': {'width': int(1.6 * scale), 'color': (78, 91, 105, 255)},
            'tertiary_link':  {'width': int(1.6 * scale), 'color': (78, 91, 105, 255)},
            'residential':    {'width': max(2, int(0.9 * scale)), 'color': (90, 103, 116, 255)},
            'unclassified':   {'width': max(2, int(0.9 * scale)), 'color': (90, 103, 116, 255)},
            'living_street':  {'width': max(2, int(0.9 * scale)), 'color': (90, 103, 116, 255)},
            'service':        {'width': max(2, int(0.7 * scale)), 'color': (95, 108, 120, 255)},
        }

        ways_by_level = {1: [], 2: [], 3: []}
        for way in osm['elements']:
            if way.get('type') != 'way' or 'geometry' not in way:
                continue
            hw = way.get('tags', {}).get('highway', 'residential')
            lvl = 3 if hw in ['motorway', 'trunk', 'primary', 'secondary'] else (2 if hw in ['tertiary', 'secondary_link', 'tertiary_link'] else 1)
            ways_by_level[lvl].append((hw, way['geometry']))

        # Draw all roads across the area
        for lvl in [1, 2, 3]:
            for hw, geom in ways_by_level[lvl]:
                style = ROAD_STYLES.get(hw, {'width': max(2, int(0.9 * scale)), 'color': (90, 103, 116, 255)})
                pts = [geo_to_grid(p['lat'], p['lon']) for p in geom]
                pts_scaled = [(p[0] * scale, p[1] * scale) for p in pts]
                for i in range(len(pts_scaled) - 1):
                    p1, p2 = pts_scaled[i], pts_scaled[i+1]
                    draw_roads.line([p1, p2], fill=style['color'], width=style['width'], joint="curve")

        # Create boundary mask (255 inside barangay, 0 outside)
        mask_img = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask_img).polygon(poly_pts_scaled, fill=255)
        mask_arr = np.array(mask_img)

        # Inside: full road appearance; Outside: subtle muted roads
        roads_arr = np.array(img_roads, dtype=np.uint8)
        grass_arr = np.array(img_grass, dtype=np.uint8)
        outside = mask_arr == 0
        # Blend outside roads softly into outside grass (40% road, 60% grass)
        roads_arr[outside] = (roads_arr[outside] * 0.45 + grass_arr[outside] * 0.55).astype(np.uint8)
        img_roads = Image.fromarray(roads_arr)

        img_roads.save(roads_tex, optimize=True)
        print(f"[city_builder] Generated high-res smooth terrain textures at {static_dir}")
    except Exception as e:
        print(f"[city_builder] Texture generation fallback: {e}")

