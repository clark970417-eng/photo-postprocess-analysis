#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("extract_edit_metadata.py")
XMP = b'''<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/">
<rdf:RDF><rdf:Description>
<crs:ProcessVersion>5.0</crs:ProcessVersion><crs:Exposure>+0.77</crs:Exposure>
<crs:Contrast>+46</crs:Contrast><crs:Vibrance>+49</crs:Vibrance>
<crs:SaturationAdjustmentBlue>0</crs:SaturationAdjustmentBlue>
<crs:HasSettings>True</crs:HasSettings><crs:AlreadyApplied>True</crs:AlreadyApplied>
</rdf:Description></rdf:RDF></x:xmpmeta>'''


class EditMetadataTests(unittest.TestCase):
    def run_extract(self, payload: bytes):
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "sample.tif"
            image.write_bytes(b"II*\x00fixture" + payload + b"tail")
            return subprocess.run(
                [sys.executable, str(SCRIPT), str(image), "--compact"],
                capture_output=True,
                text=True,
            )

    def test_extracts_only_edit_groups(self):
        result = self.run_extract(XMP)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["basic_tone"]["Exposure"], 0.77)
        self.assertEqual(payload["basic_tone"]["Contrast"], 46)
        self.assertEqual(payload["color"]["Vibrance"], 49)
        self.assertTrue(payload["provenance"]["AlreadyApplied"])
        self.assertEqual(payload["nonzero_hsl_adjustments"], {})

    def test_missing_xmp_fails_cleanly(self):
        result = self.run_extract(b"no metadata")
        self.assertEqual(result.returncode, 2)
        self.assertIn("no embedded XMP", result.stderr)


if __name__ == "__main__":
    unittest.main()
