"""
Central configuration for INCOIS-3D-OceanViz backend.

Loads the YAML registries in /config (shared with the frontend build) and
exposes them as typed, cached accessors. Nothing about a data source's URL,
variable aliasing, or color scale is hardcoded in route/service code — it
all flows from here, which is what lets a new source be added by editing
YAML instead of Python.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic_settings import BaseSettings

# Repo layout: <root>/backend/app/config.py -> <root>/config/*.yaml
# Both paths are overridable via env vars so the same image works whether
# run from a full repo checkout (docker-compose bind mount) or a slim
# container image where /config and /data are mounted independently.
REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = Path(os.environ.get("OCEANVIZ_CONFIG_DIR", REPO_ROOT / "config"))
DATA_DIR = Path(os.environ.get("OCEANVIZ_DATA_DIR", REPO_ROOT / "data"))


class Settings(BaseSettings):
    app_name: str = "INCOIS-3D-OceanViz"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Local cache / working directories
    data_dir: Path = DATA_DIR
    argo_cache_dir: Path = DATA_DIR / "argo"
    glider_cache_dir: Path = DATA_DIR / "glider"
    model_cache_dir: Path = DATA_DIR / "model_cache"

    # Networking
    request_timeout_s: int = 60
    max_subset_points: int = 2_000_000  # guardrail against runaway 3D subsets

    # Copernicus Marine credentials (optional; only needed for GLORYS pulls)
    copernicus_marine_username: str | None = os.environ.get("COPERNICUS_MARINE_USERNAME")
    copernicus_marine_password: str | None = os.environ.get("COPERNICUS_MARINE_PASSWORD")

    class Config:
        env_file = ".env"
        extra = "ignore"
        protected_namespaces = ("settings_",)  # allow model_cache_dir without pydantic's "model_" warning


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    for d in (settings.argo_cache_dir, settings.glider_cache_dir, settings.model_cache_dir):
        d.mkdir(parents=True, exist_ok=True)
    return settings


def _load_yaml(name: str) -> dict[str, Any]:
    path = CONFIG_DIR / name
    with open(path, "r") as f:
        return yaml.safe_load(f)


@lru_cache
def get_data_sources() -> dict[str, Any]:
    return _load_yaml("data_sources.yaml")["sources"]


@lru_cache
def get_variables() -> dict[str, Any]:
    return _load_yaml("variables.yaml")["variables"]


@lru_cache
def get_colorscales() -> dict[str, Any]:
    return _load_yaml("colorscales.yaml")["colorscales"]


@lru_cache
def get_domain(domain_file: str = "indian_ocean_domain.yaml") -> dict[str, Any]:
    return _load_yaml(domain_file)["domain"]


def resolve_variable_alias(canonical_name: str, source_key: str) -> str | list[str] | None:
    """Map a canonical variable (e.g. 'temperature') to the field name used
    by a specific source (e.g. 'thetao' for copernicus_glorys, 'temp' for
    argo_gdac). Returns None if that source doesn't provide the variable."""
    variables = get_variables()
    entry = variables.get(canonical_name)
    if not entry:
        return None
    return entry.get("aliases", {}).get(source_key)
