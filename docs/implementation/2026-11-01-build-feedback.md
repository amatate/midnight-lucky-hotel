# Build feedback and reward calibration · 2026-11-01

## Scope

Presentation-only pass: make parts visibly install, charge, trigger and pay, and distinguish a return from a profitable reward. Preserve the accepted cabinet art, tactile reels, lever, engine outcomes and save contracts. No new rooms, odds, balance changes or tutorial interruptions.

This publication also includes the previously local reception/guestbook, Classic tutorial/autoplay, UI-copy cleanup, navigation and generated icon atlas. Their source records are under `docs/media/concierge-2026-10-31` and `docs/media/ui-atlas-2026-10-31`.

## Implementation

- `part-feedback.ts` projects counters from pre-settlement evidence and the presented event cursor. It never dispatches commands or modifies saved counters. The Vat shows full charge at ignition and drains when its own award is presented; Candle charge stays visible until payment.
- `PartInstallFeedback` observes an actual slot change and reuses existing part art for a 620 ms flight. Hydrating a save does not install or animate parts again. Short explanatory notes require no extra click.
- `PresentedCoins` keeps one bounded money cue alive long enough to complete its flight. Pause, reduced motion, skipping and a new spin cancel it; resuming does not replay it. Parts are the source of their own coins; line rewards start at the board.
- `payoutTier` separates zero, return (payout <= paid stake), ordinary profit, 3× and 8× payout tiers. Free spins use the current reference bet. Event counts and free-spin awards no longer force jackpot feedback. Presentation intensity follows the money already shown, not the hidden final result.
- Charge-only outcomes still show their cause. Ordinary effects remain short; charge release gets a brief readable beat. The existing skip/accelerate controls remain available.
- The ledger derives part summaries from persisted receipts and action entries. It lists direct part awards and evidenced charge changes without double counting. A standalone old checkpoint lacks some evidence and does not invent it. “After bet” excludes service costs, which remain separately listed.
- New text has Chinese/English coverage; reduced-motion presentation stays static and suppresses haptics.

## Save compatibility

The published hotel fingerprint remains `rules-a3d7519aafedd7f5`. A previously local tool explanation had inadvertently changed the rules fingerprint to `rules-26033f2e5a3a637b`; that display text now lives in the UI wrapper rather than rules content. An explicit migration for that exact version branches from the validated snapshot, preserving its original archive, money, counters, reserved draw, RNG and receipts. It does not replay old commands with different rules.

## Verification

- TypeScript check passed.
- Initial full run: 927 / 929 assertions passed; the two failures were stale text expectations. Updated those expectations and reran five affected files: 97 / 97 passed, including new migration and coin-lifetime tests.
- Targeted feedback/presentation/language run earlier in the pass: 86 / 86 passed.
- GitHub Pages workflow runs the complete suite again and builds with `/midnight-lucky-hotel/` as its base. A successful push alone is not deployment confirmation.
- Manual browser checks use a separate browser profile, not the user's active game. Final release confirmation records the workflow result and deployed version.

Not established: real iPhone/Android frame rate, sustained audio/thermal performance, improved player understanding, or better game balance. No balance simulation is claimed for this presentation change.
