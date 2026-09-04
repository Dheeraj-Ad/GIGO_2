"""Argo profiling-float plugin — thin adapter over services/argo_loader."""
from __future__ import annotations

from datetime import datetime

from app.core.plugins import (
    Capabilities,
    InstrumentPlugin,
    PlatformSummary,
    ProfileSeries,
    Trajectory,
    register_plugin,
)
from app.services import argo_loader


@register_plugin
class ArgoPlugin(InstrumentPlugin):
    key = "argo"
    label = "Argo profiling floats (Ifremer GDAC)"
    kind = "profiling_float"
    variables = ("temperature", "salinity", "dissolved_oxygen", "chlorophyll")
    capabilities = Capabilities(discover=True, profile=True, trajectory=True)
    marker_color = "#e8a33d"
    notes = (
        "Profiles are fetched on demand from data-argo.ifremer.fr; the global "
        "profile index is cached locally for 6 hours."
    )

    def discover(self, bbox, since: datetime | None = None) -> list[PlatformSummary]:
        west, south, east, north = bbox
        rows = argo_loader.list_floats_in_bbox(west, south, east, north, since=since)
        return [
            PlatformSummary(
                platform_id=r["platform_number"],
                label=f"Argo {r['platform_number']}",
                lon=r["lon"],
                lat=r["lat"],
                last_seen=r["last_profile_time"],
                n_records=r["n_profiles"],
                status=r["status"],
                extra={"dac": r["dac"]},
            )
            for r in rows
        ]

    def profile(self, platform_id: str, **kwargs) -> ProfileSeries:
        cycle = kwargs.get("cycle_number")
        cycle = int(cycle) if cycle not in (None, "") else None
        p = argo_loader.get_float_profile(platform_id, cycle)
        return ProfileSeries(
            platform_id=platform_id,
            time=p["time"],
            lon=p["lon"],
            lat=p["lat"],
            # Argo's native vertical coordinate is pressure. 1 dbar ≈ 1 m to
            # within ~2% in the upper ocean, and the UI plots the axis as
            # pressure explicitly, so no conversion is applied here.
            depth_m=p["pressure_db"],
            variables=p["variables"],
            variable_units=p["variable_units"],
            depth_label="Pressure (dbar)",
            record_id=str(p["cycle_number"]),
        )

    def trajectory(self, platform_id: str, **kwargs) -> Trajectory:
        t = argo_loader.get_float_track(platform_id)
        return Trajectory(
            platform_id=platform_id, lon=t["lon"], lat=t["lat"], time=t["time"]
        )
