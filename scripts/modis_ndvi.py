"""Province-wide MODIS (16-day, 250m) over La Rioja: continuous-fade NDVI
(vegetation) AND NDWI (moisture) rasters + per-department zonal means for both.
Run offline.

NDWI = (NIR - MIR) / (NIR + MIR) on the 250m_16_days_{NIR,MIR}_reflectance
bands of the same composite period, mosaicked over the same 4-tile EPSG:4326
grid and colorized with the same ramp so it fades continuously like the NDVI
raster. Outputs larioja-ndwi.png (sharing larioja-ndvi-bounds.json) and a
deptosNdwi block in provincia-ndvi.json.

La Rioja's bbox spans FOUR MODIS sinusoidal tiles (h11v11, h11v12, h12v11,
h12v12), so we fetch every NDVI asset for the newest 16-day composite period
and mosaic them into one EPSG:4326 grid. MODIS 13Q1 NDVI is int16 with
scale 0.0001 and nodata -3000 (confirmed against the live STAC raster:bands
+ the GeoTIFF's own nodata tag); we reproject with src_nodata=-3000 so the
fill value never bleeds into valid pixels, then mask it to NaN.

Why download each asset over plain HTTPS instead of /vsicurl/: GDAL's remote
reader crashes in its error logger when the OS emits a localized (non-UTF8)
message on this Windows host, so s2_common.download_asset fetches a local file
and rasterio reads that. (Same reason as ndvi_snapshot.py / snow_snapshot.py.)
"""
import json
import os
import sys
import tempfile

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.warp import reproject

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import s2_common as s2  # noqa: E402
from PIL import Image  # noqa: E402

BBOX = [-69.6, -32.0, -65.4, -27.7]  # La Rioja province
W, S, E, N = BBOX
RES = 0.0025  # ~250 m at this latitude
COLLECTION = "modis-13Q1-061"  # CONFIRMED via live STAC
NDVI_ASSET = "250m_16_days_NDVI"  # CONFIRMED via live STAC
# Surface-reflectance bands for the moisture index (NDWI). MODIS 13Q1 ships
# per-band reflectance composites; NIR (band 2, ~858 nm) + MIR (band 7,
# ~2130 nm) give a water/moisture-sensitive normalized index.
NIR_ASSET = "250m_16_days_NIR_reflectance"  # per plan
MIR_ASSET = "250m_16_days_MIR_reflectance"  # per plan
SCALE = 0.0001  # CONFIRMED via asset raster:bands
NODATA = -3000  # CONFIRMED via GeoTIFF nodata tag + value histogram

ROOT = s2.ROOT
PNG = os.path.join(ROOT, "public", "raster", "larioja-ndvi.png")
PNG_NDWI = os.path.join(ROOT, "public", "raster", "larioja-ndwi.png")
BOUNDS = os.path.join(ROOT, "public", "raster", "larioja-ndvi-bounds.json")
PROV = os.path.join(ROOT, "public", "data", "provincia-ndvi.json")
DEPTOS = os.path.join(ROOT, "public", "data", "departamentos.geojson")


def colorize(ndvi):
    """5-stop red->green ramp. Linear interpolation between stops gives a
    smooth continuous fade (not blocky) over the 250 m grid."""
    h, w = ndvi.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    valid = np.isfinite(ndvi)
    stops = [
        (-0.1, [215, 48, 39]),
        (0.2, [252, 141, 89]),
        (0.4, [254, 224, 139]),
        (0.6, [145, 207, 96]),
        (0.8, [26, 152, 80]),
    ]
    xs = np.array([s[0] for s in stops], dtype="float32")
    rs = np.array([s[1][0] for s in stops], dtype="float32")
    gs = np.array([s[1][1] for s in stops], dtype="float32")
    bs = np.array([s[1][2] for s in stops], dtype="float32")
    v = ndvi[valid]
    rgba[valid, 0] = np.interp(v, xs, rs).astype(np.uint8)
    rgba[valid, 1] = np.interp(v, xs, gs).astype(np.uint8)
    rgba[valid, 2] = np.interp(v, xs, bs).astype(np.uint8)
    rgba[valid, 3] = 200
    return rgba


def newest_period_items(catalog):
    """All items for the most recent 16-day composite period over the bbox.
    The province needs all four sinusoidal tiles to be fully covered."""
    items = list(
        catalog.search(
            collections=[COLLECTION],
            bbox=BBOX,
            sortby=[{"field": "properties.datetime", "direction": "desc"}],
            limit=24,
        ).items()
    )
    if not items:
        return [], None
    newest_start = items[0].properties["start_datetime"]
    period = [it for it in items if it.properties["start_datetime"] == newest_start]
    return period, newest_start


def mosaic_band(items, tmp, asset_key, prefix):
    """Download each tile's `asset_key` and reproject into one shared 4326 grid,
    keeping the first valid pixel per cell (tiles do not overlap in content).
    Returns scaled values (float32, NaN where no valid data) + the dst grid.

    La Rioja spans 4 MODIS sinusoidal tiles, so every item is mosaicked (no
    limit=1). nodata is -3000 (not raw==0); reproject with src_nodata=NODATA so
    the fill value never bleeds into valid pixels, then NaN marks no-data."""
    width = int(round((E - W) / RES))
    height = int(round((N - S) / RES))
    dst_transform = rasterio.transform.from_bounds(W, S, E, N, width, height)
    acc = np.full((height, width), np.nan, dtype="float32")
    for i, it in enumerate(items):
        local = s2.download_asset(
            it.assets[asset_key].href, os.path.join(tmp, f"{prefix}_{i}.tif")
        )
        try:
            with rasterio.open(local) as src:
                tile = np.full((height, width), np.nan, dtype="float32")
                reproject(
                    source=rasterio.band(src, 1),
                    destination=tile,
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=dst_transform,
                    dst_crs="EPSG:4326",
                    resampling=Resampling.bilinear,
                    src_nodata=NODATA,
                    dst_nodata=np.nan,
                )
        finally:
            if os.path.exists(local):
                try:
                    os.remove(local)
                except OSError:
                    pass
        fill = np.isnan(acc) & np.isfinite(tile)
        acc[fill] = tile[fill]
    return acc * SCALE, dst_transform, width, height


def mosaic_ndvi(items, tmp):
    """Backward-compatible NDVI mosaic (scaled float32, NaN nodata)."""
    return mosaic_band(items, tmp, NDVI_ASSET, "ndvi")


def zonal_means(grid, finite, tr, width, height, features):
    """Per-department mean of `grid` over valid pixels. Returns {nombre: mean}."""
    out = {}
    for feat in features:
        nombre = feat["properties"].get("nombre")
        try:
            mask = geometry_mask(
                [feat["geometry"]],
                out_shape=(height, width),
                transform=tr,
                invert=True,
            )
            vals = grid[mask & finite]
            if vals.size:
                out[nombre] = round(float(vals.mean()), 3)
            else:
                print("zonal skip (no valid pixels):", nombre)
        except Exception as e:  # noqa: BLE001
            print("zonal skip", nombre, e)
    return out


def main():
    catalog = s2.open_catalog()
    items, start = newest_period_items(catalog)
    if not items:
        print("BLOCKED: no MODIS items returned for the La Rioja bbox", file=sys.stderr)
        sys.exit(1)
    fecha = start[:10]  # composite period start, e.g. 2026-05-25
    print(f"MODIS composite period start {fecha}: {len(items)} tile(s)")
    for it in items:
        print("  ", it.id)

    tmp = tempfile.mkdtemp(
        prefix="modis_", dir="C:/Temp" if os.path.isdir("C:/Temp") else None
    )
    try:
        ndvi, tr, width, height = mosaic_ndvi(items, tmp)
        # Moisture index (NDWI) from the same composite period / same dst grid:
        # NDWI = (NIR - MIR) / (NIR + MIR) on surface reflectance.
        nir, _, _, _ = mosaic_band(items, tmp, NIR_ASSET, "nir")
        mir, _, _, _ = mosaic_band(items, tmp, MIR_ASSET, "mir")
    finally:
        try:
            os.rmdir(tmp)
        except OSError:
            pass

    finite = np.isfinite(ndvi)
    cov = 100.0 * finite.sum() / ndvi.size
    print(
        f"NDVI grid {width}x{height} | valid {cov:.1f}% | "
        f"min/mean/max {np.nanmin(ndvi):.3f}/{np.nanmean(ndvi):.3f}/{np.nanmax(ndvi):.3f}"
    )

    # NDWI on reflectance; mask where either band had no data.
    denom = nir + mir
    with np.errstate(divide="ignore", invalid="ignore"):
        ndwi = (nir - mir) / denom
    ndwi[(denom == 0) | ~np.isfinite(nir) | ~np.isfinite(mir)] = np.nan
    finite_w = np.isfinite(ndwi)
    if finite_w.any():
        print(
            f"NDWI grid {width}x{height} | valid {100.0 * finite_w.sum() / ndwi.size:.1f}% | "
            f"min/mean/max {np.nanmin(ndwi):.3f}/{np.nanmean(ndwi):.3f}/{np.nanmax(ndwi):.3f}"
        )
    else:
        print("NDWI: no valid pixels (NIR/MIR did not cover the bbox)")

    os.makedirs(os.path.dirname(PNG), exist_ok=True)
    # Same fluid 5-stop colorize ramp as NDVI -> continuous fade.
    Image.fromarray(colorize(ndvi), "RGBA").save(PNG)
    Image.fromarray(colorize(ndwi), "RGBA").save(PNG_NDWI)
    # One bounds JSON serves both rasters (identical grid/bbox).
    with open(BOUNDS, "w", encoding="utf-8") as f:
        json.dump(
            {
                "coordinates": [[W, N], [E, N], [E, S], [W, S]],
                "captura": fecha,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    # Per-department zonal means (NDVI + NDWI), same masks/grid.
    with open(DEPTOS, encoding="utf-8") as f:
        gj = json.load(f)
    feats = gj["features"]
    deptos = zonal_means(ndvi, finite, tr, width, height, feats)
    deptos_ndwi = zonal_means(ndwi, finite_w, tr, width, height, feats)
    with open(PROV, "w", encoding="utf-8") as f:
        json.dump(
            {"fecha": fecha, "deptos": deptos, "deptosNdwi": deptos_ndwi},
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(f"Wrote {PNG}")
    print(f"Wrote {PNG_NDWI}")
    print(f"Wrote {BOUNDS}")
    print(f"Wrote {PROV} ({len(deptos)} deptos, {len(deptos_ndwi)} ndwi)")


if __name__ == "__main__":
    main()
