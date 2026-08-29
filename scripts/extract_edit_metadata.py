#!/usr/bin/env python3
"""Extract only Adobe Camera Raw/Lightroom editing XMP from an image file."""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

CRS_NS = "http://ns.adobe.com/camera-raw-settings/1.0/"

BASIC_TONE = (
    "Exposure", "Exposure2012", "HighlightRecovery", "Highlights2012",
    "Shadows", "Shadows2012", "FillLight", "Blacks2012", "Whites2012",
    "Brightness", "Contrast", "Contrast2012",
)
COLOR = ("WhiteBalance", "Temperature", "Tint", "Saturation", "Vibrance")
DETAIL = (
    "Clarity", "Clarity2012", "Texture", "Dehaze", "Sharpness",
    "SharpenRadius", "SharpenDetail", "SharpenEdgeMasking",
    "LuminanceSmoothing", "ColorNoiseReduction",
)
EFFECTS = ("VignetteAmount", "PostCropVignetteAmount", "GrainAmount")
PROVENANCE = (
    "Version", "ProcessVersion", "CameraProfile", "ToneCurveName",
    "HasSettings", "HasCrop", "AlreadyApplied",
)


def scalar(value: str | None):
    if value is None:
        return None
    stripped = value.strip()
    if stripped.lower() == "true":
        return True
    if stripped.lower() == "false":
        return False
    try:
        return float(stripped) if "." in stripped else int(stripped)
    except ValueError:
        return stripped


def extract_xmp(data: bytes) -> bytes:
    starts = [offset for marker in (b"<x:xmpmeta", b"<xmpmeta") if (offset := data.find(marker)) >= 0]
    if not starts:
        raise ValueError("no embedded XMP packet found")
    start = min(starts)
    closing_candidates = []
    for marker in (b"</x:xmpmeta>", b"</xmpmeta>"):
        offset = data.find(marker, start)
        if offset >= 0:
            closing_candidates.append((offset, len(marker)))
    if not closing_candidates:
        raise ValueError("embedded XMP packet is incomplete")
    end, marker_length = min(closing_candidates)
    return data[start : end + marker_length]


def collect_crs(root: ET.Element) -> dict[str, object]:
    values: dict[str, object] = {}
    prefix = "{" + CRS_NS + "}"
    for element in root.iter():
        for key, raw in element.attrib.items():
            if key.startswith(prefix):
                values[key[len(prefix):]] = scalar(raw)
        if element.tag.startswith(prefix):
            name = element.tag[len(prefix):]
            children = list(element)
            if children:
                items = [scalar(item.text) for item in element.iter() if item is not element and item.text and item.text.strip()]
                if items:
                    values[name] = items
            elif element.text and element.text.strip():
                value = scalar(element.text)
                if name in values:
                    previous = values[name]
                    values[name] = previous + [value] if isinstance(previous, list) else [previous, value]
                else:
                    values[name] = value
    return values


def selected(values: dict[str, object], names: tuple[str, ...]) -> dict[str, object]:
    return {name: values[name] for name in names if name in values}


def meaningful(value: object) -> bool:
    if value in (None, False, 0, 0.0, "", "0", "+0"):
        return False
    if isinstance(value, list):
        return any(meaningful(item) for item in value)
    return True


def analyze(path: Path) -> dict:
    packet = extract_xmp(path.read_bytes())
    try:
        root = ET.fromstring(packet)
    except ET.ParseError as exc:
        raise ValueError(f"invalid embedded XMP: {exc}") from exc
    values = collect_crs(root)
    if not values:
        raise ValueError("XMP contains no Camera Raw/Lightroom edit settings")
    selective_names = sorted(
        name for name, value in values.items()
        if any(token in name.lower() for token in ("adjustment", "paint", "gradient", "mask", "retouch", "spot"))
        and meaningful(value)
    )
    hsl = {
        name: value for name, value in values.items()
        if name.startswith(("HueAdjustment", "SaturationAdjustment", "LuminanceAdjustment"))
        and meaningful(value)
    }
    return {
        "source": str(path.resolve()),
        "camera_raw_edit_metadata_found": True,
        "provenance": selected(values, PROVENANCE),
        "basic_tone": selected(values, BASIC_TONE),
        "color": selected(values, COLOR),
        "detail": selected(values, DETAIL),
        "effects": selected(values, EFFECTS),
        "nonzero_hsl_adjustments": hsl,
        "local_or_retouch_setting_names": selective_names,
        "interpretation_limits": [
            "Settings must be interpreted using the recorded Camera Raw process version.",
            "AlreadyApplied indicates the metadata describes adjustments baked into the current rendered file.",
            "Absence of a tag is not proof that an earlier external editor or plugin was never used.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()
    try:
        if not args.image.is_file():
            raise FileNotFoundError(f"image not found: {args.image}")
        result = analyze(args.image)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=None if args.compact else 2))
        return 0
    except (OSError, ValueError) as exc:
        print(f"extract_edit_metadata: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
