"""
colormaps.py
============
Server-side twin of ``frontend/src/utils/colormap.js``.

Both read the same ``config/colorscales.yaml`` stop lists and implement the
same piecewise-linear interpolation, so a WMS tile rendered by the backend
and a client-rasterized slice of the same field are pixel-comparable. That
equivalence is the whole reason the palettes live in YAML rather than in
either codebase.
"""
from __future__ import annotations

import io
from functools import lru_cache

import numpy as np

from app.config import get_colorscales

SCALE_MODES = ("linear", "log", "symlog")


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    h = value.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


@lru_cache(maxsize=64)
def lookup_table(name: str, reverse: bool = False, n: int = 256) -> np.ndarray:
    """Build an (n, 3) uint8 LUT for a named palette."""
    scales = get_colorscales()
    if name not in scales:
        raise KeyError(f"Unknown colorscale '{name}'. Available: {', '.join(sorted(scales))}")
    stops = [_hex_to_rgb(s) for s in scales[name]["stops"]]
    if reverse:
        stops = stops[::-1]

    anchors = np.linspace(0.0, 1.0, len(stops))
    positions = np.linspace(0.0, 1.0, n)
    channels = [
        np.interp(positions, anchors, [s[c] for s in stops]) for c in range(3)
    ]
    return np.stack(channels, axis=1).round().astype(np.uint8)


def normalize(
    values: np.ndarray,
    vmin: float,
    vmax: float,
    scale: str = "linear",
) -> np.ndarray:
    """Map values to [0, 1], preserving NaN. Mirrors ``normalizeValue()`` in
    the frontend, including its handling of the log floor."""
    if scale not in SCALE_MODES:
        raise ValueError(f"scale must be one of {SCALE_MODES}, got '{scale}'")

    data = np.asarray(values, dtype=float)
    with np.errstate(invalid="ignore", divide="ignore"):
        if scale == "log":
            # Chlorophyll and other log-scaled fields legitimately contain
            # values at or below zero after QC; floor them at the low end of
            # the requested range rather than producing -inf.
            floor = max(vmin, 1e-6)
            top = max(vmax, floor * 10)
            out = (np.log(np.maximum(data, floor)) - np.log(floor)) / (np.log(top) - np.log(floor))
        elif scale == "symlog":
            # Symmetric log for signed fields (u/v, SSH anomalies): linear
            # within a small threshold around zero, logarithmic outside it.
            span = max(abs(vmin), abs(vmax)) or 1.0
            threshold = span / 100.0
            magnitude = np.abs(data)
            scaled = np.where(
                magnitude <= threshold,
                magnitude / threshold,
                1.0 + np.log10(np.maximum(magnitude, threshold) / threshold),
            )
            full = 1.0 + np.log10(span / threshold)
            out = 0.5 + 0.5 * np.sign(data) * (scaled / full)
        else:
            span = (vmax - vmin) or 1.0
            out = (data - vmin) / span

    return np.clip(out, 0.0, 1.0, where=np.isfinite(out), out=np.full_like(out, np.nan))


def to_rgba(
    values: np.ndarray,
    *,
    colormap: str,
    vmin: float,
    vmax: float,
    scale: str = "linear",
    reverse: bool = False,
    opacity: float = 1.0,
) -> np.ndarray:
    """Colorize a 2-D array to (H, W, 4) uint8. NaN → fully transparent, so
    land and masked cells show the globe rather than a palette colour."""
    lut = lookup_table(colormap, reverse)
    normalized = normalize(values, vmin, vmax, scale)
    valid = np.isfinite(normalized)

    indices = np.zeros(normalized.shape, dtype=np.intp)
    indices[valid] = (normalized[valid] * (lut.shape[0] - 1)).round().astype(np.intp)

    rgba = np.zeros((*normalized.shape, 4), dtype=np.uint8)
    rgba[..., :3] = lut[indices]
    rgba[..., 3] = np.where(valid, int(round(np.clip(opacity, 0, 1) * 255)), 0)
    return rgba


def to_png(rgba: np.ndarray) -> bytes:
    """Encode an (H, W, 4) uint8 array as PNG."""
    from PIL import Image

    buffer = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def legend_png(
    *,
    colormap: str,
    width: int = 24,
    height: int = 256,
    reverse: bool = False,
) -> bytes:
    """Render a vertical colourbar strip — the WMS ``GetLegendGraphic``
    response, and usable directly as an <img> in any client."""
    lut = lookup_table(colormap, reverse)
    ramp = np.linspace(0, 1, height)[::-1]  # high values at the top
    indices = (ramp * (lut.shape[0] - 1)).round().astype(np.intp)
    column = lut[indices]

    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., :3] = column[:, None, :]
    rgba[..., 3] = 255
    return to_png(rgba)
