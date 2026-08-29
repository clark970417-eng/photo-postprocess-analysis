#!/usr/bin/env python3
from __future__ import annotations

import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("image_stats.py")
COMPARE_SCRIPT = Path(__file__).with_name("compare_stats.py")
PORTFOLIO_SCRIPT = Path(__file__).with_name("portfolio_stats.py")


def write_bmp(path: Path) -> None:
    width = height = 4
    pixels = [
        [(0, 0, 0), (255, 255, 255), (255, 0, 0), (0, 255, 0)],
        [(0, 0, 255), (128, 128, 128), (255, 255, 0), (0, 255, 255)],
        [(255, 0, 255), (32, 32, 32), (224, 224, 224), (90, 120, 150)],
        [(4, 8, 12), (250, 248, 246), (60, 20, 10), (20, 60, 10)],
    ]
    stride = ((width * 3 + 3) // 4) * 4
    body = bytearray()
    for row in reversed(pixels):
        raw = bytearray()
        for r, g, b in row:
            raw.extend((b, g, r))
        raw.extend(b"\0" * (stride - len(raw)))
        body.extend(raw)
    offset = 54
    header = struct.pack("<2sIHHI", b"BM", offset + len(body), 0, 0, offset)
    dib = struct.pack("<IiiHHIIiiII", 40, width, height, 1, 24, 0, len(body), 2835, 2835, 0, 0)
    path.write_bytes(header + dib + body)


def write_bmp32_bitfields(path: Path) -> None:
    width = height = 2
    rows = [
        [(255, 0, 0, 255), (0, 255, 0, 255)],
        [(0, 0, 255, 255), (255, 255, 255, 255)],
    ]
    body = bytearray()
    for row in reversed(rows):
        for r, g, b, a in row:
            body.extend((b, g, r, a))
    masks = struct.pack("<IIII", 0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000)
    offset = 14 + 40 + len(masks)
    header = struct.pack("<2sIHHI", b"BM", offset + len(body), 0, 0, offset)
    dib = struct.pack("<IiiHHIIiiII", 40, width, height, 1, 32, 3, len(body), 2835, 2835, 0, 0)
    path.write_bytes(header + dib + masks + body)


class ImageStatsTests(unittest.TestCase):
    def run_stats(self, path: Path):
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(path), "--compact"],
            capture_output=True,
            text=True,
        )

    def test_deterministic_schema_and_ranges(self):
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "fixture.bmp"
            write_bmp(image)
            first = self.run_stats(image)
            second = self.run_stats(image)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(first.stdout, second.stdout)
            payload = json.loads(first.stdout)
            self.assertEqual(payload["original_dimensions"], {"height": 4, "width": 4})
            self.assertEqual(payload["pixel_count"], 16)
            self.assertIn("luma_shadow_le_2", payload["clipping_pct"])
            self.assertEqual(payload["source_properties"]["container"], "bmp")
            self.assertEqual(len(payload["spatial_grid_3x3"]), 9)
            self.assertIn("midtones", payload["low_saturation_neutral_candidates"])
            self.assertGreater(payload["usable_luma_span"]["p01_to_p99"], 0)
            hue_total = sum(payload["hue_family_share_pct_of_chromatic_pixels"].values())
            self.assertAlmostEqual(hue_total, 100, places=2)
            edge = payload["edge_support_metric"]["mean_neighbor_luma_delta_0_to_1"]
            self.assertGreaterEqual(edge, 0)
            self.assertLessEqual(edge, 1)
            for value in payload["multiscale_luma_contrast"].values():
                if isinstance(value, float):
                    self.assertGreaterEqual(value, 0)
                    self.assertLessEqual(value, 1)

    def test_missing_file_fails_cleanly(self):
        missing = self.run_stats(Path("/definitely/missing/photo.jpg"))
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("image not found", missing.stderr)

    def test_32bit_bitfields_bmp(self):
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "fixture32.bmp"
            write_bmp32_bitfields(image)
            result = self.run_stats(image)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["pixel_count"], 4)

    def test_identical_comparison_has_zero_primary_deltas(self):
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "fixture.bmp"
            write_bmp(image)
            result = subprocess.run(
                [sys.executable, str(COMPARE_SCRIPT), str(image), str(image), "--compact"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            delta = payload["directional_deltas_after_minus_before"]
            self.assertEqual(delta["mean_luma"], 0)
            self.assertEqual(delta["mean_saturation"], 0)
            self.assertTrue(all(value == 0 for value in delta["luma_percentiles"].values()))

    def test_portfolio_summary_for_identical_images_has_zero_iqr(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / "first.bmp"
            second = Path(tmp) / "second.bmp"
            write_bmp(first)
            write_bmp(second)
            result = subprocess.run(
                [sys.executable, str(PORTFOLIO_SCRIPT), str(first), str(second), "--compact"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["image_count"], 2)
            self.assertEqual(payload["corpus_summary"]["luma.mean"]["iqr"], 0)


if __name__ == "__main__":
    unittest.main()
