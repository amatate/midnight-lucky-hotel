# Midnight Lucky Hotel One-Pull-One-Explosion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the existing deterministic Web/PWA rules prototype into a mobile slot machine that explains every choice, gives the lever physical ceremony, visibly spins and stops all three reels, and turns wins and fruit-part chains into legible, satisfying feedback.

**Architecture:** Keep outcome generation, money, RNG, and progression in `src/core`; add only observational part-trigger events there. Derive all animation plans, replay frames, win tiers, copy, sound cues, haptic patterns, and particles from immutable `RunState` and ordered `GameEvent[]`. React sends existing `GameCommand` values through `useGame`; it never writes rule state or persists animation state. A single guarded automatic-flow hook owns stop/accept timing, while a separate guarded settlement hook owns event playback and `PRESENTATION_COMPLETE`.

**Tech Stack:** TypeScript 7, React 19, Vite 8, Vitest 4 + Testing Library, Playwright 1.62, CSS/SVG animation, Web Audio, Vibration API, vite-plugin-pwa.

**Spec:** `docs/superpowers/specs/2026-08-30-one-pull-one-explosion-design.md`

## Global Constraints

- Preserve all existing uncommitted Task 13 balance work. In particular, do not stage or overwrite unrelated changes in `package.json`, `src/app/components/RunSummary.tsx`, `src/content/base-machine.ts`, the currently dirty core/content/simulation tests, `artifacts/`, `docs/playtest/`, `docs/validation/`, `e2e/complete-run.spec.ts`, `scripts/`, `tests/core/scenario-builds.test.ts`, or `tests/fixtures/` unless a task explicitly names and safely isolates a required edit.
- The existing worktree `/Users/teddy/Documents/ChatGPT/slot machine/.worktrees/slot-machine-prototype` and branch `codex/slot-machine-prototype` are the implementation workspace. Never create a second nested worktree.
- The rules result is authoritative before animation begins. Filler symbols, durations, easing, sound, haptics, particles, and screen shake may not inspect win/loss to change reel timing, touch RNG, move money, reorder events, or fabricate near misses.
- The UI may change rules only by sending `GameCommand` through the existing controller. Automatic `REELS_STOPPED`, `ACCEPT_OUTCOME`, and `PRESENTATION_COMPLETE` commands need cycle-specific once guards and must be cancelled while hidden, behind recovery UI, or unmounted.
- Preserve `schemaVersion: 1`, storage key `midnight-lucky-hotel.run.v1`, deterministic seed behavior, complete/skip state equivalence, offline PWA recovery, and all existing rule tests.
- Presentation always consumes `state.pendingEvents` as the full causal source during settlement. The latest `REELS_DRAWN` is the replay origin; later `SYMBOL_CHANGED` events form visual frames. Never infer a changed cell from payout totals.
- Exact probability is visible only at `toolLevel >= 1`; estimated RTP and interval only at `toolLevel >= 2`; volatility, ruin risk, and affordable spins only at `toolLevel >= 3`. At level 0, even a hidden estimate's risk band must remain player-visible as unknown.
- Reference viewport is 390×844; support 320×568 through 430×932, safe-area insets, vertical scrolling, no horizontal overflow, and at least 44×44 CSS-pixel primary touch targets.
- Effective reduced motion is stored preference OR operating-system preference. It removes blur, particle travel, elastic scale, and shake; replaces them with a 120–180ms fade/static highlight; and must not stall automatic commands.
- New fonts and assets are local, licensed, and included in the PWA precache. Do not load remote fonts or audio at runtime.
- Tests assert observable behavior against literal, independently derived expectations. They do not assert CSS source text, framework mechanics, or mock existence.
- Each task follows RED → GREEN → refactor, runs its focused tests plus typecheck, self-reviews against this plan and the design spec, and commits only its named files.

## Baseline Evidence and Ruling

The pre-implementation baseline on Node 26.7.0 has two environmental failures:

1. Node 26 exposes an experimental global `localStorage` getter whose value is `undefined`; Vitest's jsdom global is shadowed, so 63 browser/storage tests fail before their bodies. Running with `NODE_OPTIONS=--no-experimental-webstorage` makes the focused UI suite pass 16/16.
2. The two existing 100,000-spin tests exceed Vitest's default 5-second timeout under full-suite contention. With a 30-second timeout and webstorage disabled, all 31 files / 406 tests pass.

Ruling: Task 0 repairs the test environment at the jsdom/configuration boundary before feature work. It does not modify rules, balance expectations, or the dirty Task 13 tests.

## Task 0: Restore a Trustworthy Node 26 Test Baseline

**Files:**

- Create: `tests/app/test-environment.test.ts`
- Modify: `src/test/setup.ts`
- Modify: `vite.config.ts`

**Required interface and behavior:**

- In jsdom setup, bind `globalThis.localStorage` and `globalThis.sessionStorage` to the active jsdom window's storage objects only when a window exists. Do not add a production storage polyfill.
- Configure Vitest `testTimeout: 30_000`; retain the existing jsdom environment, setup file, mocks policy, and E2E exclusion.
- The new test must prove storage set/get/clear behavior through both the global and `window` references and prove one test's clear removes the prior value.

**TDD steps:**

- [ ] Add the environment test and run `npm test -- tests/app/test-environment.test.ts`; record that the unqualified `localStorage` is unavailable before the fix.
- [ ] Add the narrow setup binding; rerun the test and the existing storage/UI suites.
- [ ] Add `testTimeout: 30_000` and run `npm test` without `NODE_OPTIONS` or CLI timeout overrides.
- [ ] Run `npm run typecheck` and confirm all original 406 tests plus the new environment regression are green before any feature change.
- [ ] Commit only the three named files as `test: stabilize jsdom on Node 26`.

## Task 1: Add Observable Part Triggers and Pure Presentation Models

**Files:**

- Modify: `src/core/settlement.ts`
- Create: `src/presentation/summary.ts`
- Create: `src/presentation/replay.ts`
- Create: `tests/core/presentation-events.test.ts`
- Create: `tests/presentation/summary.test.ts`
- Create: `tests/presentation/replay.test.ts`

**Required interfaces:**

```ts
export type FeedbackTier = "none" | "win" | "chain" | "runaway";

export interface PresentationLine {
  readonly sequence: number;
  readonly lineId: LineWin["lineId"];
  readonly symbol: SymbolId;
  readonly amount: number;
  readonly cells: LineWin["cells"];
}

export interface PresentationPartTrigger {
  readonly sequence: number;
  readonly partId: PartId;
  readonly level: 1 | 2;
}

export interface PresentationSummary {
  readonly total: number;
  readonly lines: readonly PresentationLine[];
  readonly partTriggers: readonly PresentationPartTrigger[];
  readonly effectCount: number;
  readonly chainLength: number;
  readonly freeSpinsGranted: number;
  readonly tier: FeedbackTier;
}

export function summarizePresentation(
  events: readonly GameEvent[],
  currentBet: number
): PresentationSummary;

export interface GridReplayFrame {
  readonly sequence: number;
  readonly grid: Grid;
  readonly changedCells: readonly { reel: ReelIndex; row: RowIndex }[];
}

export interface GridReplay {
  readonly initialGrid: Grid | null;
  readonly frames: readonly GridReplayFrame[];
  readonly finalGrid: Grid | null;
}

export function buildGridReplay(events: readonly GameEvent[]): GridReplay;
```

**Event contract:**

- When an active `kind: "part"` registration returns one or more effects, append exactly one `PART_TRIGGERED` draft for that handler reaction immediately before enqueueing those effects. Use the equipped slot's actual id and level.
- A reaction returning `[]`, a cracked/disabled part, or a forged/inactive registration emits no trigger. Existing effect order, amounts, RNG, attribution, and the 100-effect overload cap do not change.
- Multiple legitimate reactions from one part (for example one jam-jar reaction per cherry line) remain multiple ordered triggers.

**Tier rules:**

- `none`: total is zero and no overload.
- `win`: positive total, fewer than two line events, fewer than two part triggers, no free spin, and total below `3 × currentBet`.
- `chain`: positive total and at least two lines, at least two part triggers, a positive free-spin grant, or total in `[3 × currentBet, 8 × currentBet)`.
- `runaway`: any `OVERLOAD`, at least six effect events, or total at least `8 × currentBet`. Runaway has priority over chain.
- Use the last `PAYOUT_COMPLETE.total` as authoritative total; fall back to the sum of `LINE_WIN`, `PAYOUT_ADDED`, and `OVERLOAD` only when that event is absent.
- `effectCount` counts visible rule effects (`PART_TRIGGERED`, `PART_DISABLED`, `PAYOUT_ADDED`, `SYMBOL_CHANGED`, `RESOURCE_CHANGED`, `FOOD_CONSUMED`, `OVERLOAD`) and excludes bookkeeping/meta events.
- Map every line id to the literal cells exported by `PAYLINES`.

**Replay rules:**

- Start from the last `REELS_DRAWN` event, ignore earlier draws, clone its grid, and apply only subsequent valid `SYMBOL_CHANGED` events in sequence order.
- Never mutate caller events or draw grids. Missing draw yields null/empty replay.

**TDD steps:**

- [ ] Write part-event tests for a fruit trigger, a disabled part, an empty reaction, and multi-line jam-jar ordering; run RED against current settlement.
- [ ] Write literal summary boundary tests for zero, 2-line, 2-part, free-spin, six-effect, `3×`, `8×`, and overload cases; run RED on the missing module.
- [ ] Write replay tests with two draws, two symbol changes, immutable inputs, and missing draw; run RED.
- [ ] Implement the minimum observational event, summary, and replay code.
- [ ] Run the three new suites, existing fruit/chapel/violent/settlement suites, and `npm run typecheck`; compare identical fixtures and verify equality of payout, bankroll, RNG, attribution, reels, counters, flags, buffs, and progression fields while explicitly excluding the intentionally changed `pendingEvents` and event sequence numbers.
- [ ] Commit only named files as `feat: expose deterministic win presentation data`.

## Task 2: Replace Internal Tags with Complete Player-Facing Copy

**Files:**

- Create: `src/content/player-copy.ts`
- Modify: `src/app/GameScreen.tsx`
- Modify: `src/app/components/UpgradePicker.tsx`
- Modify: `src/app/components/PartsBar.tsx`
- Modify: `src/app/components/Hud.tsx`
- Modify: `src/app/useEstimate.ts`
- Create: `src/app/useUpgradePreviewEstimate.ts`
- Create: `tests/content/player-copy.test.ts`
- Create: `tests/app/PartsBar.test.tsx`
- Modify: `tests/app/UpgradePicker.test.tsx`
- Modify: `tests/app/GameScreen.test.tsx`
- Create: `tests/app/useUpgradePreviewEstimate.test.tsx`

**Required interfaces:**

```ts
export interface ServicePresentation {
  readonly name: string;
  readonly identity: string;
  readonly action: string;
  readonly synergies: string;
  readonly risk: string;
}

export interface UpgradePresentation {
  readonly id: UpgradeId;
  readonly name: string;
  readonly kindLabel: string;
  readonly routeLabel: string;
  readonly effect: string;
  readonly levelTwoEffect: string | null;
  readonly currentImpact: string;
  readonly synergy: string;
  readonly risk: string;
  readonly targetHint: string | null;
  readonly available: boolean;
}

export const SERVICE_PRESENTATIONS: Readonly<Record<ServiceId, ServicePresentation>>;
export function describeUpgrade(
  state: RunState,
  id: UpgradeId,
  target?: UpgradeTarget,
  estimates?: {
    readonly before: MachineEstimate | null;
    readonly after: MachineEstimate | null;
  }
): UpgradePresentation;
export function describeEquippedPart(state: RunState, part: PartInstance): UpgradePresentation;

export function buildEstimateRequest(state: RunState): EstimateRequest;

export function useUpgradePreviewEstimate(
  state: RunState,
  choice: UpgradeChoice | null
): EstimateResult;

export function buildUpgradePreviewRequest(
  state: RunState,
  choice: UpgradeChoice
): EstimateRequest | null;
```

**Binding copy facts:**

| Upgrade | L1 fact | L2 fact when a part |
|---|---|---|
| 柠檬木箱 | two distinct reels each permanently gain 2 lemons | n/a |
| 樱桃去核器 | replace 1 selected non-cherry/non-wild on one reel with cherry | n/a |
| 柠檬感染 | first lemon line each spin transforms 1 eligible off-line cell then reevaluates | transforms 2 |
| 果酱罐 | each cherry line charges; bonus is prior shift cherry lines × 0.5 × bet | multiplier becomes 1 × bet |
| 水果沙拉 | literal cherry+lemon+bell on a payline pays 1.5 × bet; wild cannot substitute | pays 2.5 × bet |
| 剩菜打包 | first consumed food each shift returns to current shortest reel | first 2 return |
| 七之净化 | replace 1 cherry or lemon on a selected reel with seven | n/a |
| 什一税箱 | pay ¥10, add 1 seven to a reel, gain 1 omen | n/a |
| 恶兆收集器 | first seven line consumes all omen for omen × 0.5 × bet | multiplier becomes 1 × bet |
| 三重祝福 | first seven line copies its payout once and adds 1 blank to every reel | copies twice and adds 2 blanks |
| 午夜钟声 | first bell line changes first literal bell to wild then reevaluates | changes first 2 |
| 殉道者硬币 | before first base spin, sacrifice ceil(10% bankroll); every seven line copies once this shift | copies twice |
| 人为裂纹 | add 1 permanent crack to a reel; next-shift focus cap +1 | n/a |
| 废料磁铁 | literal crack line pays 2 × bet and removes its physical cracks | pays 4 × bet |
| 松动弹簧 | kick advances 2 cells and adds 2 cracks | advances 3, still adds 2 |
| 空白电容 | every 3 visible physical blanks grants 1 free spin, remainder kept | threshold becomes 2 |
| 骗保单 | first other part disabled this shift pays 3 × bet | pays 6 × bet |
| 过载马达 | from second core chain effect, each pays 0.25 × bet; sixth adds 1 crack per reel | pays 0.5 × bet |
| 修枝剪 | remove 1 chosen non-wild from reel longer than 6; never below 6 | n/a |
| 复写纸 | permanently add 2 chosen base symbols to one reel | n/a |
| 安全保险丝 | when below minimum wager, consume for ¥20 | consume for ¥40 |
| 计算器 | unlock per-reel symbol probabilities | n/a |
| 会计账本 | retain probabilities; unlock estimated RTP and 95% interval | n/a |
| 统计终端 | unlock volatility, horizon ruin probability, affordable spins | n/a |

**Dynamic copy:**

- Reel modifications show selected reel symbol count and strip length before/after. At tool level 1, also show exact per-reel probability before/after; otherwise only “提高/降低”.
- At tool level 2 or 3, a valid selected reel-modification choice is applied through the immutable real controller to create a projected machine. Build the after-request from the current state's estimate request, changing only projected `reels`/`parts`; keep identical `simulationSeed`, bankroll, bet, tool level, horizon, and sample count so random noise or acquisition cost cannot masquerade as RTP change. Show `估算 RTP before → after` only after both paired estimates are ready. Never expose the projected number at tool level 0 or 1, and never call it exact.
- Existing parts say `L1 → L2` and describe the numerical change. Jam jar, leftovers, omen collector, martyr coin, blank capacitor, warranty fraud, loose spring, and safety fuse show their current counter/cost/payout/status using the current wager.
- Tool copy calls RTP an estimate, never exact. Level 0 shows no estimate or risk band; level 1 probability only; level 2 RTP/interval; level 3 adds volatility/ruin/affordable spins.
- Service cards show identity, exact action/cost, two synergies, and a real cost. Kitchen explicitly says food costs ¥10 and later gives three spins of +25% payout; security says kick is deterministic, uses the spin's intervention, and leaves permanent cracks.
- Parts panel shows the full trigger rule, level delta, current progress, trigger/disabled state supplied by current presentation, and the truthful shared `state.attribution.part` as “本局全部部件贡献”; do not invent per-part lifetime totals.
- Candidate role labels are exactly `强化现有组合`, `修补风险／换路线`, `高风险改规则`. No internal English tags appear in rendered UI.

**TDD steps:**

- [ ] Add exhaustive 24-upgrade and 4-service copy tests; prove all 14 parts have L2 text and tool gates do not leak.
- [ ] Add literal dynamic tests for target reel count/length, jam-jar next payout, leftovers remaining returns, omen payout, capacitor charge, martyr cost, warranty status, and fuse rescue.
- [ ] Add hook tests proving projected upgrade estimates use a controller-produced copy, leave the real state/RNG untouched, keep `simulationSeed`/bankroll/bet/tool/horizon/sample identical across before and after, vary only machine configuration, display before→after only at tool level 2+, and cancel stale worker results when the target changes.
- [ ] Add UI tests proving all three candidate cards explain themselves before selection, an owned part shows L1→L2, and tags are absent.
- [ ] Implement copy and wire service chooser, upgrade cards, parts panel, and HUD tool gating without changing command dispatch.
- [ ] Run new suites, all existing app suites, and `npm run typecheck`.
- [ ] Commit only named files as `feat: explain every construction choice`.

## Task 3: Centralize Legal Interventions and Guarded Automatic Flow

**Files:**

- Create: `src/app/intervention-options.ts`
- Create: `src/presentation/reel-timeline.ts`
- Create: `src/app/useAutomaticSpinFlow.ts`
- Modify: `src/app/GameScreen.tsx`
- Modify: `src/app/components/ActionBar.tsx`
- Create: `tests/app/intervention-options.test.ts`
- Create: `tests/presentation/reel-timeline.test.ts`
- Modify: `tests/app/presentation.test.ts`
- Modify: `tests/app/GameScreen.test.tsx`

**Required interfaces:**

```ts
export function availableInterventions(state: RunState): readonly GameCommand[];

export interface ReelMotionPlan {
  readonly cycleKey: string;
  readonly kind: "base" | "respin" | "repair-lock" | "kick";
  readonly spinningReels: readonly ReelIndex[];
  readonly revealAtMs: Readonly<Partial<Record<ReelIndex, number>>>;
  readonly completeAtMs: number;
}
export function reelMotionPlan(state: RunState, reducedMotion: boolean): ReelMotionPlan | null;

export interface AutomaticSpinFlowOptions {
  readonly state: RunState;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly onCommand: (command: GameCommand) => void;
}
export function useAutomaticSpinFlow(options: AutomaticSpinFlowOptions): ReelMotionPlan | null;
```

**Legality and timing:**

- Enumerate the three normal respins, three repair locks, and three security kicks, then retain only commands accepted by the real immutable `dispatchCommand(state, command)` boundary. Do not hand-copy a second legality implementation. Exclude `ACCEPT_OUTCOME` from the returned interventions.
- Base spin reveal times are reel 1 at 1000ms, reel 2 at 1220ms, reel 3 at 1440ms; completion is 1440ms.
- Normal respin and kick move only the targeted reel and finish at 620ms. Repair lock moves only the two non-locked reels, revealing them at 480ms and 620ms.
- Reduced motion makes all moving reels statically fade/reveal within 160ms; the same commands still fire.
- `cycleKey` includes command-history length and the last motion command so a respin after an intervention is a new cycle.
- On unpaused `SPINNING`, send one `REELS_STOPPED` at completion. On unpaused `AWAITING_INTERVENTION` with no available intervention, hold the result 300ms (160ms reduced), then send one `ACCEPT_OUTCOME`. With any legal intervention, wait indefinitely for the player and display “收下这把”.
- Pause and clear timers while `document.hidden`, the recovery dialog is open, or the component is unmounted. On resume, begin that phase's presentation once; never dispatch behind the recovery dialog.
- Remove the ordinary manual stop button. Retain accessible status text and intervention buttons. A recovery saved in `SPINNING` still has an explicit “继续停轮” recovery action, after which automatic timing resumes.

**TDD steps:**

- [ ] Write property-style table tests comparing every returned intervention against real controller acceptance for normal, no-focus, repair, security, already-used, and malformed short-strip states.
- [ ] Write literal motion-plan tests for all four kinds and reduced motion.
- [ ] Update fake-timer integration tests first so the old explicit-stop flow fails: stop once, wait-with-intervention, auto-accept-without-intervention, second cycle after respin, hidden/recovery/unmount guards.
- [ ] Implement the pure helpers and hook; wire `GameScreen` and simplify `ActionBar`.
- [ ] Run focused app/presentation tests, persistence recovery tests, and `npm run typecheck`.
- [ ] Commit only named files as `feat: automate honest reel flow`.

## Task 4: Build the Physical Pull Lever

**Files:**

- Create: `src/app/components/PullLever.tsx`
- Modify: `src/app/GameScreen.tsx`
- Modify: `src/presentation/audio.ts`
- Modify: `src/presentation/haptics.ts`
- Modify: `src/app/styles.css`
- Create: `tests/app/PullLever.test.tsx`
- Modify: `tests/app/GameScreen.test.tsx`

**Required interface:**

```ts
export interface PullLeverProps {
  readonly disabled?: boolean;
  readonly reducedMotion: boolean;
  readonly onPull: () => void;
}
export function PullLever(props: PullLeverProps): React.JSX.Element;
```

**Behavior:**

- Pointer travel maps continuously to a clamped 0–1 progress over 120px and exposes that progress through `data-pull-progress` plus CSS custom property `--pull-progress`.
- Crossing 0.72 downward emits one detent click and optional 8–12ms haptic per gesture. Moving above/below the point repeatedly does not repeat it until a new gesture.
- Pointer release at progress `>= 0.82` calls `onPull` once, hits bottom for 70ms, then returns with about 210ms back-ease. Below threshold or pointer cancel returns without calling.
- The accessible button labelled “拉动老虎机” calls the same guarded entry point and plays a shortened press/rebound. Disable pointer and button while not ready.
- The user gesture synchronously calls `unlockAudio()` before the `SPIN` command; browser failures remain no-op. Haptic and sound are redundant, never required for rules.

**TDD steps:**

- [ ] Add real pointer-event tests for progress 0, 0.72, 0.81, 0.82, 1; detent once; cancel; duplicate pointer-up; disabled; and fallback button. Run RED on missing component.
- [ ] Implement pointer ownership, progress, feedback callbacks, and cleanup; avoid animation-end-driven rules.
- [ ] Replace the inline `PullControl` in `GameScreen`; update the existing gesture integration test to the 82% contract.
- [ ] Add mechanical lever styling and reduced-motion fallback.
- [ ] Run lever/GameScreen/presentation tests and `npm run typecheck`.
- [ ] Commit only named files as `feat: make the lever a physical ritual`.

## Task 5: Render Real Sequential Reels Without Leaking Results

**Files:**

- Create: `src/app/components/SymbolFace.tsx`
- Modify: `src/app/components/SlotMachine.tsx`
- Modify: `src/app/GameScreen.tsx`
- Modify: `src/app/styles.css`
- Create: `tests/app/SymbolFace.test.tsx`
- Create: `tests/app/SlotMachine.test.tsx`
- Modify: `tests/app/GameScreen.test.tsx`

**Required interface:**

```ts
export interface SlotMachineProps {
  readonly state: RunState;
  readonly motionPlan: ReelMotionPlan | null;
  readonly reducedMotion: boolean;
  readonly displayGrid?: Grid | null;
  readonly highlightedLineIds?: readonly LineWin["lineId"][];
  readonly changedCells?: readonly { reel: ReelIndex; row: RowIndex }[];
}
```

**Behavior:**

- Replace emoji with a consistent inline-SVG/enamel symbol set for cherry, lemon, bell, seven, wild, blank, food, and crack. Each final cell retains its Chinese accessible name.
- Capture the last stable visible grid before each motion cycle. A moving reel renders a deterministic, win-independent filler tape that is `aria-hidden` and contains no accessible final labels.
- Reveal only each reel's authoritative `state.pendingSpin.draw.grid[reel]` at its planned stop. At the end, all nine visible and accessible cells exactly match the core grid.
- Outside settlement replay, reveal only each reel's authoritative `state.pendingSpin.draw.grid[reel]` at its planned stop. During settlement, an explicit `displayGrid` overrides that resolved grid so replay begins at `GridReplay.initialGrid` and advances only with the causal event; the fully transformed grid must not appear early.
- A base spin moves 3 reels; normal respin/kick only the target; repair lock only the two unlocked reels. Use the shared plan, never CSS `animationend`, to decide reveals.
- Stop uses overshoot and settle styling only; it does not alter timing by result. Reduced motion uses a static smoked cover then a 160ms fade.
- Map highlighted payline ids through `PAYLINES` and mark exactly their cells. Changed cells get a short “盖章/染色” state suitable for lemon infection.

**TDD steps:**

- [ ] Test all symbol faces for accessible labels and no emoji text dependency.
- [ ] With fake timers, test result privacy during motion, reel-by-reel reveal boundaries, exact final grid, each intervention motion set, explicit replay-grid override (including no early transformed symbol), line-cell mapping, and reduced mode. Run RED.
- [ ] Implement the symbol set, stable-grid capture, filler tape, reveal timers, and semantic highlight props.
- [ ] Wire the shared motion plan from `GameScreen`.
- [ ] Run SlotMachine/GameScreen/reel-timeline suites and `npm run typecheck`.
- [ ] Commit only named files as `feat: animate deterministic reel stops`.

## Task 6: Layer Win, Chain, Coin, Audio, and Haptic Feedback

**Files:**

- Create: `src/presentation/feedback.ts`
- Create: `src/app/useSettlementPresentation.ts`
- Create: `src/app/components/CoinBurst.tsx`
- Create: `src/app/components/WinPresentation.tsx`
- Modify: `src/presentation/queue.ts`
- Modify: `src/presentation/audio.ts`
- Modify: `src/presentation/haptics.ts`
- Modify: `src/app/components/SlotMachine.tsx`
- Modify: `src/app/components/PartsBar.tsx`
- Modify: `src/app/components/Hud.tsx`
- Modify: `src/app/GameScreen.tsx`
- Modify: `src/app/styles.css`
- Create: `tests/presentation/feedback.test.ts`
- Create: `tests/app/WinPresentation.test.tsx`
- Modify: `tests/app/presentation.test.ts`

**Required interfaces:**

```ts
export interface FeedbackPlan {
  readonly coinCount: 0 | 8 | 24 | 48;
  readonly shakePx: 0 | 3 | 6;
  readonly hapticPattern: number | readonly number[];
  readonly tone: "none" | "win" | "chain" | "runaway";
}
export function feedbackPlan(tier: FeedbackTier, reducedMotion: boolean): FeedbackPlan;

export interface SettlementPresentationState {
  readonly summary: PresentationSummary;
  readonly currentEvent: GameEvent | null;
  readonly eventIndex: number;
  readonly eventTotal: number;
  readonly activeLineIds: readonly LineWin["lineId"][];
  readonly activePartId: PartId | null;
  readonly changedCells: readonly { reel: ReelIndex; row: RowIndex }[];
  readonly displayGrid: Grid | null;
  readonly done: boolean;
  readonly accelerated: boolean;
  readonly speedUp: () => void;
  readonly skip: () => void;
}
```

**Behavior:**

- Feedback plans are exact: none `0/0`, win `8 coins/0px`, chain `24/3px`, runaway `48/6px`; reduced motion always `0 coins/0px` but keeps static line, amount, part, and causal text.
- Coin particles use a fixed index-derived path table, are `aria-hidden`, pooled/capped at 48, and never call game RNG.
- The win stage names the exact total, line count, part trigger count, and cause chain. `+¥X` and balance destination remain accessible even when animation is off.
- Play line highlight before part trigger, light the exact equipped part on `PART_TRIGGERED`, and expose each replayed grid as `displayGrid` so `SlotMachine` renders the pre-change grid followed by every `SYMBOL_CHANGED` frame instead of jumping directly to the resolved grid.
- Fruit-specific labels are explicit: food consumed creates a three-ticket `+25%` status, jam jar shows the cherry count stepping, fruit salad names literal cherry/lemon/bell, leftovers names the returned-food allowance. When an event lacks a physical row, highlight the truthful reel rather than guessing a cell.
- Play feedback for the first queued event too. Normal queue completion automatically sends `PRESENTATION_COMPLETE` once; zero-event settlement also completes; speed-up affects future delays; skip drains visuals then sends the same command once.
- Use `state.pendingEvents` for both fresh and recovered settlements. Balance display may animate from `state.bankroll - summary.total` to `state.bankroll`, but actual state is never delayed or rewritten.
- Hidden/recovery/unmount pauses and clears timers. Full play and skip produce identical final `RunState`.

**TDD steps:**

- [ ] Add literal feedback-plan and coin-count tests, including reduced motion and cap.
- [ ] Add WinPresentation tests for line cells, exact amount, part lamp, causal labels, fruit transformations, and accessible reduced mode.
- [ ] Update queue/hook integration tests first for first-event feedback, zero-event completion, auto-complete once, pause/resume, recovery, strict-mode rerender, and skip equivalence; run RED.
- [ ] Implement the pure plan, hook, visual components, audio chords, haptic patterns, and GameScreen wiring.
- [ ] Run all presentation/app/content-route tests and `npm run typecheck`.
- [ ] Commit only named files as `feat: stage wins and runaway chains`.

## Task 7: Rebuild the Mobile Cabinet and Contextual Decision Tray

**Files:**

- Modify: `src/app/GameScreen.tsx`
- Modify: `src/app/components/Hud.tsx`
- Modify: `src/app/components/ActionBar.tsx`
- Modify: `src/app/components/PartsBar.tsx`
- Modify: `src/app/components/UpgradePicker.tsx`
- Modify: `src/app/styles.css`
- Modify: `public/icons/icon-192.svg`
- Modify: `public/icons/icon-512.svg`
- Add: `public/fonts/SmileySans-Oblique.woff2`
- Add: `public/fonts/BarlowCondensed-SemiBold.woff2`
- Add: `public/fonts/licenses/SmileySans-LICENSE.txt`
- Add: `public/fonts/licenses/BarlowCondensed-OFL.txt`
- Modify: `vite.config.ts`
- Modify: `tests/app/GameScreen.test.tsx`
- Modify: `tests/app/UpgradePicker.test.tsx`
- Modify: `tests/app/PartsBar.test.tsx`

**Visual system:**

- Use only the six approved tokens: night ink `#0B0908`, aged brass `#B8893E`, warm enamel `#F2E3C0`, hotel red `#A92F36`, payout gold `#FFD45A`, verdigris `#347568`, plus alpha/tonal derivatives.
- Use a locally bundled open-license slanted Chinese display face and a locally bundled open-license condensed tabular-number face. System Chinese sans remains body fallback. Record source and license; update PWA `globPatterns` to include `woff2`.
- Acquire Smiley Sans only from the upstream `atelier-anchor/smiley-sans` release/source and Barlow Condensed only from `google/fonts/ofl/barlowcondensed` or its declared `jpt/barlow` upstream. If an upstream ships TTF/OTF rather than WOFF2, convert that exact file locally and retain its OFL text and source revision; do not substitute an unverified mirror.
- The hero is one physical brass/smoked-glass cabinet with a right-side lever silhouette. Bankroll/target use a room-number flip-counter treatment. Remove the generic purple glass-card/SaaS appearance, emoji, internal tags, uniform pills, and “功能原型” eyebrow.
- Keep only current-decision controls visible: service at opening; bet/service preparation in ready phase; “收下这把” plus legal interventions after stop; win stage while resolving; upgrade scene at boundary. Do not stack service and intervention panels at all times.
- Part rack is a five-socket machine strip with trigger lamps, level rings, disabled cracks, and expandable full copy.
- Upgrade choice becomes a dedicated full-width ticket scene. Cards show full effect before selection, actual target preview, L1→L2, current impact, synergy/risk, and role names from Task 2.
- A reel-mod target preview renders a maintenance ticket with symbol count and strip length before/after; exact probability only at tool level 1; estimated RTP context only at level 2.
- Apply safe-area padding, 320/390/430 responsive rules, 44px targets, visible focus, `aria-live` restraint, and both `.reduce-motion` plus `@media (prefers-reduced-motion: reduce)` fallbacks.
- Icons use the same hotel-room-number/brass-machine motif and remain SVG.

**TDD and QA steps:**

- [ ] Update behavior tests for one contextual decision region, room counter semantics, complete service copy, triggerable part detail, and maintenance preview; run RED against the old panel stack.
- [ ] Implement the cabinet hierarchy and component markup before styling; keep all existing command behavior intact.
- [ ] Apply tokens, typography, material, responsive layout, interaction states, and reduced-motion CSS.
- [ ] Add licensed local font assets and PWA caching, then build offline artifacts and assert the WOFF2 files are precached.
- [ ] Run all app tests, typecheck, and build. Use Playwright screenshots at 320×568, 390×844, and 430×932 in this plan's ignored SDD workspace; inspect them for overflow, clipped text, hierarchy, and lever reach.
- [ ] Commit only named files/assets as `feat: rebuild the midnight hotel cabinet`.

## Task 8: Production Flow, Offline, Accessibility, and Playable Acceptance

**Files:**

- Modify: `e2e/mobile-flow.spec.ts`
- Create: `e2e/game-feel.spec.ts`
- Modify only if a failing behavior requires it: files introduced or modified by Tasks 1–7
- Write ignored evidence: `.superpowers/sdd/2026-08-30-one-pull-one-explosion-implementation/acceptance.md`

**Production E2E scenarios:**

- Fixed-seed new run: choose kitchen, buy food, set conservative bet, pull via accessible lever/button, observe automatic sequential stops, choose “收下这把” only when interventions exist, observe automatic settlement, complete three base spins, and reach three fully explained upgrade cards.
- Acquire a fruit upgrade through a real target choice, continue next shift, and verify the maintenance preview/acquired name plus at least one visible change to reel contents or fruit-part state.
- Fixed event fixtures render `win`, `chain`, and `runaway` tiers with exact accessible totals and no more than 48 particles.
- Viewport loop 320×568, 390×844, 430×932: `scrollWidth <= innerWidth`; every visible primary button/select is at least 44×44; vertical scroll is allowed; the lever remains reachable.
- Reduced motion: zero moving coin particles/shake/blur, static line/amount/cause remain, and automatic commands finish.
- Recovery: save and reload in `SPINNING`, `AWAITING_INTERVENTION`, and `RESOLVING_EFFECTS`; no command fires behind the modal; continuation fires each automatic command exactly once.
- Production PWA preview: online first load becomes service-worker controlled; offline reload restores shell, local fonts/icons, and saved run.

**Final gates:**

- [ ] Update E2E selectors to roles, accessible names, and stable `data-state` attributes; remove dependence on old visual class names and manual stop/accept where flow is automatic.
- [ ] Run the new focused production E2E scenarios and inspect screenshots/video for sequential reel motion and three feedback tiers.
- [ ] Run `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`, and `npm run balance` from the worktree. Record exact counts and outputs; no environment flags or ad hoc timeouts.
- [ ] Run `git diff --check`, inspect the complete staged diff, and verify all pre-existing dirty Task 13 paths remain unstaged/unmodified by this plan unless explicitly named.
- [ ] Conduct the automated 10-second first-experience checklist in `acceptance.md`: main action discoverable, first pull has pull→roll→stop, first win names line/amount, upgrade cards explain at least two choices, next shift exposes the acquired change.
- [ ] Explicitly leave “fun” and physical-device haptics as human acceptance gates. Engineering handoff status is `technically complete; human acceptance pending`; do not mark the approved experience complete until the user plays and confirms they want to pull at least three more times.
- [ ] Commit only the Task 8 E2E/necessary fix files as `test: verify the one-pull-one-explosion flow`.

## Completion Criteria

- Every task has a RED observation, GREEN focused evidence, typecheck, scoped commit, self-review, and independent task review.
- A broad final review finds no unaddressed Critical or Important issue against the approved spec and this plan.
- All engineering gates pass from a fresh invocation while unrelated Task 13 changes remain preserved.
- The game is handed back as playable and technically verified with status `technically complete; human acceptance pending`. The approved experience becomes complete only after the user can explain the first win/upgrade change and says they want to pull at least three more times.
