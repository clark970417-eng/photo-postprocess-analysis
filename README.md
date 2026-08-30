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

## Opera GX extension

The optional `browser-extension` folder adds a user-triggered shortcut for X and Instagram. Version 0.4.0 can hand an Instagram Story's currently served image file directly to Opera downloads without screenshotting, resizing, or re-encoding it; Instagram itself may already have compressed the upload. Other pages deliberately place only the cropped PNG on the clipboard, because a combined `image/png` + `text/plain` item can cause ChatGPT to choose the text representation and discard the photo. After the user uploads or pastes and explicitly confirms the photo thumbnail, reopening Lumen Trace on the ChatGPT tab copies the evidence-based Traditional Chinese analysis prompt as a separate step. A uniquely identified, single-active in-memory handoff is accepted for 30 minutes and never stores the source image URL or pixels; the short pre-capture reservation expires after two minutes. The extension attempts to delete the record after the prompt is copied. A background service records only its generated filename and download ID, can recover after a Manifest V3 worker restart, and opens ChatGPT only after Opera reports that the download completed.

In Opera GX, open `opera:extensions`, enable Developer Mode, choose **Load unpacked**, and select the extracted `browser-extension` directory. The extension requests only `activeTab`, `clipboardWrite`, `contextMenus`, `downloads`, `scripting`, and `storage`; it does not request persistent `chatgpt.com` host access and does not inspect the ChatGPT page or conversation DOM. `downloads` is used for a user-triggered Instagram Story source-file transfer or after PNG clipboard writing fails, and the background service waits for Opera to report completion before advancing. `storage.session` holds the handoff ID, prompt, platform label, dimensions, source-tab ID, image-transfer mode, status, timestamp, generated filename, and download ID. It never stores the image URL or pixels. The Story's signed CDN URL is passed only to Opera's download manager for that download. The optional website action explicitly places the current page's source-image URL—which can contain access or signature parameters—in the Lumen Trace page query string, so it is separate from the private handoff.

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
├── browser-extension/       # Optional Opera GX / Chromium post-image shortcut
├── references/              # Analysis, software mapping, portfolio, and calibration guides
└── scripts/                 # Deterministic image statistics and test utilities
```

## Interpretation limits

A final JPEG, PNG, screenshot, or social-media copy cannot prove the original slider values or editing history. Camera rendering, lighting, optics, makeup, resizing, compression, and computational photography can resemble manual edits. The skill therefore presents reproducible equivalents and confidence levels, not forensic certainty.

## License

No open-source license has been assigned yet. Public visibility, if enabled later, does not by itself grant permission to copy, modify, or redistribute this work.
