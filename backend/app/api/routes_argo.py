"""Routes for Argo float discovery and profile retrieval."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from app.config import get_domain
from app.models.schemas import ArgoCycle, ArgoFloatSummary, ArgoProfile, ArgoTrack
from app.services import argo_loader

logger = logging.getLogger("oceanviz.routes_argo")
router = APIRouter(prefix="/argo", tags=["argo"])


@router.get("/floats", response_model=list[ArgoFloatSummary])
def list_floats(
    west: float | None = None, south: float | None = None,
    east: float | None = None, north: float | None = None,
    since_days: int | None = Query(90, description="Only floats with a profile in the last N days"),
):
    domain = get_domain()
    bbox = (
        west if west is not None else domain["bbox"]["west"],
        south if south is not None else domain["bbox"]["south"],
        east if east is not None else domain["bbox"]["east"],
        north if north is not None else domain["bbox"]["north"],
    )
    since = None
    if since_days:
        since = datetime.now() - timedelta(days=since_days)
    try:
        floats = argo_loader.list_floats_in_bbox(*bbox, since=since)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to list Argo floats")
        raise HTTPException(502, f"Could not fetch Argo index: {exc}") from exc
    return floats


@router.get("/profile/{platform_number}", response_model=ArgoProfile)
def get_profile(platform_number: str, cycle_number: int | None = None):
    try:
        return argo_loader.get_float_profile(platform_number, cycle_number)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to fetch Argo profile")
        raise HTTPException(502, f"Could not fetch profile: {exc}") from exc


@router.get("/track/{platform_number}", response_model=ArgoTrack)
def get_track(platform_number: str):
    """A float's surfacing positions over its lifetime (Argo has no
    continuous trajectory — it surfaces once per ~10-day cycle)."""
    try:
        return argo_loader.get_float_track(platform_number)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to fetch Argo track")
        raise HTTPException(502, f"Could not fetch track: {exc}") from exc


@router.get("/cycles/{platform_number}", response_model=list[ArgoCycle])
def get_cycles(platform_number: str):
    """Every cycle the index knows about for a float, for a cycle picker
    in the UI rather than only ever showing the most recent profile."""
    try:
        return argo_loader.list_cycles(platform_number)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to list Argo cycles")
        raise HTTPException(502, f"Could not list cycles: {exc}") from exc
