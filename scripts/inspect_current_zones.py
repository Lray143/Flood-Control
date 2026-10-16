import sys
sys.path.insert(0, '.')
from src.utils.city_builder import build_procedural_city

city = build_procedural_city()

print("Current Zones:")
for z in city['zones']:
    print(f"  - {z['name']} ({z['id']}): center=({z['center_x']}, {z['center_y']}), cells={z['cell_count']}, area={z['area_ha']}ha")

print("\nCurrent Map Labels:")
for l in city['map_labels']:
    print(f"  - [{l['type']:10s}] {l['name']:25s} : grid=({l['x']}, {l['y']}), lat={l['lat']}, lon={l['lon']}")
