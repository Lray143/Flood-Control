import json
from matplotlib.path import Path
import numpy as np

with open('data/brgy168.geojson') as f:
    b168 = json.load(f)
coords = np.array(b168['coordinates'][0])
poly_geo = Path(coords)

FINAL_MAP_LABELS = [
    # ── Major Road Labels (Floating close to road surface) ──
    {'name': 'Kabatuhan Rd', 'type': 'road', 'icon': '🛣️', 'lat': 14.7410, 'lon': 121.0150, 'color': '#34495e'},
    {'name': 'Deparo Rd (Sentro)', 'type': 'road', 'icon': '🛣️', 'lat': 14.7402, 'lon': 121.0252, 'color': '#34495e'},
    {'name': 'Camarin Rd', 'type': 'road', 'icon': '🛣️', 'lat': 14.7420, 'lon': 121.0336, 'color': '#34495e'},
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

all_ok = True
for l in FINAL_MAP_LABELS:
    inside = poly_geo.contains_point((l['lon'], l['lat']))
    if not inside:
        print(f"FAILED: {l['name']} is OUTSIDE boundary!")
        all_ok = False
    else:
        print(f"OK: {l['name']:30s} is inside")

if all_ok:
    print("\nALL LABELS ARE 100% INSIDE BARANGAY 168 BOUNDARY!")
