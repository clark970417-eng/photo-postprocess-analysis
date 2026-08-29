#!/usr/bin/env python3
"""Deterministic support metrics for finished-photo post-process analysis.

Uses Pillow when available. On macOS it falls back to `sips`, converts a
bounded-size copy to uncompressed BMP, and parses it with the standard library.
The metrics support visual inspection; they do not identify exact edit settings.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable, Iterator

PERCENTILES = (1, 5, 25, 50, 75, 95, 99)
HUE_FAMILIES = (
    ("red", 345, 15), ("orange", 15, 45), ("yellow", 45, 75),
    ("green", 75, 165), ("cyan", 165, 195), ("blue", 195, 255),
    ("purple", 255, 285), ("magenta", 285, 345),
)


def container_type(path: Path) -> str:
    with path.open("rb") as source:
        head = source.read(16)
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith((b"II*\x00", b"MM\x00*")):
        return "tiff"
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return "webp"
    if head.startswith(b"BM"):
        return "bmp"
    return path.suffix.lower().lstrip(".") or "unknown"


def hue_degrees(r: int, g: int, b: int) -> float:
    high, low = max(r, g, b), min(r, g, b)
    delta = high - low
    if not delta:
        return 0.0
    if high == r:
        hue = 60 * (((g - b) / delta) % 6)
    elif high == g:
        hue = 60 * (((b - r) / delta) + 2)
    else:
        hue = 60 * (((r - g) / delta) + 4)
    return hue % 360


def hue_family(hue: float) -> str:
    for name, start, end in HUE_FAMILIES:
        if start > end:
            if hue >= start or hue < end:
                return name
        elif start <= hue < end:
            return name
    return "red"


def percentile(hist: list[int], pct: int, total: int) -> int:
    target = max(1, (total * pct + 99) // 100)
    seen = 0
    for value, count in enumerate(hist):
        seen += count
        if seen >= target:
            return value
    return 255


def pct_map(hist: list[int], total: int) -> dict[str, int]:
    return {str(p): percentile(hist, p, total) for p in PERCENTILES}


def bmp_pixels(path: Path) -> tuple[int, int, Iterator[tuple[int, int, int]]]:
    data = path.read_bytes()
    if data[:2] != b"BM" or len(data) < 54:
        raise ValueError("unsupported BMP output")
    pixel_offset = struct.unpack_from("<I", data, 10)[0]
    dib_size = struct.unpack_from("<I", data, 14)[0]
    if dib_size < 40:
        raise ValueError("unsupported BMP header")
    width = struct.unpack_from("<i", data, 18)[0]
    signed_height = struct.unpack_from("<i", data, 22)[0]
    planes, bpp = struct.unpack_from("<HH", data, 26)
    compression = struct.unpack_from("<I", data, 30)[0]
    valid_compression = compression == 0 or (bpp == 32 and compression == 3)
    if width <= 0 or signed_height == 0 or planes != 1 or bpp not in (24, 32) or not valid_compression:
        raise ValueError("unsupported BMP pixel format")
    height = abs(signed_height)
    top_down = signed_height < 0
    bytes_per_pixel = bpp // 8
    stride = ((width * bytes_per_pixel + 3) // 4) * 4

    def iterator() -> Iterator[tuple[int, int, int]]:
        rows: Iterable[int] = range(height) if top_down else range(height - 1, -1, -1)
        for y in rows:
            row = pixel_offset + y * stride
            for x in range(width):
                i = row + x * bytes_per_pixel
                b, g, r = data[i : i + 3]
                yield r, g, b

    return width, height, iterator()


def pillow_pixels(path: Path, max_dimension: int):
    try:
        from PIL import Image
    except ImportError:
        return None
    with Image.open(path) as im:
        original = im.size
        rgb = im.convert("RGB")
        if max(rgb.size) > max_dimension:
            resampling = getattr(Image, "Resampling", Image).BOX
            rgb.thumbnail((max_dimension, max_dimension), resampling)
        width, height = rgb.size
        pixels = list(rgb.getdata())
    return original, (width, height), iter(pixels), "pillow"


def sips_pixels(path: Path, max_dimension: int):
    sips = shutil.which("sips")
    if not sips:
        raise RuntimeError("Pillow is unavailable and the macOS 'sips' fallback was not found")
    query = subprocess.run(
        [sips, "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    width_match = re.search(r"pixelWidth:\s*(\d+)", query)
    height_match = re.search(r"pixelHeight:\s*(\d+)", query)
    if not width_match or not height_match:
        raise RuntimeError("could not read source dimensions")
    original = (int(width_match.group(1)), int(height_match.group(1)))
    with tempfile.TemporaryDirectory(prefix="photo-stats-") as tmp:
        bmp = Path(tmp) / "decoded.bmp"
        resize_args = ["-Z", str(max_dimension)] if max(original) > max_dimension else []
        subprocess.run(
            [sips, *resize_args, "-s", "format", "bmp", str(path), "--out", str(bmp)],
            check=True,
            capture_output=True,
            text=True,
        )
        width, height, pixels = bmp_pixels(bmp)
        materialized = list(pixels)
    return original, (width, height), iter(materialized), "sips-bmp"


def analyze(path: Path, max_dimension: int) -> dict:
    decoded = pillow_pixels(path, max_dimension)
    if decoded is None:
        decoded = sips_pixels(path, max_dimension)
    original, analyzed, pixels, decoder = decoded
    pixels = list(pixels)
    width, height = analyzed
    total = width * height
    if total <= 0:
        raise ValueError("image contains no pixels")

    hists = {key: [0] * 256 for key in ("r", "g", "b", "luma", "saturation")}
    sums = {key: 0 for key in ("r", "g", "b")}
    shadow_sum = [0, 0, 0]
    highlight_sum = [0, 0, 0]
    shadow_count = highlight_count = 0
    edge_sum = edge_count = edge_tail = 0
    previous_row = [0] * width
    luma_values = bytearray(total)
    tonal_counts = {key: 0 for key in ("deep_shadows_0_31", "shadows_32_63", "lower_midtones_64_127", "upper_midtones_128_191", "highlights_192_223", "bright_highlights_224_247", "near_white_248_255")}
    neutral = {name: {"sum": [0, 0, 0], "count": 0} for name in ("shadows", "midtones", "highlights")}
    hue_counts = {name: 0 for name, _, _ in HUE_FAMILIES}
    chromatic_count = 0
    zones = [{"rgb": [0, 0, 0], "luma": 0, "saturation": 0, "count": 0} for _ in range(9)]
    jpeg_boundary_sum = jpeg_boundary_count = jpeg_internal_sum = jpeg_internal_count = 0

    for index, (r, g, b) in enumerate(pixels):
        x = index % width
        y = index // width
        luma = (54 * r + 183 * g + 19 * b + 128) >> 8
        high = max(r, g, b)
        low = min(r, g, b)
        saturation = 0 if high == 0 else ((high - low) * 255 + high // 2) // high
        luma_values[index] = luma
        for key, value in (("r", r), ("g", g), ("b", b), ("luma", luma), ("saturation", saturation)):
            hists[key][value] += 1
        sums["r"] += r
        sums["g"] += g
        sums["b"] += b
        if luma <= 63:
            shadow_count += 1
            shadow_sum[0] += r
            shadow_sum[1] += g
            shadow_sum[2] += b
        if luma >= 192:
            highlight_count += 1
            highlight_sum[0] += r
            highlight_sum[1] += g
            highlight_sum[2] += b
        if luma <= 31:
            tonal_counts["deep_shadows_0_31"] += 1
        elif luma <= 63:
            tonal_counts["shadows_32_63"] += 1
        elif luma <= 127:
            tonal_counts["lower_midtones_64_127"] += 1
        elif luma <= 191:
            tonal_counts["upper_midtones_128_191"] += 1
        elif luma <= 223:
            tonal_counts["highlights_192_223"] += 1
        elif luma <= 247:
            tonal_counts["bright_highlights_224_247"] += 1
        else:
            tonal_counts["near_white_248_255"] += 1
        if saturation <= 20 and 16 <= luma <= 247:
            region = "shadows" if luma <= 79 else "midtones" if luma <= 191 else "highlights"
            neutral[region]["count"] += 1
            for channel, value in enumerate((r, g, b)):
                neutral[region]["sum"][channel] += value
        if saturation >= 40 and 12 <= luma <= 247:
            hue_counts[hue_family(hue_degrees(r, g, b))] += 1
            chromatic_count += 1
        zone_index = min(2, y * 3 // height) * 3 + min(2, x * 3 // width)
        zone = zones[zone_index]
        zone["count"] += 1
        zone["luma"] += luma
        zone["saturation"] += saturation
        zone["rgb"][0] += r
        zone["rgb"][1] += g
        zone["rgb"][2] += b
        if x:
            diff = abs(luma - left_luma)
            edge_sum += diff
            edge_count += 1
            edge_tail += diff >= 32
            if x % 8 == 0:
                jpeg_boundary_sum += diff
                jpeg_boundary_count += 1
            else:
                jpeg_internal_sum += diff
                jpeg_internal_count += 1
        if y:
            diff = abs(luma - previous_row[x])
            edge_sum += diff
            edge_count += 1
            edge_tail += diff >= 32
            if y % 8 == 0:
                jpeg_boundary_sum += diff
                jpeg_boundary_count += 1
            else:
                jpeg_internal_sum += diff
                jpeg_internal_count += 1
        previous_row[x] = luma
        left_luma = luma

    def mean_rgb(values: list[int], count: int):
        return None if not count else [round(value / count, 3) for value in values]

    channels = {}
    for key in ("r", "g", "b", "luma", "saturation"):
        channels[key] = {
            "percentiles": pct_map(hists[key], total),
            "mean": round((sum(i * n for i, n in enumerate(hists[key])) / total), 3),
        }

    def multiscale_delta(scale: int) -> float:
        stride = max(1, scale // 2)
        delta_sum = count = 0
        for y in range(0, height, stride):
            row = y * width
            for x in range(0, width, stride):
                value = luma_values[row + x]
                if x + scale < width:
                    delta_sum += abs(value - luma_values[row + x + scale])
                    count += 1
                if y + scale < height:
                    delta_sum += abs(value - luma_values[row + x + scale * width])
                    count += 1
        return round(delta_sum / max(1, count) / 255, 6)

    neutral_output = {}
    for name, values in neutral.items():
        count = int(values["count"])
        neutral_output[name] = {
            "pixel_pct": round(100 * count / total, 5),
            "mean_rgb": mean_rgb(values["sum"], count),
        }

    zone_output = {}
    zone_names = ("top_left", "top_center", "top_right", "middle_left", "center", "middle_right", "bottom_left", "bottom_center", "bottom_right")
    for name, values in zip(zone_names, zones):
        count = int(values["count"])
        zone_output[name] = {
            "mean_luma": None if not count else round(values["luma"] / count, 3),
            "mean_saturation": None if not count else round(values["saturation"] / count, 3),
            "mean_rgb": mean_rgb(values["rgb"], count),
        }

    jpeg_boundary_mean = jpeg_boundary_sum / max(1, jpeg_boundary_count)
    jpeg_internal_mean = jpeg_internal_sum / max(1, jpeg_internal_count)
    source_container = container_type(path)
    resized = tuple(original) != tuple(analyzed)

    return {
        "source": str(path),
        "source_properties": {
            "container": source_container,
            "file_size_bytes": path.stat().st_size,
            "resized_for_analysis": resized,
            "filename_mentions_screenshot": bool(re.search(r"screen(?:shot|capture)", path.name, re.I)),
        },
        "decoder": decoder,
        "original_dimensions": {"width": original[0], "height": original[1]},
        "analyzed_dimensions": {"width": width, "height": height},
        "pixel_count": total,
        "channels": channels,
        "tonal_distribution_pct": {key: round(100 * value / total, 5) for key, value in tonal_counts.items()},
        "usable_luma_span": {
            "p01_to_p99": channels["luma"]["percentiles"]["99"] - channels["luma"]["percentiles"]["1"],
            "p05_to_p95": channels["luma"]["percentiles"]["95"] - channels["luma"]["percentiles"]["5"],
        },
        "clipping_pct": {
            "luma_shadow_le_2": round(100 * sum(hists["luma"][:3]) / total, 5),
            "luma_highlight_ge_253": round(100 * sum(hists["luma"][253:]) / total, 5),
            "r_shadow_le_2": round(100 * sum(hists["r"][:3]) / total, 5),
            "g_shadow_le_2": round(100 * sum(hists["g"][:3]) / total, 5),
            "b_shadow_le_2": round(100 * sum(hists["b"][:3]) / total, 5),
            "r_highlight_ge_253": round(100 * sum(hists["r"][253:]) / total, 5),
            "g_highlight_ge_253": round(100 * sum(hists["g"][253:]) / total, 5),
            "b_highlight_ge_253": round(100 * sum(hists["b"][253:]) / total, 5),
        },
        "tonal_region_mean_rgb": {
            "shadows_luma_le_63": mean_rgb(shadow_sum, shadow_count),
            "highlights_luma_ge_192": mean_rgb(highlight_sum, highlight_count),
        },
        "low_saturation_neutral_candidates": neutral_output,
        "hue_family_share_pct_of_chromatic_pixels": {
            key: round(100 * value / max(1, chromatic_count), 4) for key, value in hue_counts.items()
        },
        "spatial_grid_3x3": zone_output,
        "channel_mean_imbalance": {
            "r_minus_g": round((sums["r"] - sums["g"]) / total, 3),
            "b_minus_g": round((sums["b"] - sums["g"]) / total, 3),
        },
        "edge_support_metric": {
            "mean_neighbor_luma_delta_0_to_1": round(edge_sum / max(1, edge_count) / 255, 6),
            "neighbor_delta_ge_32_pct": round(100 * edge_tail / max(1, edge_count), 5),
            "limitation": "Scene content, resize, sharpening, blur, noise, and compression all affect this metric.",
        },
        "multiscale_luma_contrast": {
            "radius_1": multiscale_delta(1),
            "radius_4": multiscale_delta(4),
            "radius_16": multiscale_delta(16),
            "limitation": "Subject matter and focus distance affect every scale; compare scales within similar content or against an original.",
        },
        "jpeg_8px_block_support": {
            "eligible": source_container == "jpeg" and not resized,
            "boundary_to_internal_delta_ratio": round(jpeg_boundary_mean / max(0.000001, jpeg_internal_mean), 5),
            "limitation": "Only interpret for a non-resized JPEG; texture, architecture, and prior resampling can mimic block boundaries.",
        },
        "limitations": [
            "Whole-image and neutral-candidate color statistics do not directly recover white balance or color grading.",
            "A flattened image cannot identify an exact preset, plugin, layer stack, or slider value.",
            "Metrics are computed on a bounded decoded copy and must be interpreted with visual inspection.",
            "Hue families are descriptive image-content measurements, not proof of an HSL adjustment.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--max-dimension", type=int, default=768)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()
    try:
        if args.max_dimension < 32:
            raise ValueError("--max-dimension must be at least 32")
        if not args.image.is_file():
            raise FileNotFoundError(f"image not found: {args.image}")
        result = analyze(args.image.resolve(), args.max_dimension)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=None if args.compact else 2))
        return 0
    except Exception as exc:
        print(f"image_stats: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
