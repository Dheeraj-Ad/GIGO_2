"""
argo_loader.py
==============
Parses the Argo GDAC (Ifremer) global index and individual float profile
NetCDF files.

Two entry points:
  - list_floats_in_bbox(): reads the lightweight global profile index
    (ar_index_global_prof.txt) to find which floats have profiles in a
    region/time window, without touching any NetCDF files.
  - get_float_profile(): opens one float's profile NetCDF (Argo's
    "single-cycle" file, e.g. R5904297_034.nc) and extracts pressure/temp/
    psal/doxy/chla as depth-vs-variable arrays.

Index format (ar_index_global_prof.txt), CSV with header:
file, date, latitude, longitude, ocean, profiler_type, institution, date_update
e.g.:
aoml/5904297/profiles/R5904297_034.nc,20230115120000,12.345,68.123,I,845,AO,...
"""
from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import xarray as xr

from app.config import get_data_sources, get_settings

logger = logging.getLogger("oceanviz.argo_loader")

# Argo field name -> the canonical variable name used everywhere else in the
# system (config/variables.yaml). Keying on canonical names here is what lets
# a chart plot an Argo profile and a glider profile of "temperature" on the
# same axes without either side special-casing the other.
_ARGO_VARS = {
    "temperature": "TEMP",
    "salinity": "PSAL",
    "dissolved_oxygen": "DOXY",
    "chlorophyll": "CHLA",
}
_ARGO_UNITS = {
    "temperature": "degC",
    "salinity": "PSU",
    "dissolved_oxygen": "umol/kg",
    "chlorophyll": "mg/m3",
}


@dataclass
class ArgoIndexEntry:
    file_path: str
    date: datetime
    lat: float
    lon: float
    dac: str
    platform_number: str


def _index_url() -> str:
    return get_data_sources()["argo_gdac"]["index_file"]


def _https_root() -> str:
    return get_data_sources()["argo_gdac"]["base_url_https"]


def fetch_global_index(force_refresh: bool = False) -> pd.DataFrame:
    """Download (and locally cache) the Argo global profile index. This
    file is tens of MB but is the standard, documented way to discover
    which floats/cycles exist without crawling the FTP tree."""
    settings = get_settings()
    cache_path = settings.argo_cache_dir / "ar_index_global_prof.txt"

    if cache_path.exists() and not force_refresh:
        age_s = (datetime.now().timestamp() - cache_path.stat().st_mtime)
        if age_s < 6 * 3600:  # index refreshed a few times/day upstream; 6h is plenty
            return _parse_index(cache_path.read_text())

    logger.info("Fetching Argo global index from %s", _index_url())
    resp = requests.get(_index_url(), timeout=settings.request_timeout_s)
    resp.raise_for_status()
    cache_path.write_text(resp.text)
    return _parse_index(resp.text)


def _parse_index(raw_text: str) -> pd.DataFrame:
    # Argo index files begin with '#' comment lines, then a CSV header.
    lines = [ln for ln in raw_text.splitlines() if not ln.startswith("#")]
    df = pd.read_csv(io.StringIO("\n".join(lines)))
    df = df.rename(columns={"file": "file_path", "latitude": "lat", "longitude": "lon"})
    df["date"] = pd.to_datetime(df["date"], format="%Y%m%d%H%M%S", errors="coerce")
    df["dac"] = df["file_path"].str.split("/").str[0]
    df["platform_number"] = df["file_path"].str.split("/").str[1]
    return df.dropna(subset=["lat", "lon", "date"])


def list_floats_in_bbox(
    west: float, south: float, east: float, north: float,
    since: datetime | None = None,
) -> list[dict]:
    """Return the most recent profile per float within a bbox/time window."""
    df = fetch_global_index()
    mask = (df["lon"] >= west) & (df["lon"] <= east) & (df["lat"] >= south) & (df["lat"] <= north)
    if since is not None:
        mask &= df["date"] >= pd.Timestamp(since)
    subset = df[mask]

    latest = (
        subset.sort_values("date")
        .groupby("platform_number", as_index=False)
        .agg(
            file_path=("file_path", "last"),
            date=("date", "last"),
            lat=("lat", "last"),
            lon=("lon", "last"),
            dac=("dac", "last"),
            n_profiles=("file_path", "count"),
        )
    )
    return [
        {
            "platform_number": row.platform_number,
            "dac": row.dac,
            "lon": float(row.lon),
            "lat": float(row.lat),
            "last_profile_time": row.date.isoformat(),
            "n_profiles": int(row.n_profiles),
            "status": "active" if (datetime.now(timezone.utc) - row.date.to_pydatetime().replace(tzinfo=timezone.utc)).days < 30 else "inactive",
        }
        for row in latest.itertuples()
    ]


def get_float_track(platform_number: str) -> dict:
    """Reconstruct a float's drift path from its index entries.

    Argo floats have no continuous trajectory the way a glider does — they
    surface once per ~10-day cycle. The path is therefore the sequence of
    surfacing positions, which is exactly what the global index already
    holds, so this needs no NetCDF downloads at all.
    """
    df = fetch_global_index()
    rows = df[df["platform_number"] == platform_number].sort_values("date")
    if rows.empty:
        raise KeyError(f"No index entries for Argo float {platform_number}")
    return {
        "platform_number": platform_number,
        "lon": [float(v) for v in rows["lon"]],
        "lat": [float(v) for v in rows["lat"]],
        "time": [pd.Timestamp(t).isoformat() for t in rows["date"]],
    }


def list_cycles(platform_number: str) -> list[dict]:
    """Every cycle the index knows about for a float, so the UI can offer a
    cycle picker instead of only ever showing the most recent profile."""
    df = fetch_global_index()
    rows = df[df["platform_number"] == platform_number].sort_values("date")
    if rows.empty:
        raise KeyError(f"No index entries for Argo float {platform_number}")

    cycles = []
    for row in rows.itertuples():
        cycle = _cycle_from_path(row.file_path)
        cycles.append(
            {
                "cycle_number": cycle,
                "time": pd.Timestamp(row.date).isoformat(),
                "lon": float(row.lon),
                "lat": float(row.lat),
                # 'D' = delayed-mode (fully QC'd), 'R' = real-time.
                "mode": "delayed" if Path(row.file_path).name.startswith("D") else "realtime",
            }
        )
    return cycles


def _cycle_from_path(file_path: str) -> int | None:
    """Extract the cycle number from an Argo profile filename, e.g.
    ``aoml/5904297/profiles/R5904297_034.nc`` -> 34. Descending-profile
    files carry a trailing 'D' (``..._034D.nc``), hence the regex."""
    match = re.search(r"_(\d+)D?\.nc$", file_path)
    return int(match.group(1)) if match else None


def get_float_profile(platform_number: str, cycle_number: int | None = None) -> dict:
    """Fetch and parse the requested (or most recent) profile for a float.

    Argo "R"/"D" prefix denotes real-time vs delayed-mode QC; we prefer
    delayed-mode (D) when both exist since it's the higher-quality product.
    """
    df = fetch_global_index()
    floats = df[df["platform_number"] == platform_number].sort_values("date")
    if floats.empty:
        raise KeyError(f"No index entries for Argo float {platform_number}")

    if cycle_number is not None:
        # Match on the parsed cycle number rather than a formatted substring:
        # a `_{cycle:03d}.nc` pattern misses cycles past 999 and misses the
        # descending-profile variant (`_034D.nc`) entirely.
        candidates = floats[
            floats["file_path"].map(_cycle_from_path) == cycle_number
        ]
        if candidates.empty:
            raise KeyError(f"Cycle {cycle_number} not found for float {platform_number}")
    else:
        candidates = floats.tail(1)  # most recent cycle

    # Prefer delayed-mode ('D') over real-time ('R') when both exist for the
    # same cycle — delayed-mode has been through full scientific QC.
    delayed = candidates[
        candidates["file_path"].map(lambda p: Path(p).name.startswith("D"))
    ]
    row = (delayed if not delayed.empty else candidates).iloc[-1]

    settings = get_settings()

    # Prefer a locally cached copy (written by scripts/ingest_argo.py). This
    # is what makes the app usable offline / on a restricted network, and it
    # is the reason the ingestion script exists.
    cached = settings.argo_cache_dir / platform_number / Path(row.file_path).name
    if cached.exists():
        logger.info("Using cached Argo profile %s", cached)
        with xr.open_dataset(cached, engine="h5netcdf") as ds:
            return _extract_profile(ds, platform_number, row.file_path)

    url = f"{_https_root()}/dac/{row.file_path}"
    logger.info("Fetching Argo profile NetCDF: %s", url)
    resp = requests.get(url, timeout=settings.request_timeout_s)
    resp.raise_for_status()

    with xr.open_dataset(io.BytesIO(resp.content), engine="h5netcdf") as ds:
        return _extract_profile(ds, platform_number, row.file_path)


def _pick_field(ds: xr.Dataset, argo_name: str, n_prof: int) -> tuple[np.ndarray, str] | None:
    """Return the best available form of an Argo field, preferring the
    ``_ADJUSTED`` variant.

    Argo's convention is that ``<VAR>_ADJUSTED`` carries the calibrated,
    delayed-mode values and ``<VAR>`` the raw ones. The adjusted variable
    always *exists* in the file but is all-NaN until delayed-mode QC has
    run, so presence alone is not enough — it has to be checked for actual
    content before being preferred.
    """
    for name in (f"{argo_name}_ADJUSTED", argo_name):
        if name not in ds.variables:
            continue
        values = np.asarray(ds[name].isel(N_PROF=n_prof).values, dtype=float)
        if np.isfinite(values).any():
            return values, name
    return None


def _apply_qc(ds: xr.Dataset, field_name: str, values: np.ndarray, n_prof: int) -> np.ndarray:
    qc_name = f"{field_name}_QC"
    if qc_name not in ds.variables:
        return values
    qc = ds[qc_name].isel(N_PROF=n_prof).values
    # QC flag arrays are stored as bytes or as a single packed string
    # depending on the file's netCDF version; normalize both to one char
    # per level before comparing.
    flags = np.asarray(qc).astype("U")
    if flags.ndim == 0:
        flags = np.array(list(str(flags)))
    flags = np.array([str(f)[:1] for f in flags.ravel()])
    if flags.size != values.size:
        logger.warning(
            "QC array for %s has %d flags for %d levels; skipping QC mask",
            field_name, flags.size, values.size,
        )
        return values
    # Argo QC: '1' good, '2' probably good; mask everything else.
    return np.where(np.isin(flags, ["1", "2"]), values, np.nan)


def _extract_profile(ds: xr.Dataset, platform_number: str, file_path: str) -> dict:
    """Argo profile files store one or more cycles (N_PROF dimension); we
    take the primary profile (index 0), which is the standard convention
    for single-cycle files served under /profiles/."""
    n_prof = 0
    variables: dict[str, list] = {}
    variable_units: dict[str, str] = {}

    pres_pick = _pick_field(ds, "PRES", n_prof)
    if pres_pick is None:
        raise ValueError(f"Argo file {file_path} has no usable PRES field")
    pres, pres_name = pres_pick
    pres = _apply_qc(ds, pres_name, pres, n_prof)
    order = np.argsort(pres)
    pres_sorted = pres[order]

    for canonical, argo_name in _ARGO_VARS.items():
        pick = _pick_field(ds, argo_name, n_prof)
        if pick is None:
            continue
        raw, field_name = pick
        raw = _apply_qc(ds, field_name, raw, n_prof)[order]
        variables[canonical] = [None if np.isnan(v) else float(v) for v in raw]
        variable_units[canonical] = _ARGO_UNITS[canonical]

    cycle_number = int(ds["CYCLE_NUMBER"].isel(N_PROF=n_prof).values)
    juld = ds["JULD"].isel(N_PROF=n_prof).values
    time_str = pd.Timestamp(juld).isoformat()
    lat = float(ds["LATITUDE"].isel(N_PROF=n_prof).values)
    lon = float(ds["LONGITUDE"].isel(N_PROF=n_prof).values)

    return {
        "platform_number": platform_number,
        "cycle_number": cycle_number,
        "time": time_str,
        "lon": lon,
        "lat": lat,
        "pressure_db": [None if np.isnan(v) else float(v) for v in pres_sorted],
        "variables": variables,
        "variable_units": variable_units,
    }
