import json
import math
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vinchina_ndvi as subject


class VinchinaNdviTests(unittest.TestCase):
    def test_loads_vinchina_geometry_from_actual_department_geojson(self):
        path = subject.ROOT / "public" / "data" / "bermejo-deptos.geojson"
        geometry = subject.load_department_geometry(path, "Vinchina")

        self.assertIn(geometry["type"], {"Polygon", "MultiPolygon"})
        self.assertTrue(geometry["coordinates"])

    def test_department_geometry_selection_rejects_missing_or_ambiguous_feature(self):
        polygon = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [0, 0]]]}
        missing = {"type": "FeatureCollection", "features": []}
        ambiguous = {
            "type": "FeatureCollection",
            "features": [
                {"properties": {"nombre": "Vinchina"}, "geometry": polygon},
                {"properties": {"nombre": "Vinchina"}, "geometry": polygon},
            ],
        }

        for geojson in (missing, ambiguous):
            with self.subTest(features=len(geojson["features"])):
                with self.assertRaisesRegex(ValueError, "exactly one"):
                    subject.select_department_geometry(geojson, "Vinchina")

    def test_department_mask_excludes_outside_area_and_visualization(self):
        ndvi = np.array([[0.4, 0.9], [0.2, 0.6]])
        department = np.array([[True, False], [True, False]])
        masked = subject.apply_department_mask(ndvi, department)
        summary = subject.summarize_active_area(
            masked, 0.001, -28.75, relative_margin=0
        )
        rgba = subject.colorize_ndvi(masked)

        self.assertTrue(np.isnan(masked[0, 1]))
        self.assertTrue(np.isnan(masked[1, 1]))
        self.assertEqual(summary["ndviMedio"], 0.4)
        self.assertEqual(rgba[0, 1, 3], 0)
        self.assertEqual(rgba[1, 1, 3], 0)

    def test_usable_coverage_denominator_is_department_pixels_only(self):
        ndvi = np.array([[0.4, np.nan], [0.3, 0.2]])
        department = np.array([[True, True], [False, False]])
        coverage = subject.usable_aoi_coverage(ndvi, department)

        self.assertEqual(coverage, 0.5)

    def test_usable_coverage_rejects_empty_department_mask(self):
        with self.assertRaisesRegex(ValueError, "empty"):
            subject.usable_aoi_coverage(
                np.array([[0.4]]), np.array([[False]])
            )

    def test_ndmi_is_offset_corrected_bounded_and_quality_masked(self):
        nir = np.array([[5000.0, 5000.0, 900.0]])
        swir = np.array([[3000.0, 3000.0, 800.0]])
        quality = np.array([[True, False, True]])
        ndmi = subject.compute_ndmi(
            nir,
            swir,
            lambda values: (values - 1000.0) / 10000.0,
            quality_mask=quality,
        )

        self.assertAlmostEqual(ndmi[0, 0], 1.0 / 3.0)
        self.assertTrue(np.isnan(ndmi[0, 1]))
        self.assertTrue(np.isnan(ndmi[0, 2]))

    def test_active_summary_reports_ndmi_only_over_active_ndvi_pixels(self):
        ndvi = np.array([[0.4, 0.6, 0.2, np.nan]])
        ndmi = np.array([[0.2, 0.4, 0.9, 0.8]])
        summary = subject.summarize_active_area(
            ndvi, 0.0009, -28.75, relative_margin=0.15, ndmi=ndmi
        )

        self.assertEqual(summary["ndviMedio"], 0.5)
        self.assertEqual(summary.get("ndmiMedio"), 0.3)

    def test_workflow_keeps_vinchina_immediately_after_modis(self):
        workflow = (subject.ROOT / ".github" / "workflows" / "satelital.yml").read_text(
            encoding="utf-8"
        )

        self.assertIn(
            "          python -m unittest scripts/test_vinchina_ndvi.py\n"
            "          python scripts/modis_ndvi.py\n"
            "          python scripts/vinchina_ndvi.py\n",
            workflow,
        )

    def test_display_resize_keeps_binary_alpha_and_active_green(self):
        ndvi = np.array(
            [
                [np.nan, 0.6, 0.6],
                [np.nan, 0.6, 0.6],
                [np.nan, 0.6, 0.6],
            ]
        )

        display = subject.resize_colorized_for_display(ndvi, (12, 12))

        self.assertEqual(set(np.unique(display[..., 3])), {0, 200})
        self.assertEqual(display[-1, -1].tolist(), [26, 152, 80, 200])

    def test_scl_mask_allows_only_clear_land_classes(self):
        scl = np.arange(12, dtype=np.uint8)
        usable = subject.clear_land_mask(scl)

        self.assertEqual(
            usable.tolist(),
            [False, False, False, False, True, True, False, False,
             False, False, False, False],
        )
        self.assertEqual(subject.SCL_CLEAR_LAND_CLASSES, frozenset({4, 5}))
        self.assertEqual(
            subject.SCL_REJECTED_CLASSES,
            frozenset({0, 1, 2, 3, 6, 7, 8, 9, 10, 11}),
        )

    def test_quality_mask_excludes_otherwise_valid_ndvi_pixels(self):
        red = np.array([[3000.0, 3000.0]])
        nir = np.array([[5000.0, 5000.0]])
        quality = np.array([[True, False]])
        ndvi = subject.compute_ndvi(
            red,
            nir,
            to_reflectance=lambda values: (values - 1000.0) / 10000.0,
            quality_mask=quality,
        )

        self.assertTrue(np.isfinite(ndvi[0, 0]))
        self.assertTrue(np.isnan(ndvi[0, 1]))

    def test_scene_selection_rejects_low_coverage_and_uses_newest_passing_scene(self):
        items = [
            SimpleNamespace(id="newest", properties={"eo:cloud_cover": 4}),
            SimpleNamespace(id="passing", properties={"eo:cloud_cover": 12}),
            SimpleNamespace(id="older", properties={"eo:cloud_cover": 2}),
        ]
        coverages = {"newest": 0.94, "passing": 0.97, "older": 0.99}
        calls = []

        def loader(item):
            calls.append(item.id)
            return np.array([[0.4]]), coverages[item.id]

        selected, _, coverage = subject.select_scene_by_usable_coverage(
            items, loader, min_coverage=0.95, max_attempts=3, report=lambda _line: None
        )

        self.assertEqual(selected.id, "passing")
        self.assertEqual(coverage, 0.97)
        self.assertEqual(calls, ["newest", "passing"])

    def test_scene_selection_caps_attempts_and_fails_without_usable_scene(self):
        items = [
            SimpleNamespace(id=f"scene-{index}", properties={"eo:cloud_cover": index})
            for index in range(4)
        ]
        calls = []

        def loader(item):
            calls.append(item.id)
            return np.array([[0.4]]), 0.90

        with self.assertRaisesRegex(ValueError, "3"):
            subject.select_scene_by_usable_coverage(
                items,
                loader,
                min_coverage=0.95,
                max_attempts=3,
                report=lambda _line: None,
            )

        self.assertEqual(calls, ["scene-0", "scene-1", "scene-2"])

    def test_bbox_coverage_fraction_rejects_sliver_scenes(self):
        target = [-68.40, -28.90, -68.05, -28.60]

        full = subject.bbox_coverage_fraction(target, target)
        sliver = subject.bbox_coverage_fraction(
            [-68.40, -28.90, -68.33, -28.60], target
        )

        self.assertEqual(full, 1.0)
        self.assertAlmostEqual(sliver, 0.2)

    def test_compute_ndvi_applies_reflectance_conversion_and_masks_invalid_values(self):
        red = np.array([[3000.0, np.nan, 1000.0, 0.0, 900.0]])
        nir = np.array([[5000.0, 5000.0, 1000.0, 10000.0, 800.0]])

        ndvi = subject.compute_ndvi(
            red,
            nir,
            to_reflectance=lambda values: (values - 1000.0) / 10000.0,
        )

        self.assertAlmostEqual(ndvi[0, 0], 1.0 / 3.0)
        self.assertTrue(np.isnan(ndvi[0, 1]))
        self.assertTrue(np.isnan(ndvi[0, 2]))  # zero denominator
        self.assertTrue(np.isnan(ndvi[0, 3]))  # NDVI outside physical range
        self.assertTrue(np.isnan(ndvi[0, 4]))  # nonpositive reflectances

    def test_compute_ndvi_rejects_numerically_tiny_positive_denominator(self):
        red = np.array([[1000.000001]])
        nir = np.array([[1000.000002]])

        ndvi = subject.compute_ndvi(
            red,
            nir,
            to_reflectance=lambda values: (values - 1000.0) / 10000.0,
        )

        self.assertTrue(np.isnan(ndvi[0, 0]))

    def test_module_wording_explains_active_vegetation_ambiguity(self):
        wording = f"{subject.__doc__} {subject.ESTIMATE_QUALIFIER}".lower()

        self.assertIn("cultivated or natural", wording)
        self.assertIn("local validation", wording)
        self.assertIn("unvalidated heuristic scenario band", wording)
        self.assertIn("threshold sensitivity", wording)
        self.assertIn("field validation", wording)
        self.assertIn("monitored valle del bermejo window", wording)
        self.assertIn("does not cover the whole department", wording)
        self.assertIn("active-zone ndmi", wording)

    def test_area_summary_uses_native_analysis_resolution(self):
        analysis_resolution = subject.ANALYSIS_RES
        display_resolution = subject.DISPLAY_RES
        ndvi = np.full((10, 10), 0.5)
        latitude = -28.75

        summary = subject.summarize_active_area(
            ndvi, analysis_resolution, latitude, relative_margin=0
        )

        pixel_hectares = (
            111_320.0
            * 0.0001
            * math.cos(math.radians(latitude))
            * 110_574.0
            * 0.0001
            / 10_000.0
        )
        self.assertEqual(analysis_resolution, 0.0001)
        self.assertEqual(display_resolution, 0.0009)
        self.assertEqual(summary["haActivaMin"], round(100 * pixel_hectares))

    def test_active_summary_uses_ground_area_margin_and_active_only_mean(self):
        ndvi = np.array([[0.25, 0.30], [0.60, np.nan]])
        latitude = -28.75

        summary = subject.summarize_active_area(ndvi, 0.0009, latitude)

        pixel_ha = (
            111_320.0
            * 0.0009
            * math.cos(math.radians(latitude))
            * 110_574.0
            * 0.0009
            / 10_000.0
        )
        central = 2 * pixel_ha
        self.assertEqual(summary["haActivaMin"], round(central * 0.85))
        self.assertEqual(summary["haActivaMax"], round(central * 1.15))
        self.assertEqual(summary["ndviMedio"], 0.45)

    def test_active_summary_omits_mean_when_no_pixels_exceed_threshold(self):
        ndvi = np.array([[0.25, -0.1], [np.nan, 0.2]])
        summary = subject.summarize_active_area(
            ndvi, 0.0009, -28.75, ndmi=np.full(ndvi.shape, 0.8)
        )

        self.assertEqual(
            summary,
            {"haActivaMin": 0, "haActivaMax": 0},
        )
        self.assertNotIn("ndviMedio", summary)
        self.assertNotIn("ndmiMedio", summary)

    def test_zero_area_console_summary_does_not_require_active_mean(self):
        message = subject.format_active_area_summary(
            {"haActivaMin": 0, "haActivaMax": 0}
        )

        self.assertIn("active-pixel mean NDVI unavailable", message)
        self.assertIn("active-zone mean NDMI unavailable", message)
        self.assertIn("monitored Valle del Bermejo window", message)
        self.assertIn("not the whole department", message)
        self.assertNotIn("within the Vinchina department boundary", message)

    def test_data_output_contains_auditable_monitored_aoi_metadata(self):
        item = SimpleNamespace(
            id="scene / exact id",
            datetime=datetime(2026, 5, 24),
            properties={"eo:cloud_cover": 3.2},
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            png_path = root / "vinchina-ndvi.png"
            bounds_path = root / "vinchina-ndvi-bounds.json"
            data_path = root / "vinchina-satelital.json"
            with (
                patch.object(subject, "PNG_PATH", png_path),
                patch.object(subject, "BOUNDS_PATH", bounds_path),
                patch.object(subject, "DATA_PATH", data_path),
            ):
                subject._write_outputs_atomically(
                    np.array([[0.4]]),
                    item,
                    0.973,
                    {"haActivaMin": 10, "haActivaMax": 12, "ndviMedio": 0.4},
                )

            payload = json.loads(data_path.read_text(encoding="utf-8"))

        self.assertEqual(
            payload["alcance"],
            "Intersección del departamento Vinchina con la ventana monitoreada "
            "del Valle del Bermejo. No representa todo el departamento.",
        )
        self.assertEqual(payload["bbox"], subject.BBOX)
        self.assertEqual(payload["sceneId"], item.id)
        self.assertEqual(payload["coberturaValidaPct"], 97.3)
        self.assertEqual(
            payload["sceneUrl"],
            "https://planetarycomputer.microsoft.com/api/stac/v1/collections/"
            "sentinel-2-l2a/items/scene%20%2F%20exact%20id",
        )

    def test_active_mean_is_omitted_when_published_area_rounds_to_zero(self):
        summary = subject.summarize_active_area(
            np.array([[0.5]]),
            subject.ANALYSIS_RES,
            -28.75,
            relative_margin=0,
        )

        self.assertEqual(summary["haActivaMax"], 0)
        self.assertNotIn("ndviMedio", summary)

    def test_color_ramp_interpolates_stops_and_colors_top_values_green(self):
        ndvi = np.array([[-0.2, 0.0, 0.2, 0.4, 0.6, 0.9, np.nan, 1.1]])

        rgba = subject.colorize_ndvi(ndvi)

        self.assertEqual(rgba[0, 0].tolist(), [215, 48, 39, 200])
        self.assertEqual(rgba[0, 1].tolist(), [234, 136, 89, 200])
        self.assertEqual(rgba[0, 2].tolist(), [254, 224, 139, 200])
        self.assertEqual(rgba[0, 3].tolist(), [140, 188, 110, 200])
        self.assertEqual(rgba[0, 4].tolist(), [26, 152, 80, 200])
        self.assertEqual(rgba[0, 5].tolist(), [26, 152, 80, 200])
        self.assertEqual(rgba[0, 6].tolist(), [0, 0, 0, 0])
        self.assertEqual(rgba[0, 7].tolist(), [0, 0, 0, 0])


if __name__ == "__main__":
    unittest.main()
