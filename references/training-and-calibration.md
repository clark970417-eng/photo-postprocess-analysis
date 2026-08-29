# Training and confidence calibration

Use this guide to improve the analysis procedure without pretending that a skill file retrains the base model. Improvement here means better evidence, known-ground-truth practice cases, blind evaluation, error review, and confidence labels that track observed correctness.

## Authoritative benchmark sources

Use source licenses and access terms as published. Do not redistribute images or bundle datasets inside this skill.

- **MIT–Adobe FiveK:** 5,000 RAW photographs, five expert Lightroom renditions per photograph, semantic scene labels, and a Lightroom catalog containing slider values and adjustment histories. It is the strongest listed source for learning global tonal and color-adjustment relationships. Source: <https://data.csail.mit.edu/graphics/fivek/>
- **Acceptable Photographic Tonal Adjustments:** human acceptability labels over densely sampled brightness/contrast variants of 500 FiveK images. Use it to learn that multiple tonal results can be defensible and to avoid treating one expert rendition as the only correct answer. Source: <https://projects.csail.mit.edu/acceptable-adj/data.html>
- **PPR10K:** 11,161 RAW portrait photographs in 1,681 groups, three expert renditions, and high-resolution human-region masks. Use it for portrait priority, subject/background comparisons, and group-level color consistency. Source and paper: <https://openaccess.thecvf.com/content/CVPR2021/html/Liang_PPR10K_A_Large-Scale_Portrait_Photo_Retouching_Dataset_With_Human-Region_Mask_CVPR_2021_paper.html>
- **DPED:** synchronized mobile-camera and DSLR photographs. Use it only for rendered-quality and capture-system comparisons; because the devices differ, do not treat every pixel difference as a post-production operation. Source: <https://github.com/aiff22/DPED>

FiveK and PPR10K are large downloads. Obtain them only when the user has approved the storage and license implications. A small manifest of links and identifiers is not a substitute for accepting a dataset's terms.

## Claim vocabulary

Evaluate claims at an identifiable operation-family level. Recommended families:

- `tone.exposure`, `tone.black_point`, `tone.toe`, `tone.midtone_contrast`, `tone.shoulder`, `tone.highlight_compression`
- `color.white_balance`, `color.tint`, `color.hsl`, `color.shadow_grade`, `color.highlight_grade`
- `local.subject`, `local.background`, `local.sky`, `local.gradient`, `local.vignette`
- `portrait.cleanup`, `portrait.tone_evening`, `portrait.texture`, `portrait.dodge_burn`, `portrait.shape`
- `optical.glow`, `optical.diffusion`, `optical.halation`, `optical.flare`
- `detail.texture`, `detail.clarity`, `detail.sharpening`, `detail.noise_reduction`, `detail.grain`
- `output.resize`, `output.compression`, `output.gamut_or_profile`

Each claim has:

- `family`: one value from the vocabulary;
- `direction`: `increase`, `decrease`, `shift`, `present`, `absent`, or `unknown`;
- `magnitude`: `subtle`, `moderate`, `strong`, or `unknown`;
- `scope`: `global`, `subject`, `skin`, `background`, `highlights`, `shadows`, `region`, or `unknown`;
- `confidence`: a number from 0 to 1 for evaluation data, or High/Medium/Low in user-facing reports.

Do not score exact slider recovery unless the edit history is available and the software/version/profile are controlled. For flattened images, operation family, direction, broad magnitude, and scope are the defensible targets.

## Blind-test protocol

1. Freeze a test manifest before analyzing. Separate by original photograph, subject identity, burst/group, retoucher, and preset lineage so near-duplicates cannot cross splits.
2. Hide edit histories, filenames that reveal treatments, expert labels, and target answers during prediction.
3. Stratify by scene, portrait/non-portrait, source type, resolution, and compression. Maintain a separate social-media stress set.
4. Record claims in JSONL using the schema accepted by `scripts/score_calibration.py`.
5. Score family precision/recall/F1, then direction, magnitude, and scope only among family matches.
6. Inspect every high-confidence error. Add a counterexample rule only when it generalizes across several images; do not patch the skill around one photograph.
7. Re-run the untouched holdout after changes. Never report training-set or prompt-tuning performance as test accuracy.

Use at least 100 varied claims before treating confidence bins as stable. Until then, state that calibration is preliminary.

## Confidence calibration

Confidence should mean expected correctness for the whole predicted claim—family plus every non-`unknown` attribute—not visual obviousness. A 0.8 confidence bin should be correct about 80% of the time on comparable sources.

The scorer reports:

- family precision, recall, and F1;
- direction, magnitude, and scope accuracy on matched families;
- exact-claim accuracy for predicted claims;
- Brier score, where lower is better;
- expected calibration error (ECE) over five bins;
- high-confidence errors at confidence `>= 0.8`.

Convert probabilities to user-facing labels only after calibration:

- **High:** `0.80–1.00`, unless the source-quality ceiling forbids it;
- **Medium:** `0.55–0.79`;
- **Low:** below `0.55`, or any claim whose decisive evidence is unavailable.

If a bin is overconfident, lower future values for the same claim family and source class toward the bin's observed accuracy. Do not raise a claim merely because its wording sounds certain. The general reliability-diagram principle follows Guo et al., *On Calibration of Modern Neural Networks*: <https://proceedings.mlr.press/v70/guo17a.html>.

## JSONL example

Ground truth:

```json
{"id":"fivek-0001-a","claims":[{"family":"tone.exposure","direction":"increase","magnitude":"moderate","scope":"global"}]}
```

Prediction:

```json
{"id":"fivek-0001-a","claims":[{"family":"tone.exposure","direction":"increase","magnitude":"subtle","scope":"global","confidence":0.72}]}
```

Run:

```bash
python3 scripts/score_calibration.py ground_truth.jsonl predictions.jsonl
```

An image can have multiple claims, but a manifest should contain no more than one claim per family for the same image. Use `unknown` rather than inventing an attribute that the evidence cannot support.
