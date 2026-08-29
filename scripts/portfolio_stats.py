#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

from image_stats import analyze


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def summarize(values: list[float]) -> dict:
    q1 = percentile(values, 0.25)
    q3 = percentile(values, 0.75)
    return {
        "median": round(statistics.median(values), 5),
        "q1": round(q1, 5),
        "q3": round(q3, 5),
        "iqr": round(q3 - q1, 5),
        "min": round(min(values), 5),
        "max": round(max(values), 5),
    }


def extract(stats: dict) -> dict[str, float]:
    channels = stats["channels"]
    contrast = stats["multiscale_luma_contrast"]
    clipping = stats["clipping_pct"]
    imbalance = stats["channel_mean_imbalance"]
    output = {
        "luma.mean": channels["luma"]["mean"],
        "luma.p05": channels["luma"]["percentiles"]["5"],
        "luma.p50": channels["luma"]["percentiles"]["50"],
        "luma.p95": channels["luma"]["percentiles"]["95"],
        "saturation.mean": channels["saturation"]["mean"],
        "channel.r_minus_g": imbalance["r_minus_g"],
        "channel.b_minus_g": imbalance["b_minus_g"],
        "contrast.radius_1": contrast["radius_1"],
        "contrast.radius_4": contrast["radius_4"],
        "contrast.radius_16": contrast["radius_16"],
        "clipping.shadow": clipping["luma_shadow_le_2"],
        "clipping.highlight": clipping["luma_highlight_ge_253"],
    }
    for family, share in stats["hue_family_share_pct_of_chromatic_pixels"].items():
        output[f"hue_share.{family}"] = share
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize rendered statistics across an author's photo sample.")
    parser.add_argument("images", nargs="+", type=Path)
    parser.add_argument("--max-dimension", type=int, default=768)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()
    try:
        if args.max_dimension < 32:
            raise ValueError("--max-dimension must be at least 32")
        resolved = [path.resolve() for path in args.images]
        missing = [str(path) for path in resolved if not path.is_file()]
        if missing:
            raise FileNotFoundError("image not found: " + ", ".join(missing))
        results = [analyze(path, args.max_dimension) for path in resolved]
        compact_rows = [{"source": item["source"], **extract(item)} for item in results]
        metric_names = [key for key in compact_rows[0] if key != "source"]
        summary = {
            name: summarize([float(row[name]) for row in compact_rows])
            for name in metric_names
        }
        payload = {
            "image_count": len(results),
            "per_image": compact_rows,
            "corpus_summary": summary,
            "limitations": [
                "Scene content, lighting, camera rendering, and platform processing affect every metric.",
                "Low cross-image variance is not proof of a recurring edit; confirm across materially different contexts.",
                "Near-duplicates should count as one visual case when assigning author-level confidence.",
            ],
        }
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=None if args.compact else 2))
        return 0
    except Exception as exc:
        print(f"portfolio_stats: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
