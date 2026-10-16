import json
import numpy as np
import matplotlib.pyplot as plt
import sys
sys.path.insert(0, '.')
from src.utils.city_builder import build_procedural_city

city = build_procedural_city()

with open('data/roads_osm.json') as f:
    osm = json.load(f)

with open('data/brgy168.geojson') as f:
    b168 = json.load(f)
b_coords = np.array(b168['coordinates'][0])

fig, ax = plt.subplots(figsize=(18, 11), dpi=150)

# Plot roads
for el in osm['elements']:
    if el.get('type') == 'way' and 'geometry' in el:
        lons = [p['lon'] for p in el['geometry']]
        lats = [p['lat'] for p in el['geometry']]
        ax.plot(lons, lats, color='#bdc3c7', lw=0.6, alpha=0.7)

# Plot boundary
ax.plot(b_coords[:, 0], b_coords[:, 1], color='#e74c3c', lw=2.5, label='Barangay 168 Boundary')

# Map grid to geo
LON_MIN = 121.0050
LON_MAX = 121.0370
LAT_MIN = 14.7315
LAT_MAX = 14.7485
nx = 690
ny = 380

def grid_to_geo(c, r):
    lon = LON_MIN + (c / (nx - 1)) * (LON_MAX - LON_MIN)
    lat = LAT_MAX - (r / (ny - 1)) * (LAT_MAX - LAT_MIN)
    return lon, lat

# Plot Zones
for z in city['zones']:
    z_lon, z_lat = grid_to_geo(z['center_x'], z['center_y'])
    ax.scatter(z_lon, z_lat, color=z['color'], s=120, edgecolors='black', zorder=5)
    ax.annotate(f"{z['name']}\n({z['area_ha']} ha)", (z_lon, z_lat),
                fontsize=9, fontweight='bold', ha='center', va='bottom',
                bbox=dict(boxstyle='round,pad=0.2', facecolor='white', alpha=0.85, edgecolor=z['color']))

# Plot Labels
for l in city['map_labels']:
    ax.scatter(l['lon'], l['lat'], color='purple', s=40, zorder=6)
    ax.annotate(f"{l['icon']} {l['name']}", (l['lon'], l['lat']),
                fontsize=7.5, color='#2c3e50', alpha=0.9,
                bbox=dict(boxstyle='round,pad=0.15', facecolor='#f8f9fa', alpha=0.8, edgecolor='#bdc3c7'))

ax.set_xlim(121.004, 121.038)
ax.set_ylim(14.731, 14.749)
ax.set_title("Current Zones & Map Labels Layout Analysis", fontsize=14, fontweight='bold')
plt.tight_layout()
plt.savefig('scripts/current_zones_labels_map.png')
print("Saved scripts/current_zones_labels_map.png")
