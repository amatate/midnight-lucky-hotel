# Task 7 Report: Chapel Route, Prayer, and Omen

## Outcome

Implemented the Chapel service commands, prayer lifecycle, settlement-private Chapel part reactions, omen settlement, deterministic temporary-strip reconciliation, and next-shift resets.

## TDD Evidence

- RED: `npm test -- tests/content/chapel.test.ts` failed because `@/content/effects/chapel` and `@/content/services/chapel` did not exist.
- GREEN: the focused Chapel suite reached 32 passing tests.
- Prayer success semantics received a separate red/green regression: a final matching line that did not receive a base `LINE_WIN` award initially failed to add omen, then passed after success was restricted to final wins also present in the settlement's awarded-win set.

## Implementation

### Commands and services

- Added serializable `PRAY` and `ENABLE_MARTYR` commands.
- Added `pendingPrayer` to `RunState`, initialized in `createRun` and reset during shift advancement.
- `pray` requires `READY_TO_SPIN`, no pending spin, Chapel service, one remaining intervention point, a base-symbol target, and no prior prayer this shift.
- Prayer spends one focus, sets `interventionUsedThisSpin` before the draw, records intervention/resource/history events, and puts exactly two selected symbols in each temporary reel-addition strip.
- `enableMartyr` requires `READY_TO_SPIN`, no pending spin, no completed base spin, an equipped martyr coin, a positive affordable offering, and no prior enabling this shift.
- Martyr cost is `ceil(prePaymentBankroll * 0.10)` and is recorded in Chapel expenses and a service event.

### Temporary reel reconciliation

- `SPIN` draws from permanent strips followed by temporary additions while leaving `state.reels` unchanged.
- Settlement creates one boolean marker for every draw-strip entry. Prayer-added suffix entries are marked temporary.
- Structural removal filters symbols and markers together; permanent additions append `false` markers; transforms preserve the marker at the transformed position.
- Settlement display strips retain surviving temporary entries, while permanent `state.reels` filters only entries still carrying temporary markers.
- Prayer state and temporary additions clear immediately after settlement.
- Tests cover same-symbol permanent preservation, permanent blank additions during prayer settlement, and marker alignment when an earlier permanent food entry is consumed.

### Chapel settlement reactions

- `reactChapelParts` is registered centrally once per equipped Chapel slot.
- Settlement-only symbol-keyed registration metadata creates the exact Chapel capability; external system/part registrations receive no capability and spoofed public metadata is stripped.
- Crack disabling suppresses the exact disabled Chapel slot.
- Resolve-local claims enforce first-line/once-per-spin behavior.
- Omen collector consumes all omen on the first seven award and adds 0.5x/1.0x current bet per omen layer.
- Triple blessing repeats the first seven line award once/twice and appends one/two permanent blanks to every reel without duplicating the base line event.
- Midnight bell transforms the leftmost one/two literal bells on the first bell line, then reevaluates lines.
- Enabled martyr coin repeats the first seven line award once/twice.
- All added awards use part attribution and pass through the existing food-buff multiplier exactly once per payout copy.

### Prayer result

- Prayer succeeds only when the final post-effect grid contains the prayed symbol as a resolved winning symbol and that exact final win was awarded as a base line during settlement.
- Wild-assisted lines resolving to the prayed base symbol count.
- Failure adds one omen and emits its resource delta.
- Prayer preserves the sole-intervention flag throughout spinning/stopping, so post-stop respin is rejected; the same shared flag is ready for the later kick command.

## Existing Chapel Reel Modifications

- Seven purification and tithe-box acquisition were not duplicated.
- Existing upgrade code/tests already cover cherry/lemon replacement, tithe cost, seven addition, omen addition, Chapel expense, and the below-10 eligibility boundary.

## Self-review

- Probability space: RNG ranges use the merged strip lengths, so all six prayer copies participate in the next draw only.
- Cleanup identity: no symbol-count inference is used; permanent same-symbol additions and transforms cannot be mistaken for prayer copies.
- Once guards: multi-seven-line tests verify omen collector, triple blessing, and martyr coin each trigger only on the first seven line; Midnight Bell uses a two-bell-line fixture and triggers once.
- Omen: zero omen produces no effect; nonzero omen is consumed once and emits the exact negative resource delta.
- Martyr: tests cover rounding from 100.01 to 11, expense recording, first-spin boundary, duplicate enable, missing part, zero bankroll, and an unaffordable sub-unit bankroll.
- Capability isolation: both external system and external part handlers are tested without Chapel capability access.
- Termination: Chapel handlers are finite; Midnight Bell claims before its single reevaluation and all structural counts are 1 or 2.

## Verification

- `npm test -- tests/content/chapel.test.ts tests/core/run.test.ts tests/core/settlement.test.ts`
- `npm test`
- `npm run verify`
- `git diff --check`

The final fresh command results are recorded in the handoff message after completion.

## Fix Round 1

### Findings addressed

- Martyr Coin now pays its one/two additional copies for every distinct seven base-line award. Its resolve-local trigger key includes the exact awarded line identity, preventing a duplicate signal from repaying while allowing separate seven lines. Omen Collector and Triple Blessing retain their first-seven-only claims.
- Removed the structurally forgeable `chapelPart` member and exported Chapel capability interface from `ResolveContext`. Settlement now holds authorization in a private `WeakMap`: its symbol-keyed central slot registration synchronously authorizes the exact final context object passed to `reactChapelParts`, while the Chapel handler consumes only a narrow read accessor. A `finally` block deletes the entry immediately after that handler invocation. The mutating authorizer and brand store are not exported, external registrations receive separately cloned ordinary contexts, and forged former-shaped contexts produce no effects.
- Permanent prayer reconciliation now inserts one deterministic permanent blank whenever filtering surviving temporary entries would otherwise leave a permanent reel empty. The resolved display remains coherent with its surviving temporary entry, and the next spin safely draws the blank-only permanent reel.
- Confirmed the voluntary Martyr offering does not invoke loss/rescue checks. Tests cover a post-offering bankroll below minimum: the subsequent `SPIN` consumes a fuse and returns ready when equipped, or enters `RUN_LOST` without placing a wager when no fuse exists. Chapel expense and command history persist across both boundaries.

### RED evidence

`npm test -- tests/content/chapel.test.ts` produced four expected failures with 33 passing tests:

- Martyr L1 multi-line payout was 210 instead of 260.
- Martyr L2 multi-line payout was 260 instead of the hand-checked 360 target (the initial test literal was corrected from 410 before GREEN).
- Empty permanent prayer reconciliation returned `[]` instead of `["blank"]`.
- A forged former-shaped Chapel context produced Triple Blessing effects instead of `[]`.

The new fuse/no-fuse offering-boundary tests passed in RED, demonstrating the existing command ordering already deferred authoritative loss/rescue behavior until `SPIN`.

### GREEN and verification evidence

- `npm test -- tests/content/chapel.test.ts`: 37/37 passed.
- `npm run typecheck`: passed.
- `npm test -- tests/content/chapel.test.ts tests/core/run.test.ts tests/core/settlement.test.ts tests/core/progression.test.ts tests/content/upgrades.test.ts`: 92/92 passed.
- `npm run verify`: passed with typecheck, 13 test files / 147 tests, and the Vite production build.
- `git diff --check`: passed before the full completion run.
