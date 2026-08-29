#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ATTRS = ("direction", "magnitude", "scope")


def load_jsonl(path: Path, *, predictions: bool) -> dict[str, dict]:
    records: dict[str, dict] = {}
    with path.open(encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no}: invalid JSON: {exc.msg}") from exc
            sample_id = record.get("id")
            claims = record.get("claims")
            if not isinstance(sample_id, str) or not sample_id:
                raise ValueError(f"{path}:{line_no}: id must be a non-empty string")
            if sample_id in records:
                raise ValueError(f"{path}:{line_no}: duplicate id {sample_id!r}")
            if not isinstance(claims, list):
                raise ValueError(f"{path}:{line_no}: claims must be a list")
            by_family = {}
            for claim in claims:
                if not isinstance(claim, dict) or not isinstance(claim.get("family"), str):
                    raise ValueError(f"{path}:{line_no}: every claim needs a string family")
                family = claim["family"]
                if family in by_family:
                    raise ValueError(f"{path}:{line_no}: duplicate family {family!r}")
                if predictions:
                    confidence = claim.get("confidence")
                    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
                        raise ValueError(f"{path}:{line_no}: prediction confidence must be numeric")
                    if not 0 <= confidence <= 1:
                        raise ValueError(f"{path}:{line_no}: confidence must be between 0 and 1")
                by_family[family] = claim
            records[sample_id] = by_family
    return records


def safe_ratio(numerator: int | float, denominator: int | float) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def score(truth: dict[str, dict], predictions: dict[str, dict]) -> dict:
    missing_ids = sorted(set(truth) - set(predictions))
    extra_ids = sorted(set(predictions) - set(truth))
    tp = fp = fn = 0
    attr_hits = defaultdict(int)
    attr_totals = defaultdict(int)
    exact_hits = 0
    predicted_claims = 0
    brier_sum = 0.0
    bins = [{"count": 0, "confidence_sum": 0.0, "correct": 0} for _ in range(5)]
    high_confidence_errors = []

    for sample_id in sorted(set(truth) | set(predictions)):
        expected = truth.get(sample_id, {})
        actual = predictions.get(sample_id, {})
        expected_families = set(expected)
        actual_families = set(actual)
        matched = expected_families & actual_families
        tp += len(matched)
        fp += len(actual_families - expected_families)
        fn += len(expected_families - actual_families)

        for family in sorted(actual_families):
            prediction = actual[family]
            predicted_claims += 1
            is_exact = family in expected
            if is_exact:
                target = expected[family]
                for attr in ATTRS:
                    predicted_value = prediction.get(attr, "unknown")
                    target_value = target.get(attr, "unknown")
                    if target_value != "unknown" and predicted_value != "unknown":
                        attr_totals[attr] += 1
                        if predicted_value == target_value:
                            attr_hits[attr] += 1
                    if target_value != "unknown" and predicted_value != target_value:
                        is_exact = False
                    elif target_value == "unknown" and predicted_value != "unknown":
                        is_exact = False
            confidence = float(prediction["confidence"])
            outcome = 1 if is_exact else 0
            exact_hits += outcome
            brier_sum += (confidence - outcome) ** 2
            bin_index = min(int(confidence * 5), 4)
            bins[bin_index]["count"] += 1
            bins[bin_index]["confidence_sum"] += confidence
            bins[bin_index]["correct"] += outcome
            if confidence >= 0.8 and not is_exact:
                high_confidence_errors.append({
                    "id": sample_id,
                    "family": family,
                    "confidence": round(confidence, 4),
                })

    precision = safe_ratio(tp, tp + fp)
    recall = safe_ratio(tp, tp + fn)
    f1 = None
    if precision is not None and recall is not None and precision + recall:
        f1 = round(2 * precision * recall / (precision + recall), 4)

    calibration_bins = []
    ece = 0.0
    for index, bucket in enumerate(bins):
        count = bucket["count"]
        accuracy = safe_ratio(bucket["correct"], count)
        mean_confidence = safe_ratio(bucket["confidence_sum"], count)
        if count and accuracy is not None and mean_confidence is not None and predicted_claims:
            ece += count / predicted_claims * abs(accuracy - mean_confidence)
        calibration_bins.append({
            "range": f"{index / 5:.1f}-{(index + 1) / 5:.1f}",
            "count": count,
            "mean_confidence": mean_confidence,
            "accuracy": accuracy,
        })

    return {
        "samples": {"truth": len(truth), "predictions": len(predictions)},
        "id_coverage": {"missing_prediction_ids": missing_ids, "extra_prediction_ids": extra_ids},
        "family_detection": {
            "true_positive": tp,
            "false_positive": fp,
            "false_negative": fn,
            "precision": precision,
            "recall": recall,
            "f1": f1,
        },
        "matched_attribute_accuracy": {
            attr: {"correct": attr_hits[attr], "scored": attr_totals[attr], "accuracy": safe_ratio(attr_hits[attr], attr_totals[attr])}
            for attr in ATTRS
        },
        "predicted_claim_exact_accuracy": safe_ratio(exact_hits, predicted_claims),
        "calibration": {
            "brier_score": round(brier_sum / predicted_claims, 4) if predicted_claims else None,
            "expected_calibration_error_5_bins": round(ece, 4) if predicted_claims else None,
            "bins": calibration_bins,
            "high_confidence_errors": high_confidence_errors,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Score blind photo-edit claims and confidence calibration.")
    parser.add_argument("ground_truth", type=Path)
    parser.add_argument("predictions", type=Path)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()
    try:
        truth = load_jsonl(args.ground_truth, predictions=False)
        predictions = load_jsonl(args.predictions, predictions=True)
        result = score(truth, predictions)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=None if args.compact else 2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
