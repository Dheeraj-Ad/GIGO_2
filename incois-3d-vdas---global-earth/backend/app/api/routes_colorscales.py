"""Routes exposing the color scale registry and regional domain config so
the frontend's Colorbar Editor and initial camera framing stay in sync with
the same YAML the backend renders from."""
from __future__ import annotations

from fastapi import APIRouter

from app.config import get_domain
from app.models.schemas import ColorScale
from app.services.grid_serializer import list_colorscales

router = APIRouter(tags=["config"])


@router.get("/colorscales", response_model=list[ColorScale])
def get_colorscales_route():
    return list_colorscales()


@router.get("/domain")
def get_domain_route():
    return get_domain()
