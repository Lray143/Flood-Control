"""Visualize the new road-following pipe network over OSM roads."""
import sys, json, math
sys.path.insert(0, 'src')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

from utils.city_builder import build_procedural_city

LAT_MIN, LAT_MAX = 14.7315, 14.7485
LON_MIN, LON_MAX = 121.0050, 121.0370

city = build_procedural_city(nx=690, ny=380, dx=5.0)
nodes  = city['nodes']
pipes  = city['pipes']
nx_g   = 690
ny_g   = 380

def grid_to_geo(cx, cy):
    lon = cx / (nx_g - 1) * (LON_MAX - LON_MIN) + LON_MIN
    lat = (1.0 - cy / (ny_g - 1)) * (LAT_MAX - LAT_MIN) + LAT_MIN
    return lat, lon

# Load OSM roads for background
with open('data/roads_osm.json') as f:
    osm = json.load(f)

fig, ax = plt.subplots(figsize=(16, 10))
ax.set_facecolor('#1a1a2e')
fig.patch.set_facecolor('#1a1a2e')

# Draw OSM roads (background)
MAJOR_HW = {'secondary', 'primary', 'tertiary', 'trunk'}
for way in osm['elements']:
    if way.get('type') != 'way': continue
    hw = way.get('tags', {}).get('highway', '')
    geom = way.get('geometry', [])
    if len(geom) < 2: continue
    lons = [p['lon'] for p in geom]
    lats = [p['lat'] for p in geom]
    if hw in MAJOR_HW:
        ax.plot(lons, lats, '-', color='#4a4a8a', lw=1.5, alpha=0.8, zorder=1)
    elif hw in {'residential', 'unclassified', 'service'}:
        ax.plot(lons, lats, '-', color='#2a2a4a', lw=0.7, alpha=0.6, zorder=1)

# Draw boundary
with open('data/brgy168.geojson') as f:
    geo = json.load(f)
bcoords = geo['coordinates'][0]
blon = [c[0] for c in bcoords]
blat = [c[1] for c in bcoords]
ax.plot(blon, blat, '-', color='#00ff88', lw=2.0, alpha=0.9, zorder=2, label='Boundary')

# Draw pipes
diam_colors = {
    1.4: '#ff4444',   # primary/trunk - red
    1.2: '#ff8800',   # secondary - orange
    1.0: '#ffcc00',   # secondary_link - yellow
    0.9: '#44aaff',   # tertiary - blue
    0.6: '#88ccff',   # residential - light blue
    0.5: '#aaaaaa',   # living_street - grey
}

pipe_list = list(pipes.values()) if isinstance(pipes, dict) else pipes
for p in pipe_list:
    n_in  = nodes[p.node_in]
    n_out = nodes[p.node_out]
    lat1, lon1 = grid_to_geo(n_in.x,  n_in.y)
    lat2, lon2 = grid_to_geo(n_out.x, n_out.y)
    d = round(p.diameter, 1)
    col = diam_colors.get(d, '#ffffff')
    lw = max(0.5, d * 1.2)
    ax.plot([lon1, lon2], [lat1, lat2], '-', color=col, lw=lw, alpha=0.7, zorder=3)

# Draw nodes
for nid, n in nodes.items():
    lat, lon = grid_to_geo(n.x, n.y)
    if n.is_outlet:
        ax.plot(lon, lat, 'v', color='#ff0000', ms=8, zorder=5)
    else:
        ax.plot(lon, lat, 'o', color='#ffaa00', ms=3, alpha=0.8, zorder=4)

# Legend
patches = [
    mpatches.Patch(color='#ff8800', label='Secondary (Ø1.2m)'),
    mpatches.Patch(color='#44aaff', label='Tertiary (Ø0.9m)'),
    mpatches.Patch(color='#88ccff', label='Residential (Ø0.6m)'),
    mpatches.Patch(color='#ffaa00', label='Manhole nodes'),
    mpatches.Patch(color='#ff0000', label='Outlets'),
    mpatches.Patch(color='#4a4a8a', label='Major roads (bg)'),
    mpatches.Patch(color='#00ff88', label='Brgy boundary'),
]
ax.legend(handles=patches, loc='upper left', fontsize=8,
          facecolor='#222244', labelcolor='white', framealpha=0.9)

ax.set_xlim(LON_MIN, LON_MAX)
ax.set_ylim(LAT_MIN, LAT_MAX)
ax.set_title('Road-Following Pipe Network — Barangay 168', color='white', fontsize=14)
ax.tick_params(colors='white')
for spine in ax.spines.values():
    spine.set_edgecolor('#444466')

plt.tight_layout()
plt.savefig('scripts/pipe_network_verification.png', dpi=150, bbox_inches='tight',
            facecolor='#1a1a2e')
plt.close()
print("Saved: scripts/pipe_network_verification.png")
print(f"Total nodes: {len(nodes)}, Total pipes: {len(pipe_list)}")
outlets = [n for n in nodes.values() if n.is_outlet]
print(f"Outlets: {len(outlets)}")
