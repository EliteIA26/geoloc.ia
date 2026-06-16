"""Produce a real Sentinel-2 NDVI snapshot over Aimogasta (La Rioja, Argentina).

Pipeline:
  1. Query Microsoft Planetary Computer STAC for the most recent low-cloud
     Sentinel-2 L2A scene intersecting the Aimogasta bbox.
  2. Read the B04 (red) and B08 (NIR) assets, reprojecting/cropping from the
     scene's native UTM CRS to EPSG:4326 over the bbox so the output PNG aligns
     with MapLibre's lat/lng image overlay.
  3. Compute NDVI = (B08 - B04) / (B08 + B04).
  4. Colorize: red < 0.4, yellow 0.4-0.6, green >= 0.6 (alpha ~180),
     transparent where there is no data.
  5. Export a georeferenced RGBA PNG + a bounds JSON in EPSG:4326.

Outputs:
  public/raster/aimogasta-ndvi.png
  public/raster/aimogasta-ndvi-bounds.json

Run:  python scripts/ndvi_snapshot.py
"""

import json
import os
import tempfile

import numpy as np
import planetary_computer
import rasterio
import requests
from rasterio.enums import Resampling
from rasterio.warp import reproject
from pystac_client import Client
from PIL import Image

# Aimogasta (Arauco) bbox: [west, south, east, north] in EPSG:4326.
# Centered on the real irrigated olive-grove belt of the Arauco valley
# (NDVI inspection showed the cultivated land sits here; the area further
# south is bare Monte desert with no agricultural signal). Fully inside
# Sentinel-2 MGRS tile 19JGK so the scene covers 100% of the window.
BBOX = [-66.84, -27.90, -66.70, -27.76]
W, S, E, N = BBOX

# Restrict to MGRS tile 19JGK so a single scene fully covers the bbox.
MGRS_TILE = "19JGK"

# Output resolution in degrees (~10 m at this latitude is ~9e-5 deg).
DST_RES = 0.0001  # ~11 m/px -> sharp enough, keeps PNG small

# Sentinel-2 L2A scaling. Processing baseline >= 04.00 stores surface
# reflectance with a quantification value of 10000 and an additive offset of
# -1000 (BOA_ADD_OFFSET). True reflectance = (DN + BOA_ADD_OFFSET) / 10000.
# NDVI must be computed on offset-corrected values, otherwise vegetated
# pixels are biased low. (This scene is baseline 05.12.)
BOA_ADD_OFFSET = -1000.0
QUANTIFICATION = 10000.0

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "public", "raster")
PNG_PATH = os.path.join(OUT_DIR, "aimogasta-ndvi.png")
BOUNDS_PATH = os.path.join(OUT_DIR, "aimogasta-ndvi-bounds.json")


def find_scene():
    catalog = Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=BBOX,
        query={"eo:cloud_cover": {"lt": 10}, "s2:mgrs_tile": {"eq": MGRS_TILE}},
        sortby=[{"field": "properties.datetime", "direction": "desc"}],
        limit=10,
    )
    items = list(search.items())
    if not items:
        raise SystemExit("No Sentinel-2 L2A scenes found for the Aimogasta bbox.")
    item = items[0]
    print(f"Selected scene: {item.id}")
    print(f"  datetime:    {item.datetime}")
    print(f"  cloud_cover: {item.properties.get('eo:cloud_cover')}")
    return item


def download_asset(href, dst_path):
    """Download a remote COG to a local (ASCII-path) file.

    GDAL's /vsicurl/ reader crashes in its error logger when the OS emits a
    localized (non-UTF8) message on this Windows host, so we fetch the band
    over plain HTTPS and let rasterio read a local file instead.
    """
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


def read_band_to_4326(local_path):
    """Read a local UTM band and reproject/crop it to EPSG:4326 over the bbox.

    Returns (data float32, dst_transform, width, height).
    """
    dst_crs = "EPSG:4326"
    # Destination grid: fixed bbox at DST_RES resolution.
    width = int(round((E - W) / DST_RES))
    height = int(round((N - S) / DST_RES))
    dst_transform = rasterio.transform.from_bounds(W, S, E, N, width, height)

    with rasterio.open(local_path) as src:
        dst = np.full((height, width), np.nan, dtype="float32")
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=dst_transform,
            dst_crs=dst_crs,
            resampling=Resampling.bilinear,
            src_nodata=0,
            dst_nodata=np.nan,
        )
    return dst, dst_transform, width, height


def colorize_ndvi(ndvi):
    """Map NDVI -> RGBA. red<0.4, yellow 0.4-0.6, green>=0.6, alpha ~180."""
    h, w = ndvi.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    valid = np.isfinite(ndvi)
    red = valid & (ndvi < 0.4)
    yellow = valid & (ndvi >= 0.4) & (ndvi < 0.6)
    green = valid & (ndvi >= 0.6)

    # red  #d73027, yellow #fee08b, green #1a9850
    rgba[red] = [215, 48, 39, 180]
    rgba[yellow] = [254, 224, 139, 180]
    rgba[green] = [26, 152, 80, 180]
    # invalid pixels stay fully transparent (0,0,0,0)
    return rgba


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    item = find_scene()

    red_href = item.assets["B04"].href
    nir_href = item.assets["B08"].href

    # Download to a local ASCII-path temp dir, then read locally.
    tmpdir = tempfile.mkdtemp(prefix="ndvi_", dir="C:/Temp" if os.path.isdir("C:/Temp") else None)
    try:
        print("Downloading B04 (red) ...")
        red_local = download_asset(red_href, os.path.join(tmpdir, "B04.tif"))
        print("Downloading B08 (nir) ...")
        nir_local = download_asset(nir_href, os.path.join(tmpdir, "B08.tif"))

        print("Reprojecting B04 (red) -> EPSG:4326 ...")
        red, transform, width, height = read_band_to_4326(red_local)
        print("Reprojecting B08 (nir) -> EPSG:4326 ...")
        nir, _, _, _ = read_band_to_4326(nir_local)
    finally:
        for fn in ("B04.tif", "B08.tif"):
            p = os.path.join(tmpdir, fn)
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass

    # Convert raw DN -> surface reflectance (apply BOA additive offset).
    # NaN (nodata) propagates through the arithmetic.
    red_r = (red + BOA_ADD_OFFSET) / QUANTIFICATION
    nir_r = (nir + BOA_ADD_OFFSET) / QUANTIFICATION

    # NDVI on offset-corrected reflectance.
    denom = nir_r + red_r
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir_r - red_r) / denom
    ndvi[denom == 0] = np.nan
    # Mask pixels where either band had no data.
    nodata = ~np.isfinite(red) | ~np.isfinite(nir)
    ndvi[nodata] = np.nan

    valid = np.isfinite(ndvi)
    n_valid = int(valid.sum())
    total = ndvi.size
    print(f"NDVI grid: {width}x{height}, valid pixels: {n_valid}/{total} "
          f"({100.0 * n_valid / total:.1f}%)")
    if n_valid == 0:
        raise SystemExit("No valid NDVI pixels - scene does not cover the bbox.")

    vmean = float(np.nanmean(ndvi))
    vmin = float(np.nanmin(ndvi))
    vmax = float(np.nanmax(ndvi))
    print(f"NDVI stats: min={vmin:.3f} mean={vmean:.3f} max={vmax:.3f}")

    rgba = colorize_ndvi(ndvi)
    Image.fromarray(rgba, "RGBA").save(PNG_PATH)
    print(f"Wrote {PNG_PATH}")

    # Actual extent of the reprojected raster (matches the fixed dst grid).
    b = rasterio.transform.array_bounds(height, width, transform)
    # array_bounds returns (west, south, east, north)
    west, south, east, north = b
    bounds = {
        # MapLibre image-source order: [TL, TR, BR, BL] as [lng, lat]
        "coordinates": [
            [west, north],
            [east, north],
            [east, south],
            [west, south],
        ],
        "captura": item.datetime.strftime("%Y-%m-%d"),
        "sceneId": item.id,
    }
    with open(BOUNDS_PATH, "w", encoding="utf-8") as f:
        json.dump(bounds, f, ensure_ascii=False, indent=2)
    print(f"Wrote {BOUNDS_PATH}")
    print(json.dumps(bounds, ensure_ascii=False))

    # Print colorized class breakdown to sanity-check the field pattern.
    cls_red = int((valid & (ndvi < 0.4)).sum())
    cls_yellow = int((valid & (ndvi >= 0.4) & (ndvi < 0.6)).sum())
    cls_green = int((valid & (ndvi >= 0.6)).sum())
    print(f"Classes  red={cls_red}  yellow={cls_yellow}  green={cls_green}")


if __name__ == "__main__":
    main()
