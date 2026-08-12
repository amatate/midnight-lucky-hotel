# Midnight Lucky Hotel Functional Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, mobile-first Web/PWA prototype in which the player modifies a negative-expectation slot machine into one of three explainable, potentially profitable engines.

**Architecture:** Keep the TypeScript rules engine independent from React, the DOM, timing, sound, and storage. Commands produce a new serializable `RunState` plus structured `GameEvent` values; React renders that state and a presentation queue animates the events without deciding outcomes. Seeded Monte Carlo simulation reads cloned machine state on a separate random stream and exposes probability, RTP range, volatility, and ruin risk according to the equipped information tool.

**Tech Stack:** Node.js 24.13.1, npm 11.8.0, TypeScript 7.0.2, React 19.2.8, Vite 8.2.1, Vitest 4.1.10, fast-check 4.9.0, Testing Library, Playwright 1.62.1, vite-plugin-pwa 1.3.0.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-08-12-slot-machine-roguelite-design.md`.
- Reference viewport is 390×844 CSS pixels; supported portrait range is 320×568 through 430×932; primary touch targets are at least 44×44 CSS pixels.
- Initial bankroll is 100, checkout target is 200, normal bet is 10, conservative multiplier is 0.5, aggressive multiplier is 2.0, and each normal shift grants two intervention points.
- Money is stored in chip units rounded to two decimal places after every rule operation; comparisons use the rounded value.
- A run has five shifts with three base spins per shift; only the first four completed shifts offer a normal-run upgrade.
- The initial machine RTP must remain within 75%–85% under 100,000 deterministic base spins.
- Reel probabilities come only from visible strip contents and declared temporary modifiers; no hidden pity, dynamic difficulty, or fabricated near-miss logic is allowed.
- Every real run uses a serializable seeded RNG. Simulation uses a cloned, separately seeded stream and never advances the real run RNG.
- Every spin may use at most one intervention. One spin may expand at most 100 effect events; overflow pays 25× the current bet and terminates the spin.
- The rules engine may not import React, browser globals, storage, audio, vibration, or animation code.
- Core, content, simulation, and Node scripts use relative `.ts` imports so Node 24 can execute the balance runner without resolving the Vite `@` alias; the alias is reserved for bundled app and test imports.
- Use erasable TypeScript syntax only: no enums, namespaces, parameter properties, or other constructs that require code generation.
- The prototype contains exactly 24 upgrade definitions, four opening services, three contract templates, three complete build routes, and one ordered information-tool path.
- A completed engineering plan does not itself satisfy the product Go gate; the self-play and external attribution/replay metrics in the spec must be collected after the prototype is playable.
- Do not add story, monetization, accounts, cloud saves, leaderboards, a fourth build route, or production art.

---

## Planned File Map

```text
package.json                         pinned scripts and dependencies
package-lock.json                    npm lockfile
tsconfig.json                        strict TypeScript settings
vite.config.ts                       React, Vitest, and PWA configuration
playwright.config.ts                 portrait browser projects
index.html                           Vite entry document
public/icons/                        minimal generated PWA icons

src/main.tsx                         React bootstrap
src/app/App.tsx                      top-level screen routing
src/app/GameScreen.tsx               functional A-layout game screen
src/app/useGame.ts                   command dispatch and state ownership
src/app/useEstimate.ts               simulation-worker adapter
src/app/components/Hud.tsx           bankroll, target, shift, and tool data
src/app/components/SlotMachine.tsx   3×3 reel presentation and pull gesture
src/app/components/ActionBar.tsx     intervention and service actions
src/app/components/PartsBar.tsx      five part slots and tool slot
src/app/components/UpgradePicker.tsx upgrade selection and reroll
src/app/components/RunSummary.tsx    win, loss, attribution, and continuation
src/app/styles.css                   portrait layout and reduced-motion rules

src/core/types.ts                    serializable domain types and ID unions
src/core/random.ts                   deterministic RNG
src/core/reels.ts                    strip sampling, windows, and reel movement
src/core/paylines.ts                 five paylines and wild-aware base wins
src/core/events.ts                   structured event union
src/core/commands.ts                 player/system command union
src/core/run.ts                      initial state and state-machine dispatch
src/core/settlement.ts               effect queue and payout attribution
src/core/upgrades.ts                 acquisition, replacement, and level rules
src/core/candidates.ts               seeded synergy/pivot/wildcard selection
src/core/contracts.ts                three contract templates and progress
src/core/progression.ts              shifts, checkout, loss, and after-hours

src/content/base-machine.ts          initial strips and paytable
src/content/upgrades.ts              registry of exactly 24 upgrades
src/content/effects/fruit.ts         fruit-route behavior
src/content/effects/chapel.ts        chapel-route behavior
src/content/effects/violent.ts       violent-route behavior
src/content/effects/neutral.ts       generic reel tools and safety fuse
src/content/services/kitchen.ts      food purchase action
src/content/services/chapel.ts       prayer action
src/content/services/security.ts     deterministic kick action
src/content/services/repair.ts       extra focus, lock, and crack removal

src/sim/types.ts                     estimate request and result protocol
src/sim/statistics.ts                mean, variance, confidence interval
src/sim/monte-carlo.ts               cloned-state spin simulation
src/sim/run-summary.ts               attribution and failure explanation
src/sim/worker.ts                    browser worker entry

src/presentation/queue.ts            skippable event playback scheduler
src/presentation/audio.ts            optional Web Audio cues
src/presentation/haptics.ts          optional vibration adapter
src/persistence/storage.ts           versioned local run snapshot

src/test/setup.ts                    Testing Library matchers
tests/core/                           deterministic rule tests
tests/content/                        all route and upgrade tests
tests/sim/                            RTP and risk estimator tests
tests/app/                            React interaction tests
e2e/                                 Playwright portrait-flow tests

scripts/run-balance.ts               reproducible engineering balance report
artifacts/balance-baseline.json      generated simulation evidence
docs/validation/functional-prototype.md generated verification summary
docs/playtest/scorecard.md           fixed self-play and tester questions
```

---

### Task 1: Project Foundation and Portrait Smoke Screen

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `playwright.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/styles.css`
- Create: `src/test/setup.ts`
- Test: `tests/app/App.test.tsx`

**Interfaces:**
- Produces: `App(): React.JSX.Element` and the `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`, and `npm run verify` commands used by every later task.

- [ ] **Step 1: Create the pinned package and tool configuration**

Use this exact `package.json` dependency surface:

```json
{
  "name": "midnight-lucky-hotel",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "engines": {
    "node": ">=24.13.1",
    "npm": ">=11.8.0"
  },
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "e2e": "playwright test",
    "verify": "npm run typecheck && npm test && npm run build"
  },
  "dependencies": {
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.4",
    "@types/node": "26.2.0",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "@vitejs/plugin-react": "6.0.5",
    "@vitest/coverage-v8": "4.1.10",
    "fast-check": "4.9.0",
    "jsdom": "30.0.1",
    "typescript": "7.0.2",
    "vite": "8.2.1",
    "vite-plugin-pwa": "1.3.0",
    "vitest": "4.1.10"
  }
}
```

Use this `tsconfig.json`; worker files add `/// <reference lib="webworker" />` locally instead of combining DOM and WebWorker globals:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "useDefineForClassFields": true,
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "tests", "e2e", "scripts", "vite.config.ts", "playwright.config.ts"]
}
```

Use this initial `vite.config.ts`; Task 12 adds the PWA plugin:

```ts
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    clearMocks: true
  }
});
```

Configure Playwright with `baseURL: "http://127.0.0.1:4173"`, `webServer.command: "npm run dev -- --port 4173"`, and Chromium viewport `{ width: 390, height: 844 }`. Run `npm install` and `npx playwright install chromium` to generate the lockfile and browser runtime.

- [ ] **Step 2: Write the failing portrait-shell test**

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "@/app/App";

it("renders the functional prototype shell", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "午夜好运酒店" })).toBeVisible();
  expect(screen.getByText("功能原型")).toBeVisible();
});
```

- [ ] **Step 3: Run the smoke test and confirm the red state**

Run: `npm test -- tests/app/App.test.tsx`
Expected: FAIL because `@/app/App` does not exist.

- [ ] **Step 4: Implement the smallest portrait shell**

```tsx
export function App() {
  return (
    <main className="app-shell">
      <p className="eyebrow">功能原型</p>
      <h1>午夜好运酒店</h1>
    </main>
  );
}
```

Bootstrap it from `src/main.tsx` and add a dark, centered 390-pixel portrait container with a 44-pixel minimum button height in `src/app/styles.css`.

- [ ] **Step 5: Verify the foundation**

Run: `npm run verify`
Expected: typecheck PASS, one Vitest PASS, production build PASS.

- [ ] **Step 6: Commit the foundation**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts playwright.config.ts index.html src tests/app/App.test.tsx
git commit -m "chore: scaffold mobile slot prototype"
```

---

### Task 2: Deterministic Reel and Payline Kernel

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/random.ts`
- Create: `src/core/reels.ts`
- Create: `src/core/paylines.ts`
- Create: `src/content/base-machine.ts`
- Test: `tests/core/random.test.ts`
- Test: `tests/core/reels.test.ts`
- Test: `tests/core/paylines.test.ts`

**Interfaces:**
- Produces: `nextInt(rng: RngState, maxExclusive: number): RandomIntResult`.
- Produces: `drawReels(strips: ReelSet, rng: RngState): ReelDraw` and `advanceReel(draw: ReelDraw, reelIndex: ReelIndex, steps: number): ReelDraw`.
- Produces: `evaluateBaseWins(grid: Grid, paytable: Paytable): readonly LineWin[]`.
- Produces: `BASE_REELS` and `BASE_PAYTABLE`.

- [ ] **Step 1: Define the serializable reel types**

```ts
export type BaseSymbolId = "cherry" | "lemon" | "bell" | "seven";
export type SymbolId = BaseSymbolId | "wild" | "blank" | "food" | "crack";
export type ReelIndex = 0 | 1 | 2;
export type RowIndex = 0 | 1 | 2;
export type ReelWindow = readonly [SymbolId, SymbolId, SymbolId];
export type Grid = readonly [ReelWindow, ReelWindow, ReelWindow];
export type ReelStrip = readonly SymbolId[];
export type ReelSet = readonly [ReelStrip, ReelStrip, ReelStrip];
export type StopSet = readonly [number, number, number];
export type PaySymbolId = BaseSymbolId | "wild";
export type Paytable = Readonly<Record<PaySymbolId, number>>;
export interface LineWin {
  readonly lineId: "top" | "middle" | "bottom" | "diagonal-down" | "diagonal-up";
  readonly symbol: PaySymbolId;
  readonly cells: readonly [
    readonly [ReelIndex, RowIndex],
    readonly [ReelIndex, RowIndex],
    readonly [ReelIndex, RowIndex]
  ];
  readonly multiplier: number;
}
export interface RngState { readonly value: number }
export interface RandomIntResult { readonly value: number; readonly rng: RngState }
export interface ReelDraw {
  readonly stops: StopSet;
  readonly grid: Grid;
  readonly rng: RngState;
}
```

- [ ] **Step 2: Write deterministic RNG and wrapping-window tests**

Test that seed `123456789` produces the same ten integers twice, distinct seeds diverge, `nextInt` rejects non-positive bounds, and a stop at the last strip index wraps the next two visible cells to indices zero and one.

```ts
const first = Array.from({ length: 10 }, () => 0);
let left = { value: 123456789 };
let right = { value: 123456789 };
for (let index = 0; index < first.length; index += 1) {
  const a = nextInt(left, 97);
  const b = nextInt(right, 97);
  expect(a.value).toBe(b.value);
  left = a.rng;
  right = b.rng;
}
```

- [ ] **Step 3: Run the kernel tests and confirm missing exports**

Run: `npm test -- tests/core/random.test.ts tests/core/reels.test.ts`
Expected: FAIL because the kernel modules do not exist.

- [ ] **Step 4: Implement RNG, sampling, and deterministic advance**

Use an unsigned 32-bit Mulberry32 state transition. `drawReels` consumes exactly three random integers. `advanceReel` changes one stop modulo that reel length and consumes no RNG.

```ts
export function nextInt(rng: RngState, maxExclusive: number): RandomIntResult {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError("maxExclusive must be a positive integer");
  }
  const nextState = (rng.value + 0x6d2b79f5) >>> 0;
  let mixed = nextState;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const unit = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  return { value: Math.floor(unit * maxExclusive), rng: { value: nextState } };
}
```

- [ ] **Step 5: Write wild-aware five-payline tests**

Cover three identical symbols, two symbols plus wild, three wilds paying the wild award, mixed non-winning symbols, all five fixed line coordinates, and no substitution of wild for food or crack.

Define a local `gridWith(left, middle, right): Grid` helper that places the three arguments on the middle line and fills every other cell with blank.

```ts
expect(evaluateBaseWins(gridWith("lemon", "wild", "lemon"), BASE_PAYTABLE))
  .toContainEqual(expect.objectContaining({ symbol: "lemon", multiplier: 1.2 }));
```

- [ ] **Step 6: Implement paylines and the exact base content**

Use identical symbol counts but these ordered strips:

```ts
export const BASE_REELS: ReelSet = [
  ["cherry", "lemon", "cherry", "bell", "blank", "lemon", "cherry", "seven", "lemon", "bell", "cherry", "wild"],
  ["lemon", "cherry", "bell", "cherry", "wild", "lemon", "blank", "cherry", "seven", "lemon", "cherry", "bell"],
  ["bell", "cherry", "lemon", "blank", "cherry", "seven", "lemon", "cherry", "wild", "bell", "lemon", "cherry"]
];
export const BASE_PAYTABLE = {
  cherry: 0.8,
  lemon: 1.2,
  bell: 2,
  seven: 5,
  wild: 8
} as const;
```

- [ ] **Step 7: Verify and commit the deterministic kernel**

Run: `npm test -- tests/core/random.test.ts tests/core/reels.test.ts tests/core/paylines.test.ts`
Expected: all kernel tests PASS.

```bash
git add src/core src/content/base-machine.ts tests/core
git commit -m "feat: add deterministic reel kernel"
```

---

### Task 3: Run State Machine, Betting, Spin, and Base Intervention

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/events.ts`
- Create: `src/core/commands.ts`
- Create: `src/core/run.ts`
- Create: `src/core/progression.ts`
- Test: `tests/core/run.test.ts`
- Test: `tests/core/progression.test.ts`

**Interfaces:**
- Consumes: `drawReels`, `advanceReel`, `evaluateBaseWins`, `BASE_REELS`, `BASE_PAYTABLE`.
- Produces: `createRun(seed: number): RunState`.
- Produces: `dispatchCommand(state: RunState, command: GameCommand): DispatchResult`.
- Produces: `getCurrentBet(state: RunState): number`.

- [ ] **Step 1: Define commands, phases, state, and result contracts**

```ts
export type RunPhase =
  | "CHOOSING_SERVICE"
  | "READY_TO_SPIN"
  | "SPINNING"
  | "AWAITING_INTERVENTION"
  | "RESOLVING_EFFECTS"
  | "CHOOSING_UPGRADE"
  | "SHIFT_COMPLETE"
  | "RUN_WON"
  | "RUN_LOST"
  | "AFTER_HOURS";

export type BetMode = "conservative" | "normal" | "aggressive";
export type Money = number;
export type ServiceId = "repair" | "kitchen" | "chapel" | "security";
export type AttributionSource =
  | "base"
  | "part"
  | "intervention"
  | "service"
  | "agitation"
  | "overload";
export type CommandErrorCode =
  | "INVALID_PHASE"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_TARGET"
  | "RESOURCE_EXHAUSTED";
export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
}
export type GameCommand =
  | { readonly type: "SELECT_SERVICE"; readonly serviceId: ServiceId }
  | { readonly type: "SET_BET_MODE"; readonly mode: BetMode }
  | { readonly type: "SPIN" }
  | { readonly type: "REELS_STOPPED" }
  | { readonly type: "RESPIN_REEL"; readonly reelIndex: ReelIndex }
  | { readonly type: "ACCEPT_OUTCOME" }
  | { readonly type: "PRESENTATION_COMPLETE" }
  | { readonly type: "CASH_OUT" }
  | { readonly type: "CONTINUE" };

export type DispatchResult =
  | { readonly ok: true; readonly state: RunState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly state: RunState; readonly error: CommandError };
```

Define `GameEvent` as this discriminated union and extend it only by adding new variants:

```ts
export type GameEvent =
  | { readonly sequence: number; readonly type: "BET_PLACED"; readonly amount: number }
  | { readonly sequence: number; readonly type: "REELS_DRAWN"; readonly draw: ReelDraw }
  | { readonly sequence: number; readonly type: "INTERVENTION_USED"; readonly kind: "respin" | "repair-lock" | "kick" | "prayer"; readonly target: ReelIndex | BaseSymbolId }
  | { readonly sequence: number; readonly type: "LINE_WIN"; readonly lineId: string; readonly symbol: SymbolId; readonly amount: number; readonly source: AttributionSource }
  | { readonly sequence: number; readonly type: "PART_TRIGGERED"; readonly partId: PartId; readonly level: 1 | 2 }
  | { readonly sequence: number; readonly type: "SYMBOL_CHANGED"; readonly reel: ReelIndex; readonly row: RowIndex; readonly from: SymbolId; readonly to: SymbolId }
  | { readonly sequence: number; readonly type: "RESOURCE_CHANGED"; readonly resource: "tips" | "focus" | "omen" | "agitation" | "freeSpins"; readonly delta: number }
  | { readonly sequence: number; readonly type: "SERVICE_USED"; readonly serviceId: ServiceId; readonly cost: number }
  | { readonly sequence: number; readonly type: "CONTRACT_PROGRESS"; readonly contractId: ContractId; readonly progress: number; readonly completed: boolean }
  | { readonly sequence: number; readonly type: "OVERLOAD"; readonly amount: number }
  | { readonly sequence: number; readonly type: "PAYOUT_COMPLETE"; readonly total: number }
  | { readonly sequence: number; readonly type: "SHIFT_CHANGED"; readonly shift: number }
  | { readonly sequence: number; readonly type: "RUN_ENDED"; readonly outcome: "won" | "lost" | "cashed-out" };
```

Use these exact ID unions:

```ts
export type PartId =
  | "lemon-infection" | "jam-jar" | "fruit-salad" | "leftovers"
  | "omen-collector" | "triple-blessing" | "midnight-bell" | "martyr-coin"
  | "scrap-magnet" | "loose-spring" | "blank-capacitor"
  | "warranty-fraud" | "overload-motor" | "safety-fuse";
export type UpgradeId =
  | "lemon-crate" | "cherry-pitter" | "lemon-infection" | "jam-jar" | "fruit-salad" | "leftovers"
  | "seven-purification" | "tithe-box" | "omen-collector" | "triple-blessing" | "midnight-bell" | "martyr-coin"
  | "artificial-crack" | "scrap-magnet" | "loose-spring" | "blank-capacitor" | "warranty-fraud" | "overload-motor"
  | "pruning-shears" | "carbon-copy" | "safety-fuse"
  | "calculator" | "ledger" | "statistics-terminal";
export type ContractId = "combination" | "discipline" | "rescue";
export type CounterId = "blankCharge" | "cherryWinsThisShift";
export type ExpenseSource = "wagers" | "kitchen" | "chapel" | "repair";
export interface CandidateSet {
  readonly synergy: UpgradeId;
  readonly pivot: UpgradeId;
  readonly wildcard: UpgradeId;
}
export interface PartInstance {
  readonly id: PartId;
  readonly level: 1 | 2;
}
export interface TimedBuff {
  readonly id: "food";
  readonly spinsRemaining: number;
  readonly additivePayout: number;
}
export interface ContractState {
  readonly id: ContractId;
  readonly targetSymbol?: BaseSymbolId;
  readonly target: number;
  readonly progress: number;
  readonly completed: boolean;
  readonly rewardClaimed: boolean;
  readonly startBankroll: Money;
  readonly interventionsUsed: number;
}
export interface ShiftFlags {
  readonly foodBought: boolean;
  readonly prayerUsed: boolean;
  readonly kickUsed: boolean;
  readonly repairLockUsed: boolean;
  readonly martyrEnabled: boolean;
  readonly warrantyPaid: boolean;
  readonly returnedFoodCount: number;
}
export interface ShiftSnapshot {
  readonly shift: number;
  readonly bankroll: Money;
  readonly reels: ReelSet;
  readonly parts: readonly PartInstance[];
  readonly totalWager: Money;
  readonly totalPayout: Money;
}
```

Use this state shape; fixed-length part slots are normalized on load:

```ts
export interface RunState {
  readonly schemaVersion: 1;
  readonly initialSeed: number;
  readonly rng: RngState;
  readonly phase: RunPhase;
  readonly bankroll: Money;
  readonly checkoutTarget: 200;
  readonly shift: number;
  readonly baseSpinsInShift: number;
  readonly shiftWager: Money;
  readonly shiftPayout: Money;
  readonly baseBet: Money;
  readonly betMode: BetMode;
  readonly interventionPoints: number;
  readonly maxInterventionPoints: number;
  readonly nextShiftFocusBonus: number;
  readonly interventionUsedThisSpin: boolean;
  readonly reels: ReelSet;
  readonly temporaryReelAdditions: ReelSet;
  readonly pendingSpin: { readonly draw: ReelDraw; readonly isFree: boolean } | null;
  readonly freeSpinQueue: number;
  readonly service: ServiceId | null;
  readonly serviceCandidates: readonly [ServiceId, ServiceId, ServiceId];
  readonly tips: number;
  readonly agitation: number;
  readonly omen: number;
  readonly counters: Readonly<Record<CounterId, number>>;
  readonly shiftFlags: ShiftFlags;
  readonly partSlots: readonly [
    PartInstance | null,
    PartInstance | null,
    PartInstance | null,
    PartInstance | null,
    PartInstance | null
  ];
  readonly toolLevel: 0 | 1 | 2 | 3;
  readonly buffs: readonly TimedBuff[];
  readonly contract: ContractState | null;
  readonly afterHoursLevel: number;
  readonly exitUnlocked: boolean;
  readonly currentCandidates: CandidateSet | null;
  readonly acquiredUpgrades: readonly UpgradeId[];
  readonly pendingEvents: readonly GameEvent[];
  readonly attribution: Readonly<Record<AttributionSource, number>>;
  readonly expenses: Readonly<Record<ExpenseSource, Money>>;
  readonly shiftHistory: readonly ShiftSnapshot[];
  readonly commandHistory: readonly GameCommand[];
}
```

Until Task 5 generates choices, `currentCandidates` remains `null`.

- [ ] **Step 2: Write state-transition failures first**

Cover these exact transitions:

```text
createRun -> CHOOSING_SERVICE with three unique seeded service candidates
SELECT_SERVICE -> READY_TO_SPIN
SPIN -> SPINNING and bankroll minus current bet
REELS_STOPPED -> AWAITING_INTERVENTION
RESPIN_REEL -> SPINNING, only one stop changes, one point spent
ACCEPT_OUTCOME -> RESOLVING_EFFECTS with final payout already committed
PRESENTATION_COMPLETE -> READY_TO_SPIN or shift boundary
```

Also assert that `SPIN` during `RESOLVING_EFFECTS` returns `INVALID_PHASE` and leaves state deeply equal to the input.

- [ ] **Step 3: Run the state tests and confirm the red state**

Run: `npm test -- tests/core/run.test.ts tests/core/progression.test.ts`
Expected: FAIL because `createRun` and `dispatchCommand` are missing.

- [ ] **Step 4: Implement initial state and legal command dispatch**

Use exact economics:

```ts
export const BET_MULTIPLIER = {
  conservative: 0.5,
  normal: 1,
  aggressive: 2
} as const;

export function getCurrentBet(state: RunState): number {
  const afterHoursScale = 1.25 ** state.afterHoursLevel;
  return roundMoney(state.baseBet * BET_MULTIPLIER[state.betMode] * afterHoursScale);
}

export function roundMoney(value: number): Money {
  if (!Number.isFinite(value)) throw new RangeError("money must be finite");
  return Math.round(value * 100) / 100;
}
```

Freeze or clone every returned state so no command mutates its input. `SPIN` consumes the bet and three RNG draws unless `freeSpinQueue` is positive; a free spin consumes one queued free spin, consumes no bankroll, and marks the pending spin `isFree`. `RESPIN_REEL` consumes one RNG draw for the selected reel only and rejects a second intervention in the same spin.

- [ ] **Step 5: Implement base payout, shift boundaries, and loss checks**

`ACCEPT_OUTCOME` evaluates base lines, multiplies each award by the current bet, commits payout, and creates attributed events. `PRESENTATION_COMPLETE` increments `baseSpinsInShift` only for a paid spin; free spins are additional spins and do not replace the three base spins. After base spin three it enters `CHOOSING_UPGRADE` for shifts one through four and enters `SHIFT_COMPLETE` after shift five. If bankroll is below the minimum conservative bet and no free spin exists, enter `RUN_LOST`.

- [ ] **Step 6: Verify deterministic state and commit**

Run: `npm test -- tests/core/run.test.ts tests/core/progression.test.ts tests/core/random.test.ts`
Expected: all tests PASS with no state mutation.

```bash
git add src/core tests/core
git commit -m "feat: add slot run state machine"
```

---

### Task 4: Effect Queue, Food, Crack, Agitation, and Overload

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/events.ts`
- Modify: `src/core/run.ts`
- Create: `src/core/settlement.ts`
- Test: `tests/core/settlement.test.ts`
- Test: `tests/core/effect-properties.test.ts`

**Interfaces:**
- Consumes: a pending `ReelDraw` and equipped `PartInstance[]`.
- Produces: `resolveSpin(state: RunState, draw: ReelDraw): SettlementResult`.
- Produces: `SettlementResult = { state, events, payout, attribution }`.

```ts
export type ResolveSignal =
  | { readonly type: "GRID_ACCEPTED" }
  | { readonly type: "LINE_AWARDED"; readonly win: LineWin }
  | { readonly type: "EFFECT_APPLIED"; readonly effect: Effect }
  | { readonly type: "PART_DISABLED"; readonly partId: PartId }
  | { readonly type: "FOOD_CONSUMED"; readonly reel: ReelIndex };
export interface ResolveContext {
  readonly state: RunState;
  readonly grid: Grid;
  readonly currentBet: number;
  readonly queue: readonly Effect[];
  readonly triggeredKeys: ReadonlySet<string>;
  readonly awardedWinKeys: ReadonlySet<string>;
  readonly eventCount: number;
}
export interface SettlementResult {
  readonly state: RunState;
  readonly events: readonly GameEvent[];
  readonly payout: number;
  readonly attribution: Readonly<Record<AttributionSource, number>>;
  readonly effectCount: number;
}
```

- [ ] **Step 1: Define the finite effect vocabulary**

```ts
export type Effect =
  | { readonly type: "ADD_PAYOUT"; readonly amount: number; readonly source: AttributionSource }
  | { readonly type: "TRANSFORM_CELL"; readonly reel: ReelIndex; readonly row: RowIndex; readonly symbol: SymbolId }
  | { readonly type: "ADD_TO_REEL"; readonly reel: ReelIndex; readonly symbol: SymbolId; readonly count: number }
  | { readonly type: "REMOVE_FROM_REEL"; readonly reel: ReelIndex; readonly symbol: SymbolId; readonly count: number }
  | { readonly type: "DISABLE_PART"; readonly slot: number }
  | { readonly type: "GRANT_FREE_SPIN"; readonly count: number }
  | { readonly type: "REEVALUATE_LINES" }
  | { readonly type: "INCREMENT_COUNTER"; readonly counter: CounterId; readonly amount: number };
```

`resolveSpin` keeps a FIFO queue, a set of already-awarded win keys, an event count, and a mutable working copy that is converted back to immutable `RunState` only at the boundary.

- [ ] **Step 2: Write special-symbol and attribution tests**

Assert that:

- one visible food is removed from its source reel and adds a three-spin +25% additive buff;
- two food buffs produce +50%, not +56.25%;
- visible cracks disable rightmost parts for that spin only;
- wild never substitutes for food or crack;
- a dead spin increments agitation to a maximum of five;
- the next paying spin adds `agitation × 0.5 × bet` and clears agitation;
- base, part, intervention, service, agitation, and overload payouts use distinct attribution sources.

- [ ] **Step 3: Run settlement tests and confirm missing behavior**

Run: `npm test -- tests/core/settlement.test.ts`
Expected: FAIL because `resolveSpin` is missing.

- [ ] **Step 4: Implement special-symbol preprocessing and finite resolution**

Process crack disables before part triggers. Process food consumption after the final visible board is accepted. Apply existing timed buffs to every payout and decrement buff duration once per completed spin.

At effect 100, discard all queued recursive effects, enqueue exactly one overload event worth `25 × currentBet`, and finish without calling part reactions again.

- [ ] **Step 5: Add property tests for termination and finite money**

Define `resolveSyntheticSpin(seed, symbols)` inside the test: map integers modulo eight to the eight `SymbolId` values, build three strips of at least six symbols, create a normal-bet run, draw once, and call `resolveSpin`.

```ts
fc.assert(
  fc.property(fc.integer(), fc.array(fc.integer({ min: 0, max: 7 }), { maxLength: 60 }), (seed, symbols) => {
    const result = resolveSyntheticSpin(seed, symbols);
    expect(result.effectCount).toBeLessThanOrEqual(101);
    expect(Number.isSafeInteger(result.state.bankroll * 100)).toBe(true);
    expect(Number.isFinite(result.payout)).toBe(true);
  })
);
```

- [ ] **Step 6: Verify and commit the settlement kernel**

Run: `npm test -- tests/core/settlement.test.ts tests/core/effect-properties.test.ts`
Expected: all tests PASS, including a deliberately cyclic handler terminating through overload.

```bash
git add src/core tests/core
git commit -m "feat: add finite effect settlement"
```

---

### Task 5: Upgrade Registry, Slots, Tools, and Seeded Candidate Selection

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/commands.ts`
- Modify: `src/core/run.ts`
- Create: `src/core/upgrades.ts`
- Create: `src/core/candidates.ts`
- Create: `src/content/upgrades.ts`
- Create: `src/content/effects/neutral.ts`
- Test: `tests/content/upgrades.test.ts`
- Test: `tests/core/candidates.test.ts`

**Interfaces:**
- Produces: `UPGRADES: Readonly<Record<UpgradeId, UpgradeDefinition>>` with exactly 24 keys.
- Produces: `generateCandidates(state: RunState): CandidateResult`.
- Produces: `applyUpgrade(state: RunState, choice: UpgradeChoice): DispatchResult`.

- [ ] **Step 1: Define all IDs and candidate roles**

```ts
export type CandidateRole = "synergy" | "pivot" | "wildcard";
export type UpgradeKind = "reel-mod" | "part" | "tool";
export interface CandidateResult {
  readonly candidates: CandidateSet;
  readonly rng: RngState;
}
export interface UpgradeDefinition {
  readonly id: UpgradeId;
  readonly name: string;
  readonly kind: UpgradeKind;
  readonly route: "fruit" | "chapel" | "violent" | "neutral" | "information";
  readonly tags: readonly string[];
  readonly candidateRoles: readonly CandidateRole[];
  readonly requires: (state: RunState) => boolean;
}
```

Use the 24 IDs from design section 7.4: 18 route choices, `pruning-shears`, `carbon-copy`, `safety-fuse`, `calculator`, `ledger`, and `statistics-terminal`.

- [ ] **Step 2: Write registry and prerequisite tests**

Assert exactly 24 unique keys and names. Assert that leftovers require kitchen; omen-dependent parts require chapel; crack-only parts require security or an existing crack source; ledger requires calculator; terminal requires ledger; paid tithe does not appear below 10 bankroll.

- [ ] **Step 3: Write seeded candidate tests**

For a fixed state and RNG, assert an identical set and updated RNG. Assert three unique choices, one in each role, no unusable choice, and at least one current-route synergy when one is legal.

Determine the dominant route by counting equipped parts and permanent reel modifications; ties use the opening service mapping kitchen→fruit, chapel→chapel, security→violent, and repair→neutral. Choose the synergy first from eligible definitions tagged for `synergy` and matching the dominant route or an acquired tag, then pivot from eligible `pivot` definitions outside that route, then wildcard from eligible `wildcard` definitions. Each selection consumes one RNG draw, excludes prior choices, and falls back to any eligible definition carrying that role.

- [ ] **Step 4: Run candidate tests and confirm the red state**

Run: `npm test -- tests/content/upgrades.test.ts tests/core/candidates.test.ts`
Expected: FAIL because the registry and generator do not exist.

- [ ] **Step 5: Implement structural acquisition**

Implement immediate reel modifications, a five-slot part inventory, one information-tool level, part replacement, decline-for-one-tip, and maximum part level two. A selected level-two part is removed from future candidates. Information tools advance only in order.

```ts
export type UpgradeChoice =
  | { readonly id: UpgradeId; readonly action: "apply"; readonly target?: UpgradeTarget }
  | { readonly id: UpgradeId; readonly action: "replace"; readonly replaceSlot: number }
  | { readonly id: UpgradeId; readonly action: "decline" };
export type UpgradeTarget =
  | { readonly kind: "reel"; readonly reel: ReelIndex }
  | { readonly kind: "two-reels"; readonly reels: readonly [ReelIndex, ReelIndex] }
  | { readonly kind: "symbol-on-reel"; readonly reel: ReelIndex; readonly symbol: Exclude<SymbolId, "wild"> };
```

- [ ] **Step 6: Implement neutral effects**

`pruning-shears` refuses to reduce a reel below six symbols and cannot remove wild. `carbon-copy` adds two copies of one base symbol and cannot copy special symbols. `safety-fuse` consumes itself once at bankroll below the minimum bet and pays 20 at level one or 40 at level two.

- [ ] **Step 7: Verify and commit the construction skeleton**

Run: `npm test -- tests/content/upgrades.test.ts tests/core/candidates.test.ts`
Expected: all registry, prerequisite, slot, duplicate, replacement, and tool-order tests PASS.

```bash
git add src/core src/content tests/content tests/core/candidates.test.ts
git commit -m "feat: add seeded construction choices"
```

---

### Task 6: Fruit Route and Midnight Kitchen

**Files:**
- Create: `src/content/effects/fruit.ts`
- Create: `src/content/services/kitchen.ts`
- Modify: `src/core/commands.ts`
- Modify: `src/core/settlement.ts`
- Modify: `src/core/run.ts`
- Test: `tests/content/fruit.test.ts`
- Test: `tests/content/kitchen.test.ts`

**Interfaces:**
- Produces: `reactFruitParts(context: ResolveContext, signal: ResolveSignal): readonly Effect[]`.
- Produces: `buyFood(state: RunState, reel: ReelIndex): DispatchResult`.
- Adds `{ type: "BUY_FOOD"; reelIndex: ReelIndex }` to `GameCommand`.

- [ ] **Step 1: Write six table-driven fruit tests**

Cover these exact level-one and level-two outcomes:

```text
lemon-crate: add two lemons to two selected reels per acquisition
cherry-pitter: replace one eligible symbol with one cherry
lemon-infection: after the first lemon line, scan top-to-bottom and left-to-right and transform the first ordinary symbol outside that line, or the first two at level two, once per spin
jam-jar: future cherry lines gain 0.5×, or 1.0× at level two, per earlier cherry line in the shift
fruit-salad: literal cherry+lemon+bell pays 1.5×, or 2.5× at level two; wild does not substitute
leftovers: reinsert the first one, or first two at level two, consumed foods into the shortest reel
```

Test deterministic ties for the shortest reel by choosing the lowest reel index.

- [ ] **Step 2: Run fruit tests and confirm route behavior is absent**

Run: `npm test -- tests/content/fruit.test.ts`
Expected: FAIL because fruit handlers are not registered.

- [ ] **Step 3: Implement fruit effects with per-spin trigger guards**

Use `triggeredKeys` such as `lemon-infection:spin-8` to prevent self-recursion. Re-evaluation may award only newly created win keys. `fruit-salad` is an alternate line rule and does not also pay a normal same-symbol award for the same cells.

- [ ] **Step 4: Write and implement kitchen service tests**

`BUY_FOOD` is legal only during `READY_TO_SPIN` before the first spin of a shift, once per shift, with kitchen equipped and at least 10 bankroll. It subtracts 10 and inserts one food into the selected reel. Food consumption follows Task 4.

- [ ] **Step 5: Verify the complete fruit route**

Run: `npm test -- tests/content/fruit.test.ts tests/content/kitchen.test.ts tests/core/settlement.test.ts`
Expected: all fruit, food, re-evaluation, and attribution tests PASS.

- [ ] **Step 6: Commit the fruit route**

```bash
git add src/content/effects/fruit.ts src/content/services/kitchen.ts src/core tests/content
git commit -m "feat: add fruit buffet build"
```

---

### Task 7: Chapel Route, Prayer, and Omen

**Files:**
- Create: `src/content/effects/chapel.ts`
- Create: `src/content/services/chapel.ts`
- Modify: `src/core/commands.ts`
- Modify: `src/core/settlement.ts`
- Modify: `src/core/run.ts`
- Test: `tests/content/chapel.test.ts`

**Interfaces:**
- Produces: `pray(state: RunState, symbol: BaseSymbolId): DispatchResult`.
- Produces: `reactChapelParts(context: ResolveContext, signal: ResolveSignal): readonly Effect[]`.
- Adds `{ type: "PRAY"; symbol: BaseSymbolId }` and `{ type: "ENABLE_MARTYR" }` to `GameCommand`.

- [ ] **Step 1: Write prayer lifecycle tests**

Assert once per shift, one intervention point cost, two temporary copies of the chosen base symbol on every reel, removal after the spin, one omen when no winning line contains that symbol, and no omen on success. Prayer sets `interventionUsedThisSpin` before the draw, so post-stop re-spin and kick are rejected for that spin.

- [ ] **Step 2: Write all chapel-item tests**

```text
seven-purification: replace one cherry or lemon with one seven
tithe-box: pay 10, add one seven, add one omen, unavailable below 10
omen-collector: seven win consumes all omen for 0.5× per layer, or 1.0× at level two
triple-blessing: repeat first seven line once and add one blank per reel; level two repeats twice and adds two blanks
midnight-bell: transform the leftmost one, or two at level two, bells on the first bell line
martyr-coin: optional 10% bankroll payment at shift start makes seven awards 2×, or 3× at level two
```

- [ ] **Step 3: Run chapel tests and confirm the red state**

Run: `npm test -- tests/content/chapel.test.ts`
Expected: FAIL because chapel commands and reactions are missing.

- [ ] **Step 4: Implement temporary strip modifiers and omen settlement**

Store temporary additions separately from permanent strips, merge them only for the next draw, and remove them immediately after the accepted board. Round the martyr payment up to the nearest integer and record it as a service expense.

- [ ] **Step 5: Verify and commit the chapel route**

Run: `npm test -- tests/content/chapel.test.ts tests/core/run.test.ts tests/core/settlement.test.ts`
Expected: all prayer, omen, blank drawback, and level-two tests PASS.

```bash
git add src/content/effects/chapel.ts src/content/services/chapel.ts src/core tests/content/chapel.test.ts
git commit -m "feat: add midnight chapel build"
```

---

### Task 8: Violent Repair Route and Deterministic Kick

**Files:**
- Create: `src/content/effects/violent.ts`
- Create: `src/content/services/security.ts`
- Modify: `src/core/commands.ts`
- Modify: `src/core/settlement.ts`
- Modify: `src/core/run.ts`
- Test: `tests/content/violent.test.ts`
- Test: `tests/content/security.test.ts`

**Interfaces:**
- Produces: `previewKick(state: RunState, reel: ReelIndex): ReelWindow`.
- Produces: `kickReel(state: RunState, reel: ReelIndex): DispatchResult`.
- Produces: `reactViolentParts(context: ResolveContext, signal: ResolveSignal): readonly Effect[]`.
- Adds `{ type: "KICK_REEL"; reelIndex: ReelIndex }` to `GameCommand`.

- [ ] **Step 1: Write deterministic kick tests**

Assert that preview and execution show the same next window, kick consumes no RNG and no normal intervention point, one kick is allowed per shift, the default step is one, one crack is added after movement, and kick is rejected without security equipped. Kick sets `interventionUsedThisSpin`, preventing a second intervention on the same board.

- [ ] **Step 2: Write all violent-item tests**

```text
artificial-crack: add one crack; the next shift starts with one extra focus and a cap increased by one
scrap-magnet: three cracks pay 2× and are removed; level two pays 4×
loose-spring: kick moves two and adds two cracks; level two moves three and adds two
blank-capacitor: three visible blanks cumulatively grant a free spin; level two needs two
warranty-fraud: first crack-disabled part per shift pays 3×; level two pays 6×
overload-motor: events after the first add 0.25× each; level two adds 0.5×; event six adds one crack to every reel
```

- [ ] **Step 3: Run violent tests and confirm the red state**

Run: `npm test -- tests/content/violent.test.ts tests/content/security.test.ts`
Expected: FAIL because kick and violent reactions are missing.

- [ ] **Step 4: Implement preview, kick, cracks, and free-spin accounting**

A free spin consumes no bankroll, keeps the selected bet mode, and does not advance `baseSpinsInShift`. Multiple granted free spins form an integer queue and each still requires a player pull, so a free-spin chain cannot lock the UI in an automatic loop. Crack lines are valid only when all three cells are literal cracks; wild does not substitute.

- [ ] **Step 5: Verify and commit the violent route**

Run: `npm test -- tests/content/violent.test.ts tests/content/security.test.ts tests/core/effect-properties.test.ts`
Expected: deterministic preview, no RNG consumption, crack removal, free spins, and bounded overload PASS.

```bash
git add src/content/effects/violent.ts src/content/services/security.ts src/core tests/content
git commit -m "feat: add violent repair build"
```

---

### Task 9: Repair Service, Contracts, Tips, Checkout, and After-Hours

**Files:**
- Create: `src/content/services/repair.ts`
- Create: `src/core/contracts.ts`
- Modify: `src/core/commands.ts`
- Modify: `src/core/run.ts`
- Modify: `src/core/progression.ts`
- Test: `tests/content/repair.test.ts`
- Test: `tests/core/contracts.test.ts`
- Test: `tests/core/full-run.test.ts`

**Interfaces:**
- Produces: `generateContract(state: RunState): ContractResult`.
- Produces: `updateContract(contract: ContractState, events: readonly GameEvent[]): ContractState`.
- Produces commands `LOCK_AND_RESPIN_OTHERS`, `REMOVE_CRACKS`, `REROLL_CANDIDATES`, `CHOOSE_UPGRADE`, `DECLINE_UPGRADE`, `CASH_OUT`, and `CONTINUE`.

Use payloads `{ type: "LOCK_AND_RESPIN_OTHERS"; lockedReelIndex: ReelIndex }`, `{ type: "REMOVE_CRACKS"; reelIndex: ReelIndex }`, `{ type: "REROLL_CANDIDATES" }`, `{ type: "CHOOSE_UPGRADE"; choice: UpgradeChoice }`, `{ type: "DECLINE_UPGRADE" }`, `{ type: "CASH_OUT" }`, and `{ type: "CONTINUE" }`.

`ContractResult` is `{ contract: ContractState; rng: RngState }`. Every generated contract consumes exactly one RNG draw, including a deterministic fallback contract.

- [ ] **Step 1: Write repair-service tests**

With repair equipped, each shift starts with three intervention points. Once per shift, one point locks a selected reel and resamples the other two. At shift end, one tip removes up to two selected cracks from one reel. All actions reject invalid phases and insufficient resources without changing state.

- [ ] **Step 2: Write the three contract-template tests**

```ts
expect(CONTRACT_TEMPLATES.map((template) => template.id)).toEqual([
  "combination",
  "discipline",
  "rescue"
]);
```

Combination chooses a base symbol present on all three reels and a reachable count. Discipline succeeds only with no intervention and ending bankroll at least shift-start bankroll. Rescue succeeds only when one intervention changes a non-winning accepted board into a paying board. A completed contract grants exactly one tip once.

- [ ] **Step 3: Write full-run boundary tests**

Cover normal-run upgrade offers after shifts one through four only, early exit unlock at 200, continuing with the risk of later loss, forced loss below 200 after shift five, cash-out victory, no fifth normal upgrade, cash-out at any after-hours block boundary, and after-hours bet scaling by `1.25 ** afterHoursLevel` every three base spins.

- [ ] **Step 4: Run service and progression tests**

Run: `npm test -- tests/content/repair.test.ts tests/core/contracts.test.ts tests/core/full-run.test.ts`
Expected: FAIL because repair, contracts, and final progression commands are incomplete.

- [ ] **Step 5: Implement contracts and tips**

Generate only contracts that can be completed from the current state. One tip rerolls the complete three-choice candidate set using the next RNG state. Tips never convert to bankroll. Record contract progress from committed `GameEvent` values, not from UI callbacks.

- [ ] **Step 6: Implement checkout and after-hours**

At every completed normal or after-hours block, append a `ShiftSnapshot` and reset shift-local wager/payout totals. When starting the next block, add `nextShiftFocusBonus` to both focus and its cap, then clear the bonus. Entering after-hours sets phase `AFTER_HOURS`, resets shift-local resources every three base spins, continues offering upgrades every completed after-hours block, and increments `afterHoursLevel` before calculating the next block bet.

- [ ] **Step 7: Verify and commit the complete rule loop**

Run: `npm test -- tests/content/repair.test.ts tests/core/contracts.test.ts tests/core/full-run.test.ts`
Expected: all service, contract, tip, five-shift, cash-out, loss, and after-hours tests PASS.

```bash
git add src/content/services/repair.ts src/core tests/content/repair.test.ts tests/core
git commit -m "feat: complete run progression loop"
```

---

### Task 10: Accountant Monte Carlo and Risk Estimates

**Files:**
- Create: `src/sim/types.ts`
- Create: `src/sim/statistics.ts`
- Create: `src/sim/monte-carlo.ts`
- Create: `src/sim/run-summary.ts`
- Create: `src/sim/worker.ts`
- Test: `tests/sim/statistics.test.ts`
- Test: `tests/sim/monte-carlo.test.ts`
- Test: `tests/sim/run-summary.test.ts`

**Interfaces:**
- Produces: `estimateMachine(request: EstimateRequest): MachineEstimate`.
- Produces: `buildRunSummary(state: RunState, trajectory: readonly MachineEstimate[]): RunSummaryData`.
- Produces worker messages `{ type: "ESTIMATE"; requestId; request }` and `{ type: "ESTIMATE_RESULT"; requestId; estimate }`.

- [ ] **Step 1: Define the estimate protocol**

```ts
export interface EstimateRequest {
  readonly reels: ReelSet;
  readonly parts: readonly PartInstance[];
  readonly toolLevel: 0 | 1 | 2 | 3;
  readonly bankroll: number;
  readonly bet: number;
  readonly horizonSpins: number;
  readonly sampleCount: number;
  readonly simulationSeed: number;
}
export interface MachineEstimate {
  readonly band: "danger" | "near-break-even" | "favorable";
  readonly symbolProbabilities: readonly Record<SymbolId, number>[] | null;
  readonly rtpMean: number | null;
  readonly rtp95: readonly [number, number] | null;
  readonly payoutStandardDeviation: number | null;
  readonly ruinProbability: number | null;
  readonly expectedAffordableSpins: number | null;
}
export interface RunSummaryData {
  readonly rtpTrajectory: readonly MachineEstimate[];
  readonly largestIncomeSource: AttributionSource;
  readonly largestExpenseSource: ExpenseSource;
  readonly incompleteSynergy: UpgradeId | null;
  readonly explanation: string;
}
```

`band` is always present and uses hidden simulation thresholds below 90%, 90%–105%, and above 105%. Tool level zero exposes only `band`. Level one exposes exact strip probabilities. Level two adds RTP mean and 95% interval. Level three adds standard deviation, ruin probability, and expected affordable spins capped to the requested horizon.

- [ ] **Step 2: Write statistics tests**

Use fixed arrays with hand-computed mean, sample variance, standard error, and 95% interval. Reject empty samples and non-finite values.

- [ ] **Step 3: Write deterministic simulation tests**

Assert identical requests return identical estimates, different simulation seeds may differ, the input state and real RNG are deeply unchanged, and 100,000 base spins produce RTP between 0.75 and 0.85.

- [ ] **Step 4: Run simulator tests and confirm the red state**

Run: `npm test -- tests/sim/statistics.test.ts tests/sim/monte-carlo.test.ts`
Expected: FAIL because simulation modules do not exist.

- [ ] **Step 5: Implement cloned-state simulation**

Simulate accepted spins without future upgrades or interventions over the requested horizon. Use `simulationSeed` only. Compute RTP as total payout divided by total wager, and ruin as the fraction of samples unable to afford the conservative minimum before the horizon.

- [ ] **Step 6: Implement worker isolation and timeout semantics**

The worker returns serializable success or error results. The future UI adapter will mark the estimate as pending after 250 ms and unavailable after 1500 ms while leaving the game playable.

- [ ] **Step 7: Verify and commit the accountant engine**

Before verification, implement `buildRunSummary`: select largest income and expense by amount with enum-order tie breaking; find the unowned same-route upgrade with greatest tag overlap as incomplete synergy; generate the high-RTP/high-ruin explanation when mean exceeds 1 and ruin exceeds 0.25, otherwise explain the dominant income and expense.

Run: `npm test -- tests/sim`
Expected: statistics, deterministic isolation, tool disclosure, base RTP, ruin, and summary tests PASS.

```bash
git add src/sim tests/sim
git commit -m "feat: add accountant risk simulation"
```

---

### Task 11: Functional Mobile Game Screen

**Files:**
- Modify: `src/app/App.tsx`
- Create: `src/app/GameScreen.tsx`
- Create: `src/app/useGame.ts`
- Create: `src/app/useEstimate.ts`
- Create: `src/app/components/Hud.tsx`
- Create: `src/app/components/SlotMachine.tsx`
- Create: `src/app/components/ActionBar.tsx`
- Create: `src/app/components/PartsBar.tsx`
- Create: `src/app/components/UpgradePicker.tsx`
- Create: `src/app/components/RunSummary.tsx`
- Modify: `src/app/styles.css`
- Test: `tests/app/GameScreen.test.tsx`
- Test: `tests/app/UpgradePicker.test.tsx`
- Test: `tests/app/RunSummary.test.tsx`

**Interfaces:**
- Consumes: `createRun`, `dispatchCommand`, `MachineEstimate`, and structured state/events.
- Produces: a playable A-layout screen with semantic buttons and pointer gesture input.

- [ ] **Step 1: Write the end-user screen tests**

Test service selection, normal bet display, pull button, three reel columns, bankroll deduction, stop-to-intervention transition, one-reel re-spin, outcome acceptance, shift/spin counter, upgrade three-choice, five part slots, tool disclosure, win/loss summary, and continue/cash-out actions.

```tsx
expect(screen.getByRole("button", { name: "拉动老虎机" }))
  .toHaveAttribute("data-thumb-control", "true");
expect(screen.getAllByTestId("reel")).toHaveLength(3);
```

The Playwright test in Task 12 verifies the computed button rectangle is at least 44×44 CSS pixels.

- [ ] **Step 2: Run UI tests and confirm the red state**

Run: `npm test -- tests/app/GameScreen.test.tsx tests/app/UpgradePicker.test.tsx tests/app/RunSummary.test.tsx`
Expected: FAIL because the functional components do not exist.

- [ ] **Step 3: Implement state ownership and screen routing**

`useGame(seed)` owns `RunState`, dispatches commands synchronously, stores only the most recent returned events for presentation, and exposes `send(command)` plus the last rejection. `App` accepts an optional numeric `seed` query parameter for reproducible debugging.

- [ ] **Step 4: Implement the A-layout components**

Use this hierarchy:

```tsx
<GameScreen>
  <Hud />
  <SlotMachine />
  <ActionBar />
  <PartsBar />
  <PullControl />
</GameScreen>
```

Keep the slot grid visually dominant. Place the pull control in the bottom thumb region. Show one context action for the current service and one for intervention. Open part and tool details on tap rather than permanently displaying paragraphs.

- [ ] **Step 5: Implement pull gesture and accessible fallback**

A downward pointer movement of at least 48 CSS pixels followed by release sends `SPIN`. A semantic button sends the same command. Ignore gesture input outside `READY_TO_SPIN` and `AFTER_HOURS`.

- [ ] **Step 6: Implement tool-level display and simulator adapter**

Without tools show only `凶险` below 90%, `接近持平` from 90% through 105%, and `有利` above 105%; these labels come from internal estimates but reveal no number. Render numeric fields only at the tool levels defined in Task 10. Pending or failed simulation displays `会计仍在计算` without blocking actions.

- [ ] **Step 7: Verify portrait behavior and commit**

Run: `npm test -- tests/app`
Run: `npm run build`
Expected: all React tests and production build PASS.

```bash
git add src/app tests/app
git commit -m "feat: add functional mobile game screen"
```

---

### Task 12: Presentation Queue, Local Recovery, PWA, and Browser Flow

**Files:**
- Create: `src/presentation/queue.ts`
- Create: `src/presentation/audio.ts`
- Create: `src/presentation/haptics.ts`
- Create: `src/persistence/storage.ts`
- Modify: `src/app/useGame.ts`
- Modify: `src/app/GameScreen.tsx`
- Modify: `src/app/styles.css`
- Modify: `vite.config.ts`
- Create: `public/icons/icon-192.svg`
- Create: `public/icons/icon-512.svg`
- Test: `tests/app/presentation.test.ts`
- Test: `tests/core/storage.test.ts`
- Test: `e2e/mobile-flow.spec.ts`

**Interfaces:**
- Produces: `createPresentationQueue(events, options): PresentationQueue` with `next()`, `speedUp()`, `skip()`, and `done`.
- Produces: `saveRun(state: RunState): void`, `loadRun(): LoadRunResult`, and `clearRun(): void`.

`LoadRunResult` is `{ ok: true; state: RunState } | { ok: false; reason: "MISSING" | "INVALID_SNAPSHOT" }`. `PresentationQueue` exposes `next(): GameEvent | null`, `speedUp(): void`, `skip(): readonly GameEvent[]`, and readonly `done: boolean`.

- [ ] **Step 1: Write presentation-queue tests**

Assert events remain in causal order, long-press speed changes delay only, skip marks every remaining event presented, and final rule state is identical whether played fully or skipped.

- [ ] **Step 2: Write storage recovery tests**

Use local key `midnight-lucky-hotel.run.v1`. Save only schema version 1 and serializable state. Reject malformed JSON, wrong schema version, invalid phase, non-finite money, and missing RNG. Corruption returns `{ ok: false, reason: "INVALID_SNAPSHOT" }` and never throws into React.

- [ ] **Step 3: Run presentation and storage tests**

Run: `npm test -- tests/app/presentation.test.ts tests/core/storage.test.ts`
Expected: FAIL because presentation and persistence modules are missing.

- [ ] **Step 4: Implement optional feedback adapters**

Use Web Audio oscillator tones generated at runtime; do not add licensed audio. `haptics.ts` calls `navigator.vibrate` only after capability detection and returns a boolean. Respect `prefers-reduced-motion` and the in-game “减少闪烁” setting.

- [ ] **Step 5: Implement save-after-command and background recovery**

Save after each successful command, never midway through an animation callback. On document hidden, pause the queue. On restore, offer “继续演出” or “直接结算”; both use the already committed rule state.

- [ ] **Step 6: Configure the installable PWA**

Use `vite-plugin-pwa` with display `standalone`, portrait orientation, theme color `#17191f`, and generated SVG prototype icons. Cache only the built shell assets; the game has no network-required content.

- [ ] **Step 7: Write the portrait Playwright flow**

Use a 390×844 Chromium viewport. Start a seeded run, select a service, perform a pull through the button, complete three spins, choose an upgrade, reload, confirm bankroll/shift restoration, and verify no horizontal overflow.

- [ ] **Step 8: Verify and commit mobile recovery**

Run: `npm run verify`
Run: `npm run e2e`
Expected: unit/integration tests PASS, build PASS, portrait flow PASS, PWA manifest present in build output.

```bash
git add src/presentation src/persistence src/app vite.config.ts public tests e2e
git commit -m "feat: add presentation recovery and PWA"
```

---

### Task 13: Balance Artifact, Full Verification, and Playtest Handoff

**Files:**
- Modify: `package.json`
- Create: `scripts/run-balance.ts`
- Create: `artifacts/balance-baseline.json`
- Create: `docs/validation/functional-prototype.md`
- Create: `docs/playtest/scorecard.md`
- Create: `tests/fixtures/run-fixtures.ts`
- Test: `tests/core/scenario-builds.test.ts`
- Test: `e2e/complete-run.spec.ts`

**Interfaces:**
- Consumes: the complete rules, three predefined route builds, simulator, and functional UI.
- Produces: `npm run balance`, reproducible balance evidence, a clean verification report, and a fixed human playtest instrument.

`BaseBalanceReport` contains `sampleCount`, `seed`, `rtp`, `payoutMean`, and `payoutStandardDeviation`. `RouteBalanceReport` adds `route`, `winRate`, `medianBreakEvenShift`, `ruinRate`, and attribution totals. The top-level report contains `generatedAt`, `base`, `fruit`, `chapel`, and `violent`.

- [ ] **Step 1: Add three deterministic scenario tests**

Create shared `createFruitScenario(seed)`, `createChapelScenario(seed)`, and `createViolentScenario(seed)` state fixtures. Each must demonstrate its distinct engine:

```text
fruit: frequent low-value wins and food-driven additive buffs
chapel: omen accumulation followed by a high-value seven release
violent: deterministic kick creates a crack line and blank capacitor grants a free spin
```

Assert the causal event chain and attribution totals, not only final bankroll.

- [ ] **Step 2: Write the balance runner**

Add `"balance": "node scripts/run-balance.ts"` to package scripts. The Node 24 script uses relative `.ts` imports, runs 100,000 base spins and 10,000 full runs for each of the three scripted build policies, then writes both artifacts. Define local `runBaseRtp(sampleCount, seed): BaseBalanceReport`, `runPolicy(route, sampleCount, seed): RouteBalanceReport`, and `renderMarkdown(report): string` functions in the same script.

Use these fixed policies so reports remain comparable:

```text
fruit: kitchen; buy food when bankroll >= 20; choose lemon-crate, lemon-infection, fruit-salad, jam-jar; conservative until shift 3, normal afterward
chapel: chapel; pray for seven once per shift; choose seven-purification, omen-collector, triple-blessing, martyr-coin; normal throughout
violent: security; kick the reel whose preview creates the most paying lines; choose artificial-crack, scrap-magnet, blank-capacitor, overload-motor; normal throughout
```

If a scripted upgrade is not in the offered set, spend one tip if available to reroll; otherwise select the candidate with the most matching route tags. On a non-winning board, use the default single-reel re-spin on the reel that completes the greatest number of two-matching-symbol opportunities on the five paylines; ties use the lowest reel index. The policy never previews a random re-spin outcome.

```ts
const report = {
  generatedAt: new Date().toISOString(),
  base: runBaseRtp(100_000, 820_126),
  fruit: runPolicy("fruit", 10_000, 820_127),
  chapel: runPolicy("chapel", 10_000, 820_128),
  violent: runPolicy("violent", 10_000, 820_129)
};
writeFileSync("artifacts/balance-baseline.json", JSON.stringify(report, null, 2) + "\n");
writeFileSync("docs/validation/functional-prototype.md", renderMarkdown(report));
```

- [ ] **Step 3: Write the fixed playtest scorecard**

The scorecard asks after each run:

1. 为什么赢或输？
2. 最大收入来自哪个部件或服务？
3. 什么时候感觉机器跨过了盈亏平衡？
4. 哪次干预改变了结果？
5. 是否立即再开一局；如果没有，为什么？
6. 这一局更像“我构筑成功”还是“系统让我走运”？

Include fields for run seed, route, duration, shift reached, final bankroll, observed UI friction, and whether animation was accelerated.

- [ ] **Step 4: Write the complete-run browser test**

Use `createFruitScenario(820127)` to place a schema-valid state in `midnight-lucky-hotel.run.v1` before page load. This fixture starts at shift five with two completed base spins, bankroll 220, exit unlocked, and a complete fruit engine. Complete the final normal spin, choose continue, play one after-hours block, then cash out. Assert the summary exposes RTP trajectory, largest source, largest leak, incomplete synergy, and a concrete explanation. The Task 12 mobile flow remains the from-new-run browser test.

- [ ] **Step 5: Run the full engineering verification**

Run: `npm run balance`
Expected: base RTP in 0.75–0.85, three non-empty route reports, JSON and Markdown artifacts written.

Run: `npm run test:coverage`
Expected: every one of the 24 upgrade IDs is exercised; no uncovered command branch for invalid phase, insufficient funds, or effect overflow.

Run: `npm run e2e`
Expected: portrait smoke, recovery, complete normal run, and after-hours flow PASS.

Run: `npm run verify`
Expected: typecheck PASS, all Vitest tests PASS, production build PASS.

- [ ] **Step 6: Inspect the built prototype on a real phone**

Open the local-network Vite preview in a portrait phone browser. Verify 44-pixel targets, no horizontal overflow, pull gesture, button fallback, background/restore, reduced motion, optional vibration failure, speed-up, and skip-to-total.

- [ ] **Step 7: Commit the verified handoff**

```bash
git add package.json package-lock.json scripts artifacts docs/validation docs/playtest tests/fixtures tests/core/scenario-builds.test.ts e2e/complete-run.spec.ts
git commit -m "test: verify functional slot prototype"
```

---

## Spec Coverage Checklist

| Spec area | Implementation task |
|---|---|
| Five shifts, bets, checkout, after-hours | Tasks 3 and 9 |
| Three reels, five lines, real strip probabilities | Task 2 |
| Food, crack, agitation, finite overload | Task 4 |
| Exactly 24 choices, five part slots, ordered tool | Task 5 |
| Fruit buffet and kitchen | Task 6 |
| Midnight chapel, prayer, omen | Task 7 |
| Violent repair, kick, crack exploitation | Task 8 |
| Repair, contracts, tips | Task 9 |
| Probability, RTP, volatility, ruin | Task 10 |
| A-layout mobile UI and touch interaction | Task 11 |
| Causal feedback, acceleration, persistence, PWA | Task 12 |
| Seeded scenarios, saved evidence, playtest gate | Task 13 |

The implementation is engineering-complete only after Task 13 commands pass and the generated artifacts are read back. Product Go remains a separate human decision based on the scorecard and the acceptance metrics in the design specification.
