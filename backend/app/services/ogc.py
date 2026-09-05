"""
ogc.py
======
OGC-standard access to the same model fields the JSON API serves:

  * **WMS 1.3.0** — ``GetCapabilities``, ``GetMap``, ``GetLegendGraphic``.
    Makes every registered (source, variable) pair consumable by *any* OGC
    client — QGIS, Cesium's ``WebMapServiceImageryProvider``, Leaflet,
    ArcGIS — not just this project's frontend.
  * **WCS 2.0.1** — ``GetCapabilities``, ``DescribeCoverage``,
    ``GetCoverage``, returning CF-compliant NetCDF (or GeoTIFF-less raw
    grids) for clients that want the numbers rather than a picture.

Why this matters for INCOIS specifically: an operational centre's outputs
have to slot into existing GIS and forecasting toolchains. A bespoke JSON
API can't do that; WMS/WCS can. Layer names are ``<source>:<variable>``,
and the standard ``TIME``/``ELEVATION`` dimensions map onto the same
time/depth subsetting the REST endpoints use.

Deliberate scope limits, stated rather than hidden:
  * CRS support is EPSG:4326, CRS:84 and EPSG:3857. These cover GIS and
    web-map clients; other projections would need a pyproj dependency.
  * Rendering is nearest/bilinear resampling of the native grid. There is
    no pyramid/tile cache, so very large GetMap requests are slower than a
    dedicated map server (ncWMS, THREDDS) would be.
"""
from __future__ import annotations

import logging
from urllib.parse import quote
from xml.sax.saxutils import escape

import numpy as np
import xarray as xr

from app.config import get_colorscales, get_data_sources, get_domain, get_variables
from app.services import colormaps

logger = logging.getLogger("oceanviz.ogc")

WMS_VERSION = "1.3.0"
WCS_VERSION = "2.0.1"
SUPPORTED_CRS = ("EPSG:4326", "CRS:84", "EPSG:3857")

# Web Mercator valid latitude limit.
_MERCATOR_LAT_LIMIT = 85.05112878


class OgcError(Exception):
    """Raised with an OGC exception code so the route can emit a
    ServiceExceptionReport, which is what conformant clients parse."""

    def __init__(self, message: str, code: str = "InvalidParameterValue", locator: str = ""):
        super().__init__(message)
        self.code = code
        self.locator = locator


# ---------------------------------------------------------------------------
# Layer registry — derived from the same YAML the REST API uses
# ---------------------------------------------------------------------------

def list_layers() -> list[dict]:
    """Every (model source, variable) pair, as WMS layers."""
    sources = get_data_sources()
    variables = get_variables()
    layers = []
    for source_key, source in sources.items():
        if source.get("kind") != "model":
            continue
        for var_key, var in variables.items():
            if source_key not in (var.get("aliases") or {}):
                continue
            layers.append(
                {
                    "name": f"{source_key}:{var_key}",
                    "source": source_key,
                    "variable": var_key,
                    "title": f"{var['label']} — {source['label']}",
                    "abstract": (
                        f"{var['label']} ({var['units']}), CF standard name "
                        f"'{var['cf_standard_name']}', from {source['label']}."
                    ),
                    "units": var["units"],
                    "default_colormap": var["default_colormap"],
                    "default_range": list(var["default_range"]),
                    "bbox": source.get("default_bbox") or [30, -10, 100, 30],
                }
            )
    return layers


def parse_layer_name(name: str) -> tuple[str, str]:
    if ":" not in name:
        raise OgcError(
            f"Layer '{name}' is malformed; expected '<source>:<variable>', "
            "e.g. 'copernicus_glorys:temperature'",
            "LayerNotDefined",
            "LAYERS",
        )
    source, variable = name.split(":", 1)
    known = {layer["name"] for layer in list_layers()}
    if name not in known:
        raise OgcError(f"Layer '{name}' is not offered by this server", "LayerNotDefined", "LAYERS")
    return source, variable


# ---------------------------------------------------------------------------
# CRS / bbox handling
# ---------------------------------------------------------------------------

def parse_bbox(bbox_str: str, crs: str, version: str = WMS_VERSION) -> tuple[float, float, float, float]:
    """Parse a WMS BBOX into (west, south, east, north) in degrees.

    This is where the WMS 1.3.0 axis-order trap lives: for EPSG:4326 the
    spec mandates **latitude first** (miny, minx, maxy, maxx), while CRS:84
    and EPSG:3857 are longitude-first. Getting this wrong silently
    transposes every map, so it is handled explicitly rather than assumed.
    """
    try:
        a, b, c, d = (float(v) for v in bbox_str.split(","))
    except ValueError as exc:
        raise OgcError(f"BBOX must be four comma-separated numbers, got '{bbox_str}'", locator="BBOX") from exc

    normalized = crs.upper()
    if normalized in ("EPSG:4326",) and version == "1.3.0":
        south, west, north, east = a, b, c, d
    elif normalized == "EPSG:3857":
        west, south = _mercator_to_lonlat(a, b)
        east, north = _mercator_to_lonlat(c, d)
    else:  # CRS:84, and WMS 1.1.1-style EPSG:4326
        west, south, east, north = a, b, c, d

    if west >= east or south >= north:
        raise OgcError(
            f"Degenerate BBOX after CRS handling: west={west} east={east} south={south} north={north}",
            locator="BBOX",
        )
    return west, south, east, north


def _mercator_to_lonlat(x: float, y: float) -> tuple[float, float]:
    lon = np.degrees(x / 6378137.0)
    lat = np.degrees(2 * np.arctan(np.exp(y / 6378137.0)) - np.pi / 2)
    return float(lon), float(np.clip(lat, -_MERCATOR_LAT_LIMIT, _MERCATOR_LAT_LIMIT))


def _lonlat_to_mercator_y(lat: float) -> float:
    lat = float(np.clip(lat, -_MERCATOR_LAT_LIMIT, _MERCATOR_LAT_LIMIT))
    return float(6378137.0 * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)))


def target_grid(
    bbox: tuple[float, float, float, float],
    width: int,
    height: int,
    crs: str,
) -> tuple[np.ndarray, np.ndarray]:
    """Pixel-centre lon/lat arrays for the requested image.

    For EPSG:3857 the rows are evenly spaced in *Mercator y*, not in
    latitude, so latitudes are computed by inverting the projection per row.
    Spacing them linearly in latitude instead is the classic bug that makes
    a Web-Mercator overlay drift from the basemap towards high latitudes.
    """
    west, south, east, north = bbox
    lons = west + (np.arange(width) + 0.5) * (east - west) / width

    if crs.upper() == "EPSG:3857":
        y_south, y_north = _lonlat_to_mercator_y(south), _lonlat_to_mercator_y(north)
        ys = y_north - (np.arange(height) + 0.5) * (y_north - y_south) / height
        lats = np.array([_mercator_to_lonlat(0.0, y)[1] for y in ys])
    else:
        # Row 0 is the top of the image = northernmost latitude.
        lats = north - (np.arange(height) + 0.5) * (north - south) / height

    return lons, lats


def resample_to_grid(
    da: xr.DataArray,
    lons: np.ndarray,
    lats: np.ndarray,
    method: str = "linear",
) -> np.ndarray:
    """Resample a (lat, lon) field onto the target pixel grid, returning a
    (height, width) array with NaN outside coverage."""
    if set(da.dims) != {"lat", "lon"}:
        raise OgcError(
            f"Expected a 2-D (lat, lon) field to render; got dims {list(da.dims)}",
            "InvalidDimensionValue",
        )

    # xarray's interp needs monotonically increasing coordinates; many
    # products store latitude descending.
    da = da.sortby("lat").sortby("lon")
    resampled = da.interp(
        lat=xr.DataArray(lats, dims="y"),
        lon=xr.DataArray(lons, dims="x"),
        method=method,
        kwargs={"bounds_error": False, "fill_value": np.nan},
    )
    return np.asarray(resampled.transpose("y", "x").values, dtype=float)


# ---------------------------------------------------------------------------
# WMS
# ---------------------------------------------------------------------------

def render_getmap(
    da: xr.DataArray,
    *,
    bbox: tuple[float, float, float, float],
    width: int,
    height: int,
    crs: str,
    colormap: str,
    vmin: float,
    vmax: float,
    scale: str = "linear",
    reverse: bool = False,
    opacity: float = 1.0,
    transparent: bool = True,
) -> bytes:
    lons, lats = target_grid(bbox, width, height, crs)
    values = resample_to_grid(da, lons, lats)
    rgba = colormaps.to_rgba(
        values, colormap=colormap, vmin=vmin, vmax=vmax,
        scale=scale, reverse=reverse, opacity=opacity,
    )
    if not transparent:
        # TRANSPARENT=FALSE means composite over an opaque background; use
        # the app's abyss colour so it matches the viewer rather than white.
        background = np.array([6, 11, 20], dtype=np.uint8)
        alpha = (rgba[..., 3:4].astype(float) / 255.0)
        rgba[..., :3] = (rgba[..., :3] * alpha + background * (1 - alpha)).astype(np.uint8)
        rgba[..., 3] = 255
    return colormaps.to_png(rgba)


def wms_capabilities_xml(service_url: str, timesteps: dict[str, list[str]] | None = None) -> str:
    """Build a WMS 1.3.0 GetCapabilities document.

    ``timesteps`` optionally maps a layer name to its available times; it is
    passed in rather than looked up here so generating capabilities never
    triggers a remote dataset open (which would make the document slow and
    fragile — the one request every client makes first).
    """
    domain = get_domain()
    bbox = domain["bbox"]
    depth_min, depth_max = domain["depth_range_m"]
    timesteps = timesteps or {}

    layer_xml = []
    for layer in list_layers():
        dims = [
            f'        <Dimension name="elevation" units="m" default="0" '
            f'nearestValue="1">{depth_min}/{depth_max}/0</Dimension>'
        ]
        times = timesteps.get(layer["name"])
        if times:
            dims.append(
                f'        <Dimension name="time" units="ISO8601" default="{times[-1]}" '
                f'nearestValue="1">{",".join(times)}</Dimension>'
            )
        lw, ls, le, ln = layer["bbox"]
        layer_xml.append(
            f"""      <Layer queryable="0" opaque="0">
        <Name>{escape(layer["name"])}</Name>
        <Title>{escape(layer["title"])}</Title>
        <Abstract>{escape(layer["abstract"])}</Abstract>
        <CRS>EPSG:4326</CRS>
        <CRS>CRS:84</CRS>
        <CRS>EPSG:3857</CRS>
        <EX_GeographicBoundingBox>
          <westBoundLongitude>{lw}</westBoundLongitude>
          <eastBoundLongitude>{le}</eastBoundLongitude>
          <southBoundLatitude>{ls}</southBoundLatitude>
          <northBoundLatitude>{ln}</northBoundLatitude>
        </EX_GeographicBoundingBox>
        <BoundingBox CRS="CRS:84" minx="{lw}" miny="{ls}" maxx="{le}" maxy="{ln}"/>
{chr(10).join(dims)}
        <Style>
          <Name>{escape(layer["default_colormap"])}</Name>
          <Title>{escape(layer["default_colormap"])} (default)</Title>
          <LegendURL width="24" height="256">
            <Format>image/png</Format>
            <OnlineResource xmlns:xlink="http://www.w3.org/1999/xlink"
              xlink:href="{escape(service_url)}?SERVICE=WMS&amp;VERSION=1.3.0&amp;REQUEST=GetLegendGraphic&amp;FORMAT=image/png&amp;LAYER={quote(layer["name"])}"/>
          </LegendURL>
        </Style>
      </Layer>"""
        )

    style_names = ", ".join(sorted(get_colorscales()))
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms"
    xmlns:xlink="http://www.w3.org/1999/xlink">
  <Service>
    <Name>WMS</Name>
    <Title>INCOIS-3D-OceanViz WMS</Title>
    <Abstract>OGC WMS 1.3.0 access to Indian Ocean model fields served by
      INCOIS-3D-OceanViz. Available styles (pass as STYLES): {escape(style_names)}.
      Use the non-standard COLORSCALERANGE=min,max parameter to override the
      default value range, following the ncWMS convention.</Abstract>
    <OnlineResource xlink:href="{escape(service_url)}"/>
  </Service>
  <Capability>
    <Request>
      <GetCapabilities>
        <Format>text/xml</Format>
        <DCPType><HTTP><Get><OnlineResource xlink:href="{escape(service_url)}"/></Get></HTTP></DCPType>
      </GetCapabilities>
      <GetMap>
        <Format>image/png</Format>
        <DCPType><HTTP><Get><OnlineResource xlink:href="{escape(service_url)}"/></Get></HTTP></DCPType>
      </GetMap>
      <GetLegendGraphic>
        <Format>image/png</Format>
        <DCPType><HTTP><Get><OnlineResource xlink:href="{escape(service_url)}"/></Get></HTTP></DCPType>
      </GetLegendGraphic>
    </Request>
    <Exception><Format>XML</Format></Exception>
    <Layer>
      <Title>INCOIS-3D-OceanViz model fields</Title>
      <CRS>CRS:84</CRS>
      <EX_GeographicBoundingBox>
        <westBoundLongitude>{bbox["west"]}</westBoundLongitude>
        <eastBoundLongitude>{bbox["east"]}</eastBoundLongitude>
        <southBoundLatitude>{bbox["south"]}</southBoundLatitude>
        <northBoundLatitude>{bbox["north"]}</northBoundLatitude>
      </EX_GeographicBoundingBox>
{chr(10).join(layer_xml)}
    </Layer>
  </Capability>
</WMS_Capabilities>
"""


def service_exception_xml(error: OgcError) -> str:
    locator = f' locator="{escape(error.locator)}"' if error.locator else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<ServiceExceptionReport version="1.3.0" xmlns="http://www.opengis.net/ogc">
  <ServiceException code="{escape(error.code)}"{locator}>{escape(str(error))}</ServiceException>
</ServiceExceptionReport>
"""


# ---------------------------------------------------------------------------
# WCS
# ---------------------------------------------------------------------------

def wcs_capabilities_xml(service_url: str) -> str:
    coverage_xml = "\n".join(
        f"""      <wcs:CoverageSummary>
        <wcs:CoverageId>{escape(layer["name"].replace(":", "__"))}</wcs:CoverageId>
        <wcs:CoverageSubtype>RectifiedGridCoverage</wcs:CoverageSubtype>
        <ows:Title>{escape(layer["title"])}</ows:Title>
      </wcs:CoverageSummary>"""
        for layer in list_layers()
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<wcs:Capabilities version="2.0.1"
    xmlns:wcs="http://www.opengis.net/wcs/2.0"
    xmlns:ows="http://www.opengis.net/ows/2.0"
    xmlns:xlink="http://www.w3.org/1999/xlink">
  <ows:ServiceIdentification>
    <ows:Title>INCOIS-3D-OceanViz WCS</ows:Title>
    <ows:ServiceType>OGC WCS</ows:ServiceType>
    <ows:ServiceTypeVersion>2.0.1</ows:ServiceTypeVersion>
  </ows:ServiceIdentification>
  <ows:OperationsMetadata>
    <ows:Operation name="GetCoverage">
      <ows:DCP><ows:HTTP><ows:Get xlink:href="{escape(service_url)}"/></ows:HTTP></ows:DCP>
    </ows:Operation>
  </ows:OperationsMetadata>
  <wcs:ServiceMetadata>
    <wcs:formatSupported>application/x-netcdf</wcs:formatSupported>
  </wcs:ServiceMetadata>
  <wcs:Contents>
{coverage_xml}
  </wcs:Contents>
</wcs:Capabilities>
"""


def parse_wcs_subset(subsets: list[str]) -> dict[str, tuple[float, float] | str]:
    """Parse WCS 2.0 ``subset=axis(low,high)`` / ``subset=axis(value)``.

    Axis labels are normalized to the canonical dimension names, accepting
    the several spellings clients use (``Long``/``x``/``lon``, etc.).
    """
    axis_aliases = {
        "long": "lon", "lon": "lon", "longitude": "lon", "x": "lon",
        "lat": "lat", "latitude": "lat", "y": "lat",
        "depth": "depth", "elevation": "depth", "z": "depth",
        "time": "time", "ansi": "time", "t": "time",
    }
    parsed: dict[str, tuple[float, float] | str] = {}
    for raw in subsets:
        if "(" not in raw or not raw.rstrip().endswith(")"):
            raise OgcError(f"Malformed subset '{raw}'; expected axis(low,high)", locator="subset")
        axis, _, rest = raw.partition("(")
        axis_key = axis_aliases.get(axis.strip().lower())
        if axis_key is None:
            raise OgcError(f"Unknown subset axis '{axis}'", "InvalidAxisLabel", "subset")
        body = rest.rstrip()[:-1]
        pieces = [p.strip().strip('"') for p in body.split(",")]

        if axis_key == "time":
            parsed["time"] = pieces[0] if len(pieces) == 1 else (pieces[0], pieces[-1])
            continue
        try:
            numbers = [float(p) for p in pieces]
        except ValueError as exc:
            raise OgcError(f"Non-numeric subset bound in '{raw}'", locator="subset") from exc
        parsed[axis_key] = (numbers[0], numbers[-1]) if len(numbers) > 1 else (numbers[0], numbers[0])
    return parsed
