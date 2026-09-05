"""Smoke tests: config/YAML registries load, variable alias resolution
works, and the FastAPI app boots with all routes registered."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_colorscales, get_data_sources, get_domain, get_variables, resolve_variable_alias


def test_data_sources_load():
    sources = get_data_sources()
    assert "incois_las" in sources
    assert "copernicus_glorys" in sources
    assert "argo_gdac" in sources
    assert "glider_ego_gdac" in sources


def test_variables_load():
    variables = get_variables()
    assert "temperature" in variables
    assert variables["temperature"]["units"] == "°C"


def test_colorscales_load():
    scales = get_colorscales()
    assert "thermal" in scales
    assert len(scales["thermal"]["stops"]) > 2


def test_domain_load():
    domain = get_domain()
    assert domain["bbox"]["west"] < domain["bbox"]["east"]


def test_alias_resolution():
    assert resolve_variable_alias("temperature", "copernicus_glorys") == "thetao"
    assert resolve_variable_alias("temperature", "argo_gdac") == "temp"
    assert resolve_variable_alias("current_speed", "copernicus_glorys") == ["uo", "vo"]
    assert resolve_variable_alias("nonexistent_var", "argo_gdac") is None


def test_app_boots():
    from app.main import app
    paths = set(app.openapi()["paths"].keys())
    assert "/api/v1/model/slice" in paths
    assert "/api/v1/argo/floats" in paths
    assert "/api/v1/glider/deployments" in paths
    assert "/api/health" in paths


def test_plugin_system_loaded():
    from app.main import app  # noqa: F401 -- importing main triggers load_plugins()
    from app.core.plugins import registry
    keys = {p.key for p in registry.all()}
    assert "argo" in keys
    assert "glider" in keys
    argo_plugin = registry.get("argo")
    assert argo_plugin.capabilities.discover
    assert argo_plugin.capabilities.profile


def test_insitu_and_ogc_routes_registered():
    from app.main import app
    paths = set(app.openapi()["paths"].keys())
    assert "/api/v1/insitu/plugins" in paths
    assert "/api/v1/insitu/{plugin}/platforms" in paths
    assert "/api/v1/ogc/wms" in paths
    assert "/api/v1/ogc/wcs" in paths
    assert "/api/v1/model/section" in paths
    assert "/api/v1/model/isosurface" in paths
