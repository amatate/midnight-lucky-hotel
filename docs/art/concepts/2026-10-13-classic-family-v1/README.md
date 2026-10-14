# Classic family concepts — approved for implementation

Date: 2026-10-13

Approved by the user later on 2026-10-13. The material below records the original concept-only delivery; it is not the current implementation status. See [the implementation and verification record](../../../implementation/2026-10-13-classic-family.md) for the playable local version and its limits.

## Scope and status

Two generated approval concepts only. No gameplay, UI code, production assets, balance, storage, or original classic machine changed. Implementation is gated on the user's visual approval. These are original fantasy cabinet concepts, not manufacturer replicas.

- `cabinet-family.png`: three-cabinet exterior comparison, left Double Diamond / center Midnight Wheel / right Vault 777.
- `mobile-family.png`: corresponding portrait mobile UI concepts.
- Generated with the built-in image-generation tool; no CLI/API fallback.
- References: the current `output/playwright/classic/cabinet-art-phone.png`, followed by the generated family board for the mobile sheet.
- Original outputs remain at the generator paths; these copies are documentation only.

## Design direction

Retain existing dark green enamel, pale champagne brass, ivory physical reels, fan shoulders, fluted rails and burgundy lever. Condensed display lettering and high-contrast Chinese controls continue the current identity.

- Double Diamond: faceted diamond marquee and readable 2x/4x indicator lenses.
- Midnight Wheel: actual separate mechanical bonus wheel above the reel window.
- Vault 777: stepped shoulders, split-flap/odometer jackpot meter and a restrained vault-lock motif.

Frontend-design guidance influenced the shared phone layout: one signature feature per cabinet, clear material hierarchy, large center-line reels, retained right lever, and lower thumb-zone controls rather than web-style cards. The first generated board favors a common brass family over the proposed nickel accent; keep this visible choice subject to user approval.

## Inspection and implementation boundaries

Both outputs visually inspected. Each has three distinct cabinets, three reel columns, visible right lever and physical buttons. The mobile sheet includes Chinese labels, amount strip, bet selector, spin button and rules/ledger links. This is a generated layout proposal, not evidence of responsive behavior or touch-target acceptance.

- Numerical values and payouts are placeholders, not approved probabilities or balanced paytables.
- Visible winning arrangements alongside idle counters are illustrative composition, not a valid settlement state.
- Keep all text, controls, reels, wheel outcomes and counters live in implementation, not baked into one raster screenshot.
- Preserve original classic rules and save; new machine rules and persistence require separate design and tests after approval.
- Mobile priority: validate 390x844 and compact screens; do not reduce playable reel area or control size to preserve oversized decoration.
- Existing real curved reels remain; do not implement generated horizontal cell seams as a flat nine-cell grid.
- Do not interpret same-size wheel sectors as equal odds unless the actual rules use equal odds.
- Production asset slicing/generation, stateful feature animations, audio, mathematics and runtime tests have not started.
- Intended order after confirmation: Double Diamond, Midnight Wheel, then Vault 777. User may change this.

## Final prompts

### Exterior comparison

```text
Use case: product-mockup.
Asset type: approval-only industrial design concept board for three new original slot cabinets in the existing MIDNIGHT game family. This is NOT a revision of the existing original machine.
Input image: style reference only, a screenshot of the current approved classic machine. Preserve its restrained deep green enamel, pale champagne brass, fluted edge rails, geometric fan shoulders, cream physical reels, readable center payline, burgundy lever knob, and tasteful condensed lettering.
Primary request: create one exceptionally refined wide landscape triptych product design sheet, three distinct collectible tabletop mechanical slot cabinets, presented at equal scale, front-facing with only a hint of product depth. Three columns with narrow quiet gutters, no room scenery. Each entire cabinet visible, each has exactly THREE cylindrical mechanical reels visible behind one continuous glass window, ONE horizontal center payline, a right-side physical lever, simple physical bet keys, a circular SPIN key, and a coin tray. No separate 9-cell video grid. The artwork must feel manufactured and tactile, not a casino banner or generic app.
Left cabinet: original title "DOUBLE DIAMOND". Dark green-black enamel and satin nickel, pale champagne brass details shared with the reference. A restrained faceted ivory diamond emblem in the arched marquee, two small functional backlit multiplier lenses marked "2x" and "4x". Reel symbols BAR, cherries, a simple diamond. Precise jewelry-like bevels, no glitter.
Middle cabinet: original title "MIDNIGHT WHEEL". Forest-green enamel and pale champagne brass. Signature feature: a beautifully crafted actual mechanical bonus wheel in a circular upper head ABOVE the three-reel window, solid brass pointer at twelve o'clock, ivory and green segmented prize face, restrained thin warm lights. Wide enough wheel to read its form but not an enormous Vegas billboard. The reel section and right lever remain generously sized. Wheel and reels are physically separate mechanisms.
Right cabinet: original title "VAULT 777". Deep green enamel, pale brass, slightly more squared stepped shoulders. Upper head has an integrated elegant split-flap or odometer-style mechanical jackpot meter with exactly "JACKPOT" and "12,480", a small red indicator. Lower apron has a discreet circular vault-lock design rather than a giant obstructive safe door. Show red 7 symbols on reels. Real small screws and bank-instrument precision.
Style/medium: high quality realistic 3D industrial design visualization, original Art Deco with a restrained retro-futurist undertone, premium materials, subtle patina only at joints, clean not distressed. Matching familial silhouettes but clearly different functional upper heads. Soft broad studio light reveals enamel depth and brushed-metal grain. Background nearly black green #0b1712, green #14291f, champagne #d8c48f, ivory #f2e3c0, nickel #bfc7c2, burgundy #822f3e. Saturation restrained.
Text: only the three cabinet titles, small "BET", "WIN", "SPIN", wheel numerals, and specified functional indicators. Beautiful condensed Art Deco engraved capitals, no paragraphs, no extra logos.
Constraints: elegant NOT gaudy, pale gold not yellow gold, no neon, no purple, no flying money, no lens flare, no glossy plastic, no cartoon, no baroque flourishes, no people, no website cards or navigation dashboard, no commercial brand logos, no watermark. Keep the lever visible on all three. Large clear creamy reel symbols remain central, not hidden by ornament. Output a single landscape comparative concept board.
```

### Mobile comparison

```text
Use case: ui-mockup.
Asset type: approval-only, high-fidelity mobile game UI concept sheet for three sibling classic slot machines. Create ONE landscape board with THREE equally sized upright 390:844 mobile screen mockups side by side. Not physical phone photography: straight-on flat screens with no handset bezels, no perspective, no surrounding room, no giant explanatory headings. Each game screen fills its portrait area with a functional tactile machine UI, not a miniature full-body cabinet in a room.
Input images: first reference is current working mobile classic UI (layout and typography reference); second reference is the new cabinet family concept board (materials, names and machine identity reference). Preserve familial design and adapt it to genuinely playable phone layout, NOT just shrinking a cabinet render.
Shared layout for every screen: small top safe-area/navigation strip with "返回" and "设置"; compact engraved machine title; distinctive feature head; one HIGH-CONTRAST horizontal meter strip clearly labelled "筹码 1,000", "下注 10", "本转 0"; compact engraved rule caption; a LARGE three-cylinder reel window with cream curved reels, only one marked CENTER payline, visible glimpses of symbols above/below, burgundy lever knob and narrow right-side pull rail fully within screen; one concise status line; physical tactile bet keys "5", "10", "25", "50" with 10 selected and a generous circular pale-brass primary key "转一转"; compact bottom utility tabs "赔付表" and "账本". Avoid extra menus. Allow a proper bottom safe area. High contrast ivory labels on green; dark lettering only on pale surfaces. All touch controls at least visually 44px at 390px width. Main reels at least 200px tall, don't sacrifice readability for decoration. Narrow side rails use no more than 5 percent of screen width on each side.
Left screen "双倍钻石": green-black enamel, satin nickel mixed with pale brass. Shallow diamond marquee, small "2x" and "4x" multiplier lenses. Caption exactly "钻石替代符号 · 中奖翻倍". Large center line shows BAR, diamond, BAR. Status exactly "选好下注，拉下一转". Do not show a fake completed payout; this is an illustrative idle interface.
Center screen "午夜轮盘": pale brass and dark green, small but readable circular mechanical bonus wheel integrated in the upper 24 percent of cabinet below title. Individual wheel prizes clear and simple. Pointer, ivory/green segmented face and quiet peripheral lights. Wheel is the distinctive head, not a background watermark. Caption exactly "转中奖励符号 · 启动轮盘". Keep reel window as large and controls in the same lower thumb zone as other screens; don't turn it into a tiny strip. No full-screen bonus overlay in this sheet.
Right screen "金库 777": stepped brass upper corners and dark green enamel. Compact split-flap odometer "JACKPOT 12,480" and a MUCH smaller plainly labelled second line "小奖 100"; no four-tier casino dashboard. Caption exactly "奖池持续累积 · 组合命中领取". Precise safe-lock geometry only in subtle lower apron accents, never behind a label or control.
Design language: exact restrained Art Deco family of references, delicate fluted rails, fan corners, enamel depth, soft realistic glass reflections that NEVER reduce reel visibility, Barlow-Condensed-like tall numeral forms, restrained distinctive Chinese display typography inspired by the current screenshot, legible Chinese body text. This should look like a premium mobile mechanical game, not an HTML dashboard and not a gaudy social casino.
Constraints: only three reels per machine, only middle horizontal line highlighted, right lever retained, no upgrade cards, no inventory, no roguelike elements, no cluttered HUD, no floating coins, no bloom, no purple neon, no black-on-black text, no microcopy too small to read, no text printed across reels, no unrelated brand logos, no watermark. Crisp polished usable UI composition. Concept values are illustrative, not finalized game math.
```
