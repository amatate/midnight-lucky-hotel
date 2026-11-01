# UI artwork pass · 2026-10-31

## Scope

One new transparent atlas supplies **24 icons**: 10 reel upgrades / information tools, 5 route emblems and 9 cosmetic keepsakes. The existing 19 installed-part illustrations are reused rather than regenerated. All 29 upgrades now have artwork in the equipment catalogue and upgrade picker.

Art direction: restrained Art Deco, pale brass, jade enamel, ivory paper and muted burgundy. Names, prices, effects, progress, selected states and ownership remain live, translatable text. No odds, payout rules, RNG, save schemas or classic reel animation changed in this pass.

## Source and delivery

- `hotel-icons-master-v1.png`: selected 1536 × 1024 PNG master from built-in image generation, after a transparent-cutout refinement.
- `prompts.md`: exact generation and refinement prompts. `public/art/installed-parts-v1.png` was the style reference.
- `public/art/hotel-icons-v1.webp`: runtime atlas, 379,700 bytes (about 371 KiB); WebP quality 88 with lossless alpha.
- `src/app/ui-art-index.ts`: typed identity-to-frame manifest, independent of gameplay data.
- `src/app/components/UiArtwork.tsx`: shared decorative artwork components, with a fallback when the image cannot load.
- `src/app/ui-art.css`: presentation styles, including compact-phone layouts.
- `keepsakes-mobile.png`, `upgrades-mobile.png`, `services-mobile.png`: actual 390 px browser screenshots, not generated mockups.

The generated sheet is approximately 6 × 4, but not every silhouette stays inside an equal cell. Runtime frames are calibrated to actual object bounds; **do not replace them with equal 256-pixel crops**. Each SVG explicitly clips its source frame to avoid adjacent art appearing in letterboxed space.

## Atlas order (left to right)

| Row | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Lemon crate | Cherry pitter | Seven purification | Tithe box | Artificial crack | Pruning shears |
| 2 | Carbon copy | Calculator | Ledger | Statistics terminal | Fruit route | Chapel route |
| 3 | Workshop route | Fault route | Accounting route | First-night stamp | Ledger tab | Two-cabinet ticket |
| 4 | Workshop stamp | Reel Club card | Room key | Garden postcard | Penthouse postcard | Regular medallion |

## Surfaces

- Equipment collection: illustrated object, route emblem, existing discovery/favourite controls.
- Upgrade offers and confirmation: same illustration for recognition before and after selection.
- Service selection: route emblem next to the heading; description and costs below.
- Guestbook goals, keepsake collection and reward overlay: tangible souvenir illustrations.
- Lobby next-goal hint: matching keepsake icon.

All nine keepsakes can be previewed. Uncollected entries are explicitly labelled, show their acquisition condition, and do not reveal earned memory notes. Previewing does not claim a reward or modify progress. Only the existing claim action adds ownership.

## Verification boundaries

- Typecheck and 42 targeted tests passed (art mapping/fallback, guestbook, catalogue, upgrade picker, languages and navigation).
- Production build with `DEPLOY_BASE_PATH=/midnight-lucky-hotel/` passed; service worker includes the new atlas.
- Independent Playwright profile, not the player's saved browser: inspected catalogue and keepsakes at 390 px, keepsakes at 320/1024 px, and played the first three spins into the upgrade picker at 390 px.
- Checked English keepsake text, image loading, transparency, crop edges, upgrade confirmation and horizontal overflow.
- A browser pass caught inherited absolute positioning overlapping service text. Replaced it with a two-column icon/title row, then confirmed no overlap at 320/390 px.
- Physical iPhone/Safari and the user's visual acceptance are still separate checks. This pass is local; no GitHub push or deployment was performed.

For later additions, add an art ID and calibrated frame, reuse the shared wrappers, and extend the mapping test. Do not add art coordinates to rules or serialized save data.
