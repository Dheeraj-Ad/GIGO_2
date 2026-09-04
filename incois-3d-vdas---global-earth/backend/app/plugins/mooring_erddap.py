"""
mooring_erddap.py
=================
Generic ERDDAP-tabledap station plugin — the worked example of the
plugin system's real payoff.

This single module serves **any** number of station-based sensor types
(moorings, CTD casts, ADCP stations, tide gauges, HF-radar sites), because
it takes its station/variable/coordinate mapping from
``config/data_sources.yaml`` rather than hardcoding one archive's schema.
Every YAML entry with ``type: erddap_tabledap`` becomes its own registered
plugin at startup, with its own ``key``, ``kind`` and marker colour.

So adding the INCOIS ODIS moored-buoy network, an HF-radar collection and
a shipboard CTD archive is three YAML blocks and zero Python.

Two record shapes are supported, declared per source as ``record_shape``:

``profile``
    Each cast/burst has many depths at one time → served as a
    depth-vs-variable profile, identical in shape to Argo and glider
    profiles, so the same chart component renders it.
``timeseries``
    Each station reports at a fixed depth over time → served as a time
    series. Moorings and tide gauges are the usual case.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from app.config import get_data_sources
from app.core.plugins import (
    Capabilities,
    InstrumentPlugin,
    PlatformSummary,
    ProfileSeries,
    TimeSeries,
    registry,
)
from app.services import erddap_client

logger = logging.getLogger("oceanviz.plugins.erddap")


class ErddapStationPlugin(InstrumentPlugin):
    """One instance per configured ``erddap_tabledap`` source."""

    def __init__(self, source_key: str, cfg: dict) -> None:
        self.key = source_key
        self.label = cfg.get("label", source_key)
        self.kind = cfg.get("kind", "mooring")
        self.marker_color = cfg.get("marker_color", "#9d7fe0")
        self.notes = cfg.get("notes", "")

        self._base_url = cfg["base_url"]
        self._dataset_id = cfg["dataset_id"]
        self._station_var = cfg.get("station_id_var", "station")
        self._lon_var = cfg.get("lon_var", "longitude")
        self._lat_var = cfg.get("lat_var", "latitude")
        self._time_var = cfg.get("time_var", "time")
        self._depth_var = cfg.get("depth_var", "depth")
        self._record_shape = cfg.get("record_shape", "timeseries")

        # canonical name -> ERDDAP variable name
        self._var_map: dict[str, str] = dict(cfg.get("variables", {}) or {})
        self.variables = tuple(self._var_map)

        self.capabilities = Capabilities(
            discover=True,
            profile=self._record_shape == "profile",
            timeseries=self._record_shape == "timeseries",
            trajectory=False,
        )
        self._units_cache: dict[str, str] | None = None

    # -- helpers ---------------------------------------------------------

    def _units(self) -> dict[str, str]:
        if self._units_cache is None:
            self._units_cache = erddap_client.tabledap_units(
                self._base_url, self._dataset_id, list(self._var_map.values())
            )
        return self._units_cache

    def _canonical_units(self) -> dict[str, str]:
        raw = self._units()
        return {canonical: raw.get(erddap_name, "") for canonical, erddap_name in self._var_map.items()}

    @staticmethod
    def _clean(series: pd.Series) -> list[float | None]:
        values = pd.to_numeric(series, errors="coerce").to_numpy(dtype=float)
        return [None if not np.isfinite(v) else float(v) for v in values]

    # -- InstrumentPlugin ------------------------------------------------

    def discover(self, bbox, since: datetime | None = None) -> list[PlatformSummary]:
        west, south, east, north = bbox
        constraints: dict[str, object] = {
            f"{self._lon_var}>=": west,
            f"{self._lon_var}<=": east,
            f"{self._lat_var}>=": south,
            f"{self._lat_var}<=": north,
        }
        if since is not None:
            constraints[f"{self._time_var}>="] = since.strftime("%Y-%m-%dT%H:%M:%SZ")

        df = erddap_client.tabledap(
            self._base_url,
            self._dataset_id,
            [self._station_var, self._lon_var, self._lat_var, self._time_var],
            constraints=constraints,
            # One row per station — its most recent report. Without this a
            # busy mooring network would return millions of rows.
            functions=[f'orderByMax("{self._station_var},{self._time_var}")'],
        )
        if df.empty:
            return []

        out: list[PlatformSummary] = []
        now = datetime.now(timezone.utc)
        for _, row in df.iterrows():
            last = row.get(self._time_var)
            fresh = pd.notna(last) and (now - last.to_pydatetime()).days < 7
            out.append(
                PlatformSummary(
                    platform_id=str(row[self._station_var]),
                    label=f"{self.kind.replace('_', ' ').title()} {row[self._station_var]}",
                    lon=float(row[self._lon_var]),
                    lat=float(row[self._lat_var]),
                    last_seen=last.isoformat() if pd.notna(last) else None,
                    status="active" if fresh else "inactive",
                    extra={"dataset_id": self._dataset_id, "record_shape": self._record_shape},
                )
            )
        return out

    def profile(self, platform_id: str, **kwargs) -> ProfileSeries:
        if self._record_shape != "profile":
            raise NotImplementedError(
                f"Source '{self.key}' reports time series, not profiles — use /timeseries"
            )
        lookback_days = int(kwargs.get("lookback_days") or 30)
        since = datetime.now(timezone.utc) - timedelta(days=lookback_days)

        df = erddap_client.tabledap(
            self._base_url,
            self._dataset_id,
            [self._station_var, self._time_var, self._lat_var, self._lon_var, self._depth_var,
             *self._var_map.values()],
            constraints={
                f'{self._station_var}="': f'{platform_id}"',
                f"{self._time_var}>=": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )
        if df.empty:
            raise KeyError(f"No {self.label} records for station '{platform_id}' in the last {lookback_days} days")

        # Latest cast only: take every row sharing the most recent timestamp.
        latest = df[self._time_var].max()
        cast = df[df[self._time_var] == latest].sort_values(self._depth_var)

        return ProfileSeries(
            platform_id=platform_id,
            time=pd.Timestamp(latest).isoformat(),
            lon=float(cast[self._lon_var].iloc[0]),
            lat=float(cast[self._lat_var].iloc[0]),
            depth_m=self._clean(cast[self._depth_var]),
            variables={
                canonical: self._clean(cast[erddap_name])
                for canonical, erddap_name in self._var_map.items()
                if erddap_name in cast.columns
            },
            variable_units=self._canonical_units(),
        )

    def timeseries(self, platform_id: str, **kwargs) -> TimeSeries:
        if self._record_shape != "timeseries":
            raise NotImplementedError(
                f"Source '{self.key}' reports profiles, not time series — use /profile"
            )
        lookback_days = int(kwargs.get("lookback_days") or 30)
        since = datetime.now(timezone.utc) - timedelta(days=lookback_days)

        requested = [self._station_var, self._time_var, *self._var_map.values()]
        df = erddap_client.tabledap(
            self._base_url,
            self._dataset_id,
            requested,
            constraints={
                f'{self._station_var}="': f'{platform_id}"',
                f"{self._time_var}>=": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )
        if df.empty:
            raise KeyError(f"No {self.label} records for station '{platform_id}' in the last {lookback_days} days")

        df = df.sort_values(self._time_var)
        return TimeSeries(
            platform_id=platform_id,
            time=[pd.Timestamp(t).isoformat() for t in df[self._time_var]],
            variables={
                canonical: self._clean(df[erddap_name])
                for canonical, erddap_name in self._var_map.items()
                if erddap_name in df.columns
            },
            variable_units=self._canonical_units(),
        )


def _register_configured_sources() -> None:
    """Instantiate one plugin per ``type: erddap_tabledap`` YAML entry."""
    for source_key, cfg in get_data_sources().items():
        if cfg.get("type") != "erddap_tabledap":
            continue
        try:
            registry.register(ErddapStationPlugin(source_key, cfg))
        except (KeyError, ValueError) as exc:
            logger.error("Skipping malformed ERDDAP source '%s': %s", source_key, exc)


_register_configured_sources()
