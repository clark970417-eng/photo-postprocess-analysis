---
name: photo-postprocess-analysis
description: Analyze one finished photograph or an author's portfolio for likely color grading, tonal shaping, local retouching, glow, detail treatment, and software-specific settings. Use when the user wants to reverse-engineer an edited look, identify recurring author style, or rebuild it in Photoshop/ACR, Lightroom Classic, Evoto, PixCake, or Meitu; do not use for composition-only critique.
---

# Photo Postprocess Analysis

Reverse-engineer the visible result, not an unknowable edit history. A flattened image can support a plausible reconstruction recipe, but it cannot prove the original RAW settings, camera profile, preset, layer stack, or exact plugin.

## Inspect the source

1. View the full frame, then inspect representative crops at useful detail: a neutral candidate, a high-contrast edge, a bright highlight boundary, and—when present—skin beside hair/eyes. Do not judge diffusion, sharpening, pores, grain, or masking from the fit-to-screen view alone.
2. When the local file is available, first check whether it contains applied Camera Raw/Lightroom XMP:

   ```bash
   python3 <skill-dir>/scripts/extract_edit_metadata.py <image-path>
   ```

   If edit settings are present, treat them as provenance and use the visible pixels to explain their effect. Confirm `AlreadyApplied`, process version, profile, and whether settings describe the current rendering. Report only editing metadata; do not surface unrelated creator, copyright, GPS, or device identifiers.
3. Then run:

   ```bash
   python3 <skill-dir>/scripts/image_stats.py <image-path>
   ```

   Use the tonal distribution, neutral candidates, hue families, spatial grid, and multiscale contrast as supporting evidence. They describe final pixels; none independently identifies an edit.
4. Apply a source-quality gate before making fine-detail claims. Record whether the input is an original export, screenshot, social-media copy, resized file, or JPEG; display rendering, sharpening on export, gamut conversion, and compression can mimic editing artifacts.
5. When an original and edited file are available, also run:

   ```bash
   python3 <skill-dir>/scripts/compare_stats.py <before> <after>
   ```

   Treat differences as directional evidence only until crop, aspect ratio, pose, lighting, and registration are checked visually.

For the detailed interpretation framework, read [references/analysis-framework.md](references/analysis-framework.md). When plugin-like retouching or diffusion is relevant, also read [references/plugin-families.md](references/plugin-families.md). When the user names an editor or wants settings translated between editors, read [references/software-parameter-map.md](references/software-parameter-map.md).

When improving this skill, running a blind evaluation, or reporting whether its confidence labels are trustworthy, read [references/training-and-calibration.md](references/training-and-calibration.md). Keep benchmark examples out of the analysis context while predicting, then score them afterward with `scripts/score_calibration.py`.

When the user provides an author, profile, portfolio, feed, or several works by the same creator, use portfolio mode and read [references/author-portfolio-analysis.md](references/author-portfolio-analysis.md). Analyze only works the user supplied or that are publicly accessible within the authorized scope. Do not infer the author's personality or sensitive traits from their visual style.

## Reason in layers

For every major conclusion, keep these separate:

- **Observed:** directly visible or measured evidence.
- **Inferred:** one or more edits that could plausibly create it.
- **Alternatives:** capture lighting, lens/filter, makeup, set color, camera rendering, compression, or another workflow that could explain it.
- **Confidence:** High, Medium, or Low, with one short reason.

Never identify a precise plugin, preset, camera profile, curve, or slider value as fact from final pixels alone. Say “consistent with,” “could be produced by,” or “a practical equivalent is.”

Use independent evidence, not repeated descriptions of one cue. Before raising confidence, ask whether the same result could come from capture lighting, depth of field, makeup, optical diffusion, resizing, or output sharpening. Read the confidence and counterfactual rules in [references/analysis-framework.md](references/analysis-framework.md).

## Cover the relevant edit stack

Analyze only categories supported by the image, but check each before omitting it:

- exposure and tonal placement;
- black point, toe, midtone contrast, shoulder, and highlight roll-off;
- white balance and tint;
- HSL/color-mixer behavior for important hues;
- shadow, midtone, and highlight color grading;
- local masks, gradients, subject separation, and background treatment;
- skin cleanup, tonal evening, texture retention, and dodge-and-burn;
- bloom, diffusion, halation, flare, or soft-focus behavior;
- texture/clarity/dehaze, sharpening halos, noise reduction, and grain;
- signs of compositing, generative cleanup, liquify, or geometry correction when actually visible.

Do not infer identity, ethnicity, health, or other sensitive traits from skin appearance. Discuss only visible retouching treatment.

## Deliver an actionable reconstruction

Lead with a concise style label and a two- or three-sentence diagnosis. Then provide:

1. **Evidence table** — observation, inference, alternatives, confidence.
2. **Likely edit stack** — ordered from global processing to local finishing.
3. **Requested-software recipe** — bounded values or ranges in the user's editor, not fake recovered settings. If no editor is specified, default to Lightroom/ACR and add one relevant portrait-AI equivalent only when it materially helps.
4. **Pixel-editor finishing** — Photoshop steps only for effects that are impractical in the requested raw/AI editor.
5. **Plugin-family possibilities** — only when visible evidence warrants them; name an equivalent manual method too.
6. **Calibration notes** — what to adjust after comparing the recreation with the reference.

Use this rebuild order so later adjustments do not invalidate earlier judgments:

`profile/WB → exposure/global tone → curve → HSL → color grading → local masks → retouch → glow/diffusion → sharpening/NR/grain → output`

Parameter ranges should be useful starting points. Prefer “Texture −10 to −25” over “Texture −17” unless the user explicitly asks for a single preset-like recipe; even then label it an estimate.

Do not numerically translate unlike scales. An Evoto, PixCake, or Meitu AI intensity is subject-adaptive and is not equivalent to the same number in another app. Translate the visible operation first, then give a conservative native starting range and a calibration cue for that editor.

## Comparison mode

When the user supplies an original and an edited version, compare matching registered regions and be more specific. Separate global changes from spatially selective changes, use the original to constrain tone/color hypotheses, and identify where subject-to-background relationships changed. If the files differ in crop, dimensions, focal length, lighting, or pose, state that before comparing and lower confidence for local conclusions.

## Portfolio mode

Do not treat repeated subject matter as repeated editing. Separate per-image observations, series-specific choices, and cross-series invariants. Raise author-level confidence only when the same operation recurs across materially different scenes or lighting conditions. Use `scripts/portfolio_stats.py` on available local images as supporting evidence, never as a substitute for visual grouping and matched comparisons.

## Quality check

Before answering, verify that:

- evidence and inference are not blended together;
- embedded edit metadata, when present, is separated from visual inference and interpreted using its stated process version;
- plugin names are possibilities, not claims;
- the recipe responds to this image rather than repeating a generic preset;
- highlight clipping, skin texture, and edge softness are not confused with one another;
- whole-image color, hue-family share, and spatial averages are not presented as proof of WB, HSL, or masks;
- at least one plausible capture/output alternative was tested for every plugin-like or fine-detail claim;
- uncertainty increases when the input is small, compressed, or lacks an original;
- the user receives a sequence they can actually reproduce.
- software labels and scale assumptions match the requested editor, with version/localization uncertainty stated when necessary.
- confidence reflects measured success on comparable source types when calibration evidence exists; otherwise it remains a qualitative rubric, not a probability.
