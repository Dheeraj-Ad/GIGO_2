# Backend integration (added)

This frontend already shipped with `src/services/oceanApi.ts` written
against the INCOIS-3D-OceanViz FastAPI backend, and `vite.config.ts`
already proxies `/api/*` to `http://localhost:8000` -- both were left
completely untouched. What was added is the `backend/`, `config/`, and
`data/` folders alongside the existing frontend files.

**No frontend file was modified.** Two small, additive backend changes
were made so the backend actually satisfies what this frontend already
calls (see "What was fixed" below).

## Running it

**Terminal 1 -- backend:**
```cmd
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install --no-cache-dir -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 -- this frontend (unchanged):**
```cmd
npm install
npm run dev
```

Open the app -- the header/App-level backend status indicator should
show **online** once both are running.

## What already worked, unmodified

- `oceanApi.health() / listSources() / listVariables()` -- called in
  `App.tsx` purely to set a connecting/online/offline status; degrades
  to "offline" cleanly on any failure.
- `oceanApi.getSlice() / getVolume()` -- called in `InteractiveOceanView.tsx`
  for the live model-field texture; on failure it sets `modelStatus:
  'fallback'` and keeps rendering its own procedural visuals. No crash
  either way.
- Argo/glider "probes" are **not** wired to the backend at all in this
  frontend -- they come from a bundled CSV (`src/data/probeData.ts`) with
  their own built-in position/value simulation loop already running in
  `App.tsx`. Nothing to connect there; `oceanApi`'s Argo/glider methods
  exist but aren't called by any component.

## What was fixed (backend-only, additive)

`InteractiveOceanView.tsx` hardcodes `variable: 'currents'` for its
CURRENTS layer, but the variable registry's canonical name was
`current_speed`. Requesting `variable=currents` would 400. Fixed by
adding a `currents` entry in `config/variables.yaml` (kept `current_speed`
as-is for any other consumer) and a one-line change in
`backend/app/services/netcdf_loader.py`'s `compute_derived()` to accept
both names -- both resolve to the identical u/v computation.

## Known, expected limitation (not a bug)

`InteractiveOceanView.tsx` hardcodes `source: 'copernicus_glorys'` for
real model data. Copernicus Marine requires a free account and has no
public anonymous access, so until you run the ingestion script below,
`/model/slice` and `/model/volume` will correctly return "unavailable"
and the frontend will correctly show `modelStatus: 'fallback'` (its own
procedural visuals) -- this is the app's designed graceful-degradation
behavior, not broken integration.

To get real live model data into the CURRENTS/TEMPERATURE/SALINITY/
CHLOROPHYLL layers, populate the local cache (separate venv needed --
see the comment in `backend/requirements-copernicus.txt`):

```cmd
python -m venv .venv-copernicus
.venv-copernicus\Scripts\activate
pip install -r backend\requirements-copernicus.txt
python backend\scripts\ingest_copernicus_glorys.py --variables thetao so uo vo --bbox 30 -10 100 30 --depth-min 0 --depth-max 1000 --start 2024-01-01 --end 2024-01-10 --out data\model_cache\copernicus_glorys\cmems_mod_glo_phy_my_0.083deg_P1D-m.zarr
```

## Testing the backend

```cmd
cd backend
.venv\Scripts\activate
pip install pytest
pytest tests/ -v
```
