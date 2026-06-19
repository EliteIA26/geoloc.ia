"""Shared Sentinel-2 helpers (Planetary Computer STAC + local reproject).

Lifted verbatim (behavior-identical) from the proven ndvi_snapshot.py so that
ndvi_snapshot.py and snow_snapshot.py share one implementation.

Why download bands over plain HTTPS instead of /vsicurl/: GDAL's /vsicurl/
reader crashes in its error logger when the OS emits a localized (non-UTF8)
message on this Windows host, so we fetch each band over HTTPS and let rasterio
read a local file instead.

Sentinel-2 L2A scaling: processing baseline >= 04.00 stores surface
reflectance with a quantification value of 10000 and an additive offset of
-1000 (BOA_ADD_OFFSET). True reflectance = (DN + BOA_ADD_OFFSET) / 10000.
Indices (NDVI/NDMI/NDSI) must be computed on offset-corrected values.
"""
import json
import os

import numpy as np
import planetary_computer
import rasterio
import requests
from rasterio.enums import Resampling
from rasterio.warp import reproject
from pystac_client import Client

BOA_ADD_OFFSET = -1000.0
QUANTIFICATION = 10000.0
DST_RES = 0.0001  # ~11 m/px at this latitude

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SATELITAL_PATH = os.path.join(ROOT, "public", "data", "satelital.json")


def open_catalog():
    return Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )


def find_scenes(bbox, mgrs_tile=None, max_cloud=10, limit=20):
    """Return Sentinel-2 L2A items over bbox, newest first."""
    query = {"eo:cloud_cover": {"lt": max_cloud}}
    if mgrs_tile:
        query["s2:mgrs_tile"] = {"eq": mgrs_tile}
    search = open_catalog().search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        query=query,
        sortby=[{"field": "properties.datetime", "direction": "desc"}],
        limit=limit,
    )
    return list(search.items())


def download_asset(href, dst_path):
    """Download a remote COG to a local (ASCII-path) file over plain HTTPS."""
    with requests.get(href, stream=True, timeout=300) as r:
        r.raise_for_status()
        total = 0
        with open(dst_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
                    total += len(chunk)
    print(f"  downloaded {total / 1e6:.1f} MB -> {dst_path}")
    return dst_path


def read_band_to_4326(
    local_path, bbox, res=DST_RES, resampling=Resampling.bilinear
):
    """Read a local UTM band and reproject/crop it to EPSG:4326 over the bbox.

    B11/B03 are 20m/10m; bilinear resampling to the fixed grid handles the
    resolution mismatch. Categorical bands such as SCL must explicitly pass
    ``Resampling.nearest``. Returns a float32 array with NaN nodata.
    """
    w, s, e, n = bbox
    width = int(round((e - w) / res))
    height = int(round((n - s) / res))
    dst_transform = rasterio.transform.from_bounds(w, s, e, n, width, height)
    with rasterio.open(local_path) as src:
        dst = np.full((height, width), np.nan, dtype="float32")
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=dst_transform,
            dst_crs="EPSG:4326",
            resampling=resampling,
            src_nodata=0,
            dst_nodata=np.nan,
        )
    return dst


def to_reflectance(arr):
    """Apply the BOA additive offset to convert raw DN -> surface reflectance."""
    return (arr + BOA_ADD_OFFSET) / QUANTIFICATION


def merge_satelital(partial: dict):
    """Read-modify-write public/data/satelital.json, updating only given keys."""
    data = {}
    if os.path.exists(SATELITAL_PATH):
        with open(SATELITAL_PATH, encoding="utf-8") as f:
            data = json.load(f)
    data.update(partial)
    os.makedirs(os.path.dirname(SATELITAL_PATH), exist_ok=True)
    with open(SATELITAL_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"merged into {SATELITAL_PATH}: {list(partial.keys())}")
