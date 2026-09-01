# Settlement Ledger and Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an auditable per-spin ledger, staged payout count-up, truthful Fruit Salad line highlights, persistent idle reels, and shorter upgrade/run reports without changing any gameplay probability or payout.

**Architecture:** The core settlement event stream remains the only money truth. It emits exact pre-multiplier operands and a dedicated pattern-line event; an atomic, bounded `SpinReceipt` is built from only the current `resolveSpin` events and persisted in schema v2. React reads those receipts and transient events to animate money, show history, preserve the last resolved grid, and simplify decision copy without recalculating rules.

**Tech Stack:** TypeScript 7, React 19, Vite 8, Vitest 4, Testing Library, Playwright, localStorage PWA persistence.

**Spec:** `docs/superpowers/specs/2026-09-01-settlement-ledger-and-clarity-design.md`

## Global Constraints

- Work only in `/Users/teddy/Documents/ChatGPT/slot machine/.worktrees/slot-machine-prototype`.
- Preserve deterministic seeded RNG, reel strips, stop positions, bankroll, resources, contracts, upgrades, candidate generation, three paid spins per shift, five normal shifts, and checkout target ¥200.
- Never edit or stage `src/content/base-machine.ts`; its local Task 13 paytable is an explicit protected baseline.
- Preserve local Task 13 changes in `package.json`, balance artifacts, validation docs, scripts, fixtures, and already-modified tests. Patch overlapping test files narrowly.
- `src/app/components/RunSummary.tsx` is intentionally in scope: replace its local “RTP 轨迹点” experiment with the approved player-facing report, but do not overwrite the file from HEAD.
- Never restore the removed manual “停轮” action to satisfy stale `e2e/complete-run.spec.ts`; that file is untracked Task 13 work and is excluded from this plan.
- The settlement core, not React, owns all award arithmetic. No UI code may scan a grid to recreate Fruit Salad or read the current paytable to explain an old receipt.
- Maintain the existing rounding order: `safePayout(preMultiplierAmount * appliedMultiplier)`; never round `preMultiplierAmount` to cents first.
- Full/reduced/accelerated/skipped presentation paths must produce the same rule state, receipt, final payout, and bankroll.
- Respect 320px, 390px, and 430px portrait widths; all controls are at least 44×44px; reduced motion removes number tweening, shake, pulse, and particles but not information.
- Before every commit, run `git diff --cached --name-status` and confirm that only that task's files or hunks are staged. Use `git add -p` for pre-dirty files; never stage the protected paytable or unrelated Task 13 work.

## File Responsibility Map

### New files

- `src/core/receipts.ts` — strict receipt construction, opaque fallback, and bounded append.
- `src/persistence/codec-shared.ts` — schema-neutral primitive, money, grid, reel, and plain-object validators.
- `src/persistence/schema-v1.ts` — frozen strict v1 decoder.
- `src/persistence/schema-v2.ts` — strict v2 event, pending-spin, receipt, and root-state decoder.
- `src/persistence/migrate-v1.ts` — deterministic v1→v2 migration without RNG advancement.
- `src/app/components/AnimatedMoney.tsx` — visual-only eased number tween with stable accessible announcements outside the frame loop.
- `src/app/components/LedgerDrawer.tsx` — ledger trigger, modal bottom sheet, receipt expansion, and focus return.
- `src/app/components/UpgradeStrategyDetails.tsx` — reusable L2, synergy, and long-risk disclosure shared by upgrade cards and a future collection view.
- `src/app/components/ShiftReceipt.tsx` — compact non-blocking shift ticket shown above upgrades.
- `tests/core/receipts.test.ts`, `tests/core/storage-migration.test.ts` — receipt and migration contracts.
- `tests/app/AnimatedMoney.test.tsx`, `tests/app/LedgerDrawer.test.tsx`, `tests/app/ShiftReceipt.test.tsx` — focused UI behavior.
- `e2e/settlement-ledger.spec.ts` — player-visible payout, ledger, continuity, and reduced-motion flow.

### Existing files with changed responsibilities

- `src/core/events.ts` — authoritative formula-bearing money events and `PATTERN_LINE_WIN`.
- `src/core/types.ts` — pattern effect, pending-spin metadata, receipt types, and schema v2 state.
- `src/core/settlement.ts` — single payout normalization point and structured award causes.
- `src/content/effects/fruit.ts` — emits structured Fruit Salad pattern effects using canonical `PAYLINES`.
- `src/core/run.ts` — captures pre-bet metadata and atomically appends one receipt on `ACCEPT_OUTCOME`.
- `src/persistence/storage.ts` — v2-first orchestration, v1 fallback migration, save validation, and dual-key clearing.
- `src/app/useSettlementPresentation.ts` — event-specific pacing and visible payout/bankroll targets.
- `src/app/components/Hud.tsx`, `WinPresentation.tsx`, `GameScreen.tsx` — render staged money and ledger/idle-grid data.
- `src/app/components/SlotMachine.tsx` — accepts a non-authoritative `idleGrid` fallback only.
- `src/content/player-copy.ts`, `UpgradePicker.tsx` — separate decision copy from strategy detail.
- `src/sim/run-summary.ts`, `src/sim/types.ts`, `RunSummary.tsx` — exact amount-bearing report data and honest RTP visibility.
- `src/app/styles.css` — receipt, drawer, money, compact card, responsive, focus, and reduced-motion styles.

---

### Task 1: Emit Exact, Structured Payout Events

**Files:**
- Modify: `src/core/events.ts:13-54`
- Modify: `src/core/types.ts:125-140`
- Modify: `src/core/settlement.ts:367-419,473-494,614-649,843-868`
- Modify: `src/content/effects/fruit.ts:1-95`
- Modify: `src/core/run.ts:88-100`
- Modify temporarily: `src/persistence/storage.ts:246-284` (strictly recognize old and new event shapes until Task 3 splits codecs)
- Modify: `src/presentation/summary.ts`
- Modify: `src/app/components/WinPresentation.tsx:15-70`
- Test: `tests/core/settlement.test.ts`
- Test: `tests/content/fruit.test.ts`
- Test: `tests/presentation/summary.test.ts`
- Test: `tests/core/presentation-events.test.ts`
- Modify mechanically for event literals: `e2e/game-feel.spec.ts`, `tests/app/WinPresentation.test.tsx`, `tests/app/presentation.test.ts`, `tests/content/chapel.test.ts`, `tests/core/contracts.test.ts`, `tests/core/progression.test.ts`, `tests/core/run.test.ts`, `tests/core/storage.test.ts`, and untracked Task 13 `tests/core/scenario-builds.test.ts`

**Interfaces:**
- Consumes: existing `safePayout`, `AttributionSource`, `LineWin`, effect registration `appliedOrigin`, and canonical `PAYLINES`.
- Produces: formula-bearing `LINE_WIN`, formula-bearing union `PAYOUT_ADDED`, formula-bearing `OVERLOAD`, `PATTERN_LINE_WIN`, and internal `ADD_PATTERN_PAYOUT`.

- [ ] **Step 1: Write failing tests for exact operands and source identity**

Add assertions that prove operands are captured before cent rounding and that part bonuses name the actual part:

Put the first test below in `tests/core/settlement.test.ts`; put the Jam Jar test in the existing `describe("jam-jar")` block in `tests/content/fruit.test.ts`, where the part-aware `settlementState` helper already exists.

```ts
it("keeps the unrounded operand until the final payout normalization", () => {
  const draw = makeDraw(deadGrid);
  const award: EffectHandler = (_context, signal) => signal.type === "GRID_ACCEPTED"
    ? [{ type: "ADD_PAYOUT", amount: 1.5625, source: "service" }]
    : [];
  const state = settlementState(draw, {
    buffs: Array.from({ length: 4 }, () => ({ id: "food" as const, spinsRemaining: 2, additivePayout: 0.25 }))
  });

  const result = resolveSpin(state, draw, [system(award)]);

  expect(result.events.find((event) => event.type === "PAYOUT_ADDED")).toMatchObject({
    type: "PAYOUT_ADDED",
    source: "service",
    preMultiplierAmount: 1.5625,
    appliedMultiplier: 2,
    amount: 3.13
  });
});

it("attributes every jam-jar bonus to the exact part origin", () => {
  const draw = makeDraw([
    ["cherry", "cherry", "cherry"],
    ["cherry", "cherry", "cherry"],
    ["cherry", "cherry", "cherry"]
  ]);
  const result = resolveSpin(settlementState(draw, { id: "jam-jar", level: 1 }), draw);
  const bonuses = result.events.filter((event) => event.type === "PAYOUT_ADDED");

  expect(bonuses).toHaveLength(4);
  expect(bonuses).toEqual(expect.arrayContaining([expect.objectContaining({
    type: "PAYOUT_ADDED",
    source: "part",
    partId: "jam-jar"
  })]));
});
```

Also cover agitation, overload multiplier `1`, non-finite payouts, and `safety-fuse`'s direct event.

- [ ] **Step 2: Write failing Fruit Salad event tests**

Update the current Fruit Salad tests so one qualifying top line expects exactly one structured event and no duplicate generic payout:

```ts
const patternEvents = result.events.filter((event) => event.type === "PATTERN_LINE_WIN");
expect(patternEvents).toEqual([expect.objectContaining({
  patternId: "fruit-salad",
  partId: "fruit-salad",
  lineId: "top",
  preMultiplierAmount: 15,
  appliedMultiplier: 1,
  amount: 15
})]);
expect(result.events).not.toContainEqual(expect.objectContaining({
  type: "PAYOUT_ADDED",
  amount: 15
}));
```

Add cases for L2, a food multiplier applied once, two lines in canonical `PAYLINES` order, wildcard rejection, and reevaluation deduplication.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- tests/core/settlement.test.ts tests/content/fruit.test.ts tests/presentation/summary.test.ts tests/core/presentation-events.test.ts
```

Expected: FAIL because formula fields and `PATTERN_LINE_WIN` do not exist, and Fruit Salad still emits `PAYOUT_ADDED`.

- [ ] **Step 4: Add the final event and effect unions**

Implement these contracts in `events.ts` and `types.ts`:

```ts
type FormulaFields = {
  readonly preMultiplierAmount: number;
  readonly appliedMultiplier: number;
  readonly amount: number;
};

type PayoutAddedEvent =
  | ({ readonly type: "PAYOUT_ADDED"; readonly source: "part"; readonly partId: PartId } & FormulaFields)
  | ({
      readonly type: "PAYOUT_ADDED";
      readonly source: Exclude<AttributionSource, "part" | "overload">;
    } & FormulaFields);

type PatternLineWinEvent = {
  readonly type: "PATTERN_LINE_WIN";
  readonly patternId: "fruit-salad";
  readonly partId: "fruit-salad";
  readonly lineId: LineWin["lineId"];
} & FormulaFields;
```

Add to `Effect`:

```ts
| {
    readonly type: "ADD_PATTERN_PAYOUT";
    readonly patternId: "fruit-salad";
    readonly partId: "fruit-salad";
    readonly lineId: LineWin["lineId"];
    readonly amount: number;
  }
```

`LINE_WIN` and `OVERLOAD` receive the same operand fields. Do not put display strings in events.

- [ ] **Step 5: Centralize payout presentation causes**

Replace the positional `(working, rawAmount, source, buffMultiplier, event, win?)` arguments with:

```ts
type PayoutCause =
  | { readonly kind: "line"; readonly win: LineWin; readonly source: Exclude<AttributionSource, "overload"> }
  | { readonly kind: "bonus"; readonly source: Exclude<AttributionSource, "part" | "overload"> }
  | { readonly kind: "part-bonus"; readonly partId: PartId }
  | { readonly kind: "pattern-line"; readonly patternId: "fruit-salad"; readonly partId: "fruit-salad"; readonly lineId: LineWin["lineId"] }
  | { readonly kind: "overload" };

function addPayout(
  working: WorkingState,
  preMultiplierAmount: number,
  appliedMultiplier: number,
  cause: PayoutCause
): void {
  const amount = safePayout(preMultiplierAmount * appliedMultiplier);
  // update payout/attribution once, then emit exactly one cause-specific money event
}
```

For generic `ADD_PAYOUT source:"part"`, require `appliedOrigin?.kind === "part"` and use `appliedOrigin.partId`; a system handler cannot impersonate a part. Write the safety-fuse event with `partId:"safety-fuse"`, its exact payout as the pre-multiplier value, and multiplier `1`.

- [ ] **Step 6: Emit Fruit Salad from the canonical payline table**

Delete the private Fruit Salad payline copy, import `PAYLINES` from `src/core/paylines.ts`, and return:

```ts
return [{
  type: "ADD_PATTERN_PAYOUT",
  patternId: "fruit-salad",
  partId: "fruit-salad",
  lineId: line.lineId,
  amount: multiplier * context.currentBet
}];
```

`applyEffect` handles this variant once through the central payout function. Preserve `claimTrigger("fruit-salad:${lineId}")` and the existing reevaluation guard.

- [ ] **Step 7: Make current persistence and presentation understand the new events**

Until Task 3 introduces separate codecs, make the current validator accept two explicit exact variants for old/new money events; do not use a broad optional-key validator. Change `PresentationLine` into a discriminated `kind: "symbol" | "pattern"` union: both variants carry `sequence`, `lineId`, `cells`, and `amount`; only `symbol` carries `symbol/source`, while `pattern` carries `patternId/partId`. Count both variants toward visual line/chain totals, label the pattern “水果沙拉·{线名} +¥X”, and do not let contracts treat it as a normal symbol line.

Mechanically update exact event literals found by:

```bash
rg -n 'type: "(LINE_WIN|PAYOUT_ADDED|OVERLOAD)"' src tests
```

For neutral test fixtures use `preMultiplierAmount: amount, appliedMultiplier: 1`; part events must include the real `partId`. Preserve all existing local numeric expectations.

Locate every synthetic part effect with:

```bash
rg -n 'ADD_PAYOUT.*source: "part"' tests src
```

If it is meant to test part attribution, register it with `{ kind: "part", slot, partId, handler }`; otherwise change the synthetic source to the intended non-part category. Never invent `partId` for a `kind:"system"` handler.

- [ ] **Step 8: Run focused and full type checks**

Run:

```bash
npm test -- tests/core/settlement.test.ts tests/content/fruit.test.ts tests/presentation/summary.test.ts tests/core/presentation-events.test.ts
npm run typecheck
```

Expected: PASS. Confirm `PAYOUT_COMPLETE.total` is unchanged for every existing fixed fixture.

- [ ] **Step 9: Commit only Task 1 hunks**

Stage clean production files directly and use partial staging for pre-dirty tests:

```bash
git add src/core/events.ts src/core/types.ts src/core/settlement.ts src/content/effects/fruit.ts src/core/run.ts src/persistence/storage.ts src/presentation/summary.ts src/app/components/WinPresentation.tsx e2e/game-feel.spec.ts tests/app/WinPresentation.test.tsx tests/app/presentation.test.ts tests/core/progression.test.ts tests/core/storage.test.ts tests/presentation/summary.test.ts tests/core/presentation-events.test.ts
git add -p tests/content/chapel.test.ts tests/content/fruit.test.ts tests/core/contracts.test.ts tests/core/run.test.ts tests/core/settlement.test.ts
git diff --cached --name-status
git commit -m "feat: emit auditable payout events"
```

Expected staged set: only the tracked files above; never stage untracked Task 13 `tests/core/scenario-builds.test.ts` even though its local event literals must be updated for typecheck, and never stage `src/content/base-machine.ts`.

---

### Task 2: Build Conserved, Bounded Spin Receipts

**Files:**
- Create: `src/core/receipts.ts`
- Modify: `src/core/types.ts` (receipt types only; RunState remains unchanged until Task 3)
- Create: `tests/core/receipts.test.ts`

**Interfaces:**
- Consumes: Task 1 formula-bearing `GameEvent[]`, `safeMoney`, `safePayout`, `Grid`, and `MAX_MONEY`.
- Produces: `buildSpinReceipt`, `buildOpaqueSpinReceipt`, `appendSpinReceipt`, `MAX_SPIN_HISTORY`, and `MAX_RECEIPT_AWARDS`.

- [ ] **Step 1: Write the complete failing receipt test matrix**

Create `tests/core/receipts.test.ts` with synthetic events covering line, pattern, part bonus, agitation bonus, overload, and the authoritative completion:

```ts
it("maps each money event once and never maps PAYOUT_COMPLETE as an award", () => {
  const result = buildSpinReceipt(receiptInput(mixedSettlementEvents));
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  expect(result.receipt.awards.map((award) => award.kind)).toEqual([
    "line", "pattern-line", "part-bonus", "bonus", "overload"
  ]);
  expect(result.receipt.totalPayout).toBe(35);
  expect(result.receipt.awards.reduce((sum, award) => safeMoney(sum + award.amount), 0)).toBe(35);
});
```

Add explicit tests for paid/free balance conservation, final resolved grid, missing/duplicate `PAYOUT_COMPLETE`, mismatch failure, opaque fallback, 128-award cap, history item 101 evicting item 1, and ordinal preservation.

- [ ] **Step 2: Run receipt tests and verify RED**

Run:

```bash
npm test -- tests/core/receipts.test.ts
```

Expected: FAIL because `@/core/receipts` and receipt types do not exist.

- [ ] **Step 3: Add exact receipt types**

Add the approved `ReceiptFormula`, strict award union, and `SpinReceipt` to `types.ts`. Lock source identity in the type system:

```ts
export type ReceiptFormula =
  | { readonly kind: "known"; readonly preMultiplierAmount: number; readonly appliedMultiplier: number }
  | { readonly kind: "legacy-unavailable" };

export type ReceiptAward =
  | { readonly sequence: number; readonly kind: "line"; readonly lineId: LineWin["lineId"]; readonly symbol: SymbolId; readonly source: Exclude<AttributionSource, "overload">; readonly formula: ReceiptFormula; readonly amount: Money }
  | { readonly sequence: number; readonly kind: "pattern-line"; readonly patternId: "fruit-salad"; readonly partId: "fruit-salad"; readonly lineId: LineWin["lineId"]; readonly formula: ReceiptFormula; readonly amount: Money }
  | { readonly sequence: number; readonly kind: "part-bonus"; readonly source: "part"; readonly partId: PartId; readonly formula: ReceiptFormula; readonly amount: Money }
  | { readonly sequence: number; readonly kind: "bonus"; readonly source: Exclude<AttributionSource, "part" | "overload">; readonly formula: ReceiptFormula; readonly amount: Money }
  | { readonly sequence: number; readonly kind: "overload"; readonly source: "overload"; readonly formula: ReceiptFormula; readonly amount: Money }
  | { readonly sequence: number; readonly kind: "opaque"; readonly formula: { readonly kind: "legacy-unavailable" }; readonly amount: Money };
```

`SpinReceipt` contains `ordinal`, `shift`, `afterHoursLevel`, `isFree`, `baseSpinIndex`, `bankrollBefore`, `wager`, `finalGrid`, ordered `awards`, `totalPayout`, and `bankrollAfter` exactly as specified.

```ts
export interface SpinReceipt {
  readonly ordinal: number;
  readonly shift: number;
  readonly afterHoursLevel: number;
  readonly isFree: boolean;
  readonly baseSpinIndex: 1 | 2 | 3 | null;
  readonly bankrollBefore: Money;
  readonly wager: Money;
  readonly finalGrid: Grid;
  readonly awards: readonly ReceiptAward[];
  readonly totalPayout: Money;
  readonly bankrollAfter: Money;
}
```

- [ ] **Step 4: Implement strict construction and explicit fallback**

Export:

```ts
export const MAX_SPIN_HISTORY = 100;
export const MAX_RECEIPT_AWARDS = 128;

export type SpinReceiptBuildResult =
  | { readonly ok: true; readonly receipt: SpinReceipt }
  | { readonly ok: false; readonly reason: "MISSING_PAYOUT_COMPLETE" | "DUPLICATE_PAYOUT_COMPLETE" | "INVALID_EVENT_SEQUENCE" | "PAYOUT_MISMATCH" | "BALANCE_MISMATCH" | "TOO_MANY_AWARDS" };

export function buildSpinReceipt(input: SpinReceiptBuildInput): SpinReceiptBuildResult;
export function buildOpaqueSpinReceipt(input: SpinReceiptBuildInput, authoritativeTotal: Money): SpinReceipt;
export class SpinReceiptInvariantError extends Error {
  readonly reason: Extract<SpinReceiptBuildResult, { readonly ok: false }>["reason"];

  constructor(reason: SpinReceiptInvariantError["reason"]) {
    super(`spin receipt invariant failed: ${reason}`);
    this.name = "SpinReceiptInvariantError";
    this.reason = reason;
  }
}
export function finalizeSpinReceipt(
  input: SpinReceiptBuildInput,
  mode: "strict" | "production-fallback"
): SpinReceipt;
export function appendSpinReceipt(history: readonly SpinReceipt[], receipt: SpinReceipt): readonly SpinReceipt[];
export function isSpinReceipt(value: unknown): value is SpinReceipt;
```

`SpinReceiptBuildInput` accepts only `settlementEvents`, never the run's whole `pendingEvents`. Require strictly increasing event sequences and exactly one final `PAYOUT_COMPLETE`. Fold award totals with `safeMoney` in event order. The builders never check `import.meta.env`: `finalizeSpinReceipt(..., "strict")` throws `SpinReceiptInvariantError`. In `"production-fallback"`, it may create an opaque receipt only when there is exactly one authoritative completion and that total satisfies the bankroll equation; missing/duplicate completion or an unconserved bankroll still throws because no valid fallback exists. An opaque zero-payout receipt has `awards: []`; a positive fallback has one `opaque` award equal to the authoritative total. `isSpinReceipt` performs the same bounds, formula, grid, order, source, and bankroll-conservation checks used by schema v2 and by the drawer's per-row defensive filter.

- [ ] **Step 5: Run receipt tests and typecheck**

Run:

```bash
npm test -- tests/core/receipts.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the receipt unit**

```bash
git add src/core/receipts.ts src/core/types.ts tests/core/receipts.test.ts
git diff --cached --name-status
git commit -m "feat: build conserved spin receipts"
```

---

### Task 3: Persist Schema v2 and Append Receipts Atomically

**Files:**
- Modify: `src/core/types.ts:244-301`
- Modify: `src/core/run.ts:103-388`
- Modify: `src/core/progression.ts:14-21`
- Modify: `src/core/settlement.ts:877-904`
- Modify: `src/sim/monte-carlo.ts:149-182`
- Create: `src/persistence/codec-shared.ts`
- Create: `src/persistence/schema-v1.ts`
- Create: `src/persistence/schema-v2.ts`
- Create: `src/persistence/migrate-v1.ts`
- Rewrite orchestration only: `src/persistence/storage.ts`
- Test: `tests/core/run.test.ts`
- Test: `tests/core/storage.test.ts`
- Create: `tests/core/storage-migration.test.ts`
- Modify mechanically: `tests/fixtures/run-fixtures.ts` and every pending-spin literal reported by `rg -n 'pendingSpin: \{' src tests`

**Interfaces:**
- Consumes: Task 2 receipt functions and Task 1 final money events.
- Produces: schema v2 `RunState`, `PendingSpin`, v2-first storage with v1 fallback, and exactly one receipt per accepted settlement.

- [ ] **Step 1: Write failing run-level receipt tests**

Add to `tests/core/run.test.ts`:

```ts
it("captures paid-spin metadata before deduction and appends exactly one receipt on accept", () => {
  const before = selectService(createRun(42));
  const spinning = dispatch(before, { type: "SPIN" });
  expect(spinning.pendingSpin).toMatchObject({ bankrollBefore: 100, wager: 10, isFree: false });

  const awaiting = dispatch(spinning, { type: "REELS_STOPPED" });
  const resolving = dispatch(awaiting, { type: "ACCEPT_OUTCOME" });
  expect(resolving.spinHistory).toHaveLength(1);
  expect(resolving.nextSpinOrdinal).toBe(2);

  const completed = dispatch(resolving, { type: "PRESENTATION_COMPLETE" });
  expect(completed.pendingEvents).toEqual([]);
  expect(completed.spinHistory).toEqual(resolving.spinHistory);
});
```

Add free-spin wager `0`, duplicate/rejected accept, final transformed grid, 100-item cap, and a before/after fixed-seed projection that removes only schema/receipt fields before equality. Add one invariant-failure test proving strict/test mode throws and one production-mode unit test proving the same bad candidate becomes a single conserved opaque award; pass the mode into the small boundary helper rather than mutating `import.meta.env` in the test.

- [ ] **Step 2: Write failing migration and strict-v2 tests**

Create `storage-migration.test.ts` with fixtures serialized under the literal v1 key. Cover:

```ts
expect(loadRun()).toEqual({ ok: true, state: expect.objectContaining({
  schemaVersion: 2,
  spinHistory: [],
  nextSpinOrdinal: 1
})});
```

Required cases: READY v1 without invented history; paid/free SPINNING metadata without RNG change; RESOLVING v1 producing exactly one legacy receipt; invalid v2 present blocking v1 fallback; dual-key clear even when one `removeItem` throws; oversized/unconserved/unknown v2 rejection; `setItem` denial leaves the in-memory state and receipt usable; `getItem` denial returns `INVALID_SNAPSHOT` without throwing.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
npm test -- tests/core/run.test.ts tests/core/storage.test.ts tests/core/storage-migration.test.ts
```

Expected: FAIL because schema v2 fields, keys, codecs, and migration do not exist.

- [ ] **Step 4: Upgrade `PendingSpin` and `RunState`**

Define:

```ts
export interface PendingSpin {
  readonly draw: ReelDraw;
  readonly isFree: boolean;
  readonly bankrollBefore: Money;
  readonly wager: Money;
}

export interface RunState {
  readonly schemaVersion: 2;
  // existing fields unchanged
  readonly pendingSpin: PendingSpin | null;
  readonly spinHistory: readonly SpinReceipt[];
  readonly nextSpinOrdinal: number;
}
```

Initialize empty history and ordinal `1`. In `spin()` store the current bankroll before deduction and `wager: isFree ? 0 : bet`. Narrow `getCurrentBet` to `Pick<RunState, "baseBet" | "betMode" | "afterHoursLevel">` so migration can reuse it without pretending a v1 state is v2.

- [ ] **Step 5: Append the receipt in the same `ACCEPT_OUTCOME` transition**

Use only `settlement.events` and the resolved draw:

```ts
const input: SpinReceiptBuildInput = {
  ordinal: state.nextSpinOrdinal,
  shift: state.shift,
  afterHoursLevel: state.afterHoursLevel,
  baseSpinIndex: state.pendingSpin.isFree ? null : (state.baseSpinsInShift + 1) as 1 | 2 | 3,
  pendingSpin: state.pendingSpin,
  finalGrid: settlement.state.pendingSpin!.draw.grid,
  bankrollAfter: settlement.state.bankroll,
  settlementEvents: settlement.events
};
```

Call `finalizeSpinReceipt(input, import.meta.env.PROD ? "production-fallback" : "strict")`. Strict mode throws `SpinReceiptInvariantError(reason)`; production fallback creates one opaque receipt from the single `PAYOUT_COMPLETE.total`. Append and increment ordinal in the same returned `RunState`. `PRESENTATION_COMPLETE` clears transient fields only.

- [ ] **Step 6: Split frozen v1 and strict v2 codecs**

Move schema-neutral helpers from current `storage.ts` into `codec-shared.ts`. Implement `schema-v1.ts` as an independent frozen v1 root decoder with `RunStateV1` and `GameEventV1` types. Its money-event union accepts exactly the historical amount-only shapes and the temporary Task 1 formula-bearing shapes, but it never imports or delegates to the v2 root decoder. Implement `schema-v2.ts` with exact root keys, formula-bearing events only, and these additional checks:

```ts
// Import MAX_RECEIPT_AWARDS, MAX_SPIN_HISTORY, and isSpinReceipt from core/receipts.
// spinHistory <= 100; awards <= 128
// receipt ordinals and award sequences strictly increase
// nextSpinOrdinal > last ordinal
// formula operands finite; amount in [0, MAX_MONEY]
// safePayout(pre * multiplier) === amount for known formulas
// legal source/kind combinations and partId requirements
// finalGrid passes the existing 3x3 symbol validator
// sum(awards) === totalPayout and bankroll equation conserves
```

Export exact entries:

```ts
export function decodeRunStateV1(value: unknown): RunStateV1 | null;
export function decodeRunStateV2(value: unknown): RunState | null;
```

- [ ] **Step 7: Implement deterministic migration**

Export `migrateRunStateV1(state: RunStateV1): RunState | null`. Rules:

- normal phases: history `[]`, ordinal `1`;
- SPINNING/AWAITING: recover wager from free status and `getCurrentBet`, then `bankrollBefore = state.bankroll + wager` because v1 has already deducted paid wagers;
- RESOLVING: use the event segment after the last `REELS_DRAWN` through one `PAYOUT_COMPLETE`; `bankrollAfter = state.bankroll`; `bankrollBefore = bankrollAfter - totalPayout + wager`; mark every migrated formula `legacy-unavailable`; when a v1 `PART_TRIGGERED fruit-salad` is followed by its generic part payout, migrate that payout as `opaque` because v1 has no trustworthy `lineId`—never infer a Fruit Salad line;
- preserve RNG, reels, grid, bankroll, resources, commands, and pending events exactly apart from required v2 event enrichment; historical amount-only events become `preMultiplierAmount: amount, appliedMultiplier: 1` for replay compatibility, while every receipt award migrated from v1 remains `legacy-unavailable` and never claims that synthetic pair as its historical formula;
- resolving migration creates ordinal `1`, then sets next ordinal `2`.

- [ ] **Step 8: Rewrite storage orchestration and keys**

Use:

```ts
export const RUN_STORAGE_KEY = "midnight-lucky-hotel.run.v2";
export const LEGACY_RUN_STORAGE_KEY = "midnight-lucky-hotel.run.v1";
```

Load v2 first. If the v2 key exists but is invalid, return `INVALID_SNAPSHOT`; only a missing v2 key may fall back to v1. Migrate and immediately save valid v1. `saveRun` validates v2 before writing but never throws on storage denial. `clearRun` attempts both removals in separate `try` blocks.

- [ ] **Step 9: Update simulation and test constructors mechanically**

For every real or test `pendingSpin` literal, use the state before deduction as `bankrollBefore` and the actual paid/free wager. In fixtures already positioned at `AWAITING_INTERVENTION`, set explicit values rather than calling RNG or recomputing draws. `monte-carlo.ts` may create receipt metadata but must not retain unbounded production history between simulation samples.

Locate all sites with:

```bash
rg -n 'pendingSpin: \{' src tests
```

Do not overwrite local Task 13 test expectations; only add required v2 fields and new assertions.

- [ ] **Step 10: Run core, migration, type, and fixed-seed verification**

Run:

```bash
npm test -- tests/core/receipts.test.ts tests/core/run.test.ts tests/core/storage.test.ts tests/core/storage-migration.test.ts tests/core/progression.test.ts tests/core/settlement.test.ts tests/core/presentation-events.test.ts tests/core/effect-properties.test.ts tests/sim/base-fast-path.test.ts
npm run typecheck
```

Expected: PASS. In fixed-seed assertions, all pre-existing rule fields are deeply equal.

- [ ] **Step 11: Commit only schema/core integration hunks**

Stage new production files and clean tracked compatibility files directly. Use partial staging for pre-dirty `chapel.test.ts`, `fruit.test.ts`, `contracts.test.ts`, `run.test.ts`, and `settlement.test.ts`. The untracked Task 13 `tests/fixtures/run-fixtures.ts` and `tests/core/scenario-builds.test.ts` may need local metadata updates so the current worktree typechecks, but they remain wholly owned by Task 13 and must not be staged in this feature's commits.

```bash
git add src/core/types.ts src/core/run.ts src/core/progression.ts src/core/settlement.ts src/content/services/repair.ts src/content/services/security.ts src/sim/monte-carlo.ts src/core/receipts.ts src/persistence/codec-shared.ts src/persistence/schema-v1.ts src/persistence/schema-v2.ts src/persistence/migrate-v1.ts src/persistence/storage.ts tests/core/receipts.test.ts tests/core/storage-migration.test.ts e2e/game-feel.spec.ts tests/app/SlotMachine.test.tsx tests/app/WinPresentation.test.tsx tests/app/intervention-options.test.ts tests/app/presentation.test.ts tests/content/kitchen.test.ts tests/content/player-copy.test.ts tests/content/repair.test.ts tests/content/security.test.ts tests/content/violent.test.ts tests/core/effect-properties.test.ts tests/core/presentation-events.test.ts tests/core/progression.test.ts tests/core/storage.test.ts tests/sim/base-fast-path.test.ts
git add -p tests/content/chapel.test.ts tests/content/fruit.test.ts tests/core/contracts.test.ts tests/core/run.test.ts tests/core/settlement.test.ts
git diff --cached --name-status
git commit -m "feat: persist versioned spin history"
```

---

### Task 4: Stage Payout and Bankroll Numbers During Presentation

**Files:**
- Create: `src/app/components/AnimatedMoney.tsx`
- Create: `tests/app/AnimatedMoney.test.tsx`
- Modify: `src/app/useSettlementPresentation.ts:13-260`
- Modify: `src/app/components/WinPresentation.tsx:75-120`
- Modify: `src/app/components/Hud.tsx:17-68`
- Modify: `src/app/GameScreen.tsx:83-179,225-230`
- Modify: `src/app/styles.css`
- Test: `tests/app/presentation.test.ts`
- Test: `tests/app/WinPresentation.test.tsx`
- Test: `tests/app/GameScreen.test.tsx`

**Interfaces:**
- Consumes: the latest receipt already appended during `RESOLVING_EFFECTS` and matching event sequences.
- Produces: event-specific targets and one reusable visual money tween; no core state writes.

- [ ] **Step 1: Write failing target/pacing tests**

Extend `presentation.test.ts` with a receipt whose awards are ¥20 and ¥15. Assert:

```ts
expect(result.current).toMatchObject({
  settlementStartBankroll: 90,
  visiblePayoutTarget: 0,
  visibleBankrollTarget: 90
});

// after first award event
expect(result.current).toMatchObject({ visiblePayoutTarget: 20, visibleBankrollTarget: 110 });

// after second award event
expect(result.current).toMatchObject({ visiblePayoutTarget: 35, visibleBankrollTarget: 125 });
```

Assert normal money durations `240/360/520`, accelerated `80`, reduced-motion `0`, skip targets final values immediately, and `PAYOUT_COMPLETE` never adds a second ¥35. Add schedule-level assertions: no-win is exactly `350ms`; one ordinary award is within `700–1000ms`; a two-award or larger chain is within `1200–2200ms`; 128 awards still cap at `2200ms` without changing their order.

- [ ] **Step 2: Write failing `AnimatedMoney` tests**

Use fake timers and a requestAnimationFrame shim. Cover: mount snaps to its initial target; a later target has a visible intermediate value; the final cent value is exact; `resetKey` snaps a new settlement to its starting value; `animationKey` restarts only the current award tween; reduced motion creates no frame loop; one stable accessible label changes once per target rather than once per frame.

```ts
render(<AnimatedMoney target={35} durationMs={360} animationKey="1:4" reducedMotion={false} />);
await act(async () => vi.advanceTimersByTimeAsync(180));
expect(Number(screen.getByTestId("animated-money").textContent)).toBeGreaterThan(0);
await act(async () => vi.advanceTimersByTimeAsync(200));
expect(screen.getByTestId("animated-money")).toHaveTextContent("35");
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
npm test -- tests/app/presentation.test.ts tests/app/AnimatedMoney.test.tsx tests/app/WinPresentation.test.tsx tests/app/GameScreen.test.tsx
```

Expected: FAIL because the presentation still exposes the final total immediately.

- [ ] **Step 4: Extend presentation state and event pacing**

Add:

```ts
readonly settlementStartBankroll: number;
readonly visiblePayoutTarget: number;
readonly visibleBankrollTarget: number;
readonly awardDelta: number;
readonly moneyResetKey: string;
readonly moneyAnimationKey: string;
readonly moneyDurationMs: number;
```

Find the matching receipt award by exact event sequence. Fold receipt awards through the current event sequence with `safeMoney`. Timing:

```ts
function moneyDurationMs(amount: number, wager: number, accelerated: boolean, reduced: boolean): number {
  if (reduced) return 0;
  if (accelerated) return 80;
  const ratio = wager > 0 ? amount / wager : amount > 0 ? Number.POSITIVE_INFINITY : 0;
  return ratio <= 1 ? 240 : ratio <= 3 ? 360 : 520;
}
```

Update `activeLineIds`: return the canonical single line for either `LINE_WIN` or `PATTERN_LINE_WIN`, and return none for `PART_TRIGGERED`. Add `PATTERN_LINE_WIN` to event haptics and the static event card, but never scan `displayGrid` to rediscover the pattern.

Build one deterministic `PresentationStep[]` before playback. Start with `120ms` settled-grid anticipation. Each money event gets `80ms` line ignition, its natural money duration, `180ms` landing, and `80ms` gap. Coalesce any consecutive explanatory non-money events between two awards into one `160ms` frame; do not add a delay for `PAYOUT_COMPLETE`. Derive the target total from `summary.tier`: `350ms` for `none`, clamp natural time to `700–1000ms` for `win`, and clamp it to `1200–2200ms` for `chain`/`runaway`. If natural time exceeds its maximum, multiply every post-anticipation segment by `(maximum - 120) / (natural - 120)` while preserving sequence order and exact final targets; if below the minimum, add the difference to the final landing. Accelerated playback sets each remaining step to `80ms` and proportionally scales the remainder if it would exceed `2200ms`. Reduced motion uses `0ms` for every step while retaining event text and static highlight. A no-win presentation ignores explanatory-event count and uses one `350ms` “空手而归 / 本转支出 ¥{wager}” frame.

- [ ] **Step 5: Implement the visual-only eased number component**

Use `performance.now`, `requestAnimationFrame`, `easeOutCubic = 1 - (1 - t) ** 3`, and `safeMoney`. Cancel the previous frame on key/target change and unmount. The changing glyph span is `aria-hidden`; render a separate stable `sr-only` target announcement controlled by the parent event, not by each frame.

```ts
interface AnimatedMoneyProps {
  readonly target: number;
  readonly durationMs: number;
  readonly resetKey: string;
  readonly animationKey: string;
  readonly reducedMotion: boolean;
  readonly signed?: boolean;
  readonly accessibleLabel?: string;
  readonly className?: string;
}
```

On first mount and whenever `resetKey` changes, display `target` synchronously without a tween. When only `animationKey`/`target` changes, tween from the currently rendered value. Render the changing glyphs in an `aria-hidden` span; if `accessibleLabel` is supplied, render that exact string once in a separate `sr-only` span that never receives frame values.

- [ ] **Step 6: Wire the same targets into the payout panel and HUD**

`WinPresentation` renders `visiblePayoutTarget`, never `summary.total`, until completion. `Hud` accepts presentation money props and renders `visibleBankrollTarget`, never the final `state.bankroll`, while resolving. `GameScreen` passes one shared reset/key/duration/target bundle to both. Audit headings, status copy, `aria-label`s, and particle labels so none interpolate `summary.total` or final `state.bankroll` before completion. Keep `state.bankroll` untouched and continue to use it after presentation.

The live message per award is exactly: `本转累计 ¥{target}，余额 ¥{bankroll}`. Do not announce intermediate animation frames.

- [ ] **Step 7: Run focused tests and accessibility assertions**

Run:

```bash
npm test -- tests/app/presentation.test.ts tests/app/AnimatedMoney.test.tsx tests/app/WinPresentation.test.tsx tests/app/GameScreen.test.tsx
npm run typecheck
```

Expected: PASS; the core state in test fixtures remains at the final bankroll while the visible target starts after the wager.

- [ ] **Step 8: Commit staged presentation changes**

```bash
git add src/app/components/AnimatedMoney.tsx src/app/useSettlementPresentation.ts src/app/components/WinPresentation.tsx src/app/components/Hud.tsx src/app/GameScreen.tsx src/app/styles.css tests/app/AnimatedMoney.test.tsx tests/app/presentation.test.ts tests/app/WinPresentation.test.tsx tests/app/GameScreen.test.tsx
git diff --cached --name-status
git commit -m "feat: animate settlement totals"
```

---

### Task 5: Add the Ledger Drawer and Preserve the Last Resolved Grid

**Files:**
- Create: `src/app/components/LedgerDrawer.tsx`
- Create: `tests/app/LedgerDrawer.test.tsx`
- Modify: `src/app/components/Hud.tsx`
- Modify: `src/app/components/SlotMachine.tsx:7-16,95-145`
- Modify: `src/app/GameScreen.tsx:153-179`
- Modify: `src/app/styles.css`
- Test: `tests/app/SlotMachine.test.tsx`
- Test: `tests/app/GameScreen.test.tsx`

**Interfaces:**
- Consumes: `RunState.spinHistory` and each `SpinReceipt.finalGrid`.
- Produces: accessible receipt history and a display-only `idleGrid` prop; neither writes core state.

- [ ] **Step 1: Write failing ledger behavior tests**

Create receipts for a paid spin, free spin, known formula, and opaque award. Assert collapsed and expanded copy:

```ts
expect(screen.getByRole("button", { name: "账本" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "账本" }));
expect(screen.getByRole("dialog", { name: "前台账本" })).toBeVisible();
expect(screen.getByText("第 2 班 · 第 3 转")).toBeVisible();
expect(screen.getByText("-¥10 → +¥23 · 净 +¥13")).toBeVisible();
expect(screen.getByText("水果沙拉 · 顶线")).toBeVisible();
```

Cover: free label `免费转 · 小票 #N`; overtime label; empty state; formula expansion only for `known`; opaque text `本转合计（明细不可用）`; Escape close; initial focus on close button; return focus to trigger. Cast one malformed object between two valid receipts and assert the drawer silently omits only that row while still rendering both valid rows; this is a render-time defense, not permission to save malformed history.

- [ ] **Step 2: Write failing idle-grid tests**

In `SlotMachine.test.tsx`, mount a READY state with an `idleGrid` that differs from reel prefixes, assert its nine symbols, then rerender SPINNING with a real motion plan and prove the new draw still drives reveal. In `GameScreen.test.tsx`, finish a third spin, show upgrade scene, continue, and assert the remounted cabinet shows the receipt's resolved grid.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
npm test -- tests/app/LedgerDrawer.test.tsx tests/app/SlotMachine.test.tsx tests/app/GameScreen.test.tsx
```

Expected: FAIL because no ledger or `idleGrid` exists and the cabinet falls back to reel prefixes.

- [ ] **Step 4: Implement `LedgerDrawer` with internal focus control**

Use one component that renders its own trigger beside the HUD balance and a fixed modal sheet:

```ts
interface LedgerDrawerProps {
  readonly receipts: readonly SpinReceipt[];
}
```

Maintain `open` and one expanded ordinal. On open, focus the close button; Escape closes; on close, focus the trigger. Use `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, a backdrop button or explicit close button, and newest-first display without mutating history. Filter rows through Task 2's `isSpinReceipt`; invalid current-session rows are omitted and never written back. Do not show internal sequence numbers or event type names.

- [ ] **Step 5: Add a distinct display-only `idleGrid`**

Extend `SlotMachineProps`:

```ts
readonly idleGrid?: Grid | null;
```

Initialization and reset priority is `displayGrid` (active replay), then pending draw, then `idleGrid`, then `stripPreview`. Do not reuse `displayGrid` for idle history because `displayGrid` deliberately suppresses reel motion. `GameScreen` passes `state.spinHistory.at(-1)?.finalGrid ?? null` as `idleGrid`.

- [ ] **Step 6: Style the hotel-front-desk sheet and reduced state**

Add a maximum `72dvh` scrollable drawer, safe-area bottom padding, quiet receipt dividers, tabular numbers, 44px controls, visible `:focus-visible`, and 320px wrapping. No pulsing or background shake; formula details are plain text.

- [ ] **Step 7: Run component and integration tests**

Run:

```bash
npm test -- tests/app/LedgerDrawer.test.tsx tests/app/SlotMachine.test.tsx tests/app/GameScreen.test.tsx
npm run typecheck
```

Expected: PASS. Confirm a new run with empty history still uses `stripPreview`.

- [ ] **Step 8: Commit ledger and continuity changes**

```bash
git add src/app/components/LedgerDrawer.tsx src/app/components/Hud.tsx src/app/components/SlotMachine.tsx src/app/GameScreen.tsx src/app/styles.css tests/app/LedgerDrawer.test.tsx tests/app/SlotMachine.test.tsx tests/app/GameScreen.test.tsx
git diff --cached --name-status
git commit -m "feat: add settlement ledger and stable idle grid"
```

---

### Task 6: Simplify Upgrade Cards and Shift/Run Reports

**Files:**
- Modify: `src/content/player-copy.ts:27-47,105-274`
- Modify: `src/app/components/UpgradePicker.tsx:12-178`
- Create: `src/app/components/UpgradeStrategyDetails.tsx`
- Create: `src/app/components/ShiftReceipt.tsx`
- Create: `tests/app/ShiftReceipt.test.tsx`
- Modify: `src/app/GameScreen.tsx:232-238`
- Modify: `src/sim/types.ts:32-38`
- Modify: `src/sim/run-summary.ts:6-78`
- Modify carefully from current dirty state: `src/app/components/RunSummary.tsx`
- Modify: `src/app/styles.css`
- Test: `tests/content/player-copy.test.ts`
- Test: `tests/app/UpgradePicker.test.tsx`
- Test: `tests/sim/run-summary.test.ts`
- Test: `tests/app/RunSummary.test.tsx`

**Interfaces:**
- Consumes: existing full upgrade descriptions, current candidates, shift snapshots, state attribution/expenses, and trajectory estimates.
- Produces: compact decision fields, reusable strategy details, a truthful shift ticket, and amount-bearing run summary data.

- [ ] **Step 1: Write failing compact-copy and card tests**

Replace the current expectation that every card shows five long sections. Assert each default card shows one decision effect, at most one condition, and an immediate irreversible warning when applicable; it must not show the full “协同” and “代价／风险” paragraphs until `攻略详情` opens.

```ts
const card = screen.getByRole("heading", { name: "水果沙拉" }).closest("article")!;
expect(card).toHaveTextContent("樱桃 + 柠檬 + 铃铛同线");
expect(card).toHaveTextContent("额外获得 1.5×下注");
expect(card).toHaveTextContent("百搭不算");
expect(within(card).queryByText("协同")).not.toBeInTheDocument();
await user.click(within(card).getByText("攻略详情"));
expect(within(card).getByText("协同")).toBeVisible();
```

Keep all target selection, replacement, reroll, decline, probability-gated maintenance ticket, and final `CHOOSE_UPGRADE` assertions.

- [ ] **Step 2: Add complete decision copy, not runtime truncation**

Extend `UpgradePresentation` with:

```ts
readonly decisionEffect: string;
readonly triggerCondition: string | null;
readonly immediateCost: string | null;
```

Use this exact decision-copy matrix; keep current full `effect`, L2, synergy, and risk text unchanged for details:

| Upgrade | Decision effect | Trigger condition | Immediate cost/warning |
|---|---|---|---|
| 柠檬木箱 | 选两轮，各加入 2 个柠檬 | — | 两轮永久变长 |
| 樱桃去核器 | 把一轮的 1 个其他图案换成樱桃 | 百搭不能替换 | 被替换图案永久减少 |
| 柠檬感染 | 柠檬中奖后，把线外图案变成柠檬并重算 | 每转首次柠檬线 | — |
| 果酱罐 | 本班樱桃线越多，后续奖励越高 | 第一条只充能 | — |
| 水果沙拉 | 樱桃 + 柠檬 + 铃铛同线，额外 1.5×下注 | 百搭不算 | — |
| 剩菜打包 | 本班第 1 份食物回到最短轮 | 需要深夜厨房 | 最短轮会变长 |
| 七之净化 | 把一轮的 1 个樱桃或柠檬换成幸运7 | 目标轮必须有水果 | 被替换水果永久减少 |
| 什一税箱 | 付 ¥10，向一轮加入幸运7并获得 1 恶兆 | — | 立即支付 ¥10，转轮变长 |
| 恶兆收集器 | 幸运7中奖时，把全部恶兆换成奖励 | 每转首次幸运7线 | — |
| 三重祝福 | 首次幸运7线复制 1 次 | 每转一次 | 每轮永久加入 1 个空白 |
| 午夜钟声 | 首次铃铛线把铃铛变百搭并重算 | 必须有字面铃铛 | — |
| 殉道者硬币 | 献祭余额，本班幸运7线额外复制 | 首转前启用 | 立即失去向上取整的 10% 余额 |
| 人造裂纹 | 向一轮加入裂纹，下班专注上限 +1 | — | 永久加入 1 个裂纹 |
| 废料磁铁 | 裂纹同线，奖励 2×下注并移除它们 | 必须是实体裂纹 | — |
| 松动弹簧 | 踹击前进 2 格并制造 2 个裂纹 | 需要保安室 | 每次踹击永久加入 2 裂纹 |
| 空白电容 | 累计 3 个可见空白，获得 1 次免费转 | 余数保留 | — |
| 保修欺诈 | 其他部件首次被裂纹禁用，奖励 3×下注 | 自己失效不算 | — |
| 过载马达 | 从第 2 个连锁效果起，每个奖励 0.25×下注 | 第 6 个效果还会损伤机器 | 第 6 个效果使每轮永久 +1 裂纹 |
| 修枝剪 | 从长轮删除 1 个非百搭图案 | 轮长必须大于 6 | 所选图案永久减少 |
| 复写纸 | 向一轮加入 2 个指定基础图案 | 只能复制基础图案 | 转轮永久变长 |
| 安全保险丝 | 余额不足最低下注时自动补 ¥20 | 触发后消耗 | 一次性部件 |
| 计算器 | 显示每轮精确符号概率 | — | — |
| 会计账本 | 显示模拟 RTP 和风险带 | 信息是模拟估算 | — |
| 统计终端 | 显示破产概率、波动和可承受转数 | 信息是模拟估算 | — |

- [ ] **Step 3: Render compact cards and reusable details**

Use role labels `强化`, `转向`, `豪赌`. Default card shows role/route, name, decision effect, condition, and immediate warning. Create `UpgradeStrategyDetails` as a reusable native `<details>` labeled `攻略详情`; it receives one `UpgradePresentation` and renders L2, full synergy, and long risk. `UpgradePicker` uses this component rather than embedding those paragraphs. When selected, fold other cards to their header but keep their select buttons reachable. Confirmation repeats only target/replacement and immediate outcome, never the full copy block.

- [ ] **Step 4: Write failing shift-ticket and run-summary tests**

Create `ShiftReceipt.test.tsx`:

```ts
expect(screen.getByText("第 2 班收工")).toBeVisible();
expect(screen.getByText("本班转轮盈亏 +¥18")).toBeVisible();
expect(screen.getByText("余额 ¥138 / 目标 ¥200")).toBeVisible();
expect(screen.getByText("下注 ¥30 · 赔付 ¥48")).toBeVisible();
```

Add overtime label and missing-snapshot null render. In summary tests assert total wager reads `expenses.wagers`, total payout is the safe sum of `attribution`, largest income includes amount or is null at zero, suggestion is labeled “构筑提示”, and current RTP is null unless `toolLevel >= 2` and a non-null estimate exists.

- [ ] **Step 5: Implement exact report data**

Replace label-only summary fields with:

```ts
interface RunSummaryData {
  readonly totalWager: number;
  readonly totalPayout: number;
  readonly bankrollDelta: number;
  readonly largestIncome: { readonly source: AttributionSource; readonly amount: number } | null;
  readonly buildSuggestion: UpgradeId | null;
  readonly currentRtp: number | null;
}
```

Use opening bankroll ¥100 for `bankrollDelta`. Fold attribution with `safeMoney`. Resolve equal nonzero income sources in this explicit order: `base`, `part`, `intervention`, `service`, `agitation`, `overload`. `currentRtp` is the newest non-null mean only when `state.toolLevel >= 2`. Do not read `spinHistory` for run totals.

- [ ] **Step 6: Render the shift ticket and rewrite `RunSummary` from its current local state**

`ShiftReceipt` reads `state.shiftHistory.at(-1)`, computes `totalPayout - totalWager`, and renders immediately above `UpgradePicker` without a confirmation action. It says “本班转轮盈亏”, never “本班净赚”. Its entrance transition is at most `700ms` and never disables or covers upgrade controls.

`RunSummary` renders final balance, bankroll change, total wager/payout, amount-bearing largest income, optional build suggestion, and optional `当前模拟 RTP N% · 仅为估算`. Delete the local Task 13 “RTP 轨迹点／暂无” line, the repeated income/expense explanation, and the old high-positive-risk explanation. Keep cash-out, continue, and restart command behavior unchanged.

- [ ] **Step 7: Run copy/report tests and typecheck**

Run:

```bash
npm test -- tests/content/player-copy.test.ts tests/app/UpgradePicker.test.tsx tests/app/ShiftReceipt.test.tsx tests/sim/run-summary.test.ts tests/app/RunSummary.test.tsx tests/app/GameScreen.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit only approved copy/report changes**

Use partial staging for the already-dirty `RunSummary.tsx` and any already-dirty tests. Confirm the staged diff removes trajectory-count wording rather than importing unrelated Task 13 changes.

```bash
git add src/content/player-copy.ts src/app/components/UpgradePicker.tsx src/app/components/UpgradeStrategyDetails.tsx src/app/components/ShiftReceipt.tsx src/app/GameScreen.tsx src/sim/types.ts src/sim/run-summary.ts src/app/styles.css tests/content/player-copy.test.ts tests/app/UpgradePicker.test.tsx tests/app/ShiftReceipt.test.tsx tests/sim/run-summary.test.ts tests/app/RunSummary.test.tsx tests/app/GameScreen.test.tsx
git add -p src/app/components/RunSummary.tsx
git diff --cached --name-status
git commit -m "feat: simplify upgrade and run reports"
```

---

### Task 7: Verify the Complete Mobile Player Flow

**Files:**
- Create: `e2e/settlement-ledger.spec.ts`
- Modify: `e2e/game-feel.spec.ts`
- Modify: `e2e/mobile-flow.spec.ts`
- Create/update: `.superpowers/sdd/2026-09-01-settlement-ledger-and-clarity/acceptance.md`

**Interfaces:**
- Consumes: completed Tasks 1–6.
- Produces: automated acceptance evidence and an explicit remaining human-playtest gate.

- [ ] **Step 1: Write the new E2E acceptance flow**

Build the resolving state through real core commands, then replace only the drawn grid before `ACCEPT_OUTCOME`. This produces two authoritative awards—middle cherry line ¥10 followed by top Fruit Salad ¥15—and a real receipt with `bankrollBefore: 80`, `wager: 10`, `totalPayout: 25`, and `bankrollAfter: 95`:

```ts
const SALAD_STRIPS: ReelSet = [
  ["cherry", "cherry", "blank", "bell", "lemon", "blank"],
  ["lemon", "cherry", "blank", "bell", "seven", "blank"],
  ["bell", "cherry", "blank", "seven", "lemon", "blank"]
];
const SALAD_GRID: Grid = [
  ["cherry", "cherry", "blank"],
  ["lemon", "cherry", "blank"],
  ["bell", "cherry", "blank"]
];

function accepted(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error.code} ${result.error.message}`);
  return result.state;
}

async function installSnapshot(page: Page, state: RunState): Promise<void> {
  await page.goto(`/?seed=${state.initialSeed}`);
  await page.evaluate(({ storageKey, snapshot }) => {
    localStorage.clear();
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, { storageKey: RUN_STORAGE_KEY, snapshot: state });
  await page.reload();
  await expect(page.getByRole("dialog", { name: "恢复上次进度" })).toBeVisible();
}

function saladResolvingFixture(): RunState {
  let state = createRun(808);
  state = accepted(state, { type: "SELECT_SERVICE", serviceId: state.serviceCandidates[0] });
  state = {
    ...state,
    bankroll: 80,
    baseSpinsInShift: 2,
    shiftWager: 20,
    expenses: { ...state.expenses, wagers: 20 }
  };
  state = accepted(state, { type: "SPIN" });
  state = accepted(state, { type: "REELS_STOPPED" });
  const draw = normalizeDrawIdentity({
    ...state.pendingSpin!.draw,
    strips: SALAD_STRIPS,
    stops: [0, 0, 0],
    grid: SALAD_GRID,
    preInterventionPaying: true
  });
  state = {
    ...state,
    reels: SALAD_STRIPS,
    pendingSpin: { ...state.pendingSpin!, draw },
    partSlots: [{ id: "fruit-salad", level: 1 }, null, null, null, null]
  };
  return accepted(state, { type: "ACCEPT_OUTCOME" });
}

test("payouts enter the balance step by step and remain auditable after the shift", async ({ page }) => {
  const state = saladResolvingFixture();
  expect(state.spinHistory.at(-1)).toMatchObject({
    bankrollBefore: 80,
    wager: 10,
    totalPayout: 25,
    bankrollAfter: 95
  });
  await installSnapshot(page, state);

  const presentation = page.getByRole("region", { name: "结算演出队列" });
  const firstAward = page.waitForFunction(() => document.body.innerText.includes("本转累计 ¥10，余额 ¥80"))
    .then((handle) => handle.dispose());
  const finalAward = page.waitForFunction(() => document.body.innerText.includes("本转累计 ¥25，余额 ¥95"))
    .then((handle) => handle.dispose());
  const saladHighlight = page.waitForFunction(() => {
    const highlighted = [...document.querySelectorAll<HTMLElement>("[data-highlighted='true']")]
      .map((cell) => cell.dataset.cell)
      .sort();
    return highlighted.join(",") === "0:0,1:0,2:0" && document.body.innerText.includes("水果沙拉");
  }).then((handle) => handle.dispose());

  await expect(page.getByRole("region", { name: "本局状态" })).toContainText("余额 ¥70");
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续演出" }).click();
  await firstAward;
  await saladHighlight;
  await finalAward;
  await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "CHOOSING_UPGRADE");

  await page.getByRole("button", { name: "账本" }).click();
  const ledger = page.getByRole("dialog", { name: "前台账本" });
  await expect(ledger).toContainText("-¥10 → +¥25 · 净 +¥15");
  await expect(ledger).toContainText("樱桃 · 中线");
  await expect(ledger).toContainText("水果沙拉 · 顶线");
});
```

Import `Page` from Playwright, `GameCommand`, `Grid`, `ReelSet`, `RunState`, `normalizeDrawIdentity`, `createRun`, `dispatchCommand`, and the exported `RUN_STORAGE_KEY`/`LEGACY_RUN_STORAGE_KEY`; do not duplicate either storage-key string in E2E code.

In the same file add three exact tests using `saladResolvingFixture()`:

1. “direct settlement keeps the already-created receipt”: resume, click `直接结算` before the first award finishes, wait for `CHOOSING_UPGRADE`, open the ledger, and assert exactly one `小票 #1`, `+¥25`, and final balance `¥95`.
2. “reload restores history and the next shift preserves the resolved grid”: complete naturally, reload, choose `继续游戏`, assert the ledger still has exactly one `小票 #1`; close it, click `放弃升级`, assert phase `READY_TO_SPIN`, and assert the nine `[data-cell]` labels in reel/row order are `樱桃, 樱桃, 空白, 柠檬, 樱桃, 空白, 铃铛, 樱桃, 空白`.
3. “a genuinely fresh run clears receipt history”: after the previous state exists, clear both exported v1/v2 storage keys, reload `/?seed=808`, assert the ledger empty text is `拉动一次后，前台会在这里留下结算小票`, and assert no `小票 #1` is rendered.

- [ ] **Step 2: Update existing E2E expectations to the approved behavior**

In both existing E2E files, delete the literal v1 key and import `RUN_STORAGE_KEY` from `src/persistence/storage`. In `mobile-flow.spec.ts`, replace expectations for five long upgrade sections with compact decision copy and details. Replace the post-upgrade reel-prefix assertion with the prior receipt's final grid. In `game-feel.spec.ts`, rebuild the hand-authored resolving fixtures with schema-v2 pending metadata, formula-bearing events, and one valid receipt; wait for the visible payout target to reach the final amount instead of expecting it on the first frame. Reduced motion may assert the final amount immediately.

Do not edit or execute untracked `e2e/complete-run.spec.ts` in the scoped acceptance command.

- [ ] **Step 3: Run all unit, type, and build verification**

Run:

```bash
npm run verify
```

Expected: typecheck PASS, all tracked/local Vitest files PASS, production build PASS. Record the actual file/test counts; do not reuse old counts.

- [ ] **Step 4: Run scoped Playwright acceptance**

Run:

```bash
npm run e2e -- e2e/game-feel.spec.ts e2e/mobile-flow.spec.ts e2e/settlement-ledger.spec.ts
```

Expected: all scoped tests PASS at the configured 390×844 default, including the internal 320/390/430 viewport loop.

- [ ] **Step 5: Review screenshots and reduced-motion behavior**

Inspect generated screenshots for 320, 390, and 430px widths. Confirm no horizontal overflow, drawer height ≤72dvh, 44px controls, readable tabular money, static reduced-motion highlights, and no accidental reveal of final balance before the award sequence.

- [ ] **Step 6: Write evidence without overstating fun validation**

Record commands, exit codes, counts, viewport evidence, and protected dirty files in the acceptance note. End with this explicit gate:

```text
Automated checks verify arithmetic, persistence, layout constraints, and deterministic behavior.
They do not prove that the count-up feels exciting or that the shorter cards are easier to learn.
Final acceptance still requires the user to play one normal shift and one Fruit Salad trigger on a phone-sized viewport.
```

- [ ] **Step 7: Commit E2E and acceptance evidence**

```bash
git add e2e/game-feel.spec.ts e2e/mobile-flow.spec.ts e2e/settlement-ledger.spec.ts .superpowers/sdd/2026-09-01-settlement-ledger-and-clarity/acceptance.md
git diff --cached --name-status
git commit -m "test: verify settlement clarity flow"
```

Do not stage untracked Task 13 `e2e/complete-run.spec.ts`, artifacts, balance scripts, or validation fixtures.
