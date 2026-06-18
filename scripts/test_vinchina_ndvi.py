import math
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vinchina_ndvi as subject


class VinchinaNdviTests(unittest.TestCase):
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

    def test_active_summary_returns_zero_mean_when_no_pixels_exceed_threshold(self):
        summary = subject.summarize_active_area(
            np.array([[0.25, -0.1], [np.nan, 0.2]]), 0.0009, -28.75
        )

        self.assertEqual(
            summary,
            {"haActivaMin": 0, "haActivaMax": 0, "ndviMedio": 0},
        )

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
