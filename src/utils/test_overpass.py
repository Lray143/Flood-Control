import requests
import json
import numpy as np

def get_real_city_data():
    # Bounding box for Barangay 168, Caloocan
    lat_min, lat_max = 14.7307018, 14.7466954
    lon_min, lon_max = 121.0046237, 121.0347708

    # To keep the grid 300x300, we select a smaller 500x500m crop inside the barangay
    # Let's just use a central point
    lat_center = (lat_min + lat_max) / 2
    lon_center = (lon_min + lon_max) / 2
    
    # Approx 1 degree lat = 111,320 meters
    # 300 meters = 300 / 111320 = 0.0027 degrees
    lat_rad = lat_center * np.pi / 180
    lon_deg_per_m = 1.0 / (111320 * np.cos(lat_rad))
    lat_deg_per_m = 1.0 / 111320
    
    s_lat_min = lat_center - (150 * lat_deg_per_m)
    s_lat_max = lat_center + (150 * lat_deg_per_m)
    s_lon_min = lon_center - (150 * lon_deg_per_m)
    s_lon_max = lon_center + (150 * lon_deg_per_m)
    
    bbox = f"{s_lat_min},{s_lon_min},{s_lat_max},{s_lon_max}"
    
    query = f"""
    [out:json];
    (
      way["highway"]({bbox});
      way["building"]({bbox});
    );
    out geom;
    """
    
    print("Querying Overpass API...")
    url = "http://overpass-api.de/api/interpreter"
    response = requests.post(url, data={'data': query})
    data = response.json()
    
    buildings = []
    roads = []
    
    for element in data['elements']:
        if 'tags' in element:
            if 'highway' in element['tags']:
                roads.append(element)
            elif 'building' in element['tags']:
                buildings.append(element)
                
    print(f"Found {len(roads)} roads and {len(buildings)} buildings.")
    
get_real_city_data()
