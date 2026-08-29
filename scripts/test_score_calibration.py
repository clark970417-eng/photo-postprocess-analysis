#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("score_calibration.py")


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.write_text("".join(json.dumps(record) + "\n" for record in records), encoding="utf-8")


class CalibrationScorerTests(unittest.TestCase):
    def run_score(self, truth: list[dict], predictions: list[dict]):
        with tempfile.TemporaryDirectory() as tmp:
            truth_path = Path(tmp) / "truth.jsonl"
            predictions_path = Path(tmp) / "predictions.jsonl"
            write_jsonl(truth_path, truth)
            write_jsonl(predictions_path, predictions)
            result = subprocess.run(
                [sys.executable, str(SCRIPT), str(truth_path), str(predictions_path), "--compact"],
                capture_output=True,
                text=True,
            )
            return result

    def test_perfect_predictions(self):
        truth = [{"id": "a", "claims": [{"family": "tone.exposure", "direction": "increase", "magnitude": "moderate", "scope": "global"}]}]
        predictions = [{"id": "a", "claims": [{"family": "tone.exposure", "direction": "increase", "magnitude": "moderate", "scope": "global", "confidence": 1.0}]}]
        result = self.run_score(truth, predictions)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["family_detection"]["f1"], 1.0)
        self.assertEqual(payload["predicted_claim_exact_accuracy"], 1.0)
        self.assertEqual(payload["calibration"]["brier_score"], 0.0)

    def test_wrong_attribute_is_calibration_error(self):
        truth = [{"id": "a", "claims": [{"family": "tone.exposure", "direction": "increase", "magnitude": "moderate", "scope": "global"}]}]
        predictions = [{"id": "a", "claims": [{"family": "tone.exposure", "direction": "decrease", "magnitude": "moderate", "scope": "global", "confidence": 0.9}]}]
        payload = json.loads(self.run_score(truth, predictions).stdout)
        self.assertEqual(payload["family_detection"]["precision"], 1.0)
        self.assertEqual(payload["matched_attribute_accuracy"]["direction"]["accuracy"], 0.0)
        self.assertEqual(len(payload["calibration"]["high_confidence_errors"]), 1)

    def test_unknown_prediction_does_not_count_as_exact(self):
        truth = [{"id": "a", "claims": [{"family": "tone.exposure", "direction": "increase", "magnitude": "moderate", "scope": "global"}]}]
        predictions = [{"id": "a", "claims": [{"family": "tone.exposure", "direction": "unknown", "magnitude": "moderate", "scope": "global", "confidence": 0.8}]}]
        payload = json.loads(self.run_score(truth, predictions).stdout)
        self.assertEqual(payload["predicted_claim_exact_accuracy"], 0.0)
        self.assertEqual(len(payload["calibration"]["high_confidence_errors"]), 1)

    def test_false_positive_and_missing_claim(self):
        truth = [{"id": "a", "claims": [{"family": "color.white_balance", "direction": "shift", "magnitude": "subtle", "scope": "global"}]}]
        predictions = [{"id": "a", "claims": [{"family": "detail.grain", "direction": "present", "magnitude": "subtle", "scope": "global", "confidence": 0.4}]}]
        payload = json.loads(self.run_score(truth, predictions).stdout)
        self.assertEqual(payload["family_detection"]["false_positive"], 1)
        self.assertEqual(payload["family_detection"]["false_negative"], 1)
        self.assertEqual(payload["family_detection"]["f1"], None)

    def test_rejects_duplicate_family(self):
        claim = {"family": "tone.exposure", "direction": "increase", "magnitude": "subtle", "scope": "global"}
        truth = [{"id": "a", "claims": [claim, claim]}]
        result = self.run_score(truth, [])
        self.assertEqual(result.returncode, 2)
        self.assertIn("duplicate family", result.stderr)


if __name__ == "__main__":
    unittest.main()
