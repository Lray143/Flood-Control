# Barangay 168 Flood Simulation System

A real-time 3D flood simulation of **Barangay 168 (Deparo, Caloocan City, Metro Manila, Philippines)**, built with a Python physics engine backend and a Three.js frontend.

---

## Overview

This project simulates flood propagation across a real Digital Elevation Model (DEM) of Barangay 168, incorporating real OSM road network data, an underground pipe drainage network, and 8 community zones for situational reporting. It is designed as a flood risk analysis and education tool.

---

## Features

- **Real DEM terrain** — elevation data from `brgy168_dem.tif`, sampled to a 660×360 grid
- **Real OSM road network** — 1,965 road segments from `roads_osm.json`, rendered as 3D geometry
- **Surface flow simulation** — Numba-JIT-compiled shallow water equations propagating water across terrain
- **Underground pipe network** — drainage pipes under road cells with configurable blockage (0–100%)
- **8 community zones (SitRep)** — live flood depth, flooded area %, and alert status (SAFE/ALERT/WARNING/CRITICAL) per zone
- **2D / 3D view toggle** — switch between top-down map view and isometric 3D perspective
- **X-Ray mode** — see underground pipe flows and blockage states
- **Rain control** — adjust rainfall rate (mm/hr) in real time via slider or preset scenarios
- **Bulk pipe blockage editor** — block/unblock pipes by region (All, East, West, North, South)
- **Pipe inspector** — click any pipe in X-Ray mode to inspect its ID, flow rate, blockage, and pressure
- **Simulation controls** — Play/Pause, speed multiplier (1× to 10000×), rewind, reset
- **Live zone labels** — floating 3D sprite labels showing community status

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend engine | Python 3.11+, NumPy, Numba (JIT), SciPy |
| Web server | FastAPI + Uvicorn |
| Frontend | Three.js (WebGL), vanilla JS, HTML/CSS |
| Terrain data | GeoTIFF DEM (`rasterio`) |
| Road/boundary data | GeoJSON (OSM export) |

---

## Quick Start

### Prerequisites

```bash
pip install fastapi uvicorn numpy numba scipy rasterio shapely
```

### Run

```bash
python main.py
```

Open your browser at **http://localhost:8000**

The simulation starts paused. Press ▶ **Play** to begin.

---

## Controls

| Control | Action |
|---------|--------|
| **▶ Play / ⏸ Pause** | Start or pause the simulation |
| **⏩ Speed** | Cycle simulation speed (1× → 10000×) |
| **⏮ Rewind** | Step back one saved snapshot |
| **🔄 Reset** | Reset to initial dry state |
| **Rain slider** | Set rainfall intensity (0–200 mm/hr) |
| **Scenario buttons** | Load preset rainfall scenarios |
| **🌧 2D / 🏔 3D** | Toggle between top-down and isometric view |
| **☢ X-Ray** | Toggle underground pipe network view |
| **Bulk Blockage** | Apply uniform blockage to pipes in a region |
| **Mouse drag** | Orbit / pan camera |
| **Scroll wheel** | Zoom in/out |
| **Click pipe (X-Ray)** | Open pipe inspector panel |

---

## File Structure

```
Flood Control/
├── main.py                     # Entry point — starts Uvicorn server on :8000
│
├── src/
│   ├── server.py               # FastAPI app, simulation loop, REST API endpoints
│   └── engine/
│       ├── simulator.py        # Top-level simulation orchestrator
│       ├── state.py            # Simulation state (water depth, pipe flows, snapshots)
│       ├── surface.py          # Numba JIT surface flow (shallow water equations)
│       └── underground.py      # Pipe network drainage solver
│   └── utils/
│       └── city_builder.py     # Terrain, road, zone, building generation from DEM + OSM
│
├── static/
│   ├── index.html              # Three.js frontend (single-page app, ~2200 lines)
│   ├── terrain_roads.png       # Road texture
│   └── terrain_grass.png       # Terrain texture
│
├── data/
│   ├── brgy168_dem.tif         # Real DEM elevation raster (GeoTIFF)
│   ├── brgy168_boundary.geojson  # Barangay boundary polygon
│   └── roads_osm.json          # OSM road segments (1,965 features)
│
└── tests/
    ├── verify_full_engine.py   # Full 6-phase engine verification suite
    └── test_simulation_zones.py # Zone coverage and boundary tests
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Serve frontend (`index.html`) |
| `GET` | `/api/terrain` | Terrain geometry, zones, pipe network |
| `GET` | `/api/state` | Current simulation state (water depth, zone SitRep) |
| `POST` | `/api/control` | Play / Pause toggle |
| `POST` | `/api/speed` | Set simulation speed multiplier |
| `POST` | `/api/rainfall` | Set rainfall rate (mm/hr) |
| `POST` | `/api/reset` | Reset simulation |
| `POST` | `/api/rewind` | Rewind one snapshot |
| `POST` | `/api/pipe_blockage` | Set blockage on one or more pipes |

---

## Community Zones

Barangay 168 is divided into 8 community zones, each mapped to cells in the simulation grid:

| Zone | Area |
|------|------|
| Zone 1 | Northwest sector |
| Zone 2 | North-central |
| Zone 3 | Northeast |
| Zone 4 | West-central |
| Zone 5 | Central |
| Zone 6 | East-central |
| Zone 7 | Southwest |
| Zone 8 | South |

Zone alert levels:
- 🟢 **SAFE** — peak depth < 0.05 m
- 🟡 **ALERT** — peak depth 0.05–0.30 m
- 🟠 **WARNING** — peak depth 0.30–0.80 m
- 🔴 **CRITICAL** — peak depth ≥ 0.80 m

---

## Running Tests

```bash
python tests/verify_full_engine.py
```

Expected output: **6/6 phases PASS**

---

## Notes

- Simulation grid: **660 columns × 360 rows** (matching the DEM resolution)
- Pipe network: one drainage pipe per road segment, connecting adjacent road nodes
- Surface flow uses an explicit finite-difference scheme, JIT-compiled with Numba for performance
- Water depth polling is memoized server-side; repeated polls within the same sim tick return cached JSON (~0ms overhead)
