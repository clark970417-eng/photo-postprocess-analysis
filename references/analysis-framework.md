# Finished-photo analysis framework

Use this reference when producing a full reverse-engineering report.

## 1. Source limits

Record the source type, pixel dimensions, visible compression, clipping, and whether an original is available. A finished file collapses capture, camera processing, grading, retouching, and output conversion into one result. Exact provenance is normally non-identifiable.

Apply these ceilings unless stronger provenance is supplied:

- A screenshot or social-media copy can support strong statements about the broad visible look, but normally caps fine-detail, grain, sharpening, noise-reduction, and plugin claims at **Low**.
- A high-resolution export without an original can support **Medium** operation-level claims when multiple independent cues agree; it rarely supports an exact-tool claim.
- A registered original/edited pair can support **High** claims about directional global or local changes when capture conditions are identical.

Do not confuse file container with edit history. PNG may contain a screenshot of a compressed JPEG; JPEG may be a clean final export. Treat filename, metadata, dimensions, and artifacts together.

## 2. Global tone

Read the histogram and the image together.

- **Raised black floor:** deepest dark regions remain colored or gray instead of approaching black. Could come from a lifted curve toe, haze, flare, matte grading, or low scene contrast.
- **Crushed blacks:** large dark regions lose separation. Could come from a lowered black point, contrast curve, underexposure, or display compression.
- **Compressed highlights:** bright regions stay luminous but retain broad detail. Often a lowered highlights/whites control or a soft curve shoulder.
- **Bloomed highlights:** bright boundaries spread into neighboring darker pixels. This is diffusion/glow evidence, not merely highlight compression.
- **Midtone pop:** subject forms feel crisp without extreme endpoints. Often a mild S-curve, local contrast, dodge-and-burn, or directional lighting.

Describe the likely curve as black point + toe + midtone slope + shoulder. Do not invent control-point coordinates.

Use the helper conservatively:

- luma percentiles and tonal-distribution percentages support endpoint and tonal-placement descriptions;
- channel clipping distinguishes neutral clipping from one-channel saturation clipping;
- the 3×3 spatial grid can reveal a gradient or vignette candidate, but subject placement may fully explain it;
- multiscale contrast describes rendered spatial contrast, not a Clarity or Texture slider.

## 3. White balance and color

Use plausible neutrals cautiously; white clothing, painted walls, and clouds may be intentionally tinted or lit by colored light.

- Compare neutral candidates across shadow, midtone, and highlight zones.
- Distinguish a global cast from split-toning: a global cast moves most neutrals together; grading changes casts by luminance.
- In HSL, focus on relationships: reds versus magentas, aqua versus blue, foliage yellow versus green, skin orange luminance, and whether one hue is unusually uniform.
- High saturation near clipping can come from channel clipping, camera profiles, or gamut conversion as well as a saturation slider.
- Even a large before/after rise in mean saturation does not identify the Saturation control. Vibrance, white balance, contrast, camera profile, and highlight recovery can redistribute hue and saturation strongly while per-hue HSL and global Saturation remain at zero. Prefer a selective-HSL claim only when a constrained hue changes differently from comparable colors.

The helper's low-saturation candidates are safer than whole-image RGB means, but they are not guaranteed neutrals. Require visually plausible gray/white material before using them. Hue-family shares describe what colors occupy the frame; they support an HSL inference only when the scene content is constrained by an original or by multiple comparable objects.

## 4. Local masks

Look for changes that follow semantic boundaries or depth:

- face/skin brighter or more neutral than similarly lit surroundings;
- eyes, lips, jewelry, foliage, sky, or clothing with selective saturation/clarity;
- a radial lift around the subject;
- background texture or saturation reduced while edges around the subject stay crisp;
- sky gradients or foreground exposure ramps;
- edge inconsistencies that suggest imperfect masking.

Directional light and makeup are important alternatives to local edits.

Counterfactual check: compare the suspected mask area with another region of similar luminance, material, depth, and lighting. If both change similarly, prefer a global tone/color or optical explanation. If the effect follows a semantic boundary despite similar capture conditions, a local mask becomes more plausible.

## 5. Skin retouching

Evaluate blemish removal, tonal uniformity, pore-scale texture, transitions around eyes/nose/lips, and whether texture repeats.

- Preserved pores with smoother blotchy tone is consistent with dodge-and-burn or well-masked automated retouching.
- Lost pores plus sharp eyes/hair suggests selective smoothing, frequency separation, or AI skin masking.
- Uniform skin hue with intact luminance texture suggests tone equalization rather than blur.
- Repeated or smeared texture may indicate cloning, healing, aggressive frequency separation, or compression.

Do not use smooth skin alone to claim a plugin. Makeup, light size, focus, sensor resolution, and resizing can produce similar results.

Inspect at least three spatial frequencies:

- broad face volumes and shadow transitions;
- blotch-scale tone/color variation;
- pore, fine hair, eyelash, and fabric-scale texture.

If fine skin texture appears absent, first compare eyelashes, hair, jewelry, and nearby fabric. If all fine detail is similarly reduced, prefer focus, lens diffusion, resize, or global noise reduction over skin-specific retouching.

## 6. Glow, diffusion, and halation

Separate these effects:

- **Soft focus/diffusion:** lower microcontrast over a broad tonal range; edges remain located but less crisp.
- **Bloom/glow:** light spreads outward from bright objects; often strongest around practical lights, white clothing, or highlights.
- **Halation:** colored fringe—often warm/red—around strong highlights; can be film-like or synthetic.
- **Flare/veiling glare:** larger low-contrast wash, frequently directional and related to a bright source.
- **Negative clarity/texture:** reduces local contrast but does not necessarily create a light-emitting halo.

Use highlight-boundary behavior to separate them. Bloom grows with highlight intensity and crosses into darker surroundings; global softening lowers edge contrast regardless of luminance; sharpening can create a bright/dark paired rim; overexposure expands clipped regions without a graded halo. Check several unrelated edges before choosing an explanation.

## 7. Detail and output

- Bright/dark edge halos suggest aggressive sharpening or clarity.
- Fine texture suppressed while edges remain can indicate luminance noise reduction or resizing.
- Chroma speckles in dark areas indicate insufficient color-noise reduction; perfectly clean shadows may reflect strong NR, bright exposure, or a small output file.
- Added grain should be judged for size, uniformity, and luminance dependence.

The helper's edge metric is scene-dependent. Architecture naturally scores higher than defocused portraits, so compare it only with visual content and, ideally, an original.

Interpret the 8-pixel JPEG support metric only when it is marked eligible. A ratio near or above one is not proof of compression damage; architectural repetition and resampling can create similar periodic boundaries.

## 8. Reconstruction calibration

Match the reference in an order that isolates variables:

1. match crop and display color space;
2. match black floor, white ceiling, and median luminance;
3. match neutral candidates before creative grading;
4. match dominant hue relationships using real scene objects;
5. match subject/background separation with local masks;
6. add retouch and diffusion at 100% view;
7. apply sharpening, noise reduction, grain, and output resizing last.

Give bounded starting values that express direction and strength. Explain what visible cue each group is intended to match. If a parameter range does not respond to a cited cue, omit it.

## Confidence rubric

- **High:** at least two independent cues support the same operation, one cue is localized or measured, a matching original/provenance constrains alternatives, and no source-quality ceiling blocks the claim.
- **Medium:** multiple cues support a useful operation-level inference, but capture or output remains plausible; or a strong cue is present without an original.
- **Low:** only one ambiguous cue exists, the conclusion depends on fine detail in a compressed/resized source, or unrelated workflows produce the same pixels.

Score confidence per claim. Do not average several low-confidence observations into a high-confidence conclusion. “Plugin family possible” and “manual reconstruction likely useful” can have different confidence levels.
