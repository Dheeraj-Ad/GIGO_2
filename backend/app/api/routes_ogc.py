"""
routes_ogc.py
==============
OGC WMS 1.3.0 and WCS 2.0.1 endpoints — see app/services/ogc.py for the
protocol logic (capabilities XML, CRS/bbox handling, resampling,
colorization). This module is deliberately thin: parse the request,
resolve the dataset via dataset_registry, hand off to ogc.py, serialize
the response in the format the OGC spec requires (XML / PNG / NetCDF).

Both services share the same layer registry as the REST API
(app.services.ogc.list_layers(), itself derived from config/data_sources.yaml
+ config/variables.yaml) — a layer is never defined twice.
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path

import xarray as xr
from fastapi import APIRouter, Request, Response

from app.services import colormaps, dataset_registry, netcdf_loader, ogc
from app.config import get_variables

logger = logging.getLogger("oceanviz.routes_ogc")
router = APIRouter(prefix="/ogc", tags=["ogc"])


def _ci_params(request: Request) -> dict[str, str]:
    """OGC clients vary in query-param casing (REQUEST vs request); WMS/WCS
    are defined case-insensitively, so normalize once here."""
    return {k.upper(): v for k, v in request.query_params.items()}


def _error(exc: ogc.OgcError, status: int = 400) -> Response:
    return Response(ogc.service_exception_xml(exc), media_type="text/xml", status_code=status)


def _resolve_layer_data(source: str, variable: str, *, bbox, time, depth_m):
    """Shared by GetMap and GetCoverage: resolve the dataset and pull the
    requested slice, translating the loader's exceptions into OGC ones."""
    try:
        resolved = dataset_registry.resolve(source, variable)
    except dataset_registry.DatasetUnavailable as exc:
        raise ogc.OgcError(
            f"{exc} Hint: {dataset_registry.hint_for(source)}", "NoApplicableCode"
        ) from exc
    try:
        return netcdf_loader.load_and_slice(
            resolved.uri, variable, source, engine=resolved.engine,
            bbox=bbox, time=time, depth_m=depth_m, target_resolution_deg=None,
        )
    except (KeyError, ValueError) as exc:
        raise ogc.OgcError(str(exc), "InvalidParameterValue") from exc


# ---------------------------------------------------------------------------
# WMS 1.3.0
# ---------------------------------------------------------------------------

@router.get("/wms")
def wms(request: Request):
    params = _ci_params(request)
    req = params.get("REQUEST", "GetCapabilities")
    version = params.get("VERSION", ogc.WMS_VERSION)
    service_url = str(request.url).split("?")[0]

    try:
        if req == "GetCapabilities":
            return Response(ogc.wms_capabilities_xml(service_url), media_type="text/xml")
        if req == "GetMap":
            return _wms_get_map(params, version)
        if req == "GetLegendGraphic":
            return _wms_get_legend(params)
        raise ogc.OgcError(f"Unsupported REQUEST '{req}'", "OperationNotSupported", "REQUEST")
    except ogc.OgcError as exc:
        return _error(exc)


def _wms_get_map(params: dict, version: str) -> Response:
    layer_name = params.get("LAYERS")
    if not layer_name:
        raise ogc.OgcError("LAYERS is required", locator="LAYERS")
    source, variable = ogc.parse_layer_name(layer_name)

    crs = params.get("CRS") or params.get("SRS") or "CRS:84"
    bbox = ogc.parse_bbox(params.get("BBOX", ""), crs, version)
    width = int(params.get("WIDTH", 512))
    height = int(params.get("HEIGHT", 512))
    transparent = params.get("TRANSPARENT", "TRUE").upper() != "FALSE"
    time = params.get("TIME") or None
    elevation = float(params.get("ELEVATION", 0) or 0)

    variables = get_variables()
    meta = variables.get(variable, {})
    vmin, vmax = meta.get("default_range", [0, 1])
    if "COLORSCALERANGE" in params:  # ncWMS convention: min,max override
        try:
            vmin, vmax = (float(x) for x in params["COLORSCALERANGE"].split(","))
        except ValueError as exc:
            raise ogc.OgcError("COLORSCALERANGE must be 'min,max'", locator="COLORSCALERANGE") from exc

    style = params.get("STYLES") or meta.get("default_colormap", "thermal")
    scale = "log" if meta.get("log_scale") else "linear"

    da = _resolve_layer_data(source, variable, bbox=bbox, time=time, depth_m=elevation)
    png = ogc.render_getmap(
        da, bbox=bbox, width=width, height=height, crs=crs,
        colormap=style, vmin=vmin, vmax=vmax, scale=scale, transparent=transparent,
    )
    return Response(png, media_type="image/png")


def _wms_get_legend(params: dict) -> Response:
    layer_name = params.get("LAYER")
    colormap = params.get("STYLE")
    if layer_name and not colormap:
        _, variable = ogc.parse_layer_name(layer_name)
        colormap = get_variables().get(variable, {}).get("default_colormap", "thermal")
    colormap = colormap or "thermal"
    png = colormaps.legend_png(colormap=colormap)
    return Response(png, media_type="image/png")


# ---------------------------------------------------------------------------
# WCS 2.0.1
# ---------------------------------------------------------------------------

@router.get("/wcs")
def wcs(request: Request):
    params = _ci_params(request)
    req = params.get("REQUEST", "GetCapabilities")
    service_url = str(request.url).split("?")[0]

    try:
        if req == "GetCapabilities":
            return Response(ogc.wcs_capabilities_xml(service_url), media_type="text/xml")
        if req == "DescribeCoverage":
            return _wcs_describe_coverage(params)
        if req == "GetCoverage":
            return _wcs_get_coverage(request, params)
        raise ogc.OgcError(f"Unsupported REQUEST '{req}'", "OperationNotSupported", "REQUEST")
    except ogc.OgcError as exc:
        return _error(exc)


def _coverage_id_to_layer(coverage_id: str) -> str:
    return coverage_id.replace("__", ":", 1)


def _wcs_describe_coverage(params: dict) -> Response:
    coverage_id = params.get("COVERAGEID")
    if not coverage_id:
        raise ogc.OgcError("COVERAGEID is required", locator="COVERAGEID")
    layer_name = _coverage_id_to_layer(coverage_id)
    layer = next((l for l in ogc.list_layers() if l["name"] == layer_name), None)
    if layer is None:
        raise ogc.OgcError(f"Coverage '{coverage_id}' not found", "NoSuchCoverage", "COVERAGEID")

    west, south, east, north = layer["bbox"]
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<wcs:CoverageDescriptions xmlns:wcs="http://www.opengis.net/wcs/2.0"
    xmlns:gml="http://www.opengis.net/gml/3.2">
  <wcs:CoverageDescription gml:id="{coverage_id}">
    <wcs:CoverageId>{coverage_id}</wcs:CoverageId>
    <gml:boundedBy>
      <gml:Envelope srsName="CRS:84" axisLabels="Long Lat">
        <gml:lowerCorner>{west} {south}</gml:lowerCorner>
        <gml:upperCorner>{east} {north}</gml:upperCorner>
      </gml:Envelope>
    </gml:boundedBy>
    <wcs:CoverageSubtype>RectifiedGridCoverage</wcs:CoverageSubtype>
    <gml:rangeType>
      <swe:DataRecord xmlns:swe="http://www.opengis.net/swe/2.0">
        <swe:field name="{layer['variable']}">
          <swe:Quantity><swe:uom code="{layer['units']}"/></swe:Quantity>
        </swe:field>
      </swe:DataRecord>
    </gml:rangeType>
  </wcs:CoverageDescription>
</wcs:CoverageDescriptions>
"""
    return Response(xml, media_type="text/xml")


def _wcs_get_coverage(request: Request, params: dict) -> Response:
    coverage_id = params.get("COVERAGEID")
    if not coverage_id:
        raise ogc.OgcError("COVERAGEID is required", locator="COVERAGEID")
    source, variable = ogc.parse_layer_name(_coverage_id_to_layer(coverage_id))

    # SUBSET is a repeatable query key (WCS 2.0 KVP encoding), so it has to
    # be read from the raw multi-dict rather than the case-folded single dict.
    subsets_raw = request.query_params.getlist("subset") or request.query_params.getlist("SUBSET")
    parsed = ogc.parse_wcs_subset(subsets_raw)

    lon_range = parsed.get("lon")
    lat_range = parsed.get("lat")
    bbox = (
        lon_range[0] if lon_range else None,
        lat_range[0] if lat_range else None,
        lon_range[1] if lon_range else None,
        lat_range[1] if lat_range else None,
    )
    if None in bbox:
        raise ogc.OgcError(
            "GetCoverage requires SUBSET=Long(...) and SUBSET=Lat(...)", locator="SUBSET"
        )

    depth_range = parsed.get("depth")
    depth_m = depth_range[0] if depth_range else 0
    time = parsed.get("time") if isinstance(parsed.get("time"), str) else None

    da = _resolve_layer_data(source, variable, bbox=bbox, time=time, depth_m=depth_m)

    # xarray needs a real file target to write netCDF4 (HDF5-backed) output;
    # a temp file round-trip is the simplest reliable way to get bytes out.
    with tempfile.TemporaryDirectory() as tmp:
        out_path = Path(tmp) / "coverage.nc"
        xr.Dataset({variable: da}).to_netcdf(out_path, engine="h5netcdf")
        data = out_path.read_bytes()

    return Response(
        data, media_type="application/x-netcdf",
        headers={"Content-Disposition": f'attachment; filename="{coverage_id}.nc"'},
    )
