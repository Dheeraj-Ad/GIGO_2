"""
netcdf_loader.py
================
Modular loader for gridded ocean model fields. Handles three backends behind
one interface, so routes never know whether data came from a local NetCDF
file, a Zarr store, or a remote OPeNDAP/THREDDS endpoint:

    1. Local NetCDF / HDF5 files          (engine="netcdf4"/"h5netcdf")
    2. Local or cloud-optimized Zarr      (engine="zarr")
    3. Remote OPeNDAP / THREDDS / ERDDAP  (engine="pydap", lazy remote reads)

All three return an xarray.Dataset with CF-like dimensions (time, depth,
lat, lon), so downstream subsetting/slicing code is backend-agnostic.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import xarray as xr

from app.config import get_settings, resolve_variable_alias

logger = logging.getLogger("oceanviz.netcdf_loader")

# Common dimension name variants seen across LAS/GLORYS/generic CF files.
_DIM_ALIASES = {
    "lon": ["lon", "longitude", "x"],
    "lat": ["lat", "latitude", "y"],
    "depth": ["depth", "lev", "z", "deptht", "elevation"],
    "time": ["time", "time_counter", "t"],
}


@dataclass
class OpenResult:
    ds: xr.Dataset
    backend: str
    source_uri: str


def _standardize_dims(ds: xr.Dataset) -> xr.Dataset:
    """Rename whatever dimension/coordinate names a dataset uses to the
    canonical set (time, depth, lat, lon) so every downstream function can
    assume a single schema."""
    rename_map: dict[str, str] = {}
    for canonical, variants in _DIM_ALIASES.items():
        if canonical in ds.dims or canonical in ds.coords:
            continue
        for v in variants:
            if v in ds.dims or v in ds.coords:
                rename_map[v] = canonical
                break
    ds = ds.rename(rename_map) if rename_map else ds

    # ERDDAP griddap and some LAS products expose the vertical axis as
    # `elevation` (metres *above* the geoid, i.e. negative downward). Flip
    # it so "depth" always means metres below the surface, positive down —
    # otherwise every depth slider and slice request is silently inverted.
    if "depth" in ds.coords and _is_elevation_axis(ds):
        ds = ds.assign_coords(depth=-ds["depth"])
        ds["depth"].attrs["positive"] = "down"
        ds = ds.sortby("depth")
    return ds


def _is_elevation_axis(ds: xr.Dataset) -> bool:
    depth = ds["depth"]
    if str(depth.attrs.get("positive", "")).lower() == "up":
        return True
    values = np.asarray(depth.values, dtype=float)
    finite = values[np.isfinite(values)]
    # All-negative (and not all-zero) means it is an elevation axis.
    return bool(finite.size and np.all(finite <= 0) and np.any(finite < 0))


def parse_time(value: str | datetime | np.datetime64 | None) -> np.datetime64 | None:
    """Coerce whatever the API layer received (ISO8601 string, datetime, or
    None) into something ``DataArray.sel(time=...)`` accepts.

    Routes take ``time`` as a query string, so without this the loader was
    handed a ``str`` where it expected a ``datetime`` — which xarray only
    tolerates for exact matches, not for the ``method="nearest"`` lookups
    the time scrubber depends on.
    """
    if value is None or value == "":
        return None
    if isinstance(value, np.datetime64):
        return value
    try:
        return np.datetime64(pd.Timestamp(value).tz_localize(None))
    except TypeError:
        # Already tz-aware — normalize to UTC then drop the tz, since CF
        # time axes are naive-UTC by convention.
        return np.datetime64(pd.Timestamp(value).tz_convert("UTC").tz_localize(None))
    except ValueError as exc:
        raise ValueError(f"Could not parse '{value}' as an ISO8601 timestamp") from exc


def slice_coord(da: xr.DataArray, coord: str, lo: float, hi: float) -> xr.DataArray:
    """Range-select along a 1-D coordinate, honouring its storage order.

    ``.sel(lat=slice(south, north))`` returns an *empty* array when the
    dataset stores latitude descending (north-first) — which GLORYS, many
    THREDDS products and every ERDDAP `elevation` axis do. Rather than
    resorting the whole (potentially remote, lazily-chunked) array, detect
    the direction and reverse the slice bounds.
    """
    if coord not in da.dims:
        return da
    values = np.asarray(da[coord].values, dtype=float)
    if values.size < 2:
        return da.sel({coord: slice(lo, hi)})
    descending = values[0] > values[-1]
    lo, hi = (min(lo, hi), max(lo, hi))
    bounds = slice(hi, lo) if descending else slice(lo, hi)
    out = da.sel({coord: bounds})
    if out[coord].size == 0:
        raise ValueError(
            f"No {coord} values in range [{lo}, {hi}] — dataset covers "
            f"[{values.min():.3f}, {values.max():.3f}]"
        )
    return out


def open_dataset(uri: str, engine: str | None = None, **xr_kwargs: Any) -> OpenResult:
    """Open a dataset from a local path or remote OPeNDAP URL.

    engine=None triggers autodetection:
      - "http://" / "https://" containing "/dodsC/" or explicit opendap flag -> pydap
      - .zarr suffix or directory containing .zarray -> zarr
      - otherwise -> netcdf4 (falls back to h5netcdf on failure)

    ``engine="erddap"`` is accepted as a synonym for pydap: ERDDAP griddap
    endpoints speak OPeNDAP, so the only difference is URL construction,
    which ``services/erddap_client.griddap_dap_url()`` handles.
    """
    is_remote = uri.startswith("http://") or uri.startswith("https://") or uri.startswith("ftp://")

    if engine == "erddap":
        engine = "pydap"

    if engine is None:
        if uri.endswith(".zarr") or "/zarr/" in uri:
            engine = "zarr"
        elif is_remote:
            engine = "pydap"
        else:
            engine = "netcdf4"

    logger.info("Opening dataset uri=%s engine=%s", uri, engine)

    if engine == "zarr":
        ds = xr.open_zarr(uri, consolidated=True, **xr_kwargs)
    elif engine == "pydap":
        ds = xr.open_dataset(
            uri,
            engine="pydap",
            decode_times=True,
            chunks={},  # lazy, dask-backed reads — only pulled slices hit the wire
            **xr_kwargs,
        )
    else:
        try:
            ds = xr.open_dataset(uri, engine="netcdf4", decode_times=True, **xr_kwargs)
        except Exception as exc:  # noqa: BLE001
            logger.warning("netcdf4 engine failed (%s), retrying with h5netcdf", exc)
            ds = xr.open_dataset(uri, engine="h5netcdf", decode_times=True, **xr_kwargs)

    ds = _standardize_dims(ds)
    return OpenResult(ds=ds, backend=engine, source_uri=uri)


def select_variable(ds: xr.Dataset, canonical_name: str, source_key: str) -> xr.DataArray:
    """Resolve a canonical variable name to the source-specific field name
    and return the corresponding DataArray. Raises KeyError with a helpful
    message if the source doesn't carry that variable."""
    alias = resolve_variable_alias(canonical_name, source_key)
    if alias is None:
        raise KeyError(f"Variable '{canonical_name}' is not registered for source '{source_key}'")
    if isinstance(alias, list):
        raise ValueError(
            f"'{canonical_name}' is a derived variable ({alias}); use compute_derived() instead"
        )
    if alias not in ds.variables:
        raise KeyError(f"Field '{alias}' not present in dataset (looked for canonical '{canonical_name}')")
    return ds[alias]


def compute_derived(ds: xr.Dataset, canonical_name: str, source_key: str) -> xr.DataArray:
    """Compute derived fields (currently: current_speed = sqrt(u^2 + v^2)).
    'currents' is accepted as an alias of 'current_speed' -- some frontend
    clients request the plainer name; both resolve to the same u/v aliases
    in variables.yaml, so the actual computation is identical."""
    if canonical_name not in ("current_speed", "currents"):
        raise ValueError(f"No derivation rule for '{canonical_name}'")
    alias = resolve_variable_alias(canonical_name, source_key)
    if not isinstance(alias, list) or len(alias) != 2:
        raise KeyError(f"'{canonical_name}' aliases misconfigured for source '{source_key}'")
    u_name, v_name = alias
    u, v = ds[u_name], ds[v_name]
    speed = np.sqrt(u**2 + v**2)
    speed.name = canonical_name
    return speed


def subset(
    da: xr.DataArray,
    *,
    bbox: tuple[float, float, float, float] | None = None,  # west, south, east, north
    time: str | datetime | None = None,
    depth_m: float | None = None,
    depth_range_m: tuple[float, float] | None = None,
    target_resolution_deg: float | None = None,
) -> xr.DataArray:
    """Apply bbox/time/depth subsetting and optional coarsening, in an order
    chosen to minimize data pulled over the wire for remote (OPeNDAP) sources:
    index-based selects first (cheap, metadata-only), then coarsen last."""
    out = da

    if "time" in out.dims:
        stamp = parse_time(time)
        if stamp is not None:
            out = out.sel(time=stamp, method="nearest")
        else:
            # Always collapse time — a 2D slice endpoint must not return a
            # length-N time axis just because the caller omitted `time`.
            out = out.isel(time=-1)

    if "depth" in out.dims:
        if depth_range_m is not None:
            out = slice_coord(out, "depth", *depth_range_m)
        elif depth_m is not None:
            out = out.sel(depth=depth_m, method="nearest")

    if bbox is not None and "lon" in out.dims and "lat" in out.dims:
        west, south, east, north = bbox
        out = slice_coord(out, "lon", west, east)
        out = slice_coord(out, "lat", south, north)

    if target_resolution_deg and "lon" in out.dims and "lat" in out.dims:
        lon_factor = _coarsen_factor(out["lon"].values, target_resolution_deg)
        lat_factor = _coarsen_factor(out["lat"].values, target_resolution_deg)
        if lon_factor > 1 or lat_factor > 1:
            out = out.coarsen(lon=lon_factor, lat=lat_factor, boundary="trim").mean(
                keep_attrs=True
            )

    return out


def _coarsen_factor(coord_values: np.ndarray, target_resolution_deg: float) -> int:
    """Decimation factor to get from a coordinate's native spacing to the
    requested one. Uses the median spacing rather than the first gap, which
    is wrong for the stretched/irregular grids some regional models use."""
    values = np.asarray(coord_values, dtype=float)
    if values.size < 2:
        return 1
    native = float(np.median(np.abs(np.diff(values))))
    if native <= 0:
        return 1
    return max(1, int(round(target_resolution_deg / native)))


def guard_size(da: xr.DataArray, max_points: int) -> None:
    n = int(np.prod(da.shape)) if da.shape else 0
    if n > max_points:
        raise ValueError(
            f"Requested subset has {n} points, exceeding the {max_points} safety limit. "
            "Narrow the bbox, depth range, or increase target_resolution_deg."
        )


@lru_cache(maxsize=32)
def _cached_open(uri: str, engine: str | None) -> OpenResult:
    """Process-local cache so repeated slice requests against the same
    dataset (e.g. scrubbing through time) don't reopen the DAP connection
    each time. Keyed on (uri, engine); safe because xarray datasets opened
    lazily are cheap to hold and reads are chunk-fetched on demand."""
    return open_dataset(uri, engine=engine)


def resolve_field(ds: xr.Dataset, canonical_variable: str, source_key: str) -> xr.DataArray:
    """Return the DataArray for a canonical variable, whether it is stored
    directly or has to be derived (e.g. current_speed from u/v).

    Kept separate from ``load_and_slice`` so the section/isosurface/profile
    endpoints resolve variables through exactly the same path as the slice
    endpoint — a new derived variable becomes available everywhere at once.
    """
    alias = resolve_variable_alias(canonical_variable, source_key)
    if alias is None:
        raise KeyError(
            f"Variable '{canonical_variable}' is not registered for source '{source_key}'"
        )
    if isinstance(alias, list):
        return compute_derived(ds, canonical_variable, source_key)
    return select_variable(ds, canonical_variable, source_key)


def load_and_slice(
    uri: str,
    canonical_variable: str,
    source_key: str,
    *,
    engine: str | None = None,
    bbox: tuple[float, float, float, float] | None = None,
    time: str | datetime | None = None,
    depth_m: float | None = None,
    depth_range_m: tuple[float, float] | None = None,
    target_resolution_deg: float | None = 0.25,
) -> xr.DataArray:
    """One-call convenience: open (cached) -> resolve variable -> subset ->
    size-guard. This is what the API routes call directly."""
    settings = get_settings()
    result = _cached_open(uri, engine)

    da = resolve_field(result.ds, canonical_variable, source_key)
    da = subset(
        da,
        bbox=bbox,
        time=time,
        depth_m=depth_m,
        depth_range_m=depth_range_m,
        target_resolution_deg=target_resolution_deg,
    )
    guard_size(da, settings.max_subset_points)
    return da.load()  # materialize only the final, already-small subset


def load_field(
    uri: str,
    canonical_variable: str,
    source_key: str,
    *,
    engine: str | None = None,
) -> xr.DataArray:
    """Lazy, unsubset access to a resolved field — for callers that do
    their own indexing (vertical sections, point profiles, isosurfaces)."""
    return resolve_field(_cached_open(uri, engine).ds, canonical_variable, source_key)


def list_timesteps(
    uri: str,
    *,
    engine: str | None = None,
    limit: int | None = None,
) -> list[str]:
    """Return the dataset's time axis as ISO8601 strings.

    This is what makes the time-animation control functional: the frontend
    can't animate a field without knowing which timestamps exist, and
    guessing a cadence is wrong for products that skip days or switch from
    daily to monthly means partway through their record.

    ``limit`` keeps the most recent N steps, since a multi-decade daily
    reanalysis has ~10k timestamps and the scrubber only needs a window.
    """
    ds = _cached_open(uri, engine).ds
    if "time" not in ds.coords:
        return []
    values = pd.to_datetime(np.asarray(ds["time"].values))
    if limit is not None and len(values) > limit:
        values = values[-limit:]
    return [pd.Timestamp(t).isoformat() for t in values]


def column_profile(
    da: xr.DataArray,
    lon: float,
    lat: float,
    *,
    time: str | datetime | None = None,
    depth_range_m: tuple[float, float] | None = None,
) -> xr.DataArray:
    """Extract the model's full water column at one point.

    Used to overlay the model's own profile behind an Argo/glider profile in
    the same chart — the single most common validation task an operational
    oceanographer performs against a float.
    """
    out = da
    if "time" in out.dims:
        stamp = parse_time(time)
        out = out.sel(time=stamp, method="nearest") if stamp is not None else out.isel(time=-1)
    if depth_range_m is not None and "depth" in out.dims:
        out = slice_coord(out, "depth", *depth_range_m)
    return out.sel(lon=lon, lat=lat, method="nearest").load()
