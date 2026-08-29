# Photo Post-Process Analysis

An evidence-based Codex skill for reverse-engineering the visible finishing of photographs and translating it into practical settings for Lightroom Classic, Adobe Camera Raw, Photoshop, Evoto, PixCake, and Meitu.

The skill analyzes rendered pixels without pretending that a flattened image reveals the creator's exact preset, RAW profile, plugin, or layer stack. Its workflow separates observations from inferences, tests plausible capture alternatives, and reports confidence with explicit limitations.

## What it does

- Measures tonal distribution, clipping, saturation, hue families, spatial luminance, and multiscale contrast.
- Checks JPEG, PNG, TIFF, and WebP files for applied Camera Raw or Lightroom XMP editing metadata.
- Compares original and edited exports while warning about crop, dimension, and registration mismatches.
- Summarizes recurring traits across a photographer's publicly available portfolio.
- Produces bounded reconstruction recipes for Lightroom/ACR and equivalent operations in portrait editors.
- Supports blind calibration so confidence labels can be evaluated instead of guessed.

## Install as a global Codex skill

Copy this repository into your Codex skills directory:

```bash
git clone https://github.com/clark970417-eng/photo-postprocess-analysis.git ~/.codex/skills/photo-postprocess-analysis
```

Restart Codex after installation. The skill can then be invoked with `$photo-postprocess-analysis`, or automatically when a request asks to analyze photographic color grading or retouching.

## Example requests

```text
Use $photo-postprocess-analysis to analyze this photo and give me a Lightroom recipe.
```

```text
Compare these original and edited images. Separate measured evidence from likely local masks.
```

```text
Analyze several public photos by this author and identify only the post-processing choices that recur across different scenes.
```

## Command-line tools

The scripts use Python's standard library and do not require a package installation.

```bash
python3 scripts/image_stats.py photo.jpg
python3 scripts/extract_edit_metadata.py photo.jpg
python3 scripts/compare_stats.py original.jpg edited.jpg
python3 scripts/portfolio_stats.py image-1.jpg image-2.jpg image-3.jpg
python3 scripts/score_calibration.py predictions.json ground-truth.json
```

Run the test suite with:

```bash
python3 -m unittest discover -s scripts -p 'test_*.py'
```

## Repository structure

```text
.
├── SKILL.md                 # Main analysis workflow and response contract
├── agents/openai.yaml       # Skill display metadata and invocation policy
├── references/              # Analysis, software mapping, portfolio, and calibration guides
└── scripts/                 # Deterministic image statistics and test utilities
```

## Interpretation limits

A final JPEG, PNG, screenshot, or social-media copy cannot prove the original slider values or editing history. Camera rendering, lighting, optics, makeup, resizing, compression, and computational photography can resemble manual edits. The skill therefore presents reproducible equivalents and confidence levels, not forensic certainty.

## License

No open-source license has been assigned yet. Public visibility, if enabled later, does not by itself grant permission to copy, modify, or redistribute this work.
