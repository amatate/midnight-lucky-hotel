# Classic cabinet family

Status: implemented locally and focused checks passed, 2026-10-13. Visual direction approved; final play-feel acceptance remains with the user. Not committed, pushed or deployed in this task.

Release follow-up, 2026-10-14: included in the approved classic-cabinet / coin-tray release. The checks below describe the original implementation session; deployment status is recorded by the repository's Pages workflow.

## Scope

Keep the original machine, its v1 key, original 8,000 outcomes, hotel rules and all existing saves unchanged. Add Diamond, Wheel and Vault as separate virtual-credit machines with independent save keys. No purchase, cashout, deployment or GitHub push in this task.

## Design and implementation order

1. New pure rule model and persistence adapter; original engine stays intact.
2. Parameterize reel artwork/strips, retaining exactly 20 stops and the existing motion, timing, braking and seating curves.
3. Shared machine selector and live feature heads: diamond multiplier lenses, physical bonus wheel, progressive odometer. Use existing enamel cabinet and approved family concepts; new generated diamond crest is decoration, not controls.
4. Bilingual rules, causal payout breakdown and ledger. Bonus results persist before presentation, no duplicate payout on reload.
5. Focused math/storage/UI tests, production build and isolated phone/browser play checks. Preserve user browser progress.

## Visual tokens / review

Enamel #14291f, dark #0b1712, pale brass #d8c48f, ivory #f2e3c0, nickel #bfc7c2, burgundy #822f3e. Smiley Sans display + Barlow Condensed numerals + readable body. Shared layout: switch machine -> distinct head -> meters -> reels + lever -> payout explanation -> bet + spin -> rules/ledger -> tray. Each cabinet spends ornament on one signature; no generic dashboard cards or extra inventories. Short phones may scroll rather than shrink controls.

## Implemented rules for this build

- Diamond: one diamond on each 20-stop reel; substitutes only to complete a full three-of-kind, excludes blank. One participating diamond doubles the full-match award, two quadruple it, three diamonds pay 100x. Natural partial cherries remain separately eligible; choose the best award, never add tiers. Base triples: 7=20, bell=6, BAR=3, cherry=3, lemon=2; two cherries=2, one=1. Full enumeration expected RTP 95%.
- Wheel: third reel has one wheel symbol, replacing a blank. Any center wheel on reel three triggers one bonus wheel, even when the base line also pays. Eight equal-probability sectors: 1/2/3/2/10/2/3/1 times the triggering bet. Base triples: 7=100, bell=15, BAR=8, lemon=5, cherry=4; two cherries=2, one=1. Trigger 1/20; expected combined RTP 96.325%. Pressing the bonus button changes presentation, never the outcome.
- Vault: same base as Wheel except triple 7 is the progressive, not an additional fixed award. Exactly two 7s award an extra 10x mini; natural cherries may also pay. Pool starts at 200x the bet and grows 0.04x each paid spin. Store pool in integer hundredths of a bet; amounts displayed and awarded scale with selected bet, clearly disclosed. This prevents low-bet accumulation/high-bet extraction of a shared cash pool. Triple 7 collects the post-contribution pool and resets to 200x. Pool persists when switching/exiting. Long-run fixed-bet renewal expectation 93.7%; reset-state next-spin expectation is lower, so disclose both rather than a false fixed RTP. All money rounded to hundredths of credits.

## Critical invariants

- Original motion.ts and motor.ts not retuned; new strips have the same physical geometry.
- Visual RNG/animation never chooses outcomes. Reel and wheel endpoints match stored result.
- Feature trigger has a visible causal explanation. Break-even is not celebrated as profit.
- Reserve bet and all feature outcomes atomically; interrupted features settle exactly once.
- Per-machine locks and stale-tab checks. Invalid save is preserved; reset is explicit and names its scope, including the Vault pool.
- Reduced motion preserves results, removes lengthy motion/coins; no permanent flashing.
- Only fixed rules, no adaptive odds or manufactured near misses.

## Runtime structure

- `src/classic/machines.ts`: per-machine strips, pure awards and state, exact outcome enumeration. `machine-storage.ts`: original adapter plus independent feature keys and recovery.
- `MachineHead.tsx` / `feature-motion.ts`: live multiplier lamps, eight-sector wheel with detent sounds and rebound, jackpot counter. Original 3D reel motion and motor synthesis remain unchanged; `Reels.tsx` / `reel-scene.ts` accept per-machine strips.
- `ClassicScreen.tsx`: switcher, shared controls and meters, pending-bonus gate, staged count-up and causal ledger. `MachineRules.tsx`: bilingual rules and odds. `family.css`: feature heads and compact layout; original reel aspect and cabinet lower clearance retained.
- Vault holds the actually awarded amount during celebration, even if the next bet is changed, then displays the reset pool for the selected bet.

## Validation and limits

- `npm test -- tests/classic`: **5 files, 44 tests passed**. Includes original rules/motion/storage plus new enumeration, wildcard exclusions, all eight wheel endpoints, mixed-bet money/pool conservation, save isolation, stale writes, reserved-bonus recovery and UI flow. The final UI regression covers a bet change during jackpot celebration.
- `DEPLOY_BASE_PATH=/midnight-lucky-hotel/ npm run build`: passed TypeScript and production compilation. New crest included in PWA precache. Existing large-bundle warnings remain (Three.js renderer and main application); no claim of new performance optimization.
- `git diff --check`: passed. No full hotel regression sweep was run for these isolated changes.
- Browser: a separate in-memory Chrome profile, not the player's browser profile. Actual pointer drag initiated Diamond spin; all three curved reels stayed rendered in motion; seed 121 settled base 30 ×4 =120, credits 1,110.
- Wheel seed 122: base 10, bonus sector 4 =×10, combined payout 110; credits 990 before bonus and 1,100 after. Bonus button did not charge another bet. Pointer landed on ×10 (`rotate(180 100 100)`).
- Vault seed 2957: triple 7 paid 2,000.4, final credits 2,990.4, visible won amount retained during celebration, pool reset to 2,000 at bet 10.
- Layout: 390×844 baseline and 390×700 compact viewports; 320×640 Vault also checked. No horizontal overflow. At 390×700, Wheel primary button bottom 656px; at 320×640, Vault primary button bottom 610px and lever width 44px. Short screens can scroll to the ledger/rules/tray rather than shrink playable controls. English desktop checked at 1280×900; switching back restored original machine with live 3D reels.
- Fresh browser console showed no application errors. Automated tests check recovery and reduced-motion endpoints; this is **not** real iPhone/Safari, long-session performance, physical audio listening, or final balance acceptance.
- Screenshots are local QA artifacts in `output/playwright/classic-family/`; this folder is ignored. It includes `diamond-in-motion.png`, `diamond-4x.png`, `wheel-ready.png`, `wheel-in-motion.png`, `wheel-paid.png`, `vault-jackpot.png`, `vault-paid.png`, `vault-320.png`, `wheel-compact.png`, `wheel-desktop-en.png`, and `original-preserved.png`. Early screenshots precede the final restoration of original reel proportions and shorter bonus-button copy.

## Generated production asset

Built using the built-in **imagegen** tool, with the approved family board as a visual reference. No API/CLI image-generation fallback. The result was visually inspected on its own and in the phone interface. All controls, symbols, text, live meters, wheel sectors and outcomes are rendered in code, not embedded in this raster.

- Source: `docs/implementation/assets/diamond-crest-v1.png` (1254×1254, transparent PNG).
- Runtime: `public/assets/classic/diamond-crest-v1.webp` (approximately 205 KiB, alpha retained), a format conversion at WebP quality 88. Existing cabinet enamel is reused.
- Generator original: `exec-57addc08-5e57-4bc8-bbbb-038891114732.png`; a repository copy is kept in `docs/implementation/assets/diamond-crest-v1.png`.

Final prompt:

```text
Use case: product-mockup. Asset type: a single production decorative medallion for a mobile mechanical slot-machine marquee, isolated on a genuinely transparent background. Style reference: approved DOUBLE DIAMOND cabinet in attached family board. Generate ONLY its central faceted diamond emblem inside a thin circular pale champagne-brass and satin nickel bezel, a very narrow dark forest-green enamel inset behind the diamond inside the bezel. Precise elegant Art Deco jewelry-like crafted hardware, front facing orthographic, centered circular composition, entire circular bezel visible with transparent margin. The large ivory/clear faceted diamond has restrained warm reflections and fine realistic bevels, not blue ice, not sparkle effects. Palette champagne #d8c48f, ivory #f2e3c0, green #14291f, nickel #bfc7c2. Soft studio light. No cabinet, no wings, no shoulders, no rectangle, no text, no letters, no numbers, no glow outside edges, no watermark. Only this circular physical emblem. Outside the circular bezel completely transparent. Keep simple and legible when displayed 88px wide.
```

The frontend-design skill guided material hierarchy and compact physical controls; game-feel guided preservation of the original acceleration/braking plus feature-specific detents, lamps and staged payouts. Generated pixels are decorative only.
