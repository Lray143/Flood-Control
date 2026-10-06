# 🌧 Urban Hydrodynamics: 2D Diffusion Wave Flood Simulation

**Urban Hydrodynamics: A 2D Diffusion Wave Model for Urban Flood Routing and Drainage Simulation**

> Computational Science Research Project — University of Caloocan City, 2026
> Study Area: **Barangay 168, Caloocan City, Philippines**
> Adviser: Prof. Edrick Mendoza Estorel

A real-time 3D/2D flood simulation using actual SRTM elevation data, OpenStreetMap road networks, and a diffusive-wave physics engine — all running locally in your browser.

---

## ✨ Features

- 🌧 **Real-time rainfall simulation** — adjustable from 0 to 1000 mm/hr
- 🏠 **25,000 procedural buildings** — 6 types (residential, shanty, shop, concrete, apartment, warehouse)
- 🛣 **Real OSM road network** — 1,638 road segments from OpenStreetMap
- ⛰ **Real SRTM elevation data** — 30m DEM from OpenTopography, bicubic-upsampled to 5m
- 💧 **Diffusive-wave physics** — Manning's equation, infiltration, drain coupling
- 🔵 **Underground pipe network** — OSM-aligned drainage system with blockage simulation
- 📐 **2D / 3D view toggle** — top-down map or 3D perspective
- ⏩ **Speed control** — 1× to 10000× real-time simulation speed
- ⏪ **Rewind to snapshots** — jump back to any saved state
- 🗂 **Layer visibility** — toggle buildings, roads, water, border, drain nodes
- 👁 **X-Ray mode** — see underground pipes through terrain

---

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/Flood-Control.git
cd Flood-Control
```

### 2. Create a virtual environment (recommended)

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 3. Install Python dependencies

> Requires **Python 3.10+**

```bash
pip install -r requirements.txt
```

> ⚠️ **Numba** (used for physics acceleration) may take a few minutes to install.
> On first run, it also takes ~10–20 seconds to JIT-compile the physics engine.

### 4. Run the server

```bash
python main.py
```

### 5. Open the simulation

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

## 🏗️ Architecture

The system is split into three layers that communicate via a REST API:

```
┌─────────────────────────────────────────────────────┐
│                   BROWSER (Frontend)                 │
│         Three.js 3D/2D renderer  ·  UI Controls     │
│         Polls /api/state every ~50ms                │
└────────────────────┬────────────────────────────────┘
                     │ HTTP REST (JSON)
┌────────────────────▼────────────────────────────────┐
│               FastAPI Server  (src/server.py)        │
│  • Exposes REST endpoints (terrain, state, control)  │
│  • Runs physics_loop() as an asyncio background task │
│  • Delegates heavy compute to a thread pool          │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
┌──────────▼──────────┐  ┌───────────▼───────────────┐
│  Surface Engine      │  │  Underground Engine        │
│  (engine/surface.py) │  │  (engine/underground.py)  │
│  Numba JIT-compiled  │  │  Manning pipe-flow solver  │
│  2D diffusion wave   │  │  Node/Pipe network graph   │
└─────────────────────┘  └───────────────────────────┘
           │                          │
           └──────────┬───────────────┘
                      │
            ┌─────────▼──────────┐
            │  SimulationState   │
            │  (engine/state.py) │
            │  All grids + nodes │
            └────────────────────┘
```

### Startup Sequence

```
main.py
  └─ uvicorn starts FastAPI app (src/server.py)
        └─ build_procedural_city()        ← loads DEM, OSM roads, GeoJSON boundary
              └─ SimulationState()         ← allocates all numpy grids
                    └─ physics_loop()      ← asyncio task starts at ~20 Hz
```

---

## 📁 Project Structure

```
Flood Control/
├── main.py                      # Entry point — starts uvicorn server
├── requirements.txt             # Python dependencies (pinned)
├── CONTRIBUTING.md              # How to contribute
├── src/
│   ├── server.py                # FastAPI server + physics loop + REST endpoints
│   ├── engine/
│   │   ├── state.py             # SimulationState — holds all grids and network data
│   │   ├── simulator.py         # Time-stepping orchestrator (sub-steps for CFL stability)
│   │   ├── surface.py           # Diffusive-wave surface physics (Numba JIT-compiled)
│   │   └── underground.py       # Pipe network physics (Node + Pipe classes)
│   └── utils/
│       └── city_builder.py      # Builds terrain, roads, buildings, and pipe network
├── static/
│   └── index.html               # Three.js 3D/2D frontend (single-file app)
├── data/
│   ├── barangay168_dem.tif      # SRTM 30m DEM — real elevation data
│   ├── roads_osm.json           # OpenStreetMap road segments (Overpass API export)
│   └── brgy168.geojson          # Barangay 168 boundary polygon
├── scripts/
│   ├── check_ids.py             # Verify HTML element IDs match JS references
│   ├── fetch_osm_data.py        # Fetch fresh OSM road data via Overpass API
│   └── plot_results.py          # Generate a 2D flood heatmap from a live server
└── tests/
    └── .gitkeep
```

---

## 🔬 Physics Model

### Surface Flow — 2D Diffusion Wave

The simulation uses the **2D Diffusion Wave approximation** of the Shallow Water Equations:

$$q = \frac{h^{5/3} \cdot \sqrt{|S|}}{n} \cdot \text{sign}(S)$$

Where:
- $q$ = discharge per unit width (m²/s)
- $h$ = water depth at the cell interface (m)
- $S$ = water surface slope = $\Delta\eta / \Delta x$ (η = elevation + water depth)
- $n$ = Manning's roughness coefficient

| Surface | Manning's n |
|---|---|
| Asphalt road | 0.013 |
| Grass / soil | 0.040 |

Numerical stability is maintained by CFL sub-stepping inside `Simulator.step()`. At high fast-forward speeds, the max sub-step is relaxed (up to 10 s) because both engines apply unconditional volume caps.

### Underground Drainage — 1D Pipe Network

Each **Node** is a manhole/junction with a storage volume (shaft area = 2 m²).
Each **Pipe** carries flow driven by the hydraulic grade line using Manning's full-pipe equation:

$$Q = \frac{A \cdot R^{2/3} \cdot S_f^{1/2}}{n}$$

- Backwater flow is supported (flow reverses when downstream head > upstream head)
- Blockage reduces the effective cross-sectional area: `A_eff = A × (1 − blockage)`
- Outlet nodes drain freely to atmosphere (volume set to 0 each step)

### Surface ↔ Underground Coupling

Every surface grid cell is mapped to its nearest interior manhole (KD-tree, max 300 m).
When surface water depth exceeds the threshold, water is transferred from the grid cell into that manhole's volume each timestep.

### Simulation Time System

| `sim_speed` | Real-time equivalent |
|---|---|
| 1 | 1 sim-second per real second |
| 3600 | 1 sim-hour per real second |
| 86400 | 1 sim-day per real second |
| 10000 | Maximum — uses larger sub-steps |

---

## 🛠️ Tech Stack

### Backend
| Technology | Role |
|---|---|
| **Python 3.10+** | Primary language |
| **FastAPI** | REST API framework |
| **Uvicorn** | ASGI web server |
| **NumPy** | All grid/array computation |
| **Numba** | JIT-compiles the surface physics kernel for GPU-class CPU speed |
| **SciPy** | DEM bicubic upsampling, Gaussian smoothing, KD-tree for inlet mapping |
| **Rasterio** | Reads the GeoTIFF SRTM elevation file |
| **Matplotlib** | Rasterizes the GeoJSON boundary polygon into a grid mask |

### Frontend
| Technology | Role |
|---|---|
| **Three.js** (CDN) | 3D/2D scene rendering |
| **HTML / CSS / JS** | Single-file app in `static/index.html` |

### Data
| Source | Used For |
|---|---|
| **OpenTopography SRTM 30m** | Real terrain elevation (`barangay168_dem.tif`) |
| **OpenStreetMap / Overpass API** | Real road network (`roads_osm.json`) |
| **Nominatim / OSM** | Barangay boundary polygon (`brgy168.geojson`) |

---

## 🌐 REST API Reference

All endpoints are served at `http://localhost:8000`.

### GET `/api/terrain`
Returns the full terrain dataset (loaded once by the frontend on startup).

**Response fields:**
| Field | Type | Description |
|---|---|---|
| `shape` | `[ny, nx]` | Grid dimensions |
| `dx` | `float` | Cell size in metres |
| `elevation` | `float[][]` | Terrain elevation grid (m) |
| `road_mask` | `bool[][]` | True where a road cell exists |
| `border_mask` | `bool[][]` | True for cells inside Barangay 168 |
| `buildings` | `object[]` | List of building objects (x, y, width, height, color, etc.) |
| `nodes` | `object[]` | Drain node positions and types |
| `pipes` | `object[]` | Pipe connections, diameters, blockage |
| `main_blockage_id` | `int` | ID of the primary demo blockage pipe |

---

### GET `/api/state`
Returns the current live simulation state. Called by the frontend every ~50 ms.

**Response fields:**
| Field | Type | Description |
|---|---|---|
| `time` | `float` | Simulation time (seconds) |
| `time_label` | `string` | Human-readable time (e.g. `"1.2 hr"`) |
| `running` | `bool` | Whether the simulation is playing |
| `speed` | `int` | Current speed multiplier |
| `water_depth` | `float[][]` | Water depth grid (m); cells < 0.04 m masked to 0 |
| `rainfall_mmhr` | `float` | Current rainfall intensity (mm/hr) |
| `telemetry` | `object` | `max_depth`, `total_vol_m3`, `flooded_cells`, `blockage`, `mb_error_pct` |
| `pipes` | `object[]` | Live per-pipe blockage and flow |
| `nodes` | `object[]` | Live per-node hydraulic head and volume |
| `snapshots` | `object[]` | Available rewind points |

---

### POST `/api/control`
Toggle play / pause.

### POST `/api/speed`
```json
{ "multiplier": 100 }
```

### POST `/api/rainfall`
```json
{ "mm_per_hr": 150.0, "duration_sim_hours": 3.0 }
```
Omit `duration_sim_hours` for indefinite rain.

### POST `/api/pipe/{pipe_id}/blockage`
```json
{ "blockage": 0.95 }
```
Values from `0.0` (clear) to `1.0` (fully blocked).

### POST `/api/pipe/{pipe_id}/diameter`
```json
{ "diameter": 1.2 }
```
Diameter in metres (0.1 – 5.0 m).

### POST `/api/pipes/bulk_blockage`
```json
{ "pipe_ids": [0, 1, 2], "blockage": 0.5 }
```

### POST `/api/pipes/bulk_diameter`
```json
{ "pipe_ids": [0, 1, 2], "diameter": 0.9 }
```

### POST `/api/scenario`
Load a preset scenario:
```json
{
  "rainfall_mm_hr": 200.0,
  "duration_sim_hours": 6.0,
  "pipe_blockage_pct": 95.0,
  "reset_first": true
}
```

### POST `/api/timeskip`
Fast-forward offline to a target simulation time (non-blocking — runs in a background thread):
```json
{ "target_sim_seconds": 21600 }
```

### POST `/api/timeskip/cancel`
Cancel a running time skip.

### POST `/api/rewind`
Restore state to the nearest snapshot at or before a given time:
```json
{ "time": 1800.0 }
```

### POST `/api/reset`
Reset all water depth, simulation time, and node volumes to zero.

---

## 🗺️ Grid Coordinate System

| Axis | Direction | Range |
|---|---|---|
| **X (col)** | West → East | `0` to `nx-1` (660 cells = 3300 m) |
| **Y (row)** | North → South | `0` to `ny-1` (360 cells = 1800 m) |
| **Elevation** | Metres above sea level | Real SRTM values (≥ 1.0 m after normalization) |

Grid resolution: **dx = 5 m per cell**

---

## 📦 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | ≥ 0.142 | REST API backend |
| `uvicorn` | ≥ 0.54 | ASGI web server |
| `numpy` | ≥ 2.5 | Grid computations |
| `scipy` | ≥ 1.18 | DEM upsampling, smoothing, KD-tree |
| `rasterio` | ≥ 1.5 | Reading GeoTIFF elevation data |
| `matplotlib` | ≥ 3.11 | Boundary polygon rasterization |
| `numba` | ≥ 0.68 | JIT-compiled physics kernel |
| `three.js` (CDN) | r128+ | 3D rendering in browser |

---

## 📄 License

MIT License — free to use for academic and educational purposes.

---

## 📚 Data Sources

- **Elevation**: [OpenTopography SRTM 30m](https://opentopography.org/)
- **Roads**: [OpenStreetMap](https://www.openstreetmap.org/) via [Overpass API](https://overpass-api.de/)
- **Boundary**: [Nominatim / OSM](https://nominatim.openstreetmap.org/)

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, branch naming, and PR guidelines.
