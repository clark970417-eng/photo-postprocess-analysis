# Author portfolio analysis

Use this mode to identify a creator's recurring post-production system from several publicly accessible or user-supplied works. Analyze the work, not the person's personality, identity, health, or other sensitive attributes.

## Sampling

Prefer 12–30 images spanning at least three materially different contexts when available. Six images can support a preliminary profile; fewer than six should remain a small-series observation rather than an author signature.

Sample across:

- indoor and outdoor light;
- daylight, mixed light, and night where the portfolio contains them;
- portraits, wider scenes, and detail shots where relevant;
- different dates, locations, subjects, dominant colors, and cameras if known;
- original site and social-media copies when output treatment may differ.

Avoid filling the sample with consecutive frames from one burst, one costume/set, reposts, crops of the same source, or several edits using the same advertised preset. Near-duplicates count as one visual case for recurrence.

## Three-level model

Record each finding at one of these levels:

1. **Image-specific:** explained by this scene, light, subject, makeup, wardrobe, lens, or one-off effect.
2. **Series-specific:** recurs within a shoot or set but may be a client, location, lighting, or campaign decision.
3. **Author invariant:** recurs across different subjects, scenes, palettes, and dates and survives plausible capture alternatives.

Only level 3 belongs in the stable author signature. Level 2 belongs in conditional recipes such as “night portraits” or “pastel cosplay sets.”

## Analysis matrix

For every sampled image, note:

- source quality, dimensions, platform, and possible repost/compression;
- scene and lighting class;
- black floor, toe, midtone slope, shoulder, and highlight behavior;
- neutral/cast behavior and shadow–highlight color relationship;
- hue relationships rather than raw hue abundance;
- subject/background luminance, saturation, texture, and color separation;
- skin cleanup, tonal evening, texture preservation, and facial feature emphasis when applicable;
- glow, diffusion, halation, flare, clarity, sharpening, noise reduction, and grain;
- output crop, resize, sharpening, and compression characteristics.

Run `scripts/portfolio_stats.py` when local files are available. Its medians and interquartile ranges can expose recurring rendered tendencies, but scene content strongly affects every metric. A stable statistic is not automatically an edit; confirm it across visually dissimilar images.

## Recurrence and confidence

Count independent contexts, not raw images.

- **High author-level confidence:** the operation appears in at least three materially different contexts, is supported by multiple cues, and capture/platform alternatives do not explain the recurrence.
- **Medium:** it appears in two different contexts or many images from only one context, with plausible alternatives remaining.
- **Low:** it appears only in one series, depends on compressed fine detail, or could primarily be set color, wardrobe, lighting, lens/filter, makeup, camera profile, or platform processing.

Do not let twenty near-duplicate images produce higher confidence than three genuinely different shoots. Absence is also conditional: a subtle effect may simply be invisible in an image without suitable edges, highlights, skin detail, or shadow structure.

## Cross-image counterfactuals

Use natural experiments within the portfolio:

- Does the same highlight shoulder appear in daylight clouds, white clothing, and artificial lights?
- Do nominally neutral materials move together across unrelated scenes?
- Does skin remain brighter or more uniform than similarly lit non-skin materials?
- Does bloom follow bright boundaries in both warm and cool scenes?
- Does background texture fall relative to subject detail at different apertures and focal lengths?
- Does the palette survive when the scene's dominant colors change?

If the pattern disappears when subject matter changes, classify it as scene- or series-specific.

## Deliverable

Report:

1. **Portfolio coverage:** number of unique images, independent contexts, dates/platforms when available, and major sampling gaps.
2. **Stable author signature:** only cross-context invariants, each with evidence, alternatives, recurrence, and confidence.
3. **Conditional variants:** separate recipes for recurring scene classes such as daylight portrait, night neon, or pastel indoor work.
4. **Outliers:** works that do not follow the signature; explain whether they indicate experimentation, client constraints, capture differences, or uncertain provenance.
5. **Reconstruction system:** one base Lightroom/ACR recipe plus conditional branches and local-retouch guidance. Do not average incompatible looks into one preset.
6. **What would raise confidence:** originals, before/after pairs, higher-resolution exports, edit histories, or more varied works.

When a specific target image is supplied, first build the author signature, then determine which conditional branch the target belongs to. Use the target for final parameter tuning; use the portfolio to constrain ambiguous interpretations.
