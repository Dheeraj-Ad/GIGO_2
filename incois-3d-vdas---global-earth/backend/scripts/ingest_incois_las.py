#!/usr/bin/env python
"""
ingest_incois_las.py
=====================
Pulls a subset of an INCOIS Live Access Server product over OPeNDAP and
caches it locally as NetCDF, for offline development or as a warm cache in
front of the live DAP endpoint.

Usage:
    python scripts/ingest_incois_las.py --product ROMS_INDOFOS --variable sst \
        --bbox 30 -10 100 30 --out data/model_cache/incois_las_sst.nc

This mirrors exactly what routes_model.get_horizontal_slice() does at
request time; run it standalone when you want a persisted local copy
(e.g. for demoing without network access, or nightly cron caching).
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # allow `import app.*`

from app.services import netcdf_loader  # noqa: E402
from app.services.opendap_client import get_las_dap_url  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ingest_incois_las")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--product", required=True, help="LAS product/dataset ID")
    parser.add_argument("--variable", required=True, help="Canonical variable name, e.g. sst")
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("WEST", "SOUTH", "EAST", "NORTH"),
                         default=[30, -10, 100, 30])
    parser.add_argument("--out", required=True, help="Output NetCDF path")
    args = parser.parse_args()

    uri = get_las_dap_url(product_id=args.product, variable_alias=args.variable)
    logger.info("Resolved LAS DAP endpoint: %s", uri)

    result = netcdf_loader.open_dataset(uri, engine="pydap")
    da = netcdf_loader.subset(result.ds[args.variable], bbox=tuple(args.bbox))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    da.load().to_netcdf(out_path)
    logger.info("Wrote %s (%s)", out_path, da.shape)


if __name__ == "__main__":
    main()
