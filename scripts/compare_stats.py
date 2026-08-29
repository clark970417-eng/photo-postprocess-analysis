#!/usr/bin/env python3
"""Compare deterministic support metrics for an original and edited photograph.

This does not register pixels or prove edit settings. It reports directional
changes that help constrain a visual before/after analysis.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from image_stats import analyze


def subtract(after: float, before: float) -> float:
    return round(after - before, 5)


def optional_subtract(after: float | None, before: float | None) -> float | None:
    return None if after is None or before is None else subtract(after, before)


def compare(before_path: Path, after_path: Path, max_dimension: int) -> dict:
    before = analyze(before_path.resolve(), max_dimension)
    after = analyze(after_path.resolve(), max_dimension)
    before_ratio = before["original_dimensions"]["width"] / before["original_dimensions"]["height"]
    after_ratio = after["original_dimensions"]["width"] / after["original_dimensions"]["height"]
    aspect_delta_pct = 100 * abs(after_ratio - before_ratio) / max(before_ratio, 0.000001)

    percentile_delta = {
        key: after["channels"]["luma"]["percentiles"][key] - before["channels"]["luma"]["percentiles"][key]
        for key in before["channels"]["luma"]["percentiles"]
    }
    hue_delta = {
        key: subtract(after["hue_family_share_pct_of_chromatic_pixels"][key], before["hue_family_share_pct_of_chromatic_pixels"][key])
        for key in before["hue_family_share_pct_of_chromatic_pixels"]
    }
    zone_luma_delta = {
        key: optional_subtract(after["spatial_grid_3x3"][key]["mean_luma"], before["spatial_grid_3x3"][key]["mean_luma"])
        for key in before["spatial_grid_3x3"]
    }
    warnings = []
    if aspect_delta_pct > 1:
        warnings.append("Aspect ratios differ by more than 1%; crop or geometry changes limit spatial comparison.")
    if before["original_dimensions"] != after["original_dimensions"]:
        warnings.append("Pixel dimensions differ; detail and compression metrics are not directly comparable.")
    if before["source_properties"]["filename_mentions_screenshot"] or after["source_properties"]["filename_mentions_screenshot"]:
        warnings.append("At least one source is named as a screenshot; display rendering may be included in the difference.")

    return {
        "before": str(before_path.resolve()),
        "after": str(after_path.resolve()),
        "comparison_compatibility": {
            "aspect_ratio_delta_pct": round(aspect_delta_pct, 5),
            "same_pixel_dimensions": before["original_dimensions"] == after["original_dimensions"],
            "warnings": warnings,
        },
        "directional_deltas_after_minus_before": {
            "luma_percentiles": percentile_delta,
            "mean_luma": subtract(after["channels"]["luma"]["mean"], before["channels"]["luma"]["mean"]),
            "mean_saturation": subtract(after["channels"]["saturation"]["mean"], before["channels"]["saturation"]["mean"]),
            "luma_shadow_clipping_pct": subtract(after["clipping_pct"]["luma_shadow_le_2"], before["clipping_pct"]["luma_shadow_le_2"]),
            "luma_highlight_clipping_pct": subtract(after["clipping_pct"]["luma_highlight_ge_253"], before["clipping_pct"]["luma_highlight_ge_253"]),
            "hue_family_share_percentage_points": hue_delta,
            "spatial_grid_mean_luma": zone_luma_delta,
            "multiscale_luma_contrast": {
                key: subtract(after["multiscale_luma_contrast"][key], before["multiscale_luma_contrast"][key])
                for key in ("radius_1", "radius_4", "radius_16")
            },
        },
        "interpretation_limits": [
            "Deltas describe final rendered pixels and can include crop, lighting, camera rendering, resizing, and compression.",
            "A positive hue-family delta may come from changed subject coverage, not an HSL edit.",
            "Use registered matching regions before making high-confidence local-edit claims.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--max-dimension", type=int, default=768)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()
    try:
        for path in (args.before, args.after):
            if not path.is_file():
                raise FileNotFoundError(f"image not found: {path}")
        if args.max_dimension < 32:
            raise ValueError("--max-dimension must be at least 32")
        result = compare(args.before, args.after, args.max_dimension)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=None if args.compact else 2))
        return 0
    except Exception as exc:
        print(f"compare_stats: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
