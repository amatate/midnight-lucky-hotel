# Task 4 Report: Effect Queue, Food, Crack, Agitation, and Overload

## Status

Implemented and verified the finite settlement kernel. `ACCEPT_OUTCOME` now delegates all payout/state settlement to `resolveSpin`, leaving one authoritative path.

## Implementation

- Added the complete finite `Effect` vocabulary plus `ResolveSignal`, `ResolveContext`, and `SettlementResult` contracts.
- Added a pure `resolveSpin(state, draw, handlers?)` boundary with a deterministic FIFO queue, awarded-line deduplication, immutable output snapshots, per-spin attribution, and optional reaction handlers for Tasks 6–8.
- Added base-line settlement with cent rounding and additive application of all existing food buffs to each ordinary payout addition.
- Added literal visible-food consumption by source index, including duplicate visible food occurrences, coherent updates to `state.reels` and `pendingSpin.draw`, and one independent three-subsequent-spin +25% buff per food.
- Added crack preprocessing that disables the rightmost occupied slots in descending slot order for the settlement context only. Equipped parts remain unchanged in the returned state.
- Added dead-spin agitation capped at five. A pre-agitation paying settlement releases `agitation * 0.5 * currentBet` as separately attributed payout and clears agitation.
- Added a 100-effect safety boundary. A pending 101st effect is discarded, all recursive work is stopped, and one unbuffed `25 * currentBet` overload award/event is applied without handler re-entry.
- Added finite-money guards for malformed/non-finite and extreme handler awards.
- Added `PART_DISABLED`, `FOOD_CONSUMED`, and source-bearing `PAYOUT_ADDED` events.

## TDD Evidence

### RED 1: settlement behavior

Command:

```text
npm test -- tests/core/settlement.test.ts
```

Observed: failed because `@/core/settlement` did not exist. This was the intended missing-feature failure.

### GREEN 1: settlement and properties

Command:

```text
npm test -- tests/core/settlement.test.ts tests/core/effect-properties.test.ts
```

Observed: 2 files passed, 14 tests passed.

### RED 2: working context and safe money

Command:

```text
npm test -- tests/core/settlement.test.ts
```

Observed two intended failures: handlers saw the original counter value after an increment effect, and `Number.MAX_VALUE` overflowed through cent rounding.

### GREEN 2: hardened boundary

Focused final command:

```text
git diff --check && npm test -- tests/core/settlement.test.ts tests/core/effect-properties.test.ts
```

Observed: clean diff check; 2 files passed, 16 tests passed.

## Property and Cycle Evidence

- 300 fast-check runs map arbitrary integer arrays to all eight symbols, build three strips of at least six entries, draw from arbitrary integer seeds, and assert termination, finite payout, safe integer cents, and input/output reel separation.
- 50 fast-check runs use a deliberately recursive `REEVALUATE_LINES` handler and assert `effectCount === 101`, exactly one overload event, and exactly 250 overload attribution at the normal 10-credit bet.
- A boundary example proves exactly 100 processed effects do not overload; a queued 101st effect does.

## Verification

Required full command, run once before commit:

```text
npm run verify
```

Observed:

- typecheck: passed
- unit/integration tests: 8 files passed, 48 tests passed
- production build: passed (Vite 8.2.1, 16 modules transformed)

## Files

- `src/core/types.ts`
- `src/core/events.ts`
- `src/core/settlement.ts`
- `src/core/run.ts`
- `tests/core/settlement.test.ts`
- `tests/core/effect-properties.test.ts`

## Self-review

- FIFO determinism: recursive effects append after already queued effects; order is asserted as 1, 2, 3.
- Awarded-win dedupe: win keys include line, symbol, and cells; same-line reevaluation cannot repay an existing award.
- Buff timing/additivity: only buffs present at settlement start multiply awards; all decrement once; newly consumed food is appended afterward at duration three. Two buffs produce exactly +50%.
- Reel removal: visible foods are resolved to source-strip indices and removed descending, so two visible foods on one reel remove two occurrences without index drift. Stops, grid, state reels, and pending draw are rebuilt coherently.
- Crack behavior: literal cracks only; rightmost occupied slots disable first and only in handler context/events. Persistent `partSlots` are unchanged.
- Agitation: dead means zero pre-agitation payout; cap-five, paying-clear, and separate attribution are asserted. Agitation cannot trigger itself.
- Overload: 100 effects are allowed; recursive work beyond the boundary is discarded; exactly one unbuffed award/event is added and no signal is dispatched for it.
- Event ordering: crack-disable events precede grid reactions; line/effect work follows FIFO; food occurs after accepted-board effect resolution; agitation precedes final payout completion.
- Integration: Task 3 base payout expectations and phase/command-history behavior remain green through `ACCEPT_OUTCOME` delegation.
- Immutability and money: input snapshots remain deeply equal; strips/grids are copied; payout, bankroll, shift payout, and attribution are finite, clamped to safe cents, and cent-rounded.

## Concerns

No blocking concerns. Later route tasks will need to register their content handlers with the optional handler path (or replace it with a central registry) and may extend settlement-owned trigger-key bookkeeping; no Task 6–8 part behavior was implemented here.
