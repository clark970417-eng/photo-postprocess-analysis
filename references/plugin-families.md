# Retouching and soft-light effect families

Read this only when plugin-like portrait retouching, diffusion, glow, or soft light is relevant. These are workflow families and practical equivalents—not forensic signatures.

## Portrait skin smoothing and masking

### Imagenomic Portraiture

Officially emphasizes AI skin smoothing, AI masks for skin/hair/eyes, tone uniformity, fill light, and retention of natural texture. A result with even skin tone, restrained blemish texture, and protected eyelashes/hair is **consistent with this class of tool**, but can also be produced manually or by many competitors.

Practical manual equivalent: masked surface cleanup + low-opacity frequency separation or texture-aware smoothing + targeted fill/dodge.

Official reference: https://imagenomic.com/Products/Portraiture

### Retouch4me family

- **Heal:** repairs visible blemishes while aiming to preserve texture.
- **Dodge & Burn:** evens unfavorable highlights/shadows and can export a neutral-gray Soft Light layer.
- **Portrait Volumes:** adds facial/body dimension through tonal shaping.
- **Skin Tone:** evens visible skin color.

Evidence of preserved texture with unusually even small-scale luminosity is consistent with automated dodge-and-burn, but not unique to Retouch4me. “Soft Light layer” describes an editable Photoshop workflow, not a visible signature in a flattened JPEG.

Official references:

- https://retouch4.me/dodgeburn
- https://retouch4.me/portraitvolumes
- https://retouch4.me/api_uploads/ai-retouching-guide.pdf

## Dreamy glow and soft focus

### Nik Color Efex — Glamour Glow / Classic Soft Focus

Glamour Glow combines softening with controllable glow, saturation, warmth, shadow, highlight, blur, and colorization behavior. Classic Soft Focus simulates traditional soft-focus/diffusion techniques. Likely cues are reduced microcontrast plus a halo around light regions and possibly a warm/cool tint in that halo.

Practical manual equivalent: duplicate/merged layer → Gaussian Blur → Screen, Soft Light, or low-opacity Normal blend → Blend If or luminosity mask → optional warm/cool tint.

Official reference: https://userguides.dxo.com/nikcollection/en/color-efex/

Nik 9 also includes a dedicated Halation filter and AI/local masking. Treat a colored highlight fringe as a halation-family possibility only after excluding chromatic aberration, colored lighting, clipped-channel transitions, and flare. A semantic boundary alone does not identify Nik's masking.

### Boris FX Optics

Optics includes optical/lens and diffusion effects such as Mist, Fog, Net, Halo, atmospheric glow, UltraGlow, flare, and light leaks. It is relevant when the image has optical-looking highlight spread, veiling haze, colored glow, or flare beyond simple skin smoothing.

Practical manual equivalent: highlight luminosity selection → blur at one or more radii → Screen/Add-like blend → masked opacity; add a separate low-frequency haze or colored halo only if the reference shows it.

Official references:

- https://borisfx.com/products/optics/
- https://cdn.borisfx.com/borisfx/Documentation/optics/Optics-2024/Features-Filters%20and%20Categories.html

## Reporting rule

Use language such as:

> The highlight bloom and reduced microcontrast are consistent with a glamour-glow or diffusion workflow (for example Nik Glamour Glow or Boris Optics), but a blurred luminosity-masked layer could produce the same result.

Do not say a flattened photo “uses Portraiture,” “is Retouch4me,” or “proves Nik Glamour Glow” unless the user supplies edit metadata, a layer stack, preset name, or other provenance evidence.

Before naming any family, require both:

1. a visible behavior that the family is designed to create; and
2. a reason a simpler global edit, capture condition, resize, or manual layer is less sufficient.

If the second condition is not met, describe the visual operation and manual equivalent without naming products.
