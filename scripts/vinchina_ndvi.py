"""Sentinel-2 indices and active-vegetation estimate for Vinchina.

Every output is clipped to the Vinchina department boundary inside the query
bbox. Reported hectares are pixels with NDVI > 0.25, an arid-land vegetation
baseline; active-zone NDMI is averaged only over those same pixels. The estimate
describes observed active vegetation, not crop or cultivated area: active pixels
may be cultivated or natural vegetation, and distinguishing cultivation requires
local validation. The +/-15% range is an unvalidated heuristic scenario band
(faixa heurística de cenário), not a confidence interval or modeled uncertainty.
Threshold sensitivity and field validation are required; this is not a parcel
inventory.
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
DEPTOS_PATH = ROOT / "public" / "data" / "bermejo-deptos.geojson"


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


def select_department_geometry(geojson, name="Vinchina"):
    """Return exactly one named Polygon/MultiPolygon from a FeatureCollection."""
    if geojson.get("type") != "FeatureCollection":
        raise ValueError("department GeoJSON must be a FeatureCollection")
    matches = [
        feature
        for feature in geojson.get("features", [])
        if feature.get("properties", {}).get("nombre") == name
    ]
    if len(matches) != 1:
        raise ValueError(
            f"expected exactly one department feature named {name!r}; "
            f"found {len(matches)}"
        )
    geometry = matches[0].get("geometry") or {}
    if geometry.get("type") not in {"Polygon", "MultiPolygon"}:
        raise ValueError(f"department {name!r} must be a Polygon or MultiPolygon")
    if not geometry.get("coordinates"):
        raise ValueError(f"department {name!r} has empty geometry coordinates")
    return geometry


def load_department_geometry(path=DEPTOS_PATH, name="Vinchina"):
    """Load the named department geometry without importing geospatial packages."""
    with Path(path).open(encoding="utf-8") as source:
        return select_department_geometry(json.load(source), name)


def rasterize_department_mask(geometry, bbox=BBOX, resolution=ANALYSIS_RES):
    """Rasterize the department on the exact EPSG:4326 analysis grid."""
    from rasterio.features import geometry_mask
    from rasterio.transform import from_bounds

    west, south, east, north = bbox
    width = int(round((east - west) / resolution))
    height = int(round((north - south) / resolution))
    if width <= 0 or height <= 0:
        raise ValueError("analysis grid must have positive width and height")
    transform = from_bounds(west, south, east, north, width, height)
    mask = geometry_mask(
        [geometry],
        out_shape=(height, width),
        transform=transform,
        invert=True,
        all_touched=False,
    )
    if not mask.any():
        raise ValueError("Vinchina department mask is empty inside the analysis bbox")
    return mask


def apply_department_mask(values, department_mask):
    """Set every pixel outside the department AOI to NaN."""
    values = np.asarray(values, dtype=np.float64)
    department_mask = np.asarray(department_mask, dtype=bool)
    if values.shape != department_mask.shape:
        raise ValueError("department mask must match the analysis grid")
    masked = values.copy()
    masked[~department_mask] = np.nan
    return masked


def usable_aoi_coverage(values, department_mask):
    """Fraction of department pixels with a finite, jointly usable value."""
    values = np.asarray(values)
    department_mask = np.asarray(department_mask, dtype=bool)
    if values.shape != department_mask.shape:
        raise ValueError("department mask must match the analysis grid")
    department_pixels = int(department_mask.sum())
    if department_pixels == 0:
        raise ValueError("department mask is empty")
    usable_pixels = int((department_mask & np.isfinite(values)).sum())
    return usable_pixels / department_pixels


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


def compute_ndmi(nir, swir, to_reflectance, quality_mask=None):
    """Compute offset-corrected NDMI with the same physical/quality rules."""
    nir = np.asarray(nir, dtype=np.float64)
    swir = np.asarray(swir, dtype=np.float64)
    nir_reflectance = to_reflectance(nir)
    swir_reflectance = to_reflectance(swir)
    denominator = nir_reflectance + swir_reflectance
    valid_bands = (
        np.isfinite(nir)
        & np.isfinite(swir)
        & np.isfinite(nir_reflectance)
        & np.isfinite(swir_reflectance)
        & (nir_reflectance > 0.0)
        & (swir_reflectance > 0.0)
        & (denominator > NDVI_DENOMINATOR_EPS)
    )
    if quality_mask is not None:
        quality_mask = np.asarray(quality_mask, dtype=bool)
        if quality_mask.shape != nir.shape:
            raise ValueError("quality mask must match the NIR/SWIR grid")
        valid_bands &= quality_mask
    ndmi = np.full(nir.shape, np.nan, dtype=np.float64)
    np.divide(
        nir_reflectance - swir_reflectance,
        denominator,
        out=ndmi,
        where=valid_bands,
    )
    ndmi[(ndmi < -1.0) | (ndmi > 1.0)] = np.nan
    return ndmi


def summarize_active_area(
    ndvi,
    resolution,
    latitude,
    threshold=NDVI_ACTIVE,
    relative_margin=REL_MARGIN,
    ndmi=None,
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
        if ndmi is not None:
            ndmi = np.asarray(ndmi)
            if ndmi.shape != ndvi.shape:
                raise ValueError("NDMI must match the NDVI analysis grid")
            active_ndmi = (
                active & np.isfinite(ndmi) & (ndmi >= -1.0) & (ndmi <= 1.0)
            )
            if active_ndmi.any():
                summary["ndmiMedio"] = round(float(ndmi[active_ndmi].mean()), 3)
    return summary


def format_active_area_summary(summary):
    """Format an honest console summary when an active-pixel mean may be absent."""
    mean = summary.get("ndviMedio")
    mean_text = (
        f"active-pixel mean NDVI {mean}"
        if mean is not None
        else "active-pixel mean NDVI unavailable"
    )
    ndmi = summary.get("ndmiMedio")
    ndmi_text = (
        f"active-zone mean NDMI {ndmi}"
        if ndmi is not None
        else "active-zone mean NDMI unavailable"
    )
    return (
        f"Observed {ESTIMATE_QUALIFIER} within the Vinchina department boundary "
        f"(NDVI > {NDVI_ACTIVE:.2f}): {summary['haActivaMin']}-"
        f"{summary['haActivaMax']} ha; {mean_text}; {ndmi_text}."
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


def _download_scene_indices(s2, item, analysis_res, department_mask):
    """Download B04/B08/B11/SCL and return jointly masked NDVI/NDMI."""
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
        print(f"Downloading B11 (SWIR) for {item.id} ...")
        swir_path = s2.download_asset(
            item.assets["B11"].href, os.path.join(tmp, "B11.tif")
        )
        print(f"Downloading SCL (scene classification) for {item.id} ...")
        scl_path = s2.download_asset(
            item.assets["SCL"].href, os.path.join(tmp, "SCL.tif")
        )
        red = s2.read_band_to_4326(red_path, BBOX, analysis_res)
        nir = s2.read_band_to_4326(nir_path, BBOX, analysis_res)
        swir = s2.read_band_to_4326(swir_path, BBOX, analysis_res)
        scl = s2.read_band_to_4326(
            scl_path,
            BBOX,
            analysis_res,
            resampling=s2.Resampling.nearest,
        )

    department_mask = np.asarray(department_mask, dtype=bool)
    if department_mask.shape != scl.shape:
        raise ValueError("department mask must match the downloaded analysis grid")
    clear_department = clear_land_mask(scl) & department_mask
    ndvi = compute_ndvi(
        red,
        nir,
        s2.to_reflectance,
        quality_mask=clear_department,
    )
    ndmi = compute_ndmi(
        nir,
        swir,
        s2.to_reflectance,
        quality_mask=clear_department,
    )
    jointly_usable = department_mask & np.isfinite(ndvi) & np.isfinite(ndmi)
    ndvi = apply_department_mask(ndvi, jointly_usable)
    ndmi = apply_department_mask(ndmi, jointly_usable)
    usable_coverage = usable_aoi_coverage(ndvi, department_mask)
    return (ndvi, ndmi), usable_coverage


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
        "mascaraAOI": "límite departamental de Vinchina",
        "ndmiMedioZona": f"vegetación activa NDVI > {NDVI_ACTIVE:.2f}",
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

    if not math.isclose(s2.DST_RES, ANALYSIS_RES, rel_tol=0.0, abs_tol=1e-12):
        raise SystemExit(
            f"Analysis resolution {ANALYSIS_RES} no longer matches "
            f"s2_common.DST_RES {s2.DST_RES}."
        )
    try:
        geometry = load_department_geometry(DEPTOS_PATH, "Vinchina")
        department_mask = rasterize_department_mask(geometry, BBOX, s2.DST_RES)
    except Exception as error:
        raise SystemExit(
            f"Cannot build Vinchina department boundary mask: {error}"
        ) from error
    print(
        "Vinchina department boundary mask: "
        f"{int(department_mask.sum())}/{department_mask.size} analysis pixels inside AOI."
    )

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

    try:
        item, indices, valid_coverage = select_scene_by_usable_coverage(
            candidates,
            lambda candidate: _download_scene_indices(
                s2, candidate, s2.DST_RES, department_mask
            ),
        )
    except ValueError as error:
        raise SystemExit(str(error)) from error

    ndvi, ndmi = indices
    latitude = (BBOX[1] + BBOX[3]) / 2.0
    summary = summarize_active_area(
        ndvi, s2.DST_RES, latitude, ndmi=ndmi
    )
    _write_outputs_atomically(ndvi, item, valid_coverage, summary)
    print(
        f"Selected {item.id} ({item.datetime:%Y-%m-%d}); clear usable Vinchina "
        "boundary coverage "
        f"{valid_coverage:.1%}."
    )
    print(format_active_area_summary(summary))
    print(f"Wrote {PNG_PATH}, {BOUNDS_PATH}, and {DATA_PATH}.")


if __name__ == "__main__":
    main()
