import requests
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

def fetch_data():
    try:
        terrain = requests.get("http://localhost:8000/api/terrain").json()
        state = requests.get("http://localhost:8000/api/state").json()
        return terrain, state
    except requests.ConnectionError:
        print("Error: Could not connect to the simulation server. Is 'python main.py' running?")
        exit(1)

def plot_heatmap():
    terrain, state = fetch_data()
    
    # 1. Parse arrays
    nx = terrain['shape'][1]
    ny = terrain['shape'][0]
    
    elevation = np.array(terrain['elevation'])
    water_depth = np.array(state['water_depth'])
    
    # 2. Mask dry cells
    water_masked = np.ma.masked_where(water_depth < 0.02, water_depth)
    
    # 3. Create figure
    fig, ax = plt.subplots(figsize=(10, 8))
    
    # Plot Terrain
    terrain_im = ax.imshow(elevation, cmap='terrain', alpha=0.6, extent=[0, nx, 0, ny])
    plt.colorbar(terrain_im, ax=ax, label='Elevation (m)', shrink=0.7)
    
    # Plot Water
    water_cmap = LinearSegmentedColormap.from_list('water', ['#e0f7fa', '#01579b'])
    if water_masked.count() > 0:
        water_im = ax.imshow(water_masked, cmap=water_cmap, vmin=0, vmax=np.max(water_masked), extent=[0, nx, 0, ny])
        plt.colorbar(water_im, ax=ax, label='Water Depth (m)', shrink=0.7)
    
    # Plot Buildings
    for b in terrain['buildings']:
        rect = plt.Rectangle((b['x'] - b['width']/2, b['y'] - b['width']/2), 
                             b['width'], b['width'], 
                             facecolor='#34495e', edgecolor='black', alpha=0.8)
        ax.add_patch(rect)
        
    ax.set_title(f"2D Diffusion Wave Flood Simulation\nTime: {state['time_label']} | Max Depth: {state['telemetry']['max_depth']}m")
    ax.set_xlabel("X (meters)")
    ax.set_ylabel("Y (meters)")
    ax.invert_yaxis()  # Match simulation coordinate system
    
    plt.tight_layout()
    plt.savefig("flood_heatmap_snapshot.png", dpi=300)
    print("Saved flood_heatmap_snapshot.png!")
    plt.show()

if __name__ == "__main__":
    plot_heatmap()
