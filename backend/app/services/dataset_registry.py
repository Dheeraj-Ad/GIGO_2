"""
dataset_registry.py
===================
Resolves a gridded source key to a concrete (uri, engine) pair.

This is the *only* place in the codebase that knows where a dataset
physically lives. It used to be an ``if source == ...`` ladder inside the
route module, which meant adding a source required editing route code —
exactly the coupling the config-driven design is meant to avoid.

Resolution is driven by each source's ``access:`` list in
``config/data_sources.yaml``, tried in order, first hit wins:

    access:
      - {mode: local_zarr,   path: "model_cache/glorys/{dataset_id}.zarr"}
      - {mode: local_netcdf, path: "model_cache/glorys/*.nc"}
      - {mode: opendap_catalog}

That ordering encodes the performance policy: prefer the cloud-optimized
local Zarr an ingestion script wrote, fall back to cached NetCDF, and only
reach across the network to a live OPeNDAP/ERDDAP endpoint as a last
resort. A deployment tunes its own trade-off by reordering YAML.

Supported modes
---------------
``local_zarr``      Local (or fsspec-readable) Zarr store — best for volumes.
``local_netcdf``    Local NetCDF/HDF5, optionally a glob; newest match wins.
``opendap``         Explicit OPeNDAP/DAP URL from ``dap_url``.
``opendap_catalog`` Resolve via THREDDS/LAS ``catalog.xml`` at request time.
``erddap_griddap``  ERDDAP griddap dataset (OPeNDAP under the hood).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from app.config import get_data_sources, get_settings
from app.services import erddap_client
from app.services.opendap_client import get_las_dap_url

logger = logging.getLogger("oceanviz.dataset_registry")


class DatasetUnavailable(Exception):
    """No access mode for this source produced a usable dataset. Carries a
    per-mode explanation so the API can tell the operator which ingestion
    script to run rather than just saying 'not found'."""

    def __init__(self, source_key: str, attempts: list[str]):
        self.source_key = source_key
        self.attempts = attempts
        super().__init__(
            f"No dataset available for source '{source_key}'. Tried:\n  - "
            + "\n  - ".join(attempts)
        )


@dataclass(frozen=True)
class Resolved:
    uri: str
    engine: str | None
    mode: str
    source_key: str


def _expand(path_template: str, source: dict) -> Path:
    """Interpolate ``{dataset_id}``-style placeholders and anchor the result
    under the configured data directory (absolute paths pass through)."""
    settings = get_settings()
    rendered = path_template.format(
        dataset_id=source.get("dataset_id", ""),
        data_dir=settings.data_dir,
    )
    candidate = Path(rendered)
    return candidate if candidate.is_absolute() else settings.data_dir / candidate


def _newest_match(pattern: Path) -> Path | None:
    """Resolve a possibly-globbed path to the most recently modified match,
    so a nightly ingestion cron naturally supersedes yesterday's file."""
    if "*" not in str(pattern) and "?" not in str(pattern):
        return pattern if pattern.exists() else None
    parent, glob = pattern.parent, pattern.name
    if not parent.is_dir():
        return None
    matches = sorted(parent.glob(glob), key=lambda p: p.stat().st_mtime, reverse=True)
    return matches[0] if matches else None


def _default_access(source_key: str, source: dict) -> list[dict]:
    """Access plan for sources that predate (or omit) an explicit ``access``
    block, preserving the original behaviour for them."""
    if source.get("type") == "erddap_griddap":
        return [{"mode": "erddap_griddap"}]
    if source.get("dap_url"):
        return [{"mode": "opendap"}]
    plan: list[dict] = []
    if source.get("dataset_id"):
        plan.append({"mode": "local_zarr", "path": f"model_cache/{source_key}/{{dataset_id}}.zarr"})
    plan.append({"mode": "local_netcdf", "path": f"model_cache/{source_key}*.nc"})
    if source.get("catalog_endpoint"):
        plan.append({"mode": "opendap_catalog"})
    return plan


def resolve(source_key: str, canonical_variable: str) -> Resolved:
    """Find a usable dataset for ``source_key``.

    ``canonical_variable`` is only needed by catalog-based modes, where the
    product to open depends on which variable was asked for.
    """
    sources = get_data_sources()
    if source_key not in sources:
        raise KeyError(f"Unknown source '{source_key}'. Known: {', '.join(sorted(sources))}")

    source = sources[source_key]
    if source.get("kind") != "model":
        raise ValueError(
            f"Source '{source_key}' is kind '{source.get('kind')}', not a gridded model source"
        )

    plan = source.get("access") or _default_access(source_key, source)
    attempts: list[str] = []

    for entry in plan:
        mode = entry.get("mode", "")
        try:
            if mode in ("local_zarr", "local_netcdf"):
                pattern = _expand(entry["path"], source)
                match = _newest_match(pattern)
                if match is None:
                    attempts.append(f"{mode}: no file matching {pattern}")
                    continue
                engine = "zarr" if mode == "local_zarr" else None
                return Resolved(str(match), engine, mode, source_key)

            if mode == "opendap":
                url = source.get("dap_url")
                if not url:
                    attempts.append("opendap: source has no 'dap_url'")
                    continue
                return Resolved(url, "pydap", mode, source_key)

            if mode == "erddap_griddap":
                url = erddap_client.griddap_dap_url(source["base_url"], source["dataset_id"])
                return Resolved(url, "pydap", mode, source_key)

            if mode == "opendap_catalog":
                product = entry.get("product") or source.get("default_product") or canonical_variable
                url = get_las_dap_url(product_id=product, variable_alias=canonical_variable)
                return Resolved(url, "pydap", mode, source_key)

            attempts.append(f"unknown access mode '{mode}'")
        except Exception as exc:  # noqa: BLE001 — try the next mode
            logger.warning("Access mode '%s' failed for %s: %s", mode, source_key, exc)
            attempts.append(f"{mode}: {exc}")

    raise DatasetUnavailable(source_key, attempts)


def hint_for(source_key: str) -> str:
    """Operator-facing next step when a source can't be resolved — points at
    the specific ingestion script instead of a generic 503."""
    scripts = {
        "copernicus_glorys": (
            "python backend/scripts/ingest_copernicus_glorys.py --start ... --end ... --out ..."
        ),
        "incois_las": (
            "python backend/scripts/ingest_incois_las.py --product ... --variable ... --out ..."
        ),
    }
    generic = (
        "Run the matching script in backend/scripts/ to populate data/model_cache/, "
        "or check network access to the source's live endpoint."
    )
    return scripts.get(source_key, generic)
