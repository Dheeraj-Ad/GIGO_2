"""
grid_serializer.py
===================
Turns xarray DataArrays (already subset by netcdf_loader) into the plain
JSON-safe structures defined in models/schemas.py (GridSlice, VolumeSlice).
Separated from netcdf_loader so the same subsetting logic can eventually
feed a binary/Zarr-tile endpoint without duplicating grid-shaping code.
"""
from __future__ import annotations

import numpy as np
import xarray as xr

from app.config import get_colorscales, get_variables


def _clean_2d(values: np.ndarray) -> list[list[float | None]]:
    return [[None if np.isnan(v) else round(float(v), 4) for v in row] for row in values]


def to_grid_slice(da: xr.DataArray, canonical_variable: str) -> dict:
    variables = get_variables()
    meta = variables.get(canonical_variable, {})

    values = np.asarray(da.values, dtype=float)
    if values.ndim != 2:
        values = np.squeeze(values)
    if values.ndim != 2:
        raise ValueError(f"Expected a 2D (lat, lon) slice, got shape {values.shape}")

    finite = values[np.isfinite(values)]
    value_range = (
        float(np.nanmin(finite)) if finite.size else meta.get("default_range", [0, 1])[0],
        float(np.nanmax(finite)) if finite.size else meta.get("default_range", [0, 1])[1],
    )

    return {
        "variable": canonical_variable,
        "units": meta.get("units", ""),
        "time": str(da["time"].values) if "time" in da.coords else None,
        "depth_m": float(da["depth"].values) if "depth" in da.coords and da["depth"].values.ndim == 0 else None,
        "lon": [round(float(x), 4) for x in da["lon"].values],
        "lat": [round(float(x), 4) for x in da["lat"].values],
        "values": _clean_2d(values),
        "value_range": value_range,
        "colormap": meta.get("default_colormap", "thermal"),
    }


def to_volume_slice(da: xr.DataArray, canonical_variable: str) -> dict:
    """Same as to_grid_slice but keeps the depth dimension, for stacked
    horizontal slices the frontend assembles into a 3D texture."""
    variables = get_variables()
    meta = variables.get(canonical_variable, {})

    values = np.asarray(da.values, dtype=float)
    if values.ndim != 3:
        raise ValueError(f"Expected a 3D (depth, lat, lon) array, got shape {values.shape}")

    finite = values[np.isfinite(values)]
    value_range = (
        float(np.nanmin(finite)) if finite.size else meta.get("default_range", [0, 1])[0],
        float(np.nanmax(finite)) if finite.size else meta.get("default_range", [0, 1])[1],
    )

    return {
        "variable": canonical_variable,
        "units": meta.get("units", ""),
        "time": str(da["time"].values) if "time" in da.coords else None,
        "depths_m": [round(float(z), 2) for z in da["depth"].values],
        "lon": [round(float(x), 4) for x in da["lon"].values],
        "lat": [round(float(x), 4) for x in da["lat"].values],
        "values": [_clean_2d(layer) for layer in values],
        "value_range": value_range,
        "colormap": meta.get("default_colormap", "thermal"),
    }


def list_colorscales() -> list[dict]:
    scales = get_colorscales()
    return [{"name": k, **v} for k, v in scales.items()]
