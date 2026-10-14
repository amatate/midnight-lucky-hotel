# Classic cabinet material pass

## Scope

- Preserve the classic engine, reel strips, paytable, RNG, persistence and hotel mode.
- Keep the existing green / pale champagne Art Deco identity and mobile-first layout.
- Generated cabinet skin is decorative; all titles, counters, controls and reels remain live.
- Add deeper reel-window hardware, restrained static glass reflections, physical bet keys,
  a machined lever rail, a recessed coin tray and an engraved baseplate.
- Clarify cherry awards as being on the center line, without changing awards.
- Use the existing Barlow Condensed numerals / display and Smiley Sans Chinese title.
- Palette: enamel #14291f, shadow #0b1712, brass #d8c48f, ivory #f2e3c0,
  shadow bronze #736145. Signature: narrow fluted brass rails with fan-shaped shoulders.
- Layout: engraved crown → meters → center-line reels + lever → bet keys / spin →
  rules / ledger → tray. Avoid fake controls or rasterized labels.

## Asset provenance

- Generated with the built-in image generation tool, not a downloaded antique photograph.
- Runtime: `public/assets/classic/cabinet-enamel-v1.webp`.
- Original source: `docs/implementation/assets/classic-cabinet-enamel-v1.png`.
- WebP is a lossless format conversion at the original 1024 × 1536 resolution.
- Original generation: `exec-8af7e22f-8648-45c6-a951-1f2d48e3fe14.png`.
- CSS resolves the asset through Vite so the GitHub Pages base path is respected.
- This is an original fantasy cabinet, not a replica of a specific manufacturer's machine.

## Final generation prompt

```text
Use case: product-mockup.
Asset type: production game UI cabinet skin, a single flat front-facing portrait backplate to be used underneath live HTML controls and a real 3D reel window. Not a screenshot of a finished game.
Primary request: a sophisticated and restrained Art Deco mechanical slot-machine CABINET FACE ONLY, champagne pale brass and very dark forest-green enamel, beautiful tactile real materials and plausible collectible 1930s precision manufacturing. Portrait 2:3 composition. Orthographic straight-on camera, no perspective tilt. The entire outer cabinet is visible and fills the image edge-to-edge, NO surrounding room or background.
Composition: narrow stepped rounded shoulders, pale brushed brass outer casing taking only the outermost 3 percent of the width. Inner warm brass pinstripe frame, vertical fluted brass side rails near the very edges. Broad uninterrupted DARK GREEN blank recessed center covering x=7%..93% and y=16%..91%, to receive live controls. At the top 15% only, engraved stepped geometric fan/wing ornament at far left and far right; leave the central half of that top section plain dark green for a live title. At the bottom 8%, a understated stepped brass pedestal with a narrow dark horizontal seam, no actual tray hole. Tiny realistic slotted screws in outer four corner hardware. Subtle fine enamel grain, satin brushed brass, polished bevel edge highlights and recessed seams, very restrained age patina, not distressed or dirty. A product photograph of precision crafted hardware, NOT a flat vector illustration.
Lighting: soft broad warm upper-left light and muted cool reflected edge light, softly glossy enamel, realistic restrained metal, not glittery. Palette green #14291f, deep green #0b1712, pale champagne brass #d8c48f, cream reflections #f2e3c0, shadow bronze #736145.
Constraints: NO TEXT, no letters, no numbers, no logos, no symbols, no reel windows, no reels, no screens, no meters, no knobs, no buttons, no lever, no fruit, no coins, no bulbs, no inset rectangular cards in the center. The interior green area must be clean empty material suitable for overlaying an interface. Keep the frame narrow so the interface has maximum room on a phone. No gaudy ornament, no neon, no gold baroque filigree. Exact straight-on symmetrical silhouette, tactile physical depth in outer trim.
```

## Acceptance

Verify phone widths 320 / 390, compact height 700, desktop English, one real
spin and lever action, rules / ledger, and no horizontal overflow. Use an isolated
browser profile, never the user's live save. Run focused classic tests plus production
build; successful checks do not substitute for the user's visual / play-feel acceptance.

### Verified in this pass

- 23 classic tests across 3 files pass; TypeScript and production build pass.
- Pages-base build resolves the cabinet WebP under `/midnight-lucky-hotel/`.
- Added the skin to the existing offline precache list; verified its generated entry.
- Isolated Chromium: 390 × 844, 390 × 700, 320 × 640 have no horizontal overflow;
  the spin button stays within the viewport at every size, and 3D reels remain active.
- Button spin followed by a real pointer drag on the lever settles exactly two spins.
- Center-line cherry wording is visible in the rules sheet and covered by the UI test.
- English desktop screenshot checked at 1280 × 900; no browser errors or warnings.
- Screenshots: `output/playwright/classic/cabinet-art-{phone,compact,small,desktop-en}.png`.
- Not yet verified on a physical iPhone / Safari; no deployment or GitHub push performed.
- Existing large-JS-chunk build warning remains; this pass adds no JavaScript dependency.
