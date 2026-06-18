"""Sentinel-2 NDVI snapshot and observed active-vegetation estimate for Vinchina.

The reported hectares are pixels with NDVI > 0.25, an arid-land vegetation
baseline. The estimate describes observed active vegetation, not crop or
cultivated area: active pixels may be cultivated or natural vegetation, and
distinguishing cultivation requires local validation. A +/-15% range makes the
threshold and degree-grid area uncertainty explicit; it is not a parcel inventory.
"""

import io
import json
import math
import os
import sys
import tempfile
from pathlib import Path

import numpy as np

NDVI_ACTIVE = 0.25
REL_MARGIN = 0.15
NDVI_DENOMINATOR_EPS = 1e-8
ESTIMATE_QUALIFIER = (
    "active vegetation (cultivated or natural); distinguishing cultivation "
    "requires local validation"
)
BBOX = [-68.40, -28.90, -68.05, -28.60]
RES = 0.0009  # about 100 m in a degree grid at Vinchina's latitude
MAX_CLOUD = 60
SCENE_LIMIT = 10
MIN_BBOX_COVERAGE = 0.90
MIN_VALID_COVERAGE = 0.80

ROOT = Path(__file__).resolve().parents[1]
PNG_PATH = ROOT / "public" / "raster" / "vinchina-ndvi.png"
BOUNDS_PATH = ROOT / "public" / "raster" / "vinchina-ndvi-bounds.json"
DATA_PATH = ROOT / "public" / "data" / "vinchina-satelital.json"


def bbox_coverage_fraction(scene_bbox, target_bbox):
    """Return the fraction of the target bbox covered by a scene bbox."""
    if not scene_bbox or len(scene_bbox) < 4:
        return 0.0
    scene_west, scene_south, scene_east, scene_north = scene_bbox[:4]
    target_west, target_south, target_east, target_north = target_bbox
    intersection_width = max(
        0.0, min(scene_east, target_east) - max(scene_west, target_west)
    )
    intersection_height = max(
        0.0, min(scene_north, target_north) - max(scene_south, target_south)
    )
    target_area = (target_east - target_west) * (target_north - target_south)
    if target_area <= 0:
        raise ValueError("target bbox must have positive width and height")
    return intersection_width * intersection_height / target_area


def compute_ndvi(red, nir, to_reflectance):
    """Compute offset-corrected NDVI and mask missing/nonphysical results."""
    red = np.asarray(red, dtype=np.float64)
    nir = np.asarray(nir, dtype=np.float64)
    red_reflectance = to_reflectance(red)
    nir_reflectance = to_reflectance(nir)
    denominator = nir_reflectance + red_reflectance
    valid_bands = (
        np.isfinite(red)
        & np.isfinite(nir)
        & np.isfinite(red_reflectance)
        & np.isfinite(nir_reflectance)
        & (red_reflectance > 0.0)
        & (nir_reflectance > 0.0)
        & (denominator > NDVI_DENOMINATOR_EPS)
    )
    ndvi = np.full(red.shape, np.nan, dtype=np.float64)
    np.divide(
        nir_reflectance - red_reflectance,
        denominator,
        out=ndvi,
        where=valid_bands,
    )
    ndvi[(ndvi < -1.0) | (ndvi > 1.0)] = np.nan
    return ndvi


def summarize_active_area(
    ndvi,
    resolution,
    latitude,
    threshold=NDVI_ACTIVE,
    relative_margin=REL_MARGIN,
):
    """Estimate observed active-vegetation hectares with a threshold margin."""
    ndvi = np.asarray(ndvi)
    valid = np.isfinite(ndvi) & (ndvi >= -1.0) & (ndvi <= 1.0)
    active = valid & (ndvi > threshold)
    active_count = int(active.sum())

    latitude_metres = 110_574.0 * resolution
    longitude_metres = 111_320.0 * resolution * math.cos(math.radians(latitude))
    pixel_hectares = latitude_metres * longitude_metres / 10_000.0
    central_hectares = active_count * pixel_hectares

    return {
        "haActivaMin": round(central_hectares * (1.0 - relative_margin)),
        "haActivaMax": round(central_hectares * (1.0 + relative_margin)),
        "ndviMedio": round(float(ndvi[active].mean()), 3) if active_count else 0,
    }


def colorize_ndvi(ndvi):
    """Map physical NDVI values to the red-yellow-green RGBA ramp."""
    ndvi = np.asarray(ndvi)
    rgba = np.zeros((*ndvi.shape, 4), dtype=np.uint8)
    valid = np.isfinite(ndvi) & (ndvi >= -1.0) & (ndvi <= 1.0)
    if not valid.any():
        return rgba

    values = ndvi[valid]
    stops = np.array([-0.2, 0.2, 0.6])
    colors = np.array(
        [
            [215, 48, 39],
            [254, 224, 139],
            [26, 152, 80],
        ],
        dtype=np.float64,
    )
    for channel in range(3):
        rgba[..., channel][valid] = np.rint(
            np.interp(values, stops, colors[:, channel])
        ).astype(np.uint8)
    rgba[..., 3][valid] = 200
    return rgba


def _download_scene_ndvi(s2, item):
    """Download B04/B08 and return NDVI only after checking valid coverage."""
    temp_root = "C:/Temp" if os.path.isdir("C:/Temp") else None
    with tempfile.TemporaryDirectory(prefix="vinchina_ndvi_", dir=temp_root) as tmp:
        print(f"Downloading B04 (red) for {item.id} ...")
        red_path = s2.download_asset(
            item.assets["B04"].href, os.path.join(tmp, "B04.tif")
        )
        print(f"Downloading B08 (nir) for {item.id} ...")
        nir_path = s2.download_asset(
            item.assets["B08"].href, os.path.join(tmp, "B08.tif")
        )
        red = s2.read_band_to_4326(red_path, BBOX, RES)
        nir = s2.read_band_to_4326(nir_path, BBOX, RES)

    ndvi = compute_ndvi(red, nir, s2.to_reflectance)
    valid_count = int(np.isfinite(ndvi).sum())
    valid_coverage = valid_count / ndvi.size if ndvi.size else 0.0
    if valid_count == 0 or valid_coverage < MIN_VALID_COVERAGE:
        raise ValueError(
            f"scene {item.id} has inadequate valid coverage: "
            f"{valid_coverage:.1%} (required {MIN_VALID_COVERAGE:.0%})"
        )
    return ndvi, valid_coverage


def _coordinates_for_bbox():
    west, south, east, north = BBOX
    return [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
    ]


def _json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _write_outputs_atomically(ndvi, item, valid_coverage, summary):
    """Stage all artifacts before replacing any published output."""
    from PIL import Image

    png_buffer = io.BytesIO()
    Image.fromarray(colorize_ndvi(ndvi), "RGBA").save(png_buffer, format="PNG")
    date = item.datetime.strftime("%Y-%m-%d")
    cloud = round(float(item.properties.get("eo:cloud_cover", 0) or 0), 1)
    bounds = {
        "coordinates": _coordinates_for_bbox(),
        "captura": date,
        "sceneId": item.id,
        "nubes": cloud,
        "coberturaValidaPct": round(valid_coverage * 100.0, 1),
    }
    data = {"fecha": date, **summary}
    payloads = [
        (PNG_PATH, png_buffer.getvalue()),
        (BOUNDS_PATH, _json_bytes(bounds)),
        (DATA_PATH, _json_bytes(data)),
    ]

    staged = []
    try:
        for target, payload in payloads:
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                prefix=f".{target.name}.", suffix=".tmp", dir=target.parent, delete=False
            ) as staged_file:
                staged_file.write(payload)
                staged_file.flush()
                os.fsync(staged_file.fileno())
                staged.append((Path(staged_file.name), target))
        for staged_path, target in staged:
            os.replace(staged_path, target)
    finally:
        for staged_path, _ in staged:
            try:
                staged_path.unlink(missing_ok=True)
            except OSError:
                pass


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import s2_common as s2

    scenes = s2.find_scenes(
        BBOX,
        mgrs_tile=None,
        max_cloud=MAX_CLOUD,
        limit=SCENE_LIMIT,
    )
    if not scenes:
        raise SystemExit("No Sentinel-2 L2A scenes found for the Vinchina bbox.")

    candidates = []
    for item in scenes:
        coverage = bbox_coverage_fraction(getattr(item, "bbox", None), BBOX)
        if coverage >= MIN_BBOX_COVERAGE:
            candidates.append(item)
        else:
            print(f"Skipping {item.id}: bbox coverage is only {coverage:.1%}.")
    if not candidates:
        raise SystemExit(
            "No Sentinel-2 scene adequately covers the Vinchina bbox "
            f"(required {MIN_BBOX_COVERAGE:.0%} bbox coverage)."
        )

    selected = None
    rejected = []
    for item in candidates:
        try:
            ndvi, valid_coverage = _download_scene_ndvi(s2, item)
        except ValueError as error:
            rejected.append(str(error))
            print(f"Skipping {item.id}: {error}")
            continue
        selected = (item, ndvi, valid_coverage)
        break
    if selected is None:
        details = "; ".join(rejected) or "no candidate could be processed"
        raise SystemExit(f"No Vinchina scene had adequate valid coverage: {details}")

    item, ndvi, valid_coverage = selected
    latitude = (BBOX[1] + BBOX[3]) / 2.0
    summary = summarize_active_area(ndvi, RES, latitude)
    _write_outputs_atomically(ndvi, item, valid_coverage, summary)
    print(
        f"Selected {item.id} ({item.datetime:%Y-%m-%d}); valid coverage "
        f"{valid_coverage:.1%}."
    )
    print(
        f"Observed {ESTIMATE_QUALIFIER} (NDVI > "
        f"{NDVI_ACTIVE:.2f}, +/-{REL_MARGIN:.0%} threshold/area uncertainty): "
        f"{summary['haActivaMin']}-{summary['haActivaMax']} ha; "
        f"active-pixel mean NDVI {summary['ndviMedio']}."
    )
    print(f"Wrote {PNG_PATH}, {BOUNDS_PATH}, and {DATA_PATH}.")


if __name__ == "__main__":
    main()
