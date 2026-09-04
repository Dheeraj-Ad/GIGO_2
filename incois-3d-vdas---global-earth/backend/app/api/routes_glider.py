"""Routes for glider deployment discovery, trajectories, and profiles."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.config import get_domain
from app.models.schemas import GliderProfile, GliderSummary, GliderTrajectory
from app.services import glider_loader

logger = logging.getLogger("oceanviz.routes_glider")
router = APIRouter(prefix="/glider", tags=["glider"])


@router.get("/deployments", response_model=list[GliderSummary])
def list_deployments(
    west: float | None = None, south: float | None = None,
    east: float | None = None, north: float | None = None,
):
    domain = get_domain()
    bbox = (
        west if west is not None else domain["bbox"]["west"],
        south if south is not None else domain["bbox"]["south"],
        east if east is not None else domain["bbox"]["east"],
        north if north is not None else domain["bbox"]["north"],
    )
    try:
        return glider_loader.list_gliders_in_bbox(*bbox)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to list glider deployments")
        raise HTTPException(502, f"Could not fetch glider index: {exc}") from exc


@router.get("/trajectory/{glider_id}", response_model=GliderTrajectory)
def get_trajectory(glider_id: str, file_path: str):
    """`file_path` is the GDAC-relative NetCDF path from /deployments (kept
    explicit rather than re-resolved, since one glider_id can have several
    deployment files across its service life)."""
    try:
        return glider_loader.get_glider_trajectory(glider_id, file_path)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to fetch glider trajectory")
        raise HTTPException(502, f"Could not fetch trajectory: {exc}") from exc


@router.get("/profiles/{glider_id}", response_model=list[GliderProfile])
def get_profiles(glider_id: str, file_path: str, max_profiles: int = 50):
    try:
        return glider_loader.get_glider_profiles(glider_id, file_path, max_profiles=max_profiles)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to fetch glider profiles")
        raise HTTPException(502, f"Could not fetch profiles: {exc}") from exc
