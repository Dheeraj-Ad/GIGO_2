"""
plugins.py
==========
Plugin-style module system for in-situ instrument sources.

The gridded-model side of the system is extended purely by YAML
(config/data_sources.yaml + config/variables.yaml), because every gridded
source reduces to the same operation: open a CF-ish dataset, subset it,
serialize the grid. In-situ instruments are different — an Argo float, a
glider, a mooring, an HF-radar site and an ADCP each have their own
discovery mechanism, file layout and natural "record" shape. They can't be
collapsed into one YAML schema, but they *can* be collapsed into one
interface, which is what this module defines.

Adding a new sensor type is therefore:

    1. Drop a module in ``app/plugins/`` .
    2. Subclass :class:`InstrumentPlugin`, set ``key``/``label``/``kind``,
       implement ``discover()`` plus whichever of ``profile()`` /
       ``trajectory()`` / ``timeseries()`` make sense for the sensor, and
       declare that in ``capabilities``.
    3. Decorate it with ``@register_plugin``.

No route code, no schema code and no frontend code has to change:
``routes_insitu.py`` serves every registered plugin through generic
``/insitu/{plugin}/...`` endpoints, and the frontend discovers plugins and
their capabilities at runtime from ``/insitu/plugins``.
"""
from __future__ import annotations

import importlib
import logging
import pkgutil
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime

logger = logging.getLogger("oceanviz.plugins")

# Instrument kinds the frontend knows how to render. A plugin declaring an
# unknown kind still works through the API; it just falls back to the
# generic point-marker + profile-chart treatment in the UI.
KINDS = ("profiling_float", "glider", "mooring", "hf_radar", "adcp", "ctd_cast", "drifter")


@dataclass(frozen=True)
class Capabilities:
    """What a plugin can actually answer. The UI greys out controls for
    anything a plugin doesn't support rather than firing doomed requests."""

    discover: bool = True
    profile: bool = False
    trajectory: bool = False
    timeseries: bool = False


@dataclass
class PlatformSummary:
    """One discovered instrument, in the shape the map needs to place a
    marker without any further requests."""

    platform_id: str
    label: str
    lon: float
    lat: float
    last_seen: str | None = None
    n_records: int = 0
    status: str = "unknown"
    # Free-form, plugin-specific fields the plugin needs echoed back on
    # follow-up requests (e.g. the glider GDAC's file_path, a mooring's
    # station code). Opaque to routes and to the UI.
    extra: dict = field(default_factory=dict)


@dataclass
class ProfileSeries:
    """A depth-vs-variable(s) profile — the common currency of every
    vertical in-situ measurement, whatever the platform that made it."""

    platform_id: str
    time: str
    lon: float
    lat: float
    depth_m: list[float | None]
    variables: dict[str, list[float | None]]
    variable_units: dict[str, str]
    depth_label: str = "Depth (m)"
    record_id: str | None = None


@dataclass
class Trajectory:
    platform_id: str
    lon: list[float]
    lat: list[float]
    time: list[str]
    depth_m: list[float] | None = None


@dataclass
class TimeSeries:
    """A single-depth time series — what moorings, tide gauges and HF-radar
    sites produce, as opposed to profiles."""

    platform_id: str
    time: list[str]
    variables: dict[str, list[float | None]]
    variable_units: dict[str, str]
    depth_m: float | None = None


class InstrumentPlugin(ABC):
    """Base class for an in-situ data source.

    Subclasses are instantiated once at import time and held in the
    registry, so ``__init__`` must stay cheap — do network work lazily
    inside the query methods, not in the constructor.
    """

    key: str = ""
    label: str = ""
    kind: str = "profiling_float"
    variables: tuple[str, ...] = ()
    capabilities: Capabilities = Capabilities()
    #: Marker colour hint (CSS hex) so a new sensor type is visually
    #: distinguishable on the map without a frontend change.
    marker_color: str = "#3fd0c9"
    #: Human-readable note surfaced in the UI, e.g. auth or coverage caveats.
    notes: str = ""

    @abstractmethod
    def discover(
        self,
        bbox: tuple[float, float, float, float],
        since: datetime | None = None,
    ) -> list[PlatformSummary]:
        """Return the platforms this source has inside ``bbox``."""

    def profile(self, platform_id: str, **kwargs) -> ProfileSeries:
        raise NotImplementedError(f"Plugin '{self.key}' does not provide profiles")

    def trajectory(self, platform_id: str, **kwargs) -> Trajectory:
        raise NotImplementedError(f"Plugin '{self.key}' does not provide trajectories")

    def timeseries(self, platform_id: str, **kwargs) -> TimeSeries:
        raise NotImplementedError(f"Plugin '{self.key}' does not provide time series")

    def describe(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "kind": self.kind,
            "variables": list(self.variables),
            "capabilities": asdict(self.capabilities),
            "marker_color": self.marker_color,
            "notes": self.notes,
        }


class PluginRegistry:
    def __init__(self) -> None:
        self._plugins: dict[str, InstrumentPlugin] = {}

    def register(self, plugin: InstrumentPlugin) -> None:
        if not plugin.key:
            raise ValueError(f"{type(plugin).__name__} must define a non-empty `key`")
        if plugin.key in self._plugins:
            raise ValueError(f"Plugin key '{plugin.key}' is already registered")
        self._plugins[plugin.key] = plugin
        logger.info("Registered instrument plugin '%s' (%s)", plugin.key, plugin.kind)

    def get(self, key: str) -> InstrumentPlugin:
        try:
            return self._plugins[key]
        except KeyError as exc:
            known = ", ".join(sorted(self._plugins)) or "none"
            raise KeyError(f"Unknown instrument plugin '{key}'. Registered: {known}") from exc

    def all(self) -> list[InstrumentPlugin]:
        return list(self._plugins.values())

    def describe_all(self) -> list[dict]:
        return [p.describe() for p in self._plugins.values()]

    def clear(self) -> None:
        """Test hook — lets a test module reload plugins deterministically."""
        self._plugins.clear()


registry = PluginRegistry()


def register_plugin(cls: type[InstrumentPlugin]) -> type[InstrumentPlugin]:
    """Class decorator: instantiate and register a plugin at import time."""
    registry.register(cls())
    return cls


def load_plugins(package: str = "app.plugins") -> list[str]:
    """Import every module in ``package`` so their ``@register_plugin``
    decorators run. Called once from ``app.main`` at startup.

    A plugin that fails to import is logged and skipped rather than taking
    the whole API down with it — one broken experimental sensor adapter
    shouldn't stop an operational forecaster from seeing Argo data.
    """
    loaded: list[str] = []
    try:
        pkg = importlib.import_module(package)
    except ModuleNotFoundError:
        logger.warning("Plugin package '%s' not found; no in-situ plugins loaded", package)
        return loaded

    for mod_info in pkgutil.iter_modules(pkg.__path__):
        if mod_info.name.startswith("_"):
            continue
        full_name = f"{package}.{mod_info.name}"
        try:
            importlib.import_module(full_name)
            loaded.append(full_name)
        except Exception:  # noqa: BLE001 — see docstring
            logger.exception("Failed to load plugin module %s", full_name)
    return loaded
