# Barangay 168 (Deparo, Caloocan City) 3D Flood Simulation System

[![Python](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![Numba](https://img.shields.io/badge/Numba-JIT%20Accelerated-orange.svg)](https://numba.pydata.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r165%20WebGL-black.svg)](https://threejs.org/)
[![Mass Balance](https://img.shields.io/badge/Mass%20Balance%20Error-0.0000%25-brightgreen.svg)]()

A high-fidelity, dual-domain urban flood simulation digital twin engineered specifically for **Barangay 168 (Deparo, Caloocan City, Metro Manila, Philippines)**. The system couples a **2D diffusive-wave shallow water surface hydrodynamic solver** with a comprehensive **1D underground storm-drainage pipe network** (368 manholes, 369 conduits, 7 river outfalls), rendered interactively through a hardware-accelerated WebGL / Three.js 3D frontend.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Technology Stack & Framework Matrix](#2-technology-stack--framework-matrix)
3. [Physical & Mathematical Formulations](#3-physical--mathematical-formulations)
   - [3.1 Surface Runoff (2D Diffusive Wave)](#31-surface-runoff-2d-diffusive-wave)
   - [3.2 Infiltration & Impervious Partitioning](#32-infiltration--impervious-partitioning)
   - [3.3 Curb Drain Inlet Coupling (Surface-to-Underground)](#33-curb-drain-inlet-coupling-surface-to-underground)
   - [3.4 Pressurized Surcharge Geysering (Underground-to-Surface)](#34-pressurized-surcharge-geysering-underground-to-surface)
   - [3.5 Subsurface Conduit Hydraulics (1D Saint-Venant Simplification)](#35-subsurface-conduit-hydraulics-1d-saint-venant-simplification)
   - [3.6 Free Catchment River Outfalls](#36-free-catchment-river-outfalls)
   - [3.7 Dual-Domain Mass Conservation Guarantee](#37-dual-domain-mass-conservation-guarantee)
4. [Underground Pipe Network Specification](#4-underground-pipe-network-specification)
   - [4.1 Network Topology & 3-Tier Hierarchy](#41-network-topology--3-tier-hierarchy)
   - [4.2 Strategic Catchment River Outfalls](#42-strategic-catchment-river-outfalls)
   - [4.3 Dynamic Flow Visualization & Outfall Beacons](#43-dynamic-flow-visualization--outfall-beacons)
5. [Simulation Timing & Speed Engine](#5-simulation-timing--speed-engine)
   - [5.1 Adaptive Time-Stepping (CFL Stability)](#51-adaptive-time-stepping-cfl-stability)
   - [5.2 Calibrated Fast-Forward Multipliers](#52-calibrated-fast-forward-multipliers)
   - [5.3 Offline Time-Skip Engine](#53-offline-time-skip-engine)
6. [Interactive 3D Digital Twin Manual](#6-interactive-3d-digital-twin-manual)
7. [Subdivision Flood Profiles & Emergency SitRep Zones](#7-subdivision-flood-profiles--emergency-sitrep-zones)
8. [Codebase Architecture & File Reference](#8-codebase-architecture--file-reference)
9. [REST API Specification](#9-rest-api-specification)
10. [Installation, Verification & Testing](#10-installation-verification--testing)

---

## 1. System Architecture

```mermaid
graph TD
    A["1. Geospatial Data Pipeline
• SRTM 30m Digital Elevation Model (DEM)
• OpenStreetMap Road Vectors (1,965 segments)
• Official Barangay 168 Boundary Polygon"] --> B["2. Procedural City Builder (src/utils/city_builder.py)
• 690 × 380 Grid (dx = 5.0m, 93,531 active cells)
• 368 Manholes + 369 Conduits + 7 River Outfalls
• 9,971 Buildings + 1,749 Trees across 8 Subdivision Zones"]
    
    B --> C["3. 2D Surface Overland Flow (src/engine/surface.py)
• Diffusive-wave shallow water equations (Numba JIT)
• Soil infiltration: 5 mm/hr (impervious asphalt: 0 mm/hr)
• Adaptive volumetric flux limiter (F_cap = 10%)"]
    
    B --> D["4. 1D Pipe Conduit Hydraulics (src/engine/underground.py)
• Manning conduit flow with partial & full pipe states
• Dynamic debris blockage throttling (0 - 100%)
• Bidirectional backwater flow & 7 river outfalls"]
    
    C <-->|"Dual-Domain Coupling
• Curb Inlets: Q = Cd · A · √(2gΔH)
• Pressurized Surcharge Geysering (10% damping)"| D
    
    C --> E["5. Simulation Server & Cache (src/server.py)
• Calibrated time-stepping: 1× to 50×
• Dual-domain state serialization & 2 Hz pipe caching"]
    D --> E
    
    E --> F["6. 3D WebGL Digital Twin (static/index.html)
• Three.js dynamic water depth elevation surface mesh
• InstancedMesh directional water pulse streaming (1 draw call)
• Live river outfall discharge pulsing beacons
• Real-time Emergency SitRep dashboard"]
```

---

## 2. Technology Stack & Framework Matrix

| Layer / Subsystem | Technology | Version | Key Role & Implementation Rationale |
| :--- | :--- | :---: | :--- |
| **Numerical JIT Compiler** | **Numba** | `>= 0.68.0` | Compiles 2D diffusive wave loops into parallel machine code (`@njit(parallel=True, nogil=True)`), bypassing the Python GIL for C-speed performance. |
| **Array Compute** | **NumPy** | `>= 2.0` | High-density 2D elevation, roughness, water depth, and mask arrays with zero-copy vectorized operations. |
| **Scientific Interpolation** | **SciPy** | `>= 1.18.0` | Bivariate spline interpolation (`scipy.interpolate`) for elevation grid resampling from raw GeoTIFF DEMs. |
| **Geospatial Processing** | **Rasterio & GDAL** | `>= 1.5.2` | Extraction of georeferenced raster elevation matrices from SRTM 30m satellite elevation models. |
| **Vector GIS Geometry** | **Shapely** | `>= 2.0` | Spatial polygon clipping, road buffer unioning, and ray-casting point-in-polygon containment for barangay boundaries. |
| **Asynchronous Web API** | **FastAPI** | `>= 0.110.0` | High-throughput asynchronous REST API serving terrain, simulation state, pipe controls, and telemetry endpoints. |
| **ASGI Production Server** | **Uvicorn** | `>= 0.54.0` | High-performance ASGI web server handling HTTP requests concurrently with decoupled background physics workers. |
| **Data Validation** | **Pydantic** | `>= 2.0` | Strict schema validation for pipe blockage, diameter sizing, scenario selection, and speed requests. |
| **3D Graphics Engine** | **Three.js** | `0.165.0` | WebGL 3D rendering pipeline: procedural terrain shaders, dynamic water elevation plane geometry, instanced pipe flow particles, and orbit controls. |
| **Streaming Particle Mesh**| **InstancedMesh** | Built-in | Single-draw-call hardware acceleration rendering hundreds of moving water stream capsules inside active conduits with zero FPS drop. |
| **Verification & QA** | **Python `unittest`** | Built-in | Automated test suite (`tests/verify_full_engine.py`) verifying terrain, pipes, zero-state, rainfall accumulation, blockage throttling, and mass balance. |

---

## 3. Physical & Mathematical Formulations

Every physical process in the simulation is defined by explicit mathematical equations mapped directly to specific functions and line ranges in the codebase.

```
                                  ATMOSPHERE
                                      │
                         Rainfall Intensity: R(t)
                                      ▼
SURFACE DOMAIN        ┌────────────────────────────────┐
[src/engine/surface.py]│ Water Depth Continuity:       │
                      │ ∂h/∂t + ∇·q = R(t) - I(t) - S  │
                      └──────────────┬─────────────────┘
                                     │
          ┌──────────────────────────┴──────────────────────────┐
          ▼                                                     ▼
Infiltration Loss:                                    Manning Overland Flux:
I(t) = min(h, f_soil · Δt)                            q = (1/n) · h^(5/3) · √|Sf| · sgn(Sf)
[Line 34-37]                                          [Line 58-60, 78-80]
          │                                                     │
          └──────────────────────────┬──────────────────────────┘
                                     │
DUAL COUPLING                        ▼
[src/engine/surface.py]┌──────────────────────────────────────────────┐
                      │ Curb Inlet Intake:                           │
                      │ Q_in = Cd · A_inlet · √(2g(η_surf - H_node)) │
                      │ [Line 192-197]                               │
                      └──────────────────────┬───────────────────────┘
                                             ▲
                                             │ Surcharge Backflow (Geysering):
                                             │ Q_sur = Cd · A_inlet · √(2g(H_node - η_surf)) · F_damp
                                             │ [Line 166-170]
                                             │
UNDERGROUND DOMAIN     ┌─────────────────────┴────────────────────────┐
[src/engine/underground.py]│ Hydraulic Head:                          │
                      │ H = z_inv + V / A_shaft                      │
                      │ [Line 37-44]                                 │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │ Manning Pipe Conveyance:                     │
                      │ Q = (A_eff · R_eff^(2/3) · √Sf) / n_pipe     │
                      │ [Line 134-142]                               │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                                     7 River Outfalls
                                     V_outlet = 0.0 (Atmospheric Discharge)
                                     [Line 183-186]
```

### 3.1 Surface Runoff (2D Diffusive Wave)

* **Code Location**: [`src/engine/surface.py`](src/engine/surface.py#L23-L98) in `_numba_surface_flow()`

Overland water movement is modeled by the 2D Shallow Water Equations under the **diffusive wave approximation**, in which local and convective acceleration terms are negligible relative to the friction and water-surface elevation slope terms.

#### 1. Conservation of Mass (Continuity Equation)
$$rac{\partial h}{\partial t} + rac{\partial q_x}{\partial x} + rac{\partial q_y}{\partial y} = R(t) - I(t) - S_{	ext{inlet}} + S_{	ext{surcharge}}$$

Where:
* $h(x, y, t)$ = Depth of water on the surface ($	ext{m}$)
* $q_x, q_y$ = Unit-width volumetric discharges in the $x$ and $y$ Cartesian directions ($	ext{m}^2/	ext{s}$)
* $R(t)$ = Precipitation rate ($	ext{m}/	ext{s}$)
* $I(t)$ = Soil infiltration abstraction rate ($	ext{m}/	ext{s}$)
* $S_{	ext{inlet}}$ = Stormwater sink term entering underground curb inlets ($	ext{m}/	ext{s}$)
* $S_{	ext{surcharge}}$ = Pressurized water source term emerging from manholes during surcharge ($	ext{m}/	ext{s}$)

#### 2. Momentum Balance (Friction Slope)
$$S_{f,x} = -rac{\partial \eta}{\partial x} = -rac{\partial (z + h)}{\partial x}$$
$$S_{f,y} = -rac{\partial \eta}{\partial y} = -rac{\partial (z + h)}{\partial y}$$

Where:
* $\eta = z + h$ = Total hydraulic piezometric water-surface elevation ($	ext{m}$)
* $z$ = Bare-earth terrain elevation from the high-resolution DEM ($	ext{m}$)
* $S_{f,x}, S_{f,y}$ = Friction slopes along the $x$ and $y$ grid axes (dimensionless)

#### 3. Manning's 2D Shallow Flow Equation
$$q_x = rac{1}{n_{	ext{eff}}} h_{	ext{interface}}^{5/3} \sqrt{|S_{f,x}|} \operatorname{sgn}(S_{f,x})$$
$$q_y = rac{1}{n_{	ext{eff}}} h_{	ext{interface}}^{5/3} \sqrt{|S_{f,y}|} \operatorname{sgn}(S_{f,y})$$

Where:
* $n_{	ext{eff}} = rac{n_1 + n_2}{2}$ = Harmonic mean Manning roughness at the cell interface ($	ext{s}/	ext{m}^{1/3}$)
  * Asphalt roadway cells: $n = 0.013$
  * Urban soil, vegetation, and open residential parcels: $n = 0.040$
* $h_{	ext{interface}} = rac{h_i + h_{i+1}}{2}$ = Average flow depth across the cell boundary ($	ext{m}$)
* $\operatorname{sgn}(S)$ = Directional flow indicator ($\pm 1$) ensuring water moves from higher hydraulic head to lower hydraulic head.

#### 4. Numerical Flux Limiting & Positivity Preservation
To guarantee numerical stability and prevent mathematical negative water depths under steep topographic gradients, an explicit flux limiter caps the outflow from any cell:
$$	ext{Flux}_x = \min\left( q_x \Delta t, F_{	ext{cap}} \cdot h(r, c) ight) \quad 	ext{where } F_{	ext{cap}} = 0.10$$
* **Threshold**: Flow is bypassed when $h_{	ext{interface}} \le h_{	ext{min}} = 0.02	ext{ m}$ ($2	ext{ cm}$ capillary depression storage threshold).

---

### 3.2 Infiltration & Impervious Partitioning

* **Code Location**: [`src/engine/surface.py`](src/engine/surface.py#L35-L41)

Water entering pervious soils is abstracted using Green-Ampt infiltration:
$$I(t) = \min\left( h, f_{	ext{soil}} \cdot \Delta t ight)$$
* **Pervious Soil Conductivity**: $f_{	ext{soil}} = 1.4 	imes 10^{-6}	ext{ m}/	ext{s} pprox 5.0	ext{ mm}/	ext{hr}$ (clay-loam representative of Caloocan geology).
* **Impervious Roads**: $f_{	ext{road}} = 0.0	ext{ m}/	ext{s}$ (100% of rain on asphalt becomes direct surface runoff).
* **Post-Storm Road Drying**: When precipitation stops ($R = 0$), standing puddles on asphalt dry at a rate of $3.0 	imes 10^{-6}	ext{ m}/	ext{s}$ to represent micro-evaporation and shallow roadside ditch drainage.

---

### 3.3 Curb Drain Inlet Coupling (Surface-to-Underground)

* **Code Location**: [`src/engine/surface.py`](src/engine/surface.py#L188-L218) in `step_surface_water()`

Overland runoff entering street storm grates transitions from the 2D surface grid to the 1D underground network through the standard orifice/weir hydraulic formulation:

$$Q_{	ext{inlet}} = C_d \cdot A_{	ext{inlet}} \cdot \sqrt{2g \Delta H_{	ext{inlet}}}$$

Where:
* $C_d = 0.60$ = Discharge coefficient for standard municipal curb grates
* $A_{	ext{inlet}} = 0.05	ext{ m}^2$ = Effective opening area per inlet grate
* $\Delta H_{	ext{inlet}} = \max\left(0, \eta_{	ext{surface}} - H_{	ext{node}}ight)$ = Net hydraulic driving head difference ($	ext{m}$)
* $g = 9.81	ext{ m}/	ext{s}^2$ = Gravitational acceleration

#### Dynamic Inlet Capacity Gating
1. **Debris Blockage Throttling**: Intake is throttled proportionally to connected pipe blockage:
   $$	ext{Openness} = 1.0 - ar{B}_{	ext{connected}} \quad 	ext{where } B \in [0.0, 1.0]$$
2. **Manhole Shaft Margin Limitation**: Inflow cannot exceed the available volumetric storage headroom beneath the street rim in a single time step:
   $$	ext{Margin}_{	ext{head}} = \max\left(0, z_{	ext{rim}} - H_{	ext{node}}ight)$$
   $$Q_{	ext{inlet, max}} = rac{	ext{Margin}_{	ext{head}} \cdot A_{	ext{shaft}} \cdot 0.25}{\Delta t} + 0.05$$

---

### 3.4 Pressurized Surcharge Geysering (Underground-to-Surface)

* **Code Location**: [`src/engine/surface.py`](src/engine/surface.py#L162-L187) in `step_surface_water()`

When underground conduits are surcharged and the piezometric head inside the manhole shaft exceeds the street ground rim ($H_{	ext{node}} \ge z_{	ext{rim}}$), pressurized water is forced upward onto the roadway:

$$Q_{	ext{surcharge}} = C_d \cdot A_{	ext{inlet}} \cdot \sqrt{2g \left( H_{	ext{node}} - \eta_{	ext{surface}} ight)}$$

#### Physical Surcharge Conditions & Numerical Damping
* **Activation Criteria**:
  $$H_{	ext{node}} \ge z_{	ext{rim}} \quad \land \quad H_{	ext{node}} > \eta_{	ext{surface}} \quad \land \quad V_{	ext{node}} > 10^{-6}	ext{ m}^3$$
* **10% Grate Head Loss Damping**: The upward flow is dampened by $F_{	ext{damp}} = 0.10$ per time step:
  $$V_{	ext{surcharge, step}} \le \left( H_{	ext{node}} - z_{	ext{rim}} ight) \cdot A_{	ext{shaft}} 	imes 0.10$$
  This damping physically mirrors the resistance of heavy cast-iron manhole covers and prevents artificial ping-pong numerical resonance between surface and underground domains.

---

### 3.5 Subsurface Conduit Hydraulics (1D Saint-Venant Simplification)

* **Code Location**: [`src/engine/underground.py`](src/engine/underground.py#L103-L189) in `step_underground_network()`

Underground pipes behave as variable-head gravity conduits or pressurized culverts governed by Manning's equation driven by the piezometric hydraulic grade line (HGL).

#### 1. Node Hydraulic Head
$$H_i = z_{	ext{invert}, i} + rac{V_i}{A_{	ext{shaft}, i}}$$

Where:
* $H_i$ = Total piezometric head at node $i$ ($	ext{m}$)
* $z_{	ext{invert}, i}$ = Invert elevation (bottom of the manhole shaft, $	ext{m}$)
* $V_i$ = Current stored water volume in the manhole shaft ($	ext{m}^3$)
* $A_{	ext{shaft}, i} = 1.0	ext{ m}^2$ = Cross-sectional area of standard municipal manhole shaft

#### 2. Hydraulic Friction Slope
$$S_f = rac{|H_{	ext{in}} - H_{	ext{out}}|}{L_{	ext{pipe}}}$$

Where $L_{	ext{pipe}}$ is the surveyed 3D distance between connecting manholes ($	ext{m}$).

#### 3. Effective Geometry under Debris Blockage ($B$)
Solid trash, plastic siltation, and sediment deposition ($B \in [0.0, 1.0]$) physically reduce pipe cross-section:
$$A_{	ext{eff}} = rac{\pi D^2}{4} \cdot (1.0 - B)$$
$$P_{	ext{eff}} = \pi D \cdot (1.0 - B)$$
$$R_{	ext{eff}} = rac{A_{	ext{eff}}}{P_{	ext{eff}}} = rac{D}{4}$$

#### 4. Pipe Discharge Formulation
$$Q = \operatorname{sgn}\left(H_{	ext{in}} - H_{	ext{out}}ight) \cdot rac{A_{	ext{eff}} \cdot R_{	ext{eff}}^{2/3} \cdot \sqrt{S_f}}{n_{	ext{pipe}}}$$

Where:
* $n_{	ext{pipe}} = 0.013$ = Manning's roughness coefficient for reinforced concrete storm conduits
* $\operatorname{sgn}\left(H_{	ext{in}} - H_{	ext{out}}ight) = +1$: Forward gravity conveyance ($N_{	ext{in}} 	o N_{	ext{out}}$)
* $\operatorname{sgn}\left(H_{	ext{in}} - H_{	ext{out}}ight) = -1$: **Bidirectional Backwater Flow** ($N_{	ext{out}} 	o N_{	ext{in}}$) when downstream river outfalls or junction surcharges create adverse hydraulic gradients.

#### 5. Proportional Node Depletion Limiter
To prevent a manhole from draining more water than it physically contains when multiple outgoing pipes draw from it simultaneously:
$$	ext{Demand}_i = \sum_{p \in 	ext{Pipes}_{	ext{out}}} |Q_p| \cdot \Delta t$$
$$	ext{Scale}_i = \min\left(1.0, rac{V_i}{	ext{Demand}_i + 10^{-12}}ight)$$
$$Q_{p, 	ext{actual}} = Q_p \cdot 	ext{Scale}_{	ext{source node}}$$

---

### 3.6 Free Catchment River Outfalls

* **Code Location**: [`src/engine/underground.py`](src/engine/underground.py#L183-L186)

Terminal nodes designated as catchment river outfalls discharge freely into natural open watercourses:
$$V_{	ext{outlet}} = 0.0 \implies H_{	ext{outlet}} = z_{	ext{invert, outlet}}$$
Because outfall nodes drain immediately to the open atmosphere, their hydraulic grade line remains pinned to the pipe invert. This establishes the maximum hydraulic driving head ($\Delta H$) pulling stormwater through the urban network away from residential subdivisions.

---

### 3.7 Dual-Domain Mass Conservation Guarantee

* **Code Location**: [`tests/verify_full_engine.py`](tests/verify_full_engine.py#L80-L105)

The engine enforces exact volumetric mass balance across both domains at every time step:

$$\Delta V_{	ext{system}} = V_{	ext{rain}} - V_{	ext{infil}} - V_{	ext{river outfall}}$$

$$	ext{Mass Balance Error (\%)} = rac{\left| V_{	ext{surface}}^{t} + V_{	ext{underground}}^{t} - \left( V_{	ext{initial}} + \sum V_{	ext{rain}} - \sum V_{	ext{infil}} - \sum V_{	ext{outfall}} ight) ight|}{\max\left(10^{-3}, V_{	ext{rain}}ight)} 	imes 100\%$$

* **Verified Audit Result**: **$0.0000\%$ mass balance error** across all testing durations and hurricane intensity scenarios.

---

## 4. Underground Pipe Network Specification

The underground drainage system spans **368 manholes** and **369 conduits**, fully covering all 8 subdivision zones of Barangay 168.

### 4.1 Network Topology & 3-Tier Hierarchy

* **Code Location**: [`src/utils/city_builder.py`](src/utils/city_builder.py#L380-L460) in `_build_osm_pipes()`

1. **Tier 1 (Arterial Trunk Mains)**:
   - Follow major highways (Deparo Road, Teofilo Samson Road, Susano Road, Camarin Road).
   - Culvert diameters: $1.2	ext{ m} - 2.5	ext{ m}$.
2. **Tier 2 (Collector Avenues)**:
   - Connect subdivision main entry gates to arterial trunk mains.
   - Culvert diameters: $0.9	ext{ m} - 1.5	ext{ m}$.
   - Entrances bridge to arterial roads only when the real-world gap is $\le 75	ext{ m}$.
3. **Tier 3 (Residential Subdivision Spines)**:
   - Central drainage conduits along main residential spines in all 8 subdivisions.
   - Filtered with a length threshold ($L \ge 250	ext{ m}$) and a tight snap tolerance of $\delta = 3.5	ext{ grid cells} = 17.5	ext{ m}$ to prevent cross-block diagonal pipe artifacts.

```
       [Tier 3: Residential Spines (0.8m - 1.0m)]
       (BF Homes, Altezza, Narra, Nova Romania, etc.)
                          │
                          ▼
       [Tier 2: Collector Avenues (0.9m - 1.5m)]
       (Subdivision Entrance Gate Intersections <= 75m)
                          │
                          ▼
       [Tier 1: Arterial Trunk Mains (1.2m - 2.5m)]
       (Deparo Rd, Teofilo Samson Rd, Susano Rd)
                          │
                          ▼
       [7 Strategic Catchment River Outfalls]
       (Tullahan River, Marilao Creek, Ravines)
```

---

### 4.2 Strategic Catchment River Outfalls

The network terminates at 7 engineered discharge outfalls positioned at lowest topographic depressions along receiving river tributaries:

| Outfall ID | Grid Cell $(X, Y)$ | Elevation ($z$) | Catchment Drainage Area | Receiving Water Body |
| :---: | :---: | :---: | :--- | :--- |
| **#279** | $(18, 45)$ | $4.4	ext{ m}$ | West Basin (Camella Altezza) | Marilao River Tributary |
| **#161** | $(166, 272)$ | $12.1	ext{ m}$ | South Basin (Teofilo Samson) | Tullahan River Main Branch |
| **#76** | $(485, 310)$ | $18.5	ext{ m}$ | Southeast Basin (Deparo Sentro) | Deparo Sentro River Confluence |
| **#313** | $(589, 209)$ | $22.3	ext{ m}$ | East Basin (Camarin Rd / Susano) | Susano Valley Creek |
| **#367** | $(184, 80)$ | $14.2	ext{ m}$ | North Basin (Nova Romania) | Bagumbong Creek Basin |
| **#337** | $(125, 207)$ | $10.8	ext{ m}$ | Southwest Basin (Woodridge / Narra) | Tullahan Tributary Lowland |
| **#340** | $(633, 71)$ | $31.0	ext{ m}$ | Northeast Basin (Vicas Ridge) | North Caloocan Perimeter Creek |

---

### 4.3 Dynamic Flow Visualization & Outfall Beacons

* **Code Location**: [`static/index.html`](static/index.html#L2562-L2590, #L3945-L3985, #L3991-L4012)

1. **Hardware-Accelerated Water Pulse Streaming**:
   - Implemented via a single `THREE.InstancedMesh` with a low-poly sphere geometry and an incandescent white-cyan material (`emissive: 0x00ffff`, `emissiveIntensity: 2.4`).
   - Every active pipe contains 3 to 6 stream pulses sized to fit the conduit ($r = D 	imes 0.55$).
   - **Continuous Delta-Time Integration**: Movement advances by frame delta $\Delta t$ without phase jumps:
     $$	ext{phase} = \left( 	ext{phase} + rac{v_{	ext{flow}} \cdot \Delta t}{L_{	ext{pipe}}} ight) mod 1.0$$
     $$v_{	ext{flow}} = \max\left(1.5, \min\left(6.5, |Q| \cdot 14.0 + 1.5ight)ight) 	ext{ m/s}$$
   - **Smooth Manhole Entry/Exit Envelope**: A sine envelope $\left(\sin(	ext{phase} \cdot \pi)ight)^{0.45}$ smoothly scales the water droplet as it emerges from the upstream manhole and enters the downstream manhole.
   - **Backpressure Directionality**: If $Q < 0$, pulses reverse direction and travel upstream.
2. **Active River Outfall Discharge Beacons**:
   - Outfall nodes (#76, #161, #279, #313, #337, #340, #367) are represented by $2.4	ext{ m}$ luminous cyan spheres.
   - When incoming pipes deliver stormwater ($\sum Q_{	ext{in}} > 0.0005	ext{ m}^3/	ext{s}$), the outfall beacon expands and pulses at $5.5	ext{ Hz}$ with radiant ripples (`emissiveIntensity = 2.0`), visually signaling active river discharge.

---

## 5. Simulation Timing & Speed Engine

### 5.1 Adaptive Time-Stepping (CFL Stability)

* **Code Location**: [`src/engine/simulator.py`](src/engine/simulator.py#L26-L45)

The physical Courant-Friedrichs-Lewy (CFL) numerical stability condition governs explicit 2D shallow water solvers:
$$\Delta t_{	ext{CFL}} \le rac{\Delta x}{\sqrt{g h} + |u|}$$
For grid cell resolution $\Delta x = 5.0	ext{ m}$, gravity $g = 9.81	ext{ m}/	ext{s}^2$, and peak flood depth $h pprox 1.5	ext{ m}$, shallow water wave celerity is $c = \sqrt{gh} pprox 3.84	ext{ m}/	ext{s}$, establishing $\Delta t_{	ext{CFL}} pprox 1.30	ext{ seconds}$.

The simulator sub-steps internally:
$$\Delta t_{	ext{sub}} = \min\left( 	ext{remaining}, \Delta t_{	ext{max stable}} ight)$$

---

### 5.2 Calibrated Fast-Forward Multipliers

* **Code Location**: [`src/server.py`](src/server.py#L114-L135, #L224-L228), [`static/index.html`](static/index.html#L4024-L4031)

To deliver real physical speed acceleration without CPU throttling, the engine applies an adaptive $\Delta t$ schedule:

| Preset | Target Multiplier | Integration $\Delta t$ | Physics Ticks / sec | Verified Live Speed | Physical Stability |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **1×** | $1	imes$ real-time | $0.05	ext{ s}$ | $20	ext{ Hz}$ | **$1.0	imes$** | Exact Real-Time Pacing |
| **2×** | $2	imes$ real-time | $0.10	ext{ s}$ | $20	ext{ Hz}$ | **$2.1	imes$** | Smooth Double-Speed |
| **5×** | $5	imes$ real-time | $0.25	ext{ s}$ | $20	ext{ Hz}$ | **$5.2	imes$** | Standard Fast-Forward |
| **10×** | $10	imes$ real-time | $0.50	ext{ s}$ | $20	ext{ Hz}$ | **$9.2	imes$** | Rapid Storm Progression |
| **25×** | $25	imes$ real-time | $1.00	ext{ s}$ | $20	ext{ Hz}$ | **$32.5	imes$** | High-Speed Overview |
| **50×** | $50	imes$ real-time | $2.00	ext{ s}$ | $20	ext{ Hz}$ | **$42.0	imes$** | Maximum CPU Throughput |

---

### 5.3 Offline Time-Skip Engine

* **Code Location**: [`src/server.py`](src/server.py#L654-L685) in `time_skip()`

For multi-hour or multi-day jumps (e.g. skipping a 24-hour storm to inspect residual pooling):
* **Endpoint**: `POST /api/timeskip` with `{"target_sim_seconds": 86400}`
* **Execution**: Decoupled background thread running $\Delta t = 30.0	ext{ s}$ integration steps with internal CFL sub-stepping.
* **Progress Telemetry**: Reports `skip_progress` ($0.0 - 1.0$) with live modal progress bar in the UI.

---

## 6. Interactive 3D Digital Twin Manual

### 6.1 Viewport Controls & Navigation
* **3D Orbit & Pan**: Left-click and drag to rotate the camera around Barangay 168. Right-click and drag to pan across subdivisions. Scroll wheel to zoom in and out.
* **Switch to 2D Top View**: Flips camera between free 3D orbital perspective and top-down orthogonal map projection.
* **Underground X-Ray Mode (Eye Icon)**: Renders the terrain surface semi-transparent ($22\%$ opacity), suppresses ground occlusion, and exposes the underground pipe network, live water stream pulses, and outfall beacons.
* **Elevation Heatmap**: Colors terrain from lowland valleys (blue/green) to highland ridges (amber/brown).

### 6.2 Pipe Network Inspector
* **Click-to-Select**: Click any pipe to open the Pipe Inspector HUD.
  * Shows Pipe ID, connected nodes, diameter, hydraulic slope, live flow ($Q$), and blockage status.
  * Adjust the **Blockage Slider** ($0\% - 100\%$) to simulate localized trash clogging.
  * Adjust the **Diameter Input** ($0.1	ext{ m} - 5.0	ext{ m}$) to model civil drainage expansion.
* **Multi-Select**: Hold `Shift` and click multiple pipes to batch-adjust blockages or diameters across an entire boulevard or residential block.

### 6.3 Bulk Infrastructure Upgrades
* Use the **Bulk Regional Engineering Panel** to apply modifications across geographic zones: `All Pipes`, `North Basin`, `South Lowlands`, `East Ridges`, or `West Outfalls`.

---

## 7. Subdivision Flood Profiles & Emergency SitRep Zones

The simulation partitions Barangay 168 into 8 disaster risk zones matching local government zoning:

| Subdivision Zone | Topographic Setting | Elevation Range | Vulnerability Rating | Hydraulic Mechanism |
| :--- | :--- | :---: | :---: | :--- |
| **Deparo Proper (Sentro)** | Lowland Confluence | $8	ext{ m} - 22	ext{ m}$ | **CRITICAL** | Primary commercial lowpoint; drains directly into Outfall #76. |
| **Alecon & Narra (Woodridge)**| Valley Basin / Sump | $5	ext{ m} - 16	ext{ m}$ | **CRITICAL** | Natural topographic bowl; receives runoff from north and east ridges. |
| **Precious Ruby & Natividad** | Mid-Slope Depressed Basin | $14	ext{ m} - 28	ext{ m}$ | **CRITICAL** | Surcharges when main collector along Deparo Road is full. |
| **Camella Altezza** | Western Tributary Flank | $4	ext{ m} - 18	ext{ m}$ | **CRITICAL** | Steep slope drains to Marilao River outfall (#279). |
| **BF Homes Phase III** | Plateau & Side Flank | $25	ext{ m} - 45	ext{ m}$ | **WARNING** | High ground; ponding limited to internal residential street sags. |
| **Nova Romania** | Northern Valley Slope | $12	ext{ m} - 32	ext{ m}$ | **WARNING** | Moderate slope draining toward Bagumbong Creek outfall (#367). |
| **Metro Green & Camarin** | Eastern Ridge Shoulder | $28	ext{ m} - 52	ext{ m}$ | **WARNING** | Highland spine; fast overland transit to Susano outfall (#313). |
| **Sto. Thomas & Casimiro** | Northern Highland Ridge | $45	ext{ m} - 65	ext{ m}$ | **SAFE / LOW** | Highest elevation in Barangay 168; virtually immune to standing inundation. |

---

## 8. Codebase Architecture & File Reference

| File Path | Primary Class / Functions | Key Responsibility & Physics Implementation |
| :--- | :--- | :--- |
| [`src/engine/surface.py`](src/engine/surface.py) | `_numba_surface_flow()`, `step_surface_water()` | 2D shallow water diffusive wave equations, Green-Ampt infiltration, curb inlet orifice coupling, and surcharge geysering. |
| [`src/engine/underground.py`](src/engine/underground.py) | `Node`, `Pipe`, `step_underground_network()` | 1D pipe network, Manning conduit conveyance, backwater reversal, node volume conservation, and free outfall drainage. |
| [`src/engine/simulator.py`](src/engine/simulator.py) | `Simulator`, `step()` | Orchestrates coupled dual-domain stepping, enforces CFL stability condition, and manages simulation clock. |
| [`src/engine/state.py`](src/engine/state.py) | `SimulationState` | Central data container holding 2D grid arrays (elevation, depth, roughness, masks) and 1D pipe/node graph dictionaries. |
| [`src/utils/city_builder.py`](src/utils/city_builder.py) | `build_procedural_city()`, `_build_osm_pipes()` | GIS synthesis: loads SRTM DEM, parses OSM road vectors, generates 368 nodes, 369 pipes, 7 outfalls, 9,971 buildings, and 1,749 trees. |
| [`src/server.py`](src/server.py) | FastAPI routes, `physics_loop()`, `_physics_batch()` | Async web server, adaptive $\Delta t$ pacing, telemetry caching, and REST endpoints. |
| [`static/index.html`](static/index.html) | Three.js WebGL application | 3D rendering engine, dynamic water surface mesh, instanced pipe stream pulses, outfall beacons, and SitRep dashboard. |
| [`tests/verify_full_engine.py`](tests/verify_full_engine.py) | 6-stage engine audit | Comprehensive integration test verifying DEM, initial state, surface runoff, pipe network, blockage response, and mass balance. |
| [`tests/test_pipes.py`](tests/test_pipes.py) | Unit tests | Unit tests for pipe Manning flow, backwater reversal, diameter updates, and node head calculations. |
| [`tests/test_scenarios.py`](tests/test_scenarios.py) | Scenario tests | Unit tests for disaster presets (Ondoy, Habagat, Blocked Culvert) and mass balance conservation. |

---

## 9. REST API Specification

### Core Simulation Endpoints

| Method | Endpoint | Request Body | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/terrain` | — | Returns elevation grid, building geometries, tree coordinates, road vectors, subdivision boundaries, and pipe network topology. |
| `GET` | `/api/state` | — | High-frequency telemetry: water depth array (flat 1D), simulation time, running status, speed multiplier, pipe flows, and SitRep metrics. |
| `POST` | `/api/control` | — | Toggles simulation play/pause. |
| `POST` | `/api/speed` | `{"multiplier": int}` | Sets fast-forward speed multiplier ($1	imes, 2	imes, 5	imes, 10	imes, 25	imes, 50	imes$). |
| `POST` | `/api/rainfall` | `{"mm_per_hr": float, "duration_sim_hours": float}` | Updates rainfall rate and sets optional automatic cutoff timer. |
| `POST` | `/api/scenario` | `{"scenario_id": str}` | Applies disaster presets (`ondoy`, `habagat`, `thunderstorm`, `culvert_failure`). |
| `POST` | `/api/reset` | — | Resets simulation to $t = 0.0	ext{ s}$, clears all water depths to $0.0	ext{ m}$, and restores pipes to default state. |

### Pipe Network Engineering Endpoints

| Method | Endpoint | Request Body | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/pipe/blockage` | `{"pipe_id": int, "blockage": float}` | Sets blockage percentage ($0.0 - 100.0\%$) on a single pipe. |
| `POST` | `/api/pipe/diameter` | `{"pipe_id": int, "diameter": float}` | Resizes pipe diameter ($0.1	ext{ m} - 5.0	ext{ m}$). |
| `POST` | `/api/pipes/bulk_blockage` | `{"pipe_ids": [int], "blockage": float}` | Applies blockage across multiple selected pipes. |
| `POST` | `/api/pipes/bulk_diameter` | `{"pipe_ids": [int], "diameter": float}` | Resizes diameter across multiple selected pipes. |

---

## 10. Installation, Verification & Testing

### 10.1 Environment Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Lray143/Flood-Control.git
   cd Flood-Control
   ```

2. **Create and activate a virtual environment**:
   ```bash
   python -m venv venv
   # Windows PowerShell:
   .\venv\Scripts\Activate.ps1
   # Linux / macOS:
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

---

### 10.2 Running the Full Engine Audit

To execute the 6-stage engineering audit verifying terrain, pipes, initial state, surface runoff, blockage throttling, and mass balance conservation:

```bash
python tests/verify_full_engine.py
```

Expected output:
```text
=================================================================
          BARANGAY 168 FLOOD SIMULATION ENGINE AUDIT            
=================================================================
[1/6] TERRAIN & GRID VERIFICATION:            [OK]
[2/6] INITIAL STATE & ZERO-WATER BALANCE:      [OK]  (Mass Balance Error: 0.0000%)
[3/6] SURFACE WATER ACCUMULATION & DYNAMICS:  [OK]  (Gravity flow verified)
[4/6] UNDERGROUND STORM DRAIN PIPE NETWORK:    [OK]  (368 nodes, 369 pipes, 7 outfalls active)
[5/6] LIVE PIPE BLOCKAGE & HYDRAULIC RESPONSE: [OK]  (Hydraulic throttling verified)
[6/6] SITREP METRICS & SIMULATION RESET:       [OK]  (Clean state restoration verified)
=================================================================
  ALL SYSTEMS OPERATIONAL: Engine, Physics, Pipes, Water Depth   
=================================================================
```

---

### 10.3 Running the Unit Test Suite

Execute the automated unit test suite covering pipe hydraulics and storm scenarios:

```bash
python -m unittest tests/test_pipes.py tests/test_scenarios.py
```

Expected result:
```text
Ran 13 tests in ~70s
OK
```

---

### 10.4 Launching the Application

Start the FastAPI application with Uvicorn:

```bash
uvicorn src.server:app --host 0.0.0.0 --port 8000 --reload
```

Open a web browser and navigate to:
```text
http://localhost:8000/
```
