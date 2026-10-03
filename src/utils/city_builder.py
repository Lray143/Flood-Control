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

    # ── MAP TRACING (BARANGAY 168 BOUNDARY) ─────────────────────────────────
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

    # ── 4. REALISTIC OSM-ALIGNED PIPE NETWORK ────────────────────────────────
    nodes_list = []
    pipes      = []
    inlet_mapping = {}
    MAIN_BLOCKAGE = 0   # will be updated below

    # Geographic bounding box (same as road loader above)
    LAT_MIN_bb, LAT_MAX_bb = 14.7307018, 14.7466954
    LON_MIN_bb, LON_MAX_bb = 121.0046237, 121.0347708

    def geo_to_grid_f(lat, lon):
        c = (lon - LON_MIN_bb) / (LON_MAX_bb - LON_MIN_bb) * (nx - 1)
        r = (1.0 - (lat - LAT_MIN_bb) / (LAT_MAX_bb - LAT_MIN_bb)) * (ny - 1)
        return c, r

    osm_network_ok = False
    try:
        import json as _json, os as _os, math as _math
        from collections import Counter as _Counter
        from scipy.spatial import cKDTree as _KDTree

        osm_path = _os.path.join(_os.path.dirname(__file__), '..', '..', 'roads_osm.json')
        with open(osm_path) as f:
            osm = _json.load(f)

        DRAIN_HW = {'secondary', 'tertiary', 'residential', 'unclassified',
                    'service', 'secondary_link', 'primary', 'trunk'}

        node_count = _Counter()
        node_pos   = {}

        for way in osm['elements']:
            if way.get('type') != 'way':
                continue
            hw = way.get('tags', {}).get('highway', '')
            if hw not in DRAIN_HW:
                continue
            geom     = way.get('geometry', [])
            node_ids = way.get('nodes', [])
            for nid, pt in zip(node_ids, geom):
                node_count[nid] += 1
                node_pos[nid] = (pt['lat'], pt['lon'])

        # Keep intersections (shared by 2+ roads) inside bbox
        raw_pts = []
        for nid, cnt in node_count.items():
            if cnt < 2:
                continue
            lat, lon = node_pos[nid]
            if not (LAT_MIN_bb <= lat <= LAT_MAX_bb and
                    LON_MIN_bb <= lon <= LON_MAX_bb):
                continue
            c, r = geo_to_grid_f(lat, lon)
            if 0 <= c < nx and 0 <= r < ny:
                if border_mask[int(r), int(c)]:
                    raw_pts.append((c, r))

        # Cluster nearby intersections → manholes
        CLUSTER_DIST = 40   # cells = 200 m
        clusters = []
        used = [False] * len(raw_pts)
        for i, pt in enumerate(raw_pts):
            if used[i]:
                continue
            group = [pt]
            used[i] = True
            for j in range(i + 1, len(raw_pts)):
                if used[j]:
                    continue
                dx2 = pt[0] - raw_pts[j][0]
                dy2 = pt[1] - raw_pts[j][1]
                if _math.sqrt(dx2 * dx2 + dy2 * dy2) < CLUSTER_DIST:
                    group.append(raw_pts[j])
                    used[j] = True
            cx = sum(p[0] for p in group) / len(group)
            cy = sum(p[1] for p in group) / len(group)
            clusters.append((cx, cy))

        # Mark western-most and southern-most existing clusters as outlets
        # instead of creating artificial nodes outside the boundary
        outlet_ids = set()
        if len(clusters) > 4:
            # Sort by X to find westernmost
            sorted_by_x = sorted(enumerate(clusters), key=lambda item: item[1][0])
            # Sort by Y (higher Y is further south in this grid)
            sorted_by_y = sorted(enumerate(clusters), key=lambda item: item[1][1], reverse=True)
            
            outlet_ids.add(sorted_by_x[0][0])
            outlet_ids.add(sorted_by_x[1][0])
            outlet_ids.add(sorted_by_y[0][0])
            outlet_ids.add(sorted_by_y[1][0])
        else:
            for i in range(len(clusters)):
                outlet_ids.add(i)

        print(f"[city_builder] OSM pipe network: {len(clusters)} manhole nodes "
              f"({len(outlet_ids)} outlets)")

        # Build Node objects using real terrain elevation for invert depth
        for idx, (cx, cy) in enumerate(clusters):
            col = max(0, min(nx - 1, int(round(cx))))
            row = max(0, min(ny - 1, int(round(cy))))
            z_surf = float(elevation[row, col])
            z_inv  = z_surf - 1.5
            nodes_list.append(Node(
                node_id   = idx,
                x         = col,
                y         = row,
                z_invert  = z_inv,
                is_outlet = (idx in outlet_ids),
                shaft_area = 2.0,
            ))

        # Connect nodes via K-nearest-neighbor proximity graph
        K_NEAREST     = 3
        MAX_CONN_DIST = 150   # cells
        TRUNK_DIAM    = 1.2
        SECONDARY_DIAM = 0.9
        LATERAL_DIAM  = 0.6

        pipe_id   = 0
        connected = set()
        coords    = np.array([(c[0], c[1]) for c in clusters])
        kd_pipes  = _KDTree(coords)

        for i in range(len(clusters)):
            dists, idxs = kd_pipes.query(coords[i], k=K_NEAREST + 1)
            for dist, j in zip(dists[1:], idxs[1:]):
                if dist > MAX_CONN_DIST:
                    continue
                key = frozenset((i, int(j)))
                if key in connected:
                    continue
                connected.add(key)
                length_m = float(dist) * dx
                diam = TRUNK_DIAM if length_m > 400 else (
                       SECONDARY_DIAM if length_m > 150 else LATERAL_DIAM)
                pipes.append(Pipe(
                    pipe_id    = pipe_id,
                    node_in    = i,
                    node_out   = int(j),
                    diameter   = diam,
                    roughness_n = 0.013,
                    length     = max(length_m, 1.0),
                ))
                pipe_id += 1

        # Demo blockage: first non-outlet secondary/trunk pipe
        MAIN_BLOCKAGE = 0
        for p in pipes:
            ni = nodes_list[p.node_in]
            no = nodes_list[p.node_out]
            if not ni.is_outlet and not no.is_outlet and p.diameter >= SECONDARY_DIAM:
                MAIN_BLOCKAGE = p.id
                p.blockage = 0.95
                break

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

    # ── 4f. Inlet mapping: every cell -> nearest manhole (KD-tree) ───────────
    try:
        from scipy.spatial import cKDTree as _KDT2
        node_coords = np.array([[n.x, n.y] for n in nodes_list], dtype=np.float32)
        kd2 = _KDT2(node_coords)
        MAX_INLET_DIST = 60   # cells = 300 m
        all_rc = np.array([[c, r] for r in range(ny) for c in range(nx)], dtype=np.float32)
        dists2, idxs2 = kd2.query(all_rc)
        for idx_flat, (c, r) in enumerate([(c, r) for r in range(ny) for c in range(nx)]):
            if dists2[idx_flat] <= MAX_INLET_DIST:
                inlet_mapping[(c, r)] = int(idxs2[idx_flat])
    except Exception as e:
        print(f"[city_builder] inlet_mapping KD fallback: {e}")
        for r in range(ny):
            for c in range(nx):
                inlet_mapping[(c, r)] = 0

    nodes = {n.id: n for n in nodes_list}


    # border_mask generated earlier

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
        "border_mask": border_mask.tolist()
    }
