"""Pydantic request/response models for the OceanViz API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class BBox(BaseModel):
    west: float
    south: float
    east: float
    north: float


class ModelSliceRequest(BaseModel):
    source: str = Field(..., description="Key into data_sources.yaml, e.g. 'copernicus_glorys'")
    variable: str = Field(..., description="Canonical variable name, e.g. 'temperature'")
    time: datetime | None = None
    depth_m: float | None = Field(None, description="Single depth for a horizontal slice")
    depth_range_m: tuple[float, float] | None = Field(
        None, description="Depth range for a volumetric/vertical-section pull"
    )
    bbox: BBox | None = None
    target_resolution_deg: float = Field(0.25, description="Downsample target for payload size")


class GridSlice(BaseModel):
    variable: str
    units: str
    time: str | None
    depth_m: float | None
    lon: list[float]
    lat: list[float]
    values: list[list[float | None]]  # row-major [lat][lon], null = land/mask
    value_range: tuple[float, float]
    colormap: str


class VolumeSlice(BaseModel):
    """Stacked horizontal slices across depth, for client-side 3D volume
    reconstruction (used by the Three.js volumetric renderer)."""
    variable: str
    units: str
    time: str | None
    depths_m: list[float]
    lon: list[float]
    lat: list[float]
    values: list[list[list[float | None]]]  # [depth][lat][lon]
    value_range: tuple[float, float]
    colormap: str


class ArgoFloatSummary(BaseModel):
    platform_number: str
    dac: str
    lon: float
    lat: float
    last_profile_time: str
    n_profiles: int
    status: Literal["active", "inactive", "unknown"] = "unknown"


class ArgoProfile(BaseModel):
    platform_number: str
    cycle_number: int
    time: str
    lon: float
    lat: float
    pressure_db: list[float]
    variables: dict[str, list[float | None]]  # e.g. {"temp": [...], "psal": [...]}
    variable_units: dict[str, str]


class ArgoTrack(BaseModel):
    """A float's surfacing positions over its lifetime — Argo's equivalent
    of a trajectory (it has no continuous path; it surfaces once a cycle)."""

    platform_number: str
    lon: list[float]
    lat: list[float]
    time: list[str]


class ArgoCycle(BaseModel):
    cycle_number: int | None
    time: str
    lon: float
    lat: float
    mode: Literal["delayed", "realtime"]


class GliderSummary(BaseModel):
    glider_id: str
    deployment_name: str
    #: GDAC-relative NetCDF path. Required on follow-up profile/trajectory
    #: calls, because one glider_id may have several deployment files.
    
    lon: float
    lat: float
    last_fix_time: str
    trajectory_points: int
    status: Literal["active", "inactive", "unknown"] = "unknown"


class GliderTrajectory(BaseModel):
    glider_id: str
    lon: list[float]
    lat: list[float]
    time: list[str]
    depth_m: list[float | None] | None = None


class GliderProfile(BaseModel):
    glider_id: str
    profile_index: int
    time: str
    lon: float
    lat: float
    depth_m: list[float]
    variables: dict[str, list[float | None]]
    variable_units: dict[str, str]


class ColorScale(BaseModel):
    name: str
    stops: list[str]
    description: str


class VariableMeta(BaseModel):
    key: str
    label: str
    units: str
    cf_standard_name: str
    default_range: tuple[float, float]
    default_colormap: str
    log_scale: bool
    available_sources: list[str]


class SourceMeta(BaseModel):
    key: str
    label: str
    type: str
    kind: str
    variables: list[str]
    default_bbox: list[float]
    auth_required: bool
