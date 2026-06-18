"""Sentinel-2 NDVI snapshot and observed active-vegetation estimate for Vinchina.

The reported hectares are pixels with NDVI > 0.25, an arid-land vegetation
baseline. The estimate describes observed active vegetation, not crop or
cultivated area: active pixels may be cultivated or natural vegetation, and
distinguishing cultivation requires local validation. The +/-15% range is an
unvalidated heuristic scenario band (faixa heurística de cenário), not a
confidence interval or modeled uncertainty. Threshold sensitivity and field
validation are required; this is not a parcel inventory.
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
    "requires local validation; the +/-15% range is an unvalidated heuristic "
    "scenario band (faixa heurística de cenário), not a confidence interval or "
    "modeled uncertainty; threshold sensitivity and field validation are required"
)
BBOX = [-68.40, -28.90, -68.05, -28.60]
ANALYSIS_RES = 0.0001  # s2_common.DST_RES: native-ish ~11 m analysis grid
DISPLAY_RES = 0.0009  # ~100 m display grid used only to keep the PNG compact
RES = DISPLAY_RES  # backward-compatible name; never use this for hectare estimates
MAX_CLOUD = 60
SCENE_LIMIT = 10
MAX_SCENE_ATTEMPTS = 3
MIN_BBOX_COVERAGE = 0.95
MIN_CLEAR_COVERAGE = 0.95

# Sentinel-2 Scene Classification Layer classes. Only clear land is usable.
SCL_CLEAR_LAND_CLASSES = frozenset({4, 5})  # vegetation, bare/not-vegetated
SCL_REJECTED_CLASSES = frozenset(
    {0, 1, 2, 3, 6, 7, 8, 9, 10, 11}
)  # nodata, saturated, dark, shadow, water, unclassified/cloud/cirrus, snow

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


def clear_land_mask(scl):
    """Mask SCL to explicit clear-land classes; reject unknown classes too."""
    scl = np.asarray(scl)
    return np.isfinite(scl) & np.isin(scl, tuple(SCL_CLEAR_LAND_CLASSES))


def compute_ndvi(red, nir, to_reflectance, quality_mask=None):
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
    if quality_mask is not None:
        quality_mask = np.asarray(quality_mask, dtype=bool)
        if quality_mask.shape != red.shape:
            raise ValueError("quality mask must match the red/NIR grid")
        valid_bands &= quality_mask
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

    summary = {
        "haActivaMin": round(central_hectares * (1.0 - relative_margin)),
        "haActivaMax": round(central_hectares * (1.0 + relative_margin)),
    }
    if active_count and summary["haActivaMax"] > 0:
        summary["ndviMedio"] = round(float(ndvi[active].mean()), 3)
    return summary


def format_active_area_summary(summary):
    """Format an honest console summary when an active-pixel mean may be absent."""
    mean = summary.get("ndviMedio")
    mean_text = (
        f"active-pixel mean NDVI {mean}"
        if mean is not None
        else "active-pixel mean NDVI unavailable"
    )
    return (
        f"Observed {ESTIMATE_QUALIFIER} (NDVI > {NDVI_ACTIVE:.2f}): "
        f"{summary['haActivaMin']}-{summary['haActivaMax']} ha; {mean_text}."
    )


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


def resize_colorized_for_display(ndvi, size):
    """Resize RGB smoothly while preserving alpha strictly as 0 or 200."""
    from PIL import Image

    ndvi = np.asarray(ndvi)
    rgba = colorize_ndvi(ndvi)
    valid = np.isfinite(ndvi) & (ndvi >= -1.0) & (ndvi <= 1.0)
    valid_float = valid.astype(np.float32)
    weights = np.asarray(
        Image.fromarray(valid_float).resize(size, resample=Image.Resampling.LANCZOS)
    )
    rgb_float = np.zeros((*weights.shape, 3), dtype=np.float32)
    for channel in range(3):
        weighted_channel = rgba[..., channel].astype(np.float32) * valid_float
        numerator = np.asarray(
            Image.fromarray(weighted_channel).resize(
                size, resample=Image.Resampling.LANCZOS
            )
        )
        np.divide(
            numerator,
            weights,
            out=rgb_float[..., channel],
            where=weights > 1e-6,
        )
    rgb = np.clip(np.rint(rgb_float), 0, 255).astype(np.uint8)
    source_alpha = np.where(valid, 200, 0).astype(np.uint8)
    alpha = np.asarray(
        Image.fromarray(source_alpha, "L").resize(
            size, resample=Image.Resampling.NEAREST
        )
    )
    display = np.empty((*alpha.shape, 4), dtype=np.uint8)
    display[..., :3] = rgb
    display[..., 3] = alpha
    unstable = (alpha == 200) & (weights <= 1e-6)
    if unstable.any():
        nearest_rgb = np.asarray(
            Image.fromarray(rgba[..., :3], "RGB").resize(
                size, resample=Image.Resampling.NEAREST
            )
        )
        display[unstable, :3] = nearest_rgb[unstable]
    display[alpha == 0, :3] = 0
    return display


def _download_scene_ndvi(s2, item, analysis_res):
    """Download B04/B08/SCL and return quality-masked native-ish NDVI."""
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
        print(f"Downloading SCL (scene classification) for {item.id} ...")
        scl_path = s2.download_asset(
            item.assets["SCL"].href, os.path.join(tmp, "SCL.tif")
        )
        red = s2.read_band_to_4326(red_path, BBOX, analysis_res)
        nir = s2.read_band_to_4326(nir_path, BBOX, analysis_res)
        scl = s2.read_band_to_4326(
            scl_path,
            BBOX,
            analysis_res,
            resampling=s2.Resampling.nearest,
        )

    ndvi = compute_ndvi(
        red,
        nir,
        s2.to_reflectance,
        quality_mask=clear_land_mask(scl),
    )
    valid_count = int(np.isfinite(ndvi).sum())
    usable_coverage = valid_count / ndvi.size if ndvi.size else 0.0
    return ndvi, usable_coverage


def select_scene_by_usable_coverage(
    candidates,
    loader,
    min_coverage=MIN_CLEAR_COVERAGE,
    max_attempts=MAX_SCENE_ATTEMPTS,
    report=print,
):
    """Select the newest candidate with near-complete clear usable AOI coverage."""
    rejections = []
    attempted = candidates[:max_attempts]
    for item in attempted:
        ndvi, coverage = loader(item)
        cloud = round(float(item.properties.get("eo:cloud_cover", 0) or 0), 1)
        if coverage >= min_coverage:
            report(
                f"Accepted {item.id}: granule cloud={cloud}% / "
                f"clear usable AOI={coverage:.1%}."
            )
            return item, ndvi, coverage
        reason = (
            f"{item.id}: granule cloud={cloud}% / clear usable AOI={coverage:.1%} "
            f"(< {min_coverage:.0%})"
        )
        rejections.append(reason)
        report(f"Rejected {reason}.")

    details = "; ".join(rejections) or "no candidates attempted"
    raise ValueError(
        f"No scene reached {min_coverage:.0%} clear usable AOI coverage after "
        f"{len(attempted)} of at most {max_attempts} attempts: {details}"
    )


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
    west, south, east, north = BBOX
    display_size = (
        int(round((east - west) / DISPLAY_RES)),
        int(round((north - south) / DISPLAY_RES)),
    )
    display_image = Image.fromarray(
        resize_colorized_for_display(ndvi, display_size), "RGBA"
    )
    display_image.save(png_buffer, format="PNG")
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

    if not math.isclose(s2.DST_RES, ANALYSIS_RES, rel_tol=0.0, abs_tol=1e-12):
        raise SystemExit(
            f"Analysis resolution {ANALYSIS_RES} no longer matches "
            f"s2_common.DST_RES {s2.DST_RES}."
        )
    try:
        item, ndvi, valid_coverage = select_scene_by_usable_coverage(
            candidates,
            lambda candidate: _download_scene_ndvi(s2, candidate, s2.DST_RES),
        )
    except ValueError as error:
        raise SystemExit(str(error)) from error

    latitude = (BBOX[1] + BBOX[3]) / 2.0
    summary = summarize_active_area(ndvi, s2.DST_RES, latitude)
    _write_outputs_atomically(ndvi, item, valid_coverage, summary)
    print(
        f"Selected {item.id} ({item.datetime:%Y-%m-%d}); clear usable AOI coverage "
        f"{valid_coverage:.1%}."
    )
    print(format_active_area_summary(summary))
    print(f"Wrote {PNG_PATH}, {BOUNDS_PATH}, and {DATA_PATH}.")


if __name__ == "__main__":
    main()
