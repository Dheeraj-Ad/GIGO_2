"""
geometry.py
===========
Derived geometry products computed from an already-subset gridded field:

  * :func:`vertical_section` — depth-vs-distance curtain along an arbitrary
    transect (the classic "what does the thermocline do across this
    eddy?" view, and the natural companion to a float profile).
  * :func:`isosurface_mesh` — a real triangulated isosurface via marching
    cubes, in lon/lat/depth coordinates.

Kept out of ``netcdf_loader`` deliberately: that module owns IO and
subsetting, this one owns pure array→geometry maths. Neither imports the
other's concerns, so either can be swapped (e.g. moving isosurfacing to a
worker process) without touching the data path.

Why a server-side isosurface as well as the shader-based one?
``ThreeVolumeViewer``'s raymarcher renders an isosurface *visually* by
thresholding during compositing, which is fast and interactive but is not
a geometric object — it can't be measured, exported, or draped on the
Cesium globe at true geospatial coordinates. Marching cubes gives an
actual mesh for those uses. The two are complementary, and the UI offers
both ("Isosurface" view mode = shader, "Extract mesh" = this).
"""
from __future__ import annotations

import logging

import numpy as np
import xarray as xr

logger = logging.getLogger("oceanviz.geometry")

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lon1: np.ndarray, lat1: np.ndarray, lon2: np.ndarray, lat2: np.ndarray) -> np.ndarray:
    """Great-circle distance in km. Used for the section's distance axis so
    it is a true physical distance rather than degrees, which compress
    badly across the 40° of latitude the Indian Ocean domain spans."""
    lon1, lat1, lon2, lat2 = (np.radians(np.asarray(a, dtype=float)) for a in (lon1, lat1, lon2, lat2))
    dlon, dlat = lon2 - lon1, lat2 - lat1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def interpolate_track(
    start: tuple[float, float],
    end: tuple[float, float],
    n_points: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Sample ``n_points`` positions along the straight line between two
    lon/lat points.

    Linear interpolation in lon/lat (a rhumb-ish path), not a great circle:
    over the few-hundred-km transects a forecaster draws across an eddy or
    a front the two differ by well under one grid cell, and a straight line
    in lon/lat is what the user drew on the map and expects to get back.
    """
    lons = np.linspace(start[0], end[0], n_points)
    lats = np.linspace(start[1], end[1], n_points)
    return lons, lats


def vertical_section(
    da: xr.DataArray,
    start: tuple[float, float],
    end: tuple[float, float],
    *,
    n_points: int = 120,
) -> dict:
    """Interpolate a (depth, lat, lon) field onto a vertical transect.

    Returns a dict shaped for the frontend's section chart:
    ``values[depth][point]``, with both a distance-along-track axis (km)
    and the lon/lat of each sample so the track can be drawn on the map.
    """
    if "depth" not in da.dims:
        raise ValueError("A vertical section needs a depth dimension; got dims " f"{list(da.dims)}")

    lons, lats = interpolate_track(start, end, n_points)
    track_lon = xr.DataArray(lons, dims="track")
    track_lat = xr.DataArray(lats, dims="track")

    # Bilinear interpolation onto the track. `interp` broadcasts the two
    # 1-D 'track'-dimensioned selectors together (rather than as an outer
    # product), which is exactly the point-wise sampling we want.
    section = da.interp(lon=track_lon, lat=track_lat)
    section = section.transpose("depth", "track").load()

    distance_km = np.concatenate(
        [[0.0], np.cumsum(haversine_km(lons[:-1], lats[:-1], lons[1:], lats[1:]))]
    )
    values = np.asarray(section.values, dtype=float)
    finite = values[np.isfinite(values)]

    return {
        "depths_m": [round(float(z), 2) for z in np.asarray(section["depth"].values, dtype=float)],
        "distance_km": [round(float(d), 3) for d in distance_km],
        "lon": [round(float(x), 4) for x in lons],
        "lat": [round(float(y), 4) for y in lats],
        "values": [
            [None if not np.isfinite(v) else round(float(v), 4) for v in row] for row in values
        ],
        "value_range": (
            (float(finite.min()), float(finite.max())) if finite.size else (0.0, 0.0)
        ),
        "n_valid": int(finite.size),
    }


def isosurface_mesh(da: xr.DataArray, level: float, *, step: int = 1) -> dict:
    """Extract a triangulated isosurface at ``level`` from a
    (depth, lat, lon) field using marching cubes.

    Vertices come back in real-world coordinates (lon°, lat°, depth m) so
    the client can place the mesh geospatially rather than in index space.

    ``step`` decimates the volume before marching (``step=2`` → 8x fewer
    cells), which is the practical lever for keeping a basin-scale
    isosurface inside a sane payload.
    """
    try:
        from skimage.measure import marching_cubes
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise RuntimeError(
            "Isosurface extraction needs scikit-image: pip install scikit-image"
        ) from exc

    if set(da.dims) != {"depth", "lat", "lon"}:
        raise ValueError(
            f"Isosurface extraction needs exactly (depth, lat, lon) dims; got {list(da.dims)}"
        )

    da = da.transpose("depth", "lat", "lon")
    if step > 1:
        da = da.isel(depth=slice(None, None, step), lat=slice(None, None, step), lon=slice(None, None, step))

    volume = np.asarray(da.values, dtype=np.float32)
    depths = np.asarray(da["depth"].values, dtype=float)
    lats = np.asarray(da["lat"].values, dtype=float)
    lons = np.asarray(da["lon"].values, dtype=float)

    if min(volume.shape) < 2:
        raise ValueError(
            f"Volume is too thin to mesh (shape {volume.shape}); widen the bbox or depth range"
        )

    finite = volume[np.isfinite(volume)]
    if finite.size == 0:
        raise ValueError("Volume contains no valid data (all land/masked)")
    if not (finite.min() <= level <= finite.max()):
        raise ValueError(
            f"Isosurface level {level} is outside the data range "
            f"[{finite.min():.3f}, {finite.max():.3f}] — nothing to extract"
        )

    # Marching cubes cannot handle NaN. Land/masked cells are pushed far
    # below the data range so the surface closes off against them instead
    # of leaking through the mask.
    fill = float(finite.min()) - (float(finite.max() - finite.min()) or 1.0)
    volume = np.nan_to_num(volume, nan=fill, posinf=fill, neginf=fill)

    verts, faces, normals, _ = marching_cubes(volume, level=level)

    # Index space -> world space. Vertex coords are fractional indices, so
    # interpolate the (possibly non-uniform) depth axis rather than assuming
    # a constant step — ocean model levels are always stretched with depth.
    vz = np.interp(verts[:, 0], np.arange(depths.size), depths)
    vy = np.interp(verts[:, 1], np.arange(lats.size), lats)
    vx = np.interp(verts[:, 2], np.arange(lons.size), lons)

    return {
        "level": float(level),
        # Flat, interleaved arrays: this is what a Three.js BufferGeometry
        # wants, and it keeps the JSON roughly 3x smaller than nested triples.
        "vertices": np.stack([vx, vy, vz], axis=1).round(5).ravel().tolist(),
        "indices": faces.astype(np.uint32).ravel().tolist(),
        "normals": normals.round(4).ravel().tolist(),
        "n_vertices": int(verts.shape[0]),
        "n_triangles": int(faces.shape[0]),
        "bbox": {
            "west": float(lons.min()), "east": float(lons.max()),
            "south": float(lats.min()), "north": float(lats.max()),
            "depth_min_m": float(depths.min()), "depth_max_m": float(depths.max()),
        },
    }
