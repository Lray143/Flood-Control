# 🌧 Urban Hydrodynamics: 2D Diffusion Wave Flood Simulation

**Urban Hydrodynamics: A 2D Diffusion Wave Model for Urban Flood Routing and Drainage Simulation**

> Computational Science Research Project — University of Caloocan City, 2026  
> Study Area: **Barangay 168, Caloocan City, Philippines**  
> Adviser: Prof. Edrick Mendoza Estorel  
> Student: Marc Josef P. Salenga

---

## 🖥 Live Preview

![Simulation Screenshot](static/preview.png)

A real-time 3D/2D flood simulation using actual SRTM elevation data, OpenStreetMap road networks, and a diffusive-wave physics engine — all running locally in your browser.

---

## ✨ Features

- 🌧 **Real-time rainfall simulation** — adjustable from 0 to 1000 mm/hr
- 🏠 **25,000 procedural buildings** — 6 types (residential, shanty, shop, concrete, apartment, warehouse)
- 🛣 **Real OSM road network** — 1,638 road segments from OpenStreetMap
- ⛰ **Real SRTM elevation data** — 30m DEM from OpenTopography, bicubic-upsampled
- 💧 **Diffusive-wave physics** — Manning's equation, infiltration, drain coupling
- 🔵 **Underground pipe network** — 9-node drainage system with blockage simulation
- 📐 **2D / 3D view toggle** — top-down map or 3D perspective
- ⏩ **Speed control** — 1× to 10000× real-time simulation speed
- ⏪ **Rewind to snapshots** — jump back to any saved state
- 🗂 **Layer visibility** — toggle buildings, roads, water, border, drain nodes
- 👁 **X-Ray mode** — see underground pipes through terrain

---

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/Comp_Sci_Flood_Control.git
cd Comp_Sci_Flood_Control
```

### 2. Install Python dependencies

> Requires **Python 3.10+**

```bash
pip install -r requirements.txt
```

> ⚠️ **Numba** (used for physics acceleration) may take a few minutes to install.  
> On first run, it also takes ~10–20 seconds to JIT-compile the physics engine.

### 3. Run the server

```bash
python main.py
```

### 4. Open the simulation

Open your browser and go to:

```
http://localhost:8000
```

---

## 🎮 How to Use

| Control | Action |
|---|---|
| **▶ Play / ⏸ Pause** | Start or pause the simulation |
| **⏩ Speed** | Cycle through 1×, 5×, 25×, 100×, 500×, 1000×, 10000× |
| **Rainfall slider** | Set rainfall intensity (mm/hr) |
| **Main Blockage slider** | Simulate a clogged drain pipe (0–100%) |
| **Scenario Presets** | Load predefined flood scenarios |
| **📐 Switch to 3D View** | Toggle between 2D top-down and 3D perspective |
| **# Grid** | Toggle grid overlay |
| **⛰ Elevation Map** | Show real terrain elevation as a heatmap |
| **👁 X-Ray Ground** | See pipes below ground |
| **⏪ Rewind** | Jump back to a saved snapshot |
| **🔄 Reset** | Clear all water and restart |
| **Layer Visibility** | Show/hide buildings, roads, water, border, pipes |

---

## 📁 Project Structure

```
Flood Control/
├── main.py                      # Entry point — starts uvicorn server
├── requirements.txt             # Python dependencies
├── src/
│   ├── server.py                # FastAPI server + physics loop
│   ├── engine/
│   │   ├── state.py             # Simulation state
│   │   ├── simulator.py         # Time-stepping orchestrator
│   │   ├── surface.py           # Diffusive-wave surface physics (Numba JIT)
│   │   └── underground.py       # Pipe network physics
│   └── utils/
│       └── city_builder.py      # Terrain, roads, buildings, pipe network
├── static/
│   └── index.html               # Three.js 3D frontend
├── barangay168_dem.tif          # SRTM 30m DEM (real elevation data)
├── roads_osm.json               # Real OSM road segments
└── brgy168.geojson              # Barangay 168 boundary polygon
```

---

## 🔬 Physics Model

The simulation uses the **2D Diffusion Wave approximation** of the Shallow Water Equations:

$$q = \frac{h^{5/3} \cdot \sqrt{|S|}}{n} \cdot \text{sign}(S)$$

Where:
- $q$ = discharge per unit width (m²/s)
- $h$ = water depth at cell interface (m)
- $S$ = water surface slope = $\Delta\eta / \Delta x$
- $n$ = Manning's roughness coefficient

| Surface | Manning's n |
|---|---|
| Asphalt road | 0.013 |
| Grass / soil | 0.040 |

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `fastapi` | REST API backend |
| `uvicorn` | ASGI web server |
| `numpy` | Grid computations |
| `scipy` | DEM upsampling, Gaussian smoothing |
| `rasterio` | Reading GeoTIFF elevation data |
| `matplotlib` | Barangay boundary polygon rasterization |
| `numba` | JIT-compiled physics for speed |
| `three.js` (CDN) | 3D rendering in browser |

---

## 📄 License

MIT License — free to use for academic and educational purposes.

---

## 📚 Data Sources

- **Elevation**: [OpenTopography SRTM 30m](https://opentopography.org/)
- **Roads**: [OpenStreetMap](https://www.openstreetmap.org/) via Overpass API
- **Boundary**: [Nominatim / OSM](https://nominatim.openstreetmap.org/)
