"""Produce a real, multi-date Sentinel-2 NDVI series over Aimogasta (La Rioja,
Argentina): one small colorized NDVI PNG per recent low-cloud scene plus a
rolling manifest the UI can browse by date. Also keeps the legacy single-scene
outputs (NDMI moisture mean + NDVI trend + the latest-scene alias PNG/bounds)
so existing consumers (the /panel producer overlay) keep working unchanged.

Pipeline:
  1. Query Microsoft Planetary Computer STAC for the most recent Sentinel-2 L2A
     scenes intersecting the Aimogasta bbox (cloud <= 60%, newest first).
  2. For each scene in a rolling window (newest WINDOW), read the B04 (red) and
     B08 (NIR) assets, reprojecting/cropping from the scene's native UTM CRS to
     EPSG:4326 over the bbox so each PNG aligns with MapLibre's image overlay.
  3. Compute NDVI = (B08 - B04) / (B08 + B04) on offset-corrected reflectance.
  4. Colorize: red < 0.4, yellow 0.4-0.6, green >= 0.6 (alpha ~180),
     transparent where there is no data. Save aimogasta-ndvi-<YYYY-MM-DD>.png.
  5. Write aimogasta-series.json (escenas newest-first) and PRUNE per-date PNGs
     that fell out of the rolling window.
  6. Alias the latest scene to aimogasta-ndvi.png + aimogasta-ndvi-bounds.json.
  7. On the latest scene also compute NDMI = (B08 - B11) / (B08 + B11) -> mean,
     and an NDVI trend vs. an older (>= ~28 days) scene -> satelital.json.

Outputs:
  public/raster/aimogasta-ndvi-<YYYY-MM-DD>.png  (per scene, rolling window)
  public/raster/aimogasta-ndvi.png               (alias = latest scene)
  public/raster/aimogasta-ndvi-bounds.json       (alias = latest scene)
  public/data/aimogasta-series.json              (keys: escenas[])
  public/data/satelital.json                     (keys: ndmiAimogasta, ndviTrend)

Run:  python scripts/ndvi_snapshot.py
"""

import json
import os
import shutil
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

# Multi-date pipeline knobs.
MAX_CLOUD = 60   # relaxed from 10%; the UI badges each scene's cloud %.
WINDOW = 6       # rolling window: keep the newest WINDOW scenes.

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "public", "raster")
PNG_PATH = os.path.join(OUT_DIR, "aimogasta-ndvi.png")            # latest alias
BOUNDS_PATH = os.path.join(OUT_DIR, "aimogasta-ndvi-bounds.json")  # latest alias
SERIES_PATH = os.path.join(ROOT, "public", "data", "aimogasta-series.json")


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


def coordinates_for_bbox():
    """MapLibre image-source coordinate order [TL, TR, BR, BL] as [lng, lat]
    for the fixed Aimogasta destination grid (same bbox for every scene)."""
    width = int(round((E - W) / DST_RES))
    height = int(round((N - S) / DST_RES))
    transform = rasterio.transform.from_bounds(W, S, E, N, width, height)
    # array_bounds returns (west, south, east, north) for the dst grid.
    west, south, east, north = rasterio.transform.array_bounds(height, width, transform)
    return [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
    ]


def _ndvi_from_bands(red, nir):
    """NDVI on offset-corrected reflectance with nodata masked to NaN."""
    red_r = s2.to_reflectance(red)
    nir_r = s2.to_reflectance(nir)
    denom = nir_r + red_r
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir_r - red_r) / denom
    ndvi[denom == 0] = np.nan
    # Mask pixels where either band had no data.
    nodata = ~np.isfinite(red) | ~np.isfinite(nir)
    ndvi[nodata] = np.nan
    return ndvi


def process_scene(item, png_path):
    """Download B04/B08 for one scene, reproject to EPSG:4326 over the bbox,
    compute + colorize NDVI, save to png_path, and return
    (png_path, coordinates, ndvi_mean). Each scene uses its own temp dir;
    GDAL's /vsicurl reader crashes on this (accented) Windows host, so we
    fetch bands over plain HTTPS to a local ASCII-path temp file first.
    """
    tmpdir = tempfile.mkdtemp(
        prefix="ndvi_", dir="C:/Temp" if os.path.isdir("C:/Temp") else None
    )
    tmp_files = []
    try:
        print(f"  downloading B04 (red) for {item.id} ...")
        red_local = s2.download_asset(
            item.assets["B04"].href, os.path.join(tmpdir, "B04.tif")
        )
        tmp_files.append(red_local)
        print(f"  downloading B08 (nir) for {item.id} ...")
        nir_local = s2.download_asset(
            item.assets["B08"].href, os.path.join(tmpdir, "B08.tif")
        )
        tmp_files.append(nir_local)

        red = s2.read_band_to_4326(red_local, BBOX)
        nir = s2.read_band_to_4326(nir_local, BBOX)
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

    ndvi = _ndvi_from_bands(red, nir)
    valid = np.isfinite(ndvi)
    n_valid = int(valid.sum())
    if n_valid == 0:
        raise SystemExit(
            f"No valid NDVI pixels for {item.id} - scene does not cover the bbox."
        )
    vmean = float(np.nanmean(ndvi))
    print(
        f"  NDVI valid {n_valid}/{ndvi.size} "
        f"({100.0 * n_valid / ndvi.size:.1f}%) mean={vmean:.3f}"
    )

    Image.fromarray(colorize_ndvi(ndvi), "RGBA").save(png_path)
    print(f"  wrote {png_path}")
    return png_path, coordinates_for_bbox(), vmean


def load_manifest():
    """Return the existing escenas list (empty on absence/parse error)."""
    if os.path.exists(SERIES_PATH):
        try:
            with open(SERIES_PATH, encoding="utf-8") as f:
                return json.load(f).get("escenas", [])
        except Exception:  # noqa: BLE001
            return []
    return []


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(SERIES_PATH), exist_ok=True)

    existing = {e["fecha"]: e for e in load_manifest()}
    items = s2.find_scenes(BBOX, MGRS_TILE, max_cloud=MAX_CLOUD, limit=15)[:WINDOW]
    if not items:
        raise SystemExit("No Sentinel-2 L2A scenes found for the Aimogasta bbox.")

    # Latest scene first (find_scenes is newest-first) drives the legacy outputs.
    latest_item = items[0]

    escenas = []
    latest_mean = None
    for item in items:
        fecha = item.datetime.strftime("%Y-%m-%d")
        nubes = round(float(item.properties.get("eo:cloud_cover", 0) or 0), 1)
        png_name = f"aimogasta-ndvi-{fecha}.png"
        png_path = os.path.join(OUT_DIR, png_name)
        if fecha in existing and os.path.exists(png_path):
            # Already produced this date in a prior run; reuse coords, skip re-download.
            coords = existing[fecha]["coordinates"]
            print(f"scene {fecha} ({nubes}%): reuse existing PNG")
        else:
            print(f"scene {fecha} ({nubes}%): processing")
            _, coords, mean = process_scene(item, png_path)
            if item.id == latest_item.id:
                latest_mean = mean
        escenas.append(
            {
                "fecha": fecha,
                "nubes": nubes,
                "png": f"/raster/{png_name}",
                "coordinates": coords,
            }
        )

    # Newest first, capped to the rolling window.
    escenas.sort(key=lambda e: e["fecha"], reverse=True)
    escenas = escenas[:WINDOW]

    # --- Legacy alias for the Gestión/producer overlay (unchanged consumers) ---
    latest = escenas[0]
    latest_png_name = os.path.basename(latest["png"])
    shutil.copyfile(os.path.join(OUT_DIR, latest_png_name), PNG_PATH)
    with open(BOUNDS_PATH, "w", encoding="utf-8") as f:
        json.dump(
            {
                # MapLibre image-source order: [TL, TR, BR, BL] as [lng, lat]
                "coordinates": latest["coordinates"],
                "captura": latest["fecha"],
                "sceneId": latest_item.id,
                "nubes": latest["nubes"],
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"alias -> {PNG_PATH} + {BOUNDS_PATH} (latest {latest['fecha']})")

    # --- Manifest ---
    with open(SERIES_PATH, "w", encoding="utf-8") as f:
        json.dump({"escenas": escenas}, f, ensure_ascii=False, indent=2)
    print(f"wrote {SERIES_PATH} ({len(escenas)} escenas)")

    # --- Prune per-date PNGs no longer in the rolling window ---
    keep = {os.path.basename(e["png"]) for e in escenas} | {
        "aimogasta-ndvi.png",
        "larioja-ndvi.png",
        "larioja-ndwi.png",
    }
    for fn in os.listdir(OUT_DIR):
        if fn.startswith("aimogasta-ndvi-") and fn.endswith(".png") and fn not in keep:
            try:
                os.remove(os.path.join(OUT_DIR, fn))
                print(f"pruned {fn}")
            except OSError:
                pass

    print("series: " + ", ".join(f"{e['fecha']} ({e['nubes']}%)" for e in escenas))

    # --- NDMI + NDVI trend on the LATEST scene (keeps satelital.json keys) ---
    # Download B08/B11 (and an older B04/B08 for the trend) for the latest scene.
    update_satelital(latest_item, latest_mean)


def update_satelital(item, ndvi_mean):
    """Compute NDMI (B08-B11)/(B08+B11) on the latest scene and an NDVI trend
    vs. an older (>= ~28 days) scene; merge into satelital.json. Best-effort:
    skips the trend if no suitable older scene is found."""
    cur_dt = item.datetime
    older = next(
        (
            it
            for it in s2.find_scenes(BBOX, MGRS_TILE, max_cloud=15, limit=30)
            if (cur_dt - it.datetime) >= timedelta(days=28)
        ),
        None,
    )

    tmpdir = tempfile.mkdtemp(
        prefix="ndmi_", dir="C:/Temp" if os.path.isdir("C:/Temp") else None
    )
    tmp_files = []
    try:
        print("Downloading B08 (nir) for NDMI ...")
        nir_local = s2.download_asset(
            item.assets["B08"].href, os.path.join(tmpdir, "B08.tif")
        )
        tmp_files.append(nir_local)
        print("Downloading B11 (swir) for NDMI ...")
        swir_local = s2.download_asset(
            item.assets["B11"].href, os.path.join(tmpdir, "B11.tif")
        )
        tmp_files.append(swir_local)

        o_red_local = o_nir_local = None
        if older is not None:
            print(
                f"Older scene for trend: {older.id}  {older.datetime}  "
                f"cloud={older.properties.get('eo:cloud_cover')}"
            )
            o_red_local = s2.download_asset(
                older.assets["B04"].href, os.path.join(tmpdir, "oB04.tif")
            )
            tmp_files.append(o_red_local)
            o_nir_local = s2.download_asset(
                older.assets["B08"].href, os.path.join(tmpdir, "oB08.tif")
            )
            tmp_files.append(o_nir_local)
        else:
            print("No older scene (>=28 days) found within search window; trend skipped.")

        nir = s2.read_band_to_4326(nir_local, BBOX)
        swir = s2.read_band_to_4326(swir_local, BBOX)
        o_red = o_nir = None
        if o_red_local is not None:
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

    nir_r = s2.to_reflectance(nir)
    swir_r = s2.to_reflectance(swir)
    with np.errstate(divide="ignore", invalid="ignore"):
        ndmi = (nir_r - swir_r) / (nir_r + swir_r)
    ndmi_finite = ndmi[np.isfinite(ndmi)]
    if ndmi_finite.size == 0:
        raise SystemExit("No valid NDMI pixels - SWIR band did not cover the bbox.")
    ndmi_mean = float(np.nanmean(ndmi_finite))
    print(f"NDMI mean: {ndmi_mean:.3f}")

    ndvi_trend = None
    if o_red is not None and o_nir is not None and ndvi_mean is not None:
        o_red_r, o_nir_r = s2.to_reflectance(o_red), s2.to_reflectance(o_nir)
        with np.errstate(divide="ignore", invalid="ignore"):
            o_ndvi = (o_nir_r - o_red_r) / (o_nir_r + o_red_r)
        o_finite = o_ndvi[np.isfinite(o_ndvi)]
        if o_finite.size > 0:
            ndvi_trend = {
                "actual": round(ndvi_mean, 3),
                "anterior": round(float(np.nanmean(o_finite)), 3),
                "fechaAnterior": older.datetime.strftime("%Y-%m-%d"),
            }
            print(f"NDVI trend: {ndvi_trend}")
        else:
            print("Older scene had no valid NDVI pixels; trend skipped.")

    s2.merge_satelital(
        {
            "ndmiAimogasta": round(ndmi_mean, 3),
            **({"ndviTrend": ndvi_trend} if ndvi_trend else {}),
        }
    )


if __name__ == "__main__":
    main()
