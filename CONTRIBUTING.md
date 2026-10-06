# Contributing to Flood Control Simulation

Thank you for contributing! This project is a 2D diffusion wave flood simulation for Barangay 168, Caloocan City, Philippines.

---

## 🚀 Setup

### Requirements
- Python 3.10+
- Git

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/Flood-Control.git
cd Flood-Control
```

### 2. Create a virtual environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

> ⚠️ **Numba** takes a few minutes to install and ~10–20 seconds to JIT-compile on first run. This is normal.

### 4. Run the server

```bash
python main.py
```

Then open **http://localhost:8000** in your browser.

---

## 📁 Where Things Go

| What you're adding | Where it goes |
|---|---|
| Physics engine changes | `src/engine/` |
| New simulation parameters / state | `src/engine/state.py` |
| Terrain / road / pipe generation | `src/utils/city_builder.py` |
| New API endpoints | `src/server.py` |
| Frontend (UI / 3D rendering) | `static/index.html` |
| One-off scripts / data tools | `scripts/` |
| Spatial data files (`.tif`, `.json`, `.geojson`) | `data/` |
| Tests | `tests/` |

---

## 🌿 Branch Naming

```
feature/<short-description>     # new features
fix/<short-description>         # bug fixes
refactor/<short-description>    # code cleanup
docs/<short-description>        # documentation only
```

Example: `feature/add-rainfall-heatmap`

---

## ✅ Before Submitting a PR

1. Make sure `python main.py` starts without errors
2. Verify the simulation runs in the browser
3. If you changed `city_builder.py`, run a quick sanity check:
   ```bash
   python -c "from src.utils.city_builder import build_procedural_city; print(build_procedural_city(nx=50, ny=50).keys())"
   ```
4. Do **not** commit:
   - `__pycache__/` folders
   - `*.nbc` / `*.nbi` Numba cache files
   - Your local `.env` or virtual environment folder

---

## 📦 Data Files

The `data/` folder contains spatial input files for Barangay 168:

| File | Description |
|---|---|
| `barangay168_dem.tif` | SRTM 30m Digital Elevation Model |
| `roads_osm.json` | OpenStreetMap road network |
| `brgy168.geojson` | Barangay boundary polygon |

Do **not** replace these files unless you have an updated dataset and have discussed it with the team.

---

## 🧪 Running Tests

```bash
pytest tests/
```

*(Tests are a work in progress — contributions welcome!)*
