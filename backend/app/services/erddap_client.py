"""
erddap_client.py
================
Minimal ERDDAP client covering the two protocols an ERDDAP server exposes:

  * **tabledap** — tabular/point data (moorings, CTD casts, tide gauges,
    drifters, ADCP station records). Queried here as CSV, which ERDDAP
    emits with a units row under the header.
  * **griddap** — gridded data, which is OPeNDAP-compatible, so it needs no
    client of its own: :func:`griddap_dap_url` just builds the DAP URL and
    ``netcdf_loader.open_dataset(..., engine="pydap")`` takes it from there.

ERDDAP is the standard access layer for a large share of operational
in-situ archives (IOOS, EMODnet, several INCOIS/ODIS collections), so
supporting it once means a new mooring or CTD collection is a YAML entry
rather than a new parser.
"""
from __future__ import annotations

import io
import logging
from urllib.parse import quote

import pandas as pd
import requests

from app.config import get_settings

logger = logging.getLogger("oceanviz.erddap")


class ErddapError(RuntimeError):
    """Raised for ERDDAP-level failures, including its 'nothing matched'
    response, which arrives as HTTP 404 with a text body rather than an
    empty result set."""


def _build_query(
    variables: list[str],
    constraints: dict[str, object] | None = None,
    functions: list[str] | None = None,
) -> str:
    """Assemble an ERDDAP query string.

    ERDDAP's grammar is ``?var1,var2&constraint&constraint&function()``.
    Constraint keys carry their own operator, e.g.
    ``{"time>=": "2023-01-01", "longitude<=": 100}``.
    """
    parts = [",".join(variables)] if variables else []
    for key, value in (constraints or {}).items():
        parts.append(f"{key}{quote(str(value), safe='')}")
    parts.extend(functions or [])
    return "?" + "&".join(parts) if parts else ""


def tabledap(
    base_url: str,
    dataset_id: str,
    variables: list[str],
    constraints: dict[str, object] | None = None,
    functions: list[str] | None = None,
) -> pd.DataFrame:
    """Run a tabledap query and return it as a DataFrame.

    An empty result is returned as an empty DataFrame (with the requested
    columns) rather than raising, because "no instruments in this bbox" is
    a normal answer, not an error.
    """
    settings = get_settings()
    url = f"{base_url.rstrip('/')}/tabledap/{dataset_id}.csv{_build_query(variables, constraints, functions)}"
    logger.info("ERDDAP tabledap request: %s", url)

    resp = requests.get(url, timeout=settings.request_timeout_s)
    if resp.status_code == 404:
        # ERDDAP signals an empty match with 404 + an explanatory body.
        if "nothing" in resp.text.lower() or "no data" in resp.text.lower():
            return pd.DataFrame(columns=variables)
        raise ErddapError(f"ERDDAP dataset '{dataset_id}' not found at {base_url}")
    if not resp.ok:
        raise ErddapError(f"ERDDAP returned {resp.status_code}: {resp.text[:400]}")

    # Row 0 is the header, row 1 is the units row — skip it, keeping the
    # units in case a caller wants them.
    text = resp.text
    df = pd.read_csv(io.StringIO(text), skiprows=[1])
    if "time" in df.columns:
        df["time"] = pd.to_datetime(df["time"], errors="coerce", utc=True)
    return df


def tabledap_units(base_url: str, dataset_id: str, variables: list[str]) -> dict[str, str]:
    """Read just the units row of a tabledap response (one row of data
    requested so the payload stays trivial)."""
    settings = get_settings()
    url = (
        f"{base_url.rstrip('/')}/tabledap/{dataset_id}.csv"
        f"{_build_query(variables, functions=['orderByCount()'])}"
    )
    try:
        resp = requests.get(url, timeout=settings.request_timeout_s)
        resp.raise_for_status()
        lines = resp.text.splitlines()
        if len(lines) < 2:
            return {}
        names = [c.strip() for c in lines[0].split(",")]
        units = [u.strip() for u in lines[1].split(",")]
        return dict(zip(names, units))
    except Exception as exc:  # noqa: BLE001 — units are cosmetic; never fatal
        logger.warning("Could not read ERDDAP units for %s: %s", dataset_id, exc)
        return {}


def griddap_dap_url(base_url: str, dataset_id: str) -> str:
    """ERDDAP griddap datasets are OPeNDAP endpoints; hand the result to
    ``netcdf_loader.open_dataset(uri, engine='pydap')``."""
    return f"{base_url.rstrip('/')}/griddap/{dataset_id}"
