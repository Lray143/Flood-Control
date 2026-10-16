import json, sys, numpy as np
sys.path.insert(0, 'src')
from matplotlib.path import Path

with open('data/brgy168.geojson') as f:
    geo = json.load(f)
coords = geo['coordinates'][0]
poly_path = Path([(c[0], c[1]) for c in coords])

# Check lat 14.7430-14.7445 range
print("Checking upper-central lat band for sto_thomas_casimiro:")
for lat in [14.7420, 14.7425, 14.7430, 14.7435, 14.7440]:
    row = []
    for lon in [121.0200, 121.0205, 121.0210, 121.0215, 121.0220, 121.0225, 121.0230]:
        inside = poly_path.contains_point((lon, lat))
        row.append("IN " if inside else "OUT")
    print(f"  lat={lat}: " + " | ".join(row))
