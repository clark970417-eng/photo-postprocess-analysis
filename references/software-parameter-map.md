# Software parameter map for photo reconstruction

Read this reference only when the user requests editor-specific settings or a translation between editors. UI labels, feature availability, and slider response can change by desktop/mobile version, subscription, locale, model update, and file type.

## Translation rules

1. Infer the **visible operation** first: tonal placement, color relationship, semantic local correction, texture cleanup, geometry change, or synthetic effect.
2. Map that operation to a native control family in the requested editor.
3. Give a bounded **starting range**, never a recovered value.
4. State the calibration cue: what the user should watch while moving the control.
5. Keep operation confidence separate from numeric confidence. A skin-tone equalization inference may be Medium while an Evoto amount estimate remains Low.

Never equate identical numbers across products. Lightroom/ACR Exposure is approximately photographic-stop oriented; normalized `−100…100` controls, `0…100` AI amounts, presets, and generated AI results are not interchangeable. AI tools are semantic and image-adaptive: the same amount can affect different faces or scenes differently.

Use these generic bands only when the actual UI exposes a `0…100` strength control and the user requests numbers:

- restrained: `5–15`;
- visible but natural: `15–30`;
- strong/stylized: `30–50`;
- above `50`: recommend only when the reference visibly supports aggressive transformation.

For a symmetric `−100…100` conventional control, start with `±5–15` for subtle, `±15–30` for moderate, and exceed `±30` only with strong evidence. Vendor response curves may be nonlinear.

## Cross-software operation map

| Visible operation | Photoshop / ACR | Lightroom Classic | Evoto | PixCake / 像素蛋糕 | Meitu / 美圖秀秀 |
|---|---|---|---|---|---|
| Global exposure and endpoints | Camera Raw Basic; Curves/Levels adjustment layers | Light panel; Tone Curve | Color Adjustments: Exposure, Highlight, Shadow, White, Black | 白平衡、影調、曲線; AI 色彩風格 may generate exposure corrections | 光效/基礎調整: exposure, highlight, shadow, white, black where available |
| White balance / cast | ACR Temp/Tint; Color Balance; Curves by channel | Temp/Tint; Point Color or masks for local cast | Temp/Tint; Skin Tone Change only for skin-specific cast | 白平衡; AI 追色 for reference-relative color; local subject/background/skin adjustments | 色溫、色調; skin-tone styles for semantic skin changes |
| Hue-specific color | ACR Color Mixer/Point Color; Hue/Saturation/Selective Color | Color Mixer, Point Color | 8-channel HSL and selector | HSL、色彩編輯器; AI 追色 local semantic regions | HSL; selective color features vary by version |
| Shadow/midtone/highlight tint | ACR Color Grading; Color Balance | Color Grading | Color Grading wheels | 顏色分級 | 色調分離; filter/recipe alternatives |
| Subject/background separation | Layer masks, Select Subject, Blend If, luminosity masks | Subject, Background, Sky, People, Color/Luminance Range masks | AI Masking; Manual Tuning Pen; Background Adjustments | AI 追色全圖/局部; subject/background/face-skin masks | 智慧選取, local tools, portrait segmentation; controls vary by platform |
| Even blotchy skin tone with texture retained | Dodge & Burn; low-frequency correction; restrained Frequency Separation | People/Skin mask with small Texture/Clarity and color corrections; not full retouch | Even with Dodge & Burn, Textured Smoothing, Frequency Separation Low Frequency | 中性灰磨皮、質感磨皮、高低頻平整 | 一鍵美顏/膚質, selective smoothing; manual local tools when available |
| Fine skin texture softened | Frequency Separation high-frequency layer; healing | Texture reduction on a skin mask, used cautiously | Frequency Separation High Frequency, Skin Softening | 高頻增強/減弱、高低頻磨皮、水潤磨皮 | 磨皮/膚質 strength |
| Skin brightness without changing facial features | masked Curves/Camera Raw | People/Skin Exposure, Shadows, Whites | Skin Radiance | 膚色透亮; local skin exposure | 膚色/美白 or local brighten; protect lips/eyes if possible |
| Skin hue/redness | Selective Color, Hue/Saturation, masked Curves | Skin mask Temp/Tint/Saturation; Orange/Red HSL cautiously | Skin Tone Change, Rosy Complexion | 膚色選擇、膚色色溫、膚色色調、膚色紅潤 | 膚色 styles, 色溫/色調, HSL where available |
| Blemish/wrinkle cleanup | Remove/Healing; low-opacity clone; D&B | Remove tool for isolated defects | Freckle, Acne, wrinkles by region, Dark Circles, Eye Bags | specific wrinkle removals, manual repair, blemish tools | 祛斑祛痘、祛皺、黑眼圈 and manual/auto modes |
| Glow / diffusion | luminosity-masked blur, Screen/Normal/Soft Light, Blend If | negative Clarity/Texture plus local highlight masks; limited true bloom | no exact product signature; use local/background and tone controls, then Photoshop if needed | 水潤磨皮 affects skin feel; AI light tools may synthesize atmosphere | filters, 光效, 3D lighting styles; use intensity rather than claiming optical bloom |
| Sharpening / clarity / noise | ACR Detail; Smart Sharpen; High Pass | Detail panel, Texture, Clarity, Dehaze | Texture, Clarity, Dehaze, denoise/sharpen features | AI 超清, detail tools, manual tone/color panels | 銳化/清晰修復; avoid reading generated detail as captured texture |
| Face/body geometry | Liquify, Warp | generally not the main tool | Facial Reshape, Full Body Reshape | 3D 全身美型、瘦臉瘦身 | 捏臉、面部重塑、身材塑形 |

## Photoshop and Adobe Camera Raw

Use ACR for profile/WB, global tone, curve, Color Mixer/Point Color, Color Grading, masking, detail, optics, and grain. Use Photoshop layers for retouch, compositing, controlled diffusion, and geometry.

Useful starting ranges when evidence supports them:

- Exposure: `±0.10–0.40` subtle, `±0.40–1.00` moderate.
- Highlights/Shadows/Whites/Blacks: usually begin within `±10–35`; use `35–60` only for visibly compressed or HDR-like tone.
- Texture/Clarity: `±5–15` subtle, `±15–30` obvious. Check halos and skin at 100%.
- HSL/Color Mixer: begin within `±5–15`; change hue before pushing saturation when the target color family is displaced.
- skin retouch layer opacity: begin around `10–30%` for broad automated/frequency-separation corrections and build selectively.
- glow layer opacity: begin around `5–15%`; restrict with highlight luminosity or Blend If before increasing blur/opacity.

Adjustment layers are preferred for Curves, Levels, Hue/Saturation, Color Balance, and Selective Color so their masks and opacity remain editable. Do not claim a precise layer blend mode from flattened pixels.

## Lightroom Classic

Lightroom and ACR share broadly corresponding raw-development control families, but profiles, defaults, masks, and file rendering affect results. Use the same bounded ranges above as starting points.

For a portrait, prefer People/Skin masks over large global negative Texture. For a landscape, use Subject/Background/Sky plus Color or Luminance Range intersections before assuming a Photoshop composite. Adobe documents that Clarity increases local contrast and may create halos at high values; visible halos support excessive local contrast, not a unique slider value.

## Evoto

Evoto separates conventional color development from semantic portrait modules.

### Color controls

- WB: As Shot/Auto/presets, Temp, Tint.
- Tone: Exposure, Contrast, Brightness, Highlight, Shadow, White, Black.
- Presence/color: Texture, Clarity, Dehaze, Vibrance, Saturation.
- HSL: Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta.
- Color Grading: Shadows, Midtones, Highlights, and Global; Hue `0–360`, Saturation `0–100`, Luminance `−100…100`; Blending `0–100` and Balance `−100…100` where exposed.

### Portrait controls

- Even with Dodge & Burn: small-scale luminosity evening.
- Sculpt with Dodge & Burn: Facial Features and Facial Contours; use when form looks deliberately reinforced, not merely well lit.
- Textured Smoothing: tone/structure smoothing intended to retain dimensionality.
- Frequency Separation: High Frequency controls texture; Low Frequency controls smoothness and tonal balance.
- Skin Softening: broader frequency-separation-based smoothing.
- Skin Tone Change: changes overall skin/facial-feature color together.
- Skin Radiance: brightens skin while protecting key facial-feature color.
- Rosy Complexion: increases or decreases visible redness.
- Blemish Removal includes separate freckles/acne, shine, dark circles, eye bags/lower-eyelid protection, and region-specific wrinkles.

Start most semantic portrait sliders at `5–15`, then compare skin beside eyelashes, hair, lips, and fabric. Use `15–30` only when the reference clearly shows stronger cleanup. Avoid stacking several smoothing tools at medium strength; assign each visible problem to one primary control.

## PixCake / 像素蛋糕

PixCake combines manual raw-style controls, semantic portrait retouch, and reference-driven AI color.

### Color workflow

- AI 追色: begin with a reference that matches scene, lighting direction, framing, and subject coverage. It can synchronize global warmth/saturation plus semantic skin brightness, hair, lips, sky, and indoor background.
- AI 追色 intensity controls include overall Degree, Tone Degree, and Color Degree; local mode can target subject, background, facial skin, and other semantic masks. Start restrained and correct exposure/WB before increasing the match.
- AI 色彩風格 dynamically generates exposure and style corrections per photo; do not report a single reusable slider recipe as the recovered source.
- Manual refinement: 白平衡 → 影調 → 曲線 → HSL → 色彩編輯器 → 顏色分級 → 局部調色.

### Portrait controls

- 中性灰磨皮: evens local luminosity while aiming to retain texture.
- 質感磨皮: lighter, broader face treatment.
- 高低頻磨皮: high-frequency control affects texture; high/low-frequency smoothing affects the tone/color layer.
- 水潤磨皮: adds a softer, more luminous skin feel; do not confuse it with whole-frame optical diffusion.
- Skin texture styles: 啞光, 緞面, 水光.
- Skin appearance: 膚色透亮, 膚色美白, 膚色紅潤, AI face/body complexion unification, skin selection, temperature, and tint.
- Region-specific wrinkle removal and manual repair are better matches for isolated defects than raising global smoothing.

Because PixCake effects are AI- and image-adaptive, prefer qualitative bands (`低／中低／中`) unless the user supplies the exact app version or a screenshot of its current scale.

## Meitu / 美圖秀秀

Meitu desktop/mobile/web controls vary. Use current visible UI labels when the user supplies a screenshot; otherwise state version uncertainty.

Documented conventional families include:

- 光效: highlights, shadow improvement, fade, and other light controls depending on version.
- 色彩: temperature and tint/tone.
- HSL: hue, saturation, and lightness by color family.
- 色調分離: separate highlight/shadow color.
- 銳化 and clarity/quality-restoration features.

Portrait families include skin tone/texture, smoothing, whitening, blemish removal, wrinkle removal with automatic/manual modes, dark-circle cleanup, teeth, makeup, facial reshape, and body shaping. “美圖配方” or one-click beauty can combine several operations; from final pixels, report the component behaviors rather than claiming a specific recipe.

Meitu's official cloud API documents some conventional controls as `−100…100`, exposure as `−500…500`, and face-beauty/repair strengths as `0…100`; these ranges must **not** be assumed to match the consumer Meitu UI. For a consumer-app reconstruction, use relative strength bands unless the exact UI scale is visible.

## Reporting format for software-specific requests

For each requested editor, provide a compact table:

| Module / control | Starting range | Visible cue it targets | Stop or reduce when |
|---|---:|---|---|

Then give the native operation order. If the editor lacks a practical equivalent, say so and route only that step to Photoshop; do not invent a control. When several AI controls overlap, choose the smallest non-overlapping set and explain which visible problem each one owns.

## Official source anchors

- Adobe Photoshop tone/color and adjustment layers: https://helpx.adobe.com/photoshop/using/adjusting-color-tone-cs6.html
- Adobe Lightroom tone/color and clipping: https://helpx.adobe.com/uk/lightroom-classic/help/image-tone-color.html
- Adobe Lightroom masking: https://helpx.adobe.com/lightroom/desktop/edit-photos/masking.html
- Evoto color controls: https://support.evoto.ai/color-adjustment-feature-modules/
- Evoto skin retouching: https://support.evoto.ai/skin-retouching/
- Evoto blemish removal: https://support.evoto.ai/blemish-removal/
- PixCake AI color style: https://wiki.pixcakeai.com/guide/14642.html
- PixCake AI color match: https://wiki.pixcakeai.com/guide/14641.html
- PixCake portrait retouching: https://wiki.pixcakeai.com/guide/14644.html
- Meitu conventional color tools: https://pc.meitu.com/school-post/function/tupianbianji20220620
- Meitu portrait features: https://www.meitu.com/zh/media/313
- Meitu cloud parameter schema (not consumer-UI equivalence): https://ai.meitu.com/doc/?domain=OUT&id=320&lang=zh&type=api
