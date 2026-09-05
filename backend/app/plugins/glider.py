"""OceanGliders / EGO glider plugin — adapter over services/glider_loader."""
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
from app.services import glider_loader


@register_plugin
class GliderPlugin(InstrumentPlugin):
    key = "glider"
    label = "OceanGliders / EGO gliders (Ifremer GDAC)"
    kind = "glider"
    variables = ("temperature", "salinity", "chlorophyll", "backscatter", "dissolved_oxygen")
    capabilities = Capabilities(discover=True, profile=True, trajectory=True)
    marker_color = "#e1614f"
    notes = (
        "EGO deployment files are trajectory files; discrete profiles are derived "
        "by splitting the dive/climb record at pressure turning points."
    )

    def discover(self, bbox, since: datetime | None = None) -> list[PlatformSummary]:
        west, south, east, north = bbox
        rows = glider_loader.list_gliders_in_bbox(west, south, east, north, since=since)
        return [
            PlatformSummary(
                platform_id=r["glider_id"],
                label=r["deployment_name"] or r["glider_id"],
                lon=r["lon"],
                lat=r["lat"],
                last_seen=r["last_fix_time"] or None,
                n_records=r["trajectory_points"],
                status=r.get("status", "unknown"),
                # file_path must survive the round trip: one glider_id can have
                # several deployment files across its service life, so the
                # follow-up profile/trajectory request has to name the exact one.
                extra={"file_path": r["file_path"]},
            )
            for r in rows
        ]

    def profile(self, platform_id: str, **kwargs) -> ProfileSeries:
        file_path = _require_file_path(kwargs)
        index = int(kwargs.get("profile_index") or 0)
        profiles = glider_loader.get_glider_profiles(
            platform_id, file_path, max_profiles=index + 1
        )
        if not profiles:
            raise KeyError(f"No resolvable profiles in glider deployment '{file_path}'")
        p = profiles[min(index, len(profiles) - 1)]
        return ProfileSeries(
            platform_id=platform_id,
            time=p["time"],
            lon=p["lon"],
            lat=p["lat"],
            depth_m=p["depth_m"],
            variables=p["variables"],
            variable_units=p["variable_units"],
            depth_label="Pressure (dbar)",
            record_id=str(p["profile_index"]),
        )

    def trajectory(self, platform_id: str, **kwargs) -> Trajectory:
        file_path = _require_file_path(kwargs)
        t = glider_loader.get_glider_trajectory(platform_id, file_path)
        return Trajectory(
            platform_id=platform_id,
            lon=t["lon"],
            lat=t["lat"],
            time=t["time"],
            depth_m=t.get("depth_m"),
        )


def _require_file_path(kwargs: dict) -> str:
    file_path = kwargs.get("file_path")
    if not file_path:
        raise ValueError(
            "The glider plugin requires `file_path` (returned in each platform's "
            "`extra` block by /insitu/glider/platforms)"
        )
    return str(file_path)
