"""Routes for gridded ocean model fields (temperature, salinity, currents...)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from app.config import get_data_sources, get_domain, get_variables
from app.models.schemas import GridSlice, SourceMeta, VariableMeta, VolumeSlice
from app.services import dataset_registry, geometry, netcdf_loader
from app.services.grid_serializer import to_grid_slice, to_volume_slice

logger = logging.getLogger("oceanviz.routes_model")
router = APIRouter(prefix="/model", tags=["model"])


def _bbox(west, south, east, north) -> tuple[float, float, float, float]:
    domain = get_domain()
    return (
        west if west is not None else domain["bbox"]["west"],
        south if south is not None else domain["bbox"]["south"],
        east if east is not None else domain["bbox"]["east"],
        north if north is not None else domain["bbox"]["north"],
    )


def _resolve(source: str, variable: str) -> tuple[str, str | None]:
    """Delegate to dataset_registry -- the single place that knows how each
    source's dataset is physically located (local Zarr/NetCDF cache written
    by an ingestion script, or a live OPeNDAP/ERDDAP endpoint), tried in the
    order configured per-source in data_sources.yaml."""
    try:
        resolved = dataset_registry.resolve(source, variable)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except dataset_registry.DatasetUnavailable as exc:
        raise HTTPException(
            503, f"{exc} Hint: {dataset_registry.hint_for(source)}"
        ) from exc
    return resolved.uri, resolved.engine


@router.get("/sources", response_model=list[SourceMeta])
def list_sources():
    sources = get_data_sources()
    return [
        SourceMeta(
            key=k, label=v["label"], type=v["type"], kind=v["kind"],
            variables=v.get("variables", []), default_bbox=v.get("default_bbox", []),
            auth_required=v.get("auth_required", False),
        )
        for k, v in sources.items() if v["kind"] == "model"
    ]


@router.get("/variables", response_model=list[VariableMeta])
def list_variables():
    variables = get_variables()
    out = []
    for key, meta in variables.items():
        out.append(VariableMeta(
            key=key, label=meta["label"], units=meta["units"],
            cf_standard_name=meta["cf_standard_name"],
            default_range=tuple(meta["default_range"]),
            default_colormap=meta["default_colormap"],
            log_scale=meta.get("log_scale", False),
            available_sources=list(meta.get("aliases", {}).keys()),
        ))
    return out


@router.get("/slice", response_model=GridSlice)
def get_horizontal_slice(
    source: str = Query(..., description="e.g. copernicus_glorys, incois_las"),
    variable: str = Query(..., description="canonical variable, e.g. temperature"),
    depth_m: float = Query(0, description="depth for the horizontal slice"),
    time: str | None = Query(None, description="ISO8601 timestamp; nearest match used"),
    west: float | None = None, south: float | None = None,
    east: float | None = None, north: float | None = None,
    resolution_deg: float = Query(0.25, ge=0.05, le=2.0),
):
    """A single depth-slice horizontal grid -- the workhorse endpoint for
    the map/isosurface base layer and for scrubbing the depth-slice slider."""
    bbox = _bbox(west, south, east, north)
    uri, engine = _resolve(source, variable)
    try:
        da = netcdf_loader.load_and_slice(
            uri, variable, source, engine=engine, bbox=bbox,
            time=time, depth_m=depth_m, target_resolution_deg=resolution_deg,
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(
            503,
            f"Dataset not available locally ({exc}). Run the matching ingestion script in "
            "backend/scripts/ to populate the local cache, or check remote connectivity.",
        ) from exc
    return to_grid_slice(da, variable)


@router.get("/volume", response_model=VolumeSlice)
def get_volume(
    source: str, variable: str,
    depth_min_m: float = 0, depth_max_m: float = 500,
    time: str | None = None,
    west: float | None = None, south: float | None = None,
    east: float | None = None, north: float | None = None,
    resolution_deg: float = Query(0.5, ge=0.1, le=2.0),
):
    """Stacked depth slices for full 3D volumetric rendering. Coarser
    default resolution than /slice since payload size grows with depth
    levels x lat x lon."""
    bbox = _bbox(west, south, east, north)
    uri, engine = _resolve(source, variable)
    try:
        da = netcdf_loader.load_and_slice(
            uri, variable, source, engine=engine, bbox=bbox, time=time,
            depth_range_m=(depth_min_m, depth_max_m), target_resolution_deg=resolution_deg,
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(503, f"Dataset not available locally ({exc})") from exc
    return to_volume_slice(da, variable)


@router.get("/section")
def get_vertical_section(
    source: str, variable: str,
    start_lon: float, start_lat: float, end_lon: float, end_lat: float,
    depth_min_m: float = 0, depth_max_m: float = 1000,
    time: str | None = None,
    n_points: int = Query(120, ge=2, le=500),
    resolution_deg: float = Query(0.25, ge=0.05, le=2.0),
):
    """Depth-vs-distance curtain along an arbitrary transect -- draw a line
    across an eddy or a front and see the thermocline's shape underneath it."""
    # A generous bbox around the transect endpoints, so the loader pulls
    # enough surrounding grid to interpolate the track without edge effects.
    pad = 1.0
    bbox = (
        min(start_lon, end_lon) - pad, min(start_lat, end_lat) - pad,
        max(start_lon, end_lon) + pad, max(start_lat, end_lat) + pad,
    )
    uri, engine = _resolve(source, variable)
    try:
        da = netcdf_loader.load_and_slice(
            uri, variable, source, engine=engine, bbox=bbox, time=time,
            depth_range_m=(depth_min_m, depth_max_m), target_resolution_deg=resolution_deg,
        )
        result = geometry.vertical_section(
            da, (start_lon, start_lat), (end_lon, end_lat), n_points=n_points
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(503, f"Dataset not available locally ({exc})") from exc
    result["variable"] = variable
    result["units"] = get_variables().get(variable, {}).get("units", "")
    return result


@router.get("/isosurface")
def get_isosurface(
    source: str, variable: str, level: float,
    depth_min_m: float = 0, depth_max_m: float = 1000,
    time: str | None = None,
    west: float | None = None, south: float | None = None,
    east: float | None = None, north: float | None = None,
    resolution_deg: float = Query(0.5, ge=0.1, le=2.0),
    step: int = Query(1, ge=1, le=8, description="Decimation factor before meshing"),
):
    """A real triangulated isosurface mesh (marching cubes) at the given
    value, for geospatially-accurate draping on the Cesium globe -- distinct
    from ThreeVolumeViewer's shader-based isosurface, which is fast and
    interactive but not an exportable/measurable geometric object."""
    bbox = _bbox(west, south, east, north)
    uri, engine = _resolve(source, variable)
    try:
        da = netcdf_loader.load_and_slice(
            uri, variable, source, engine=engine, bbox=bbox, time=time,
            depth_range_m=(depth_min_m, depth_max_m), target_resolution_deg=resolution_deg,
        )
        mesh = geometry.isosurface_mesh(da, level, step=step)
    except (KeyError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(503, f"Dataset not available locally ({exc})") from exc
    mesh["variable"] = variable
    return mesh
