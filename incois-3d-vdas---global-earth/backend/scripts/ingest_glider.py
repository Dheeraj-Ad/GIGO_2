#!/usr/bin/env python
"""
ingest_glider.py
================
Downloads EGO-format glider deployment NetCDF files from the OceanGliders
GDAC (Ifremer) for deployments active in a bounding box, caching them under
data/glider/<glider_id>/.

Usage:
    python scripts/ingest_glider.py --bbox 30 -10 100 30
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_data_sources, get_settings  # noqa: E402
from app.services import glider_loader  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ingest_glider")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("WEST", "SOUTH", "EAST", "NORTH"),
                         default=[30, -10, 100, 30])
    args = parser.parse_args()

    logger.info("Refreshing glider index and querying bbox=%s", args.bbox)
    deployments = glider_loader.list_gliders_in_bbox(*args.bbox)
    logger.info("Found %d glider deployments in domain", len(deployments))

    settings = get_settings()
    https_root = get_data_sources()["glider_ego_gdac"]["base_url_https"]
    df = glider_loader.fetch_glider_index()

    for d in deployments:
        glider_id = d["glider_id"]
        rows = df[df.get("glider_id", df.get("deployment_name")) == glider_id] if "glider_id" in df.columns else df
        if rows.empty or "file_path" not in df.columns:
            logger.warning("No file_path in index for %s; skipping (check index schema)", glider_id)
            continue

        glider_dir = settings.glider_cache_dir / str(glider_id)
        glider_dir.mkdir(parents=True, exist_ok=True)

        for _, row in rows.iterrows():
            url = f"{https_root}/{row['file_path']}"
            dest = glider_dir / Path(row["file_path"]).name
            if dest.exists():
                continue
            try:
                resp = requests.get(url, timeout=settings.request_timeout_s)
                resp.raise_for_status()
                dest.write_bytes(resp.content)
                logger.info("Saved %s", dest)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to fetch %s: %s", url, exc)

    logger.info("Done. Cached under %s", settings.glider_cache_dir)


if __name__ == "__main__":
    main()
