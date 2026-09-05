"""
INCOIS-3D-OceanViz backend entrypoint.

Run with:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    routes_argo,
    routes_colorscales,
    routes_glider,
    routes_insitu,
    routes_model,
    routes_ogc,
)
from app.config import get_settings
from app.core.plugins import load_plugins, registry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("oceanviz.main")

settings = get_settings()

# Import every module in app/plugins/ so their @register_plugin classes
# (Argo, glider, and any ERDDAP-backed mooring/CTD/HF-radar/ADCP sources
# declared in config/data_sources.yaml) register themselves before the app
# starts serving /insitu/* routes.
_loaded_plugins = load_plugins()
logger.info(
    "Loaded %d in-situ instrument plugin module(s): %s",
    len(_loaded_plugins), ", ".join(p.key for p in registry.all()) or "none",
)

app = FastAPI(
    title=settings.app_name,
    description=(
        "REST + OGC WMS/WCS API serving 3D ocean model fields (temperature, "
        "salinity, currents) and in-situ Argo float / glider / plugin-based "
        "instrument data for the INCOIS 3D Ocean Data Visualization System."
    ),
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_model.router, prefix=settings.api_prefix)
app.include_router(routes_argo.router, prefix=settings.api_prefix)
app.include_router(routes_glider.router, prefix=settings.api_prefix)
app.include_router(routes_insitu.router, prefix=settings.api_prefix)
app.include_router(routes_colorscales.router, prefix=settings.api_prefix)
app.include_router(routes_ogc.router, prefix=settings.api_prefix)


@app.get("/api/health", tags=["health"])
def health():
    return {
        "status": "ok",
        "service": settings.app_name,
        "plugins": [p.key for p in registry.all()],
    }


@app.get("/", tags=["health"])
def root():
    return {
        "service": settings.app_name,
        "docs": "/api/docs",
        "api_prefix": settings.api_prefix,
    }
