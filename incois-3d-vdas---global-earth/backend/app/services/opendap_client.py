"""
opendap_client.py
==================
Resolves a (source, variable) pair to a concrete OPeNDAP DAP endpoint.

INCOIS LAS and most THREDDS-based servers expose a catalog.xml describing
available datasets; ERDDAP exposes a similar info/index. Rather than
hardcoding dataset URLs (which drift as INCOIS reorganizes products), this
module resolves them at request time and caches the mapping.

For sources with a fixed/known DAP path convention, `direct_url()` builds
the URL without a catalog round-trip.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from xml.etree import ElementTree as ET

import requests

from app.config import get_data_sources, get_settings

logger = logging.getLogger("oceanviz.opendap_client")


@lru_cache(maxsize=64)
def resolve_catalog_dataset_url(catalog_url: str, dataset_match: str) -> str:
    """Fetch a THREDDS/LAS catalog.xml and return the DAP service URL for
    the first dataset whose ID/name contains `dataset_match`.

    THREDDS catalog.xml structure (simplified):
        <catalog>
          <dataset name="..." ID="...">
            <access serviceName="dap" urlPath="..."/>
          </dataset>
          <service name="dap" base="/thredds/dodsC/"/>
        </catalog>
    """
    settings = get_settings()
    resp = requests.get(catalog_url, timeout=settings.request_timeout_s)
    resp.raise_for_status()

    ns = {"t": "http://www.unidata.ucar.edu/namespaces/thredds/InvCatalog/v1.0"}
    root = ET.fromstring(resp.content)

    services = {
        s.get("name"): s.get("base")
        for s in root.findall(".//t:service", ns) + root.findall(".//service")
    }

    for ds in root.findall(".//t:dataset", ns) + root.findall(".//dataset"):
        ds_id = (ds.get("ID") or ds.get("name") or "")
        if dataset_match.lower() not in ds_id.lower():
            continue
        url_path = ds.get("urlPath")
        if url_path:
            base = services.get("dap") or services.get("DAP") or "/thredds/dodsC/"
            server_root = catalog_url.split("/thredds/")[0]
            return f"{server_root}{base}{url_path}"

    raise LookupError(f"No dataset matching '{dataset_match}' found in catalog {catalog_url}")


def direct_url(source_key: str, dataset_relative_path: str) -> str:
    """Build a DAP URL for sources with a stable, documented path scheme,
    skipping the catalog round-trip entirely."""
    sources = get_data_sources()
    entry = sources[source_key]
    base = entry.get("base_url") or entry.get("base_url_https")
    return f"{base.rstrip('/')}/{dataset_relative_path.lstrip('/')}"


def get_las_dap_url(product_id: str, variable_alias: str) -> str:
    """INCOIS LAS-specific resolution: queries the LAS product catalog and
    returns the DAP endpoint for the requested product/variable pairing.
    Falls back to LAS's conventional '/dodsC/<product>/<variable>' layout
    if the catalog lookup fails (e.g. LAS catalog schema changes)."""
    sources = get_data_sources()
    las = sources["incois_las"]
    try:
        return resolve_catalog_dataset_url(las["catalog_endpoint"], product_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("LAS catalog lookup failed (%s); falling back to conventional path", exc)
        return f"{las['base_url'].rstrip('/')}/dodsC/{product_id}/{variable_alias}"
