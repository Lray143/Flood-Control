import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.server import get_terrain

d = get_terrain()
labels = d.get('map_labels', [])
print(f"PASS: get_terrain returned {len(labels)} map labels successfully.")
for item in labels:
    print(f" - {item['name']:25s} @ ({item['x']}, {item['y']}) [type: {item['type']}]")
