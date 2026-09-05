"""
glider_loader.py
================
Parses EGO-format glider NetCDF files from the OceanGliders GDAC (Ifremer
mirror served over HTTPS, matching the FTP tree at
ftp://ftp.ifremer.fr/ifremer/glider/v2/).

EGO files are trajectory files: one dataset per deployment containing a
1-D TIME dimension with along-path LATITUDE/LONGITUDE/PRES and sensor
variables (TEMP, PSAL, CHLA, ...). We derive:
  - a simplified trajectory (lon/lat/time) for map overlay + path line
  - discrete "profiles" by splitting the dive/climb cycle on pressure
    turning points, for the same depth-vs-variable chart UI used for Argo
"""
from __future__ import annotations

import io
import logging
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import xarray as xr

from app.config import get_data_sources, get_settings

logger = logging.getLogger("oceanviz.glider_loader")

# EGO field name -> canonical variable name (config/variables.yaml), matching
# argo_loader's convention so the two plot on shared axes.
_GLIDER_VARS = {
    "temperature": "TEMP",
    "salinity": "PSAL",
    "chlorophyll": "CHLA",
    "backscatter": "BBP700",
    "dissolved_oxygen": "DOXY",
}
_GLIDER_UNITS = {
    "temperature": "degC", "salinity": "PSU", "chlorophyll": "mg/m3",
    "backscatter": "m-1 sr-1", "dissolved_oxygen": "umol/kg",
}

# Column-name variants seen across revisions of the EGO GDAC index.
_INDEX_COLUMN_ALIASES = {
    "lat": ("latitude", "lat", "last_latitude_observation"),
    "lon": ("longitude", "lon", "last_longitude_observation"),
    "date": ("last_update", "date_update", "date", "last_date_observation"),
    "file_path": ("file", "file_path", "filename", "path"),
    "glider_id": ("glider_id", "platform_code", "wmo_platform_code", "glider"),
    "deployment_name": ("deployment_name", "deployment", "title", "dataset_name"),
}


def _index_url() -> str:
    return get_data_sources()["glider_ego_gdac"]["index_file"]


def _https_root() -> str:
    return get_data_sources()["glider_ego_gdac"]["base_url_https"]


def fetch_glider_index(force_refresh: bool = False) -> pd.DataFrame:
    """Glider GDAC index: deployment_name, file_path, lon, lat (last fix),
    last_update. Mirrors the structure of the Argo index but one row per
    deployment rather than per profile."""
    settings = get_settings()
    cache_path = settings.glider_cache_dir / "glider_index.txt"

    if cache_path.exists() and not force_refresh:
        age_s = datetime.now().timestamp() - cache_path.stat().st_mtime
        if age_s < 6 * 3600:
            return _parse_index(cache_path.read_text())

    logger.info("Fetching glider GDAC index from %s", _index_url())
    resp = requests.get(_index_url(), timeout=settings.request_timeout_s)
    resp.raise_for_status()
    cache_path.write_text(resp.text)
    return _parse_index(resp.text)


def _parse_index(raw_text: str) -> pd.DataFrame:
    """Normalize the GDAC index to canonical columns.

    The EGO index's column names have changed across revisions (and differ
    from the Argo index's), so every column this module relies on is
    resolved through ``_INDEX_COLUMN_ALIASES`` rather than assumed. A
    missing optional column becomes an empty one, so downstream code never
    has to test for its existence.
    """
    lines = [ln for ln in raw_text.splitlines() if ln and not ln.startswith("#")]
    if not lines:
        return pd.DataFrame(columns=list(_INDEX_COLUMN_ALIASES))

    df = pd.read_csv(io.StringIO("\n".join(lines)))
    df.columns = [c.strip().lower() for c in df.columns]

    for canonical, variants in _INDEX_COLUMN_ALIASES.items():
        if canonical in df.columns:
            continue
        for variant in variants:
            if variant in df.columns:
                df = df.rename(columns={variant: canonical})
                break
        else:
            df[canonical] = pd.NA

    df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")

    # Fall back to the deployment name (then the filename stem) when the
    # index carries no platform code, so every row has a usable identity.
    stem = df["file_path"].astype("string").str.rsplit("/", n=1).str[-1].str.replace(
        r"\.nc$", "", regex=True
    )
    df["glider_id"] = df["glider_id"].astype("string").fillna(
        df["deployment_name"].astype("string")
    ).fillna(stem).fillna("unknown")
    df["deployment_name"] = df["deployment_name"].astype("string").fillna(df["glider_id"])

    return df.dropna(subset=["lat", "lon", "file_path"])


def list_gliders_in_bbox(
    west: float, south: float, east: float, north: float,
    since: datetime | None = None,
) -> list[dict]:
    df = fetch_glider_index()
    if df.empty:
        return []

    mask = (df["lon"] >= west) & (df["lon"] <= east) & (df["lat"] >= south) & (df["lat"] <= north)
    if since is not None:
        mask &= df["date"] >= pd.Timestamp(since, tz="UTC")
    subset = df[mask]

    now = pd.Timestamp.now(tz="UTC")
    out = []
    for row in subset.itertuples():
        recent = pd.notna(row.date) and (now - row.date).days < 30
        out.append(
            {
                "glider_id": str(row.glider_id),
                "deployment_name": str(row.deployment_name or ""),
                # The exact deployment file must round-trip to the client: one
                # glider_id can have several files across its service life, so
                # follow-up profile/trajectory calls have to name which.
                "file_path": str(row.file_path),
                "lon": float(row.lon),
                "lat": float(row.lat),
                "last_fix_time": row.date.isoformat() if pd.notna(row.date) else "",
                "trajectory_points": int(getattr(row, "n_points", 0) or 0),
                "status": "active" if recent else "inactive",
            }
        )
    return out


def _open_deployment(file_path: str) -> xr.Dataset:
    """Open a deployment file, preferring a locally cached copy written by
    scripts/ingest_glider.py over a fresh download."""
    settings = get_settings()
    name = Path(file_path).name

    for cached in settings.glider_cache_dir.glob(f"*/{name}"):
        logger.info("Using cached glider deployment %s", cached)
        return xr.open_dataset(cached, engine="h5netcdf")

    url = f"{_https_root()}/{file_path.lstrip('/')}"
    logger.info("Fetching glider deployment NetCDF: %s", url)
    resp = requests.get(url, timeout=settings.request_timeout_s)
    resp.raise_for_status()
    return xr.open_dataset(io.BytesIO(resp.content), engine="h5netcdf")


def get_glider_trajectory(glider_id: str, file_path: str, max_points: int = 4000) -> dict:
    """Along-path lon/lat/time (and pressure, where present) for the map line.

    A multi-month deployment can hold >100k fixes, which is far more than a
    polyline needs; the track is decimated to ``max_points`` evenly-spaced
    samples, always keeping the last fix so the line ends at the glider's
    current position.
    """
    with _open_deployment(file_path) as ds:
        lon = np.asarray(ds["LONGITUDE"].values, dtype=float)
        lat = np.asarray(ds["LATITUDE"].values, dtype=float)
        time = pd.to_datetime(ds["TIME"].values)
        pres = (
            np.asarray(ds["PRES"].values, dtype=float)
            if "PRES" in ds.variables
            else None
        )

        valid = np.isfinite(lon) & np.isfinite(lat)
        lon, lat, time = lon[valid], lat[valid], time[valid]
        if pres is not None and pres.size == valid.size:
            pres = pres[valid]
        else:
            pres = None

        if lon.size > max_points:
            keep = np.unique(
                np.concatenate(
                    [np.linspace(0, lon.size - 1, max_points).astype(int), [lon.size - 1]]
                )
            )
            lon, lat, time = lon[keep], lat[keep], time[keep]
            if pres is not None:
                pres = pres[keep]

        return {
            "glider_id": glider_id,
            "lon": lon.tolist(),
            "lat": lat.tolist(),
            "time": [pd.Timestamp(t).isoformat() for t in time],
            "depth_m": (
                [None if not np.isfinite(v) else float(v) for v in pres]
                if pres is not None
                else None
            ),
        }


def _split_profiles(
    pressure: np.ndarray,
    min_amplitude_db: float = 10.0,
    min_samples: int = 5,
) -> list[slice]:
    """Segment a continuous glider dive/climb record into discrete profiles.

    Splitting naively at every sign change in dP/dt does not work on real
    data: sensor noise and the glider's pitch adjustments produce hundreds
    of tiny reversals, shattering one 500 m dive into dozens of 3-sample
    fragments. This uses hysteresis instead — a direction change is only
    accepted once pressure has actually reversed by ``min_amplitude_db``
    from the local extremum, which is the standard approach in EGO QC
    toolchains and robust to noise an order of magnitude below a real dive.
    """
    if pressure.size < min_samples:
        return [slice(0, pressure.size)]

    finite = np.isfinite(pressure)
    if not finite.any():
        return []

    bounds = [0]
    direction = 0  # +1 descending (pressure rising), -1 ascending
    extremum = pressure[np.argmax(finite)]

    for i in range(1, pressure.size):
        p = pressure[i]
        if not np.isfinite(p):
            continue

        if direction == 0:
            if abs(p - extremum) >= min_amplitude_db:
                direction = 1 if p > extremum else -1
                extremum = p
            elif (p > extremum) == (direction >= 0):
                extremum = p
            continue

        if (p - extremum) * direction > 0:
            extremum = p  # still moving the same way; extend the extremum
        elif abs(p - extremum) >= min_amplitude_db:
            # Confirmed reversal: close the current profile at the extremum.
            bounds.append(i)
            direction = -direction
            extremum = p

    bounds.append(pressure.size)
    return [
        slice(bounds[i], bounds[i + 1])
        for i in range(len(bounds) - 1)
        if bounds[i + 1] - bounds[i] >= min_samples
    ]


def get_glider_profiles(glider_id: str, file_path: str, max_profiles: int = 50) -> list[dict]:
    with _open_deployment(file_path) as ds:
        pres = ds["PRES"].values.astype(float) if "PRES" in ds.variables else ds["DEPTH"].values.astype(float)
        time = pd.to_datetime(ds["TIME"].values)
        lon = ds["LONGITUDE"].values.astype(float)
        lat = ds["LATITUDE"].values.astype(float)

        profiles = []
        for seg in _split_profiles(pres)[:max_profiles]:
            order = np.argsort(pres[seg])
            depth = pres[seg][order]

            variables: dict[str, list] = {}
            variable_units: dict[str, str] = {}
            for canonical, glider_name in _GLIDER_VARS.items():
                if glider_name not in ds.variables:
                    continue
                raw = ds[glider_name].values[seg].astype(float)[order]
                variables[canonical] = [None if np.isnan(v) else float(v) for v in raw]
                variable_units[canonical] = _GLIDER_UNITS[canonical]

            if not variables:
                continue

            mid = seg.start + (seg.stop - seg.start) // 2
            profiles.append({
                "glider_id": glider_id,
                "profile_index": len(profiles),
                "time": pd.Timestamp(time[mid]).isoformat(),
                "lon": float(lon[mid]),
                "lat": float(lat[mid]),
                "depth_m": [None if np.isnan(v) else float(v) for v in depth],
                "variables": variables,
                "variable_units": variable_units,
            })
        return profiles
