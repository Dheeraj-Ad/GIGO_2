"""
routes_insitu.py
=================
Generic routes for every registered in-situ instrument plugin (Argo,
glider, ERDDAP-backed moorings/CTD/HF-radar/ADCP — see app/core/plugins.py
and app/plugins/). Adding a new sensor type never touches this file: drop
a module in app/plugins/, and it's served here automatically.

Endpoint shape mirrors the plugin interface directly:

    GET /insitu/plugins                          -> registry.describe_all()
    GET /insitu/{plugin}/platforms?bbox...        -> plugin.discover()
    GET /insitu/{plugin}/profile/{platform_id}    -> plugin.profile()
    GET /insitu/{plugin}/trajectory/{platform_id} -> plugin.trajectory()
    GET /insitu/{plugin}/timeseries/{platform_id} -> plugin.timeseries()

The dedicated /argo/* and /glider/* routes (routes_argo.py, routes_glider.py)
remain as the stable, typed API those two sources have always had — this
module is the generic fallback every *other* plugin gets for free, and an
equally valid way to reach Argo/glider data via the same generic shape.
"""
from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request

from app.config import get_domain
from app.core.plugins import registry

logger = logging.getLogger("oceanviz.routes_insitu")
router = APIRouter(prefix="/insitu", tags=["insitu"])

# Query params consumed by this module itself, rather than forwarded to the
# plugin as a kwarg (bbox/since_days shape the discover() call explicitly;
# everything else in the query string is plugin-specific and passed through).
_RESERVED_PARAMS = {"west", "south", "east", "north", "since_days"}


def _bbox_from_query(west, south, east, north) -> tuple[float, float, float, float]:
    domain = get_domain()
    return (
        west if west is not None else domain["bbox"]["west"],
        south if south is not None else domain["bbox"]["south"],
        east if east is not None else domain["bbox"]["east"],
        north if north is not None else domain["bbox"]["north"],
    )


def _get_plugin(key: str):
    try:
        return registry.get(key)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


def _extra_kwargs(request: Request) -> dict:
    """Everything in the query string that isn't one of this route's own
    parameters gets forwarded to the plugin method as a kwarg — this is how
    glider's `file_path`, Argo's `cycle_number`, and ERDDAP's
    `lookback_days` reach their plugins without this file knowing about any
    of them individually."""
    return {k: v for k, v in request.query_params.items() if k not in _RESERVED_PARAMS}


@router.get("/plugins")
def list_plugins():
    """Every registered instrument source and what it supports — the
    frontend's Instruments panel builds its source list from this alone."""
    return registry.describe_all()


@router.get("/{plugin}/platforms")
def discover(
    plugin: str,
    west: float | None = None, south: float | None = None,
    east: float | None = None, north: float | None = None,
    since_days: int | None = None,
):
    p = _get_plugin(plugin)
    bbox = _bbox_from_query(west, south, east, north)
    since = datetime.now() - timedelta(days=since_days) if since_days else None
    try:
        return [asdict(row) for row in p.discover(bbox, since=since)]
    except Exception as exc:  # noqa: BLE001
        logger.exception("Plugin '%s' discover() failed", plugin)
        raise HTTPException(502, f"'{plugin}' discovery failed: {exc}") from exc


@router.get("/{plugin}/profile/{platform_id}")
def profile(plugin: str, platform_id: str, request: Request):
    p = _get_plugin(plugin)
    if not p.capabilities.profile:
        raise HTTPException(400, f"Plugin '{plugin}' does not provide profiles")
    try:
        return asdict(p.profile(platform_id, **_extra_kwargs(request)))
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Plugin '%s' profile() failed", plugin)
        raise HTTPException(502, f"'{plugin}' profile fetch failed: {exc}") from exc


@router.get("/{plugin}/trajectory/{platform_id}")
def trajectory(plugin: str, platform_id: str, request: Request):
    p = _get_plugin(plugin)
    if not p.capabilities.trajectory:
        raise HTTPException(400, f"Plugin '{plugin}' does not provide trajectories")
    try:
        return asdict(p.trajectory(platform_id, **_extra_kwargs(request)))
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Plugin '%s' trajectory() failed", plugin)
        raise HTTPException(502, f"'{plugin}' trajectory fetch failed: {exc}") from exc


@router.get("/{plugin}/timeseries/{platform_id}")
def timeseries(plugin: str, platform_id: str, request: Request):
    p = _get_plugin(plugin)
    if not p.capabilities.timeseries:
        raise HTTPException(400, f"Plugin '{plugin}' does not provide time series")
    try:
        return asdict(p.timeseries(platform_id, **_extra_kwargs(request)))
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Plugin '%s' timeseries() failed", plugin)
        raise HTTPException(502, f"'{plugin}' timeseries fetch failed: {exc}") from exc
