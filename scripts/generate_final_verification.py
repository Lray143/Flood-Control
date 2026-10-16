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

fig, ax = plt.subplots(figsize=(19, 11), dpi=150)

# Plot roads
for el in osm['elements']:
    if el.get('type') == 'way' and 'geometry' in el:
        lons = [p['lon'] for p in el['geometry']]
        lats = [p['lat'] for p in el['geometry']]
        ax.plot(lons, lats, color='#bdc3c7', lw=0.65, alpha=0.7)

# Plot boundary
ax.plot(b_coords[:, 0], b_coords[:, 1], color='#e74c3c', lw=3.0, label='Barangay 168 Boundary (Google Maps Aligned)')

# Plot zone boundaries
zb = city.get('zone_borders', [])
if len(zb) >= 4:
    segs = np.array(zb).reshape(-1, 4)
    for seg in segs[::3]: # subsample for clean display
        x1, y1, x2, y2 = seg
        lon1, lat1 = grid_to_geo(x1, y1)
        lon2, lat2 = grid_to_geo(x2, y2)
        ax.plot([lon1, lon2], [lat1, lat2], color='#3498db', lw=0.8, alpha=0.35, linestyle=':')

# Plot Zone Centers
for z in city['zones']:
    z_lon, z_lat = grid_to_geo(z['center_x'], z['center_y'])
    ax.scatter(z_lon, z_lat, color=z['color'], s=150, edgecolors='black', zorder=6)
    ax.annotate(f"ZONE: {z['name']}\n({z['area_ha']} ha)", (z_lon, z_lat),
                fontsize=9.5, fontweight='bold', ha='center', va='bottom',
                bbox=dict(boxstyle='round,pad=0.25', facecolor='white', alpha=0.92, edgecolor=z['color'], lw=1.6))

# Plot Map Labels
for l in city['map_labels']:
    is_road = (l['type'] == 'road')
    is_hall = (l['type'] == 'hall')
    color = '#8e44ad' if is_hall else ('#1a5276' if is_road else '#b9770e')
    bg = '#f5eef8' if is_hall else ('#ebf5fb' if is_road else '#fef9e7')
    
    ax.scatter(l['lon'], l['lat'], color=color, s=30, zorder=7)
    ax.annotate(f"{l['name']}", (l['lon'], l['lat']),
                fontsize=8, fontweight='bold', color=color,
                bbox=dict(boxstyle='round,pad=0.2', facecolor=bg, alpha=0.9, edgecolor=color, lw=0.9))

ax.set_xlim(121.004, 121.0375)
ax.set_ylim(14.7335, 14.7485)
ax.set_title("Barangay 168: Improved Subdivisions, Zones & Road Alignment", fontsize=14, fontweight='bold')
ax.legend(loc='lower left')
plt.tight_layout()
plt.savefig('scripts/final_zones_labels_verified.png')
print("Saved scripts/final_zones_labels_verified.png")

import shutil
shutil.copy('scripts/final_zones_labels_verified.png', r'C:\Users\Lray\.gemini\antigravity\brain\66c7edce-1349-4620-a991-f38e839c53a8\final_zones_labels_verified.png')
print("Copied to artifacts directory.")
