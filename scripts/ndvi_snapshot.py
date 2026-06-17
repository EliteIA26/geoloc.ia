"""Produce a real Sentinel-2 NDVI snapshot over Aimogasta (La Rioja, Argentina),
plus an NDMI moisture mean and an NDVI trend (current vs. ~1-month-older scene).

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
  6. NDMI = (B08 - B11) / (B08 + B11) on the same current scene -> mean.
  7. NDVI trend: pick an older scene (>= ~28 days before current), compute its
     NDVI mean, and write {actual, anterior, fechaAnterior} to satelital.json.

Outputs:
  public/raster/aimogasta-ndvi.png
  public/raster/aimogasta-ndvi-bounds.json
  public/data/satelital.json  (keys: ndmiAimogasta, ndviTrend)

Run:  python scripts/ndvi_snapshot.py
"""

import json
import os
import sys
import tempfile
from datetime import timedelta

import numpy as np
import rasterio
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import s2_common as s2

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
DST_RES = s2.DST_RES  # ~11 m/px -> sharp enough, keeps PNG small

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "public", "raster")
PNG_PATH = os.path.join(OUT_DIR, "aimogasta-ndvi.png")
BOUNDS_PATH = os.path.join(OUT_DIR, "aimogasta-ndvi-bounds.json")


def find_scene():
    items = s2.find_scenes(BBOX, mgrs_tile=MGRS_TILE, max_cloud=10, limit=10)
    if not items:
        raise SystemExit("No Sentinel-2 L2A scenes found for the Aimogasta bbox.")
    item = items[0]
    print(f"Selected scene: {item.id}")
    print(f"  datetime:    {item.datetime}")
    print(f"  cloud_cover: {item.properties.get('eo:cloud_cover')}")
    return item


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
    swir_href = item.assets["B11"].href

    # Destination grid (fixed bbox at DST_RES) — used for the bounds JSON.
    width = int(round((E - W) / DST_RES))
    height = int(round((N - S) / DST_RES))
    transform = rasterio.transform.from_bounds(W, S, E, N, width, height)

    # Download all needed bands (current scene + older scene) to a local
    # ASCII-path temp dir BEFORE cleanup, then read locally.
    tmpdir = tempfile.mkdtemp(prefix="ndvi_", dir="C:/Temp" if os.path.isdir("C:/Temp") else None)
    tmp_files = []

    # --- NDVI trend: find an older scene (>= ~28 days before current) ---
    cur_dt = item.datetime
    older = next(
        (it for it in s2.find_scenes(BBOX, MGRS_TILE, max_cloud=15, limit=30)
         if (cur_dt - it.datetime) >= timedelta(days=28)),
        None,
    )

    try:
        print("Downloading B04 (red) ...")
        red_local = s2.download_asset(red_href, os.path.join(tmpdir, "B04.tif"))
        tmp_files.append(red_local)
        print("Downloading B08 (nir) ...")
        nir_local = s2.download_asset(nir_href, os.path.join(tmpdir, "B08.tif"))
        tmp_files.append(nir_local)
        print("Downloading B11 (swir) ...")
        swir_local = s2.download_asset(swir_href, os.path.join(tmpdir, "B11.tif"))
        tmp_files.append(swir_local)

        o_red_local = o_nir_local = None
        if older is not None:
            print(f"Older scene for trend: {older.id}  {older.datetime}  "
                  f"cloud={older.properties.get('eo:cloud_cover')}")
            print("Downloading older B04 ...")
            o_red_local = s2.download_asset(older.assets["B04"].href, os.path.join(tmpdir, "oB04.tif"))
            tmp_files.append(o_red_local)
            print("Downloading older B08 ...")
            o_nir_local = s2.download_asset(older.assets["B08"].href, os.path.join(tmpdir, "oB08.tif"))
            tmp_files.append(o_nir_local)
        else:
            print("No older scene (>=28 days) found within search window; trend skipped.")

        print("Reprojecting B04 (red) -> EPSG:4326 ...")
        red = s2.read_band_to_4326(red_local, BBOX)
        print("Reprojecting B08 (nir) -> EPSG:4326 ...")
        nir = s2.read_band_to_4326(nir_local, BBOX)
        print("Reprojecting B11 (swir) -> EPSG:4326 ...")
        swir = s2.read_band_to_4326(swir_local, BBOX)

        o_red = o_nir = None
        if o_red_local is not None:
            print("Reprojecting older B04/B08 -> EPSG:4326 ...")
            o_red = s2.read_band_to_4326(o_red_local, BBOX)
            o_nir = s2.read_band_to_4326(o_nir_local, BBOX)
    finally:
        for p in tmp_files:
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
    red_r = s2.to_reflectance(red)
    nir_r = s2.to_reflectance(nir)

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

    # --- NDMI on the SAME current scene: (B08 - B11) / (B08 + B11) ---
    swir_r = s2.to_reflectance(swir)
    with np.errstate(divide="ignore", invalid="ignore"):
        ndmi = (nir_r - swir_r) / (nir_r + swir_r)
    ndmi_finite = ndmi[np.isfinite(ndmi)]
    if ndmi_finite.size == 0:
        raise SystemExit("No valid NDMI pixels - SWIR band did not cover the bbox.")
    ndmi_mean = float(np.nanmean(ndmi_finite))
    print(f"NDMI mean: {ndmi_mean:.3f}")

    # --- NDVI trend (older scene already reprojected above) ---
    ndvi_trend = None
    if o_red is not None and o_nir is not None:
        o_red_r, o_nir_r = s2.to_reflectance(o_red), s2.to_reflectance(o_nir)
        with np.errstate(divide="ignore", invalid="ignore"):
            o_ndvi = (o_nir_r - o_red_r) / (o_nir_r + o_red_r)
        o_finite = o_ndvi[np.isfinite(o_ndvi)]
        if o_finite.size > 0:
            ndvi_trend = {
                "actual": round(vmean, 3),
                "anterior": round(float(np.nanmean(o_finite)), 3),
                "fechaAnterior": older.datetime.strftime("%Y-%m-%d"),
            }
            print(f"NDVI trend: {ndvi_trend}")
        else:
            print("Older scene had no valid NDVI pixels; trend skipped.")

    s2.merge_satelital({
        "ndmiAimogasta": round(ndmi_mean, 3),
        **({"ndviTrend": ndvi_trend} if ndvi_trend else {}),
    })


if __name__ == "__main__":
    main()
