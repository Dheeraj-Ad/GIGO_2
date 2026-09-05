#!/usr/bin/env python
"""
ingest_copernicus_glorys.py
============================
Pulls a subset of Copernicus Marine Service's GLORYS12V1 reanalysis
(GLOBAL_MULTIYEAR_PHY_001_030) and writes it to a local, cloud-optimized
Zarr store that the backend reads from at request time (see
app/api/routes_model.py::_resolve_dataset_uri).

Copernicus Marine requires an account (https://data.marine.copernicus.eu)
and the official `copernicusmarine` Python toolbox, which handles auth,
dataset discovery, and subsetting far more robustly than raw OPeNDAP against
their service. Credentials are read from environment variables:

    COPERNICUS_MARINE_USERNAME
    COPERNICUS_MARINE_PASSWORD

Usage:
    python scripts/ingest_copernicus_glorys.py \
        --variables thetao so uo vo \
        --bbox 30 -10 100 30 \
        --depth-min 0 --depth-max 2000 \
        --start 2023-01-01 --end 2023-01-10 \
        --out data/model_cache/copernicus_glorys/cmems_mod_glo_phy_my_0.083deg_P1D-m.zarr
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ingest_copernicus_glorys")

DATASET_ID = "cmems_mod_glo_phy_my_0.083deg_P1D-m"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--variables", nargs="+", default=["thetao", "so", "uo", "vo", "zos", "mlotst"])
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("WEST", "SOUTH", "EAST", "NORTH"),
                         default=[30, -10, 100, 30])
    parser.add_argument("--depth-min", type=float, default=0)
    parser.add_argument("--depth-max", type=float, default=2000)
    parser.add_argument("--start", required=True, help="YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="YYYY-MM-DD")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    username = os.environ.get("COPERNICUS_MARINE_USERNAME")
    password = os.environ.get("COPERNICUS_MARINE_PASSWORD")
    if not username or not password:
        logger.error(
            "COPERNICUS_MARINE_USERNAME / COPERNICUS_MARINE_PASSWORD not set. "
            "Register at https://data.marine.copernicus.eu and export both before running."
        )
        sys.exit(1)

    try:
        import copernicusmarine
    except ImportError:
        logger.error("Install the toolbox first: pip install copernicusmarine")
        sys.exit(1)

    west, south, east, north = args.bbox
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info("Requesting %s vars=%s bbox=%s depth=[%s,%s] time=[%s,%s]",
                DATASET_ID, args.variables, args.bbox, args.depth_min, args.depth_max, args.start, args.end)

    # copernicusmarine.subset() streams directly from Copernicus's cloud
    # object store (no full-file download) and writes NetCDF/Zarr locally.
    copernicusmarine.subset(
        dataset_id=DATASET_ID,
        variables=args.variables,
        minimum_longitude=west, maximum_longitude=east,
        minimum_latitude=south, maximum_latitude=north,
        minimum_depth=args.depth_min, maximum_depth=args.depth_max,
        start_datetime=args.start, end_datetime=args.end,
        output_filename=str(out_path.name),
        output_directory=str(out_path.parent),
        username=username, password=password,
        file_format="zarr",
    )
    logger.info("Wrote %s", out_path)


if __name__ == "__main__":
    main()
