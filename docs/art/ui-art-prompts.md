# Art Deco game UI assets

Generated on 2026-09-16 with the built-in `image_gen.imagegen` tool (not CLI/API fallback). Both are project-bound, final selected originals copied into `public/art` without raster editing. Original outputs remain in the generated-images folder.

## Deliverables and integration notes

| Asset | Dimensions | Intended use |
| --- | --- | --- |
| `public/art/cabinet-frame-v1.png` | 1024 × 1536 | Empty tactile cabinet skin; real game elements must remain live DOM above it. |
| `public/art/hotel-lobby-v1.png` | 1024 × 1536 | Title-screen atmosphere; overlay real title and controls, not generated lettering. |

The frame has an uninterrupted opaque green-black center, straight slim rails, a stepped top crown and a lower return/vent lip. Visually inspected after generation. Suggested CSS border-image starting slice: `160 96 170 96 fill`; suggested rendered border width around `54px 24px 46px 24px`, with narrower side widths at small phone sizes. These are art-side estimates, not final browser-verified dimensions. Do not stretch the entire bitmap disproportionately when a nine-slice can preserve bevels. The blank upper nameplate is approximately x240–785, y68–116.

The lobby is an environmental illustration rather than a UI mockup. Upper ~30% has low-detail dark space for a title; bottom ~12% falls into dark values for menu controls. The single machine, lamps and geometric wall edges are decoration, not an interactive board. Use object-fit/background-size intentionally and keep interactive text separate. Both originals are about 1.8 MiB; compression or alternate serving formats should preserve originals and be measured against phone load performance.

## Cabinet frame prompt

```text
Use case: stylized-concept
Asset type: production-ready 9-slice raster skin for a mobile Art Deco slot-machine game cabinet, NOT a screenshot or UI mockup
Primary request: Create one flat front-facing orthographic rectangular cabinet FRAME, portrait 1024 by 1536 pixels, filling the entire image edge to edge. It is an empty material frame that actual live game controls will be placed over.
Composition: Slim bevelled champagne-gold outer rails occupy approximately the leftmost 8% and rightmost 8% of the canvas. The top 13% is a refined symmetrical stepped Art Deco crown: pale brushed brass edge work, a small central fan / sunburst low relief, and an EMPTY dark nameplate. The bottom 7% is a simple refined vent and coin-return lip. The remaining central 80% height between those borders is a SINGLE UNINTERRUPTED EMPTY dark green-black lacquer panel with only almost imperceptible micrograin. It must have absolutely no internal objects, partitions, highlights, framing, decorations, seams, hardware, embossing or focal features in that center panel. Side rails have straight continuous vertical portions suitable for CSS stretching; ornament is confined to top and bottom corners.
Style/medium: restrained premium 2.5D game UI artwork, elegant minimalist Art Deco meets subtle retro future. Tactile pale brushed champagne brass and deep forest-black lacquer, very fine enamel edges. No gaudy ornamentation. Quiet sophisticated palette: ink #0c1715, champagne #c3a76b, pale enamel #f2e3c0. Soft light from upper left with readable bevel highlights at phone scale. The center panel is opaque #0c1715, not transparent.
Constraints: exact front elevation with parallel verticals; no perspective or tilt. Cabinet and frame extend to all canvas edges: no outer background, no transparent margin, no exterior drop shadow margin. Keep side rails slim, not chunky. NO text, letters, numbers, logos, watermarks, reel windows, symbols, fruit, buttons, levers, meters, slots or other controls. Only the EMPTY cabinet frame and its empty uninterrupted dark lacquer center. No room, no scenery, no mock phone. No shiny yellow gold, baroque carving, neon, colored glow or flashy casino styling.
```

Source output: `exec-8e867fdd-03b7-4b48-b69e-3b643a08b211.png`; selected original: `public/art/cabinet-frame-v1.png`.

## Hotel lobby prompt

Image 1 was the selected cabinet frame, supplied only as a material/style reference, not as an edit target. Inspected the frame before passing it as reference.

```text
Use case: stylized-concept
Asset type: portrait title-screen environmental art for an elegant mobile slot-machine roguelike game, 1024 by 1536 pixels
Input images: Image 1 is only a MATERIAL AND ART DIRECTION reference. Match its pale champagne brass, dark green lacquer, restrained stepped Art Deco relief, tactile softly shaded 2.5D premium game finish. Do not reproduce a giant empty frame.
Primary request: A quiet late-night Art Deco boutique hotel gaming alcove. One beautifully crafted small slot machine in pale brass and deep forest-green lacquer sits centrally in the lower-middle of the composition on a dark polished pedestal. Its softly lit ivory three reel windows and one small muted ruby-red pull lever are visible. The machine feels mysterious and inviting rather than gaudy. Two warm small wall sconces gently illuminate tall dark green lacquer wall panels with slim geometric brass trim. A few subtle curved reflections on dark flooring.
Composition: Portrait establishing scene, largely front-facing with slight architectural depth. The machine occupies around 34 percent of image width and 37 percent of height, from y≈46% to y≈83%. Upper 38 percent of canvas must be quiet dark wall, only barely perceptible architectural lines, clean negative space for live title lettering. Lower 15 percent softly falls into near-black for live menu buttons. Framing is intimate, not a huge casino. There are NO people.
Style/medium: art-directed premium 2.5D illustrated game environment, tangible metal and enamel, quiet cinematic depth, carefully controlled soft highlights. Elegant restrained Art Deco with a hint of retro-future. Pale champagne gold, forest-black lacquer, softly warm ivory light, tiny muted ruby accent only on the physical lever. Soft warm lamps against dark emerald shadows.
Constraints: no text or readable lettering anywhere, no numbers, no brand, no logos, no watermark, no UI labels, no HUD, no cards, no superimposed buttons, no phone outline, no ornate baroque details, no rainbow casino lighting, no neon, no flashy coins or jackpots, no giant symbols. This is real background art, not a screen mockup. Keep most of image dark for readable overlay text.
```

Source output: `exec-b03e7845-3b26-41ff-aa7e-0f1891292a4b.png`; selected original: `public/art/hotel-lobby-v1.png`.

## Review

- Frame: exact front elevation, plain center, no generated text or false controls; subtle material detail preserved.
- Lobby: consistent lacquer, champagne metal and geometric fan motif; no generated lettering or UI. Atmospheric machine symbols are only part of the title-screen illustration.
- No existing artwork was overwritten; no code, gameplay, probabilities, persistence or publishing was changed by the asset-generation task.
