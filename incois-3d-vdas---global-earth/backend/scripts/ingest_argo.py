#!/usr/bin/env python
"""
ingest_argo.py
==============
Bulk-downloads Argo profile NetCDF files for floats active in a bounding
box/time window from the Ifremer GDAC, and caches them under
data/argo/<platform_number>/. Also refreshes the local copy of the global
profile index.

Usage:
    python scripts/ingest_argo.py --bbox 30 -10 100 30 --since-days 90 \
        --max-floats 25
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_data_sources, get_settings  # noqa: E402
from app.services import argo_loader  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ingest_argo")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("WEST", "SOUTH", "EAST", "NORTH"),
                         default=[30, -10, 100, 30])
    parser.add_argument("--since-days", type=int, default=90)
    parser.add_argument("--max-floats", type=int, default=25)
    args = parser.parse_args()

    since = datetime.now() - timedelta(days=args.since_days)
    logger.info("Refreshing Argo global index and querying bbox=%s since=%s", args.bbox, since)

    floats = argo_loader.list_floats_in_bbox(*args.bbox, since=since)
    logger.info("Found %d floats in domain; downloading up to %d", len(floats), args.max_floats)

    settings = get_settings()
    https_root = get_data_sources()["argo_gdac"]["base_url_https"]
    df = argo_loader.fetch_global_index()

    downloaded = 0
    for f in floats[: args.max_floats]:
        platform = f["platform_number"]
        float_dir = settings.argo_cache_dir / platform
        float_dir.mkdir(parents=True, exist_ok=True)

        rows = df[df["platform_number"] == platform]
        for _, row in rows.iterrows():
            url = f"{https_root}/dac/{row.file_path}"
            dest = float_dir / Path(row.file_path).name
            if dest.exists():
                continue
            try:
                resp = requests.get(url, timeout=settings.request_timeout_s)
                resp.raise_for_status()
                dest.write_bytes(resp.content)
                downloaded += 1
                logger.info("Saved %s", dest)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to fetch %s: %s", url, exc)

    logger.info("Done. %d new profile files cached under %s", downloaded, settings.argo_cache_dir)


if __name__ == "__main__":
    main()
