import { BASE_PAYTABLE } from "@/content/base-machine";
import type { GameEvent, GameEventDraft } from "@/core/events";
import { evaluateBaseWins } from "@/core/paylines";
import { getCurrentBet } from "@/core/progression";
import type {
  AttributionSource,
  Effect,
  Grid,
  LineWin,
  PartInstance,
  PartId,
  ReelDraw,
  ReelIndex,
  ReelSet,
  ReelWindow,
  ResolveContext,
  ResolveSignal,
  RowIndex,
  RunState,
  SettlementResult,
  StopSet,
  SymbolId,
  TimedBuff
} from "@/core/types";

const EFFECT_LIMIT = 100;
const MAX_STRUCTURAL_COUNT = 100;
const MAX_MONEY = Number.MAX_SAFE_INTEGER / 100;
const ATTRIBUTION_SOURCES: readonly AttributionSource[] = [
  "base",
  "part",
  "intervention",
  "service",
  "agitation",
  "overload"
];

export type EffectHandler = (context: ResolveContext, signal: ResolveSignal) => readonly Effect[];
export type EffectHandlerRegistration =
  | { readonly kind: "system"; readonly handler: EffectHandler }
  | { readonly kind: "part"; readonly slot: number; readonly partId: PartId; readonly handler: EffectHandler };

interface WorkingState {
  grid: [SymbolId[], SymbolId[], SymbolId[]];
  strips: [SymbolId[], SymbolId[], SymbolId[]];
  stops: [number, number, number];
  queue: Effect[];
  drafts: GameEventDraft[];
  triggeredKeys: Set<string>;
  awardedWinKeys: Set<string>;
  disabledSlots: Set<number>;
  attribution: Record<AttributionSource, number>;
  payout: number;
  effectCount: number;
  overloaded: boolean;
  freeSpinQueue: number;
  counters: { blankCharge: number; cherryWinsThisShift: number };
}

function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function windowAt(strip: readonly SymbolId[], stop: number): SymbolId[] {
  if (strip.length === 0) return ["blank", "blank", "blank"];
  const start = modulo(stop, strip.length);
  return [strip[start]!, strip[(start + 1) % strip.length]!, strip[(start + 2) % strip.length]!];
}

function refreshGrid(working: WorkingState, reel?: ReelIndex): void {
  const reels: readonly ReelIndex[] = reel === undefined ? [0, 1, 2] : [reel];
  for (const reelIndex of reels) {
    working.grid[reelIndex] = windowAt(working.strips[reelIndex], working.stops[reelIndex]);
  }
}

function boundedStructuralCount(value: number): number | undefined {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_STRUCTURAL_COUNT ? value : undefined;
}

function finiteInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function safePayout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return safeMoney(value);
}

function safeMoney(value: number): number {
  if (Number.isNaN(value)) return 0;
  const bounded = Math.min(MAX_MONEY, Math.max(-MAX_MONEY, value));
  return Math.round(bounded * 100) / 100;
}

function lineWinKey(win: LineWin): string {
  return `${win.lineId}:${win.symbol}:${win.cells.map(([reel, row]) => `${reel},${row}`).join("|")}`;
}

function activePartState(state: RunState, disabledSlots: ReadonlySet<number>): RunState {
  const partSlots = state.partSlots.map((part, slot) => (disabledSlots.has(slot) ? null : part)) as unknown as RunState["partSlots"];
  return { ...state, partSlots };
}

function createContext(
  state: RunState,
  currentBet: number,
  working: WorkingState
): ResolveContext {
  const reels = immutableReels(working);
  const grid = immutableGrid(working);
  const stops = [...working.stops] as StopSet;
  const attribution = { ...state.attribution };
  for (const source of ATTRIBUTION_SOURCES) {
    attribution[source] = safeMoney(attribution[source] + working.attribution[source]);
  }
  const contextState = activePartState(
    {
      ...state,
      bankroll: safeMoney(state.bankroll + working.payout),
      shiftPayout: safeMoney(state.shiftPayout + working.payout),
      reels,
      pendingSpin: state.pendingSpin === null ? null : {
        ...state.pendingSpin,
        draw: { ...state.pendingSpin.draw, strips: reels, stops, grid }
      },
      freeSpinQueue: working.freeSpinQueue,
      counters: { ...working.counters },
      attribution
    },
    working.disabledSlots
  );
  return {
    state: structuredClone(contextState),
    grid: structuredClone(grid),
    currentBet,
    queue: working.queue.map((effect) => ({ ...effect })),
    triggeredKeys: new Set(working.triggeredKeys),
    awardedWinKeys: new Set(working.awardedWinKeys),
    eventCount: working.effectCount
  };
}

function registrationIsActive(
  state: RunState,
  disabledSlots: ReadonlySet<number>,
  registration: EffectHandlerRegistration
): boolean {
  if (registration.kind === "system") return true;
  if (disabledSlots.has(registration.slot)) return false;
  return state.partSlots[registration.slot]?.id === registration.partId;
}

function cloneSignal(signal: ResolveSignal): ResolveSignal {
  return structuredClone(signal);
}

function enqueueEffects(working: WorkingState, effects: readonly Effect[]): void {
  for (const effect of effects) working.queue.push({ ...effect });
}

function dispatchSignal(
  state: RunState,
  currentBet: number,
  working: WorkingState,
  registrations: readonly EffectHandlerRegistration[],
  signal: ResolveSignal
): void {
  if (working.overloaded) return;
  for (const registration of registrations) {
    if (!registrationIsActive(state, working.disabledSlots, registration)) continue;
    const effects = registration.handler(createContext(state, currentBet, working), cloneSignal(signal));
    enqueueEffects(working, effects);
  }
}

function addPayout(
  working: WorkingState,
  rawAmount: number,
  source: AttributionSource,
  buffMultiplier: number,
  event: "line" | "effect" | "overload",
  win?: LineWin
): void {
  const amount = safePayout(rawAmount * buffMultiplier);
  if (amount === 0) return;
  working.payout = safeMoney(working.payout + amount);
  working.attribution[source] = safeMoney(working.attribution[source] + amount);
  if (event === "line" && win !== undefined) {
    working.drafts.push({
      type: "LINE_WIN",
      lineId: win.lineId,
      symbol: win.symbol,
      amount,
      source
    });
  } else if (event === "effect") {
    working.drafts.push({ type: "PAYOUT_ADDED", amount, source });
  } else if (event === "overload") {
    working.drafts.push({ type: "OVERLOAD", amount });
  }
}

function awardNewLines(
  state: RunState,
  currentBet: number,
  buffMultiplier: number,
  working: WorkingState,
  registrations: readonly EffectHandlerRegistration[]
): void {
  const wins = evaluateBaseWins(working.grid as unknown as Grid, BASE_PAYTABLE);
  for (const win of wins) {
    const key = lineWinKey(win);
    if (working.awardedWinKeys.has(key)) continue;
    working.awardedWinKeys.add(key);
    addPayout(working, win.multiplier * currentBet, "base", buffMultiplier, "line", win);
    dispatchSignal(state, currentBet, working, registrations, { type: "LINE_AWARDED", win });
  }
}

function removeIndices(working: WorkingState, reel: ReelIndex, indices: readonly number[]): number {
  const stripLength = working.strips[reel].length;
  const unique = new Set(
    indices.filter((index) => Number.isInteger(index) && index >= 0 && index < stripLength)
  );
  if (unique.size === 0) return 0;
  const oldStop = working.stops[reel];
  const removedBeforeStop = [...unique].filter((index) => index < oldStop).length;
  const remaining = working.strips[reel].filter((_symbol, index) => !unique.has(index));
  working.strips[reel] = remaining.length > 0 ? remaining : ["blank"];
  working.stops[reel] = modulo(oldStop - removedBeforeStop, working.strips[reel].length);
  refreshGrid(working, reel);
  return unique.size;
}

function removeSymbol(working: WorkingState, reel: ReelIndex, symbol: SymbolId, count: number): void {
  const indices: number[] = [];
  for (let index = 0; index < working.strips[reel].length && indices.length < count; index += 1) {
    if (working.strips[reel][index] === symbol) indices.push(index);
  }
  removeIndices(working, reel, indices);
}

function disablePart(
  state: RunState,
  currentBet: number,
  working: WorkingState,
  registrations: readonly EffectHandlerRegistration[],
  slot: number
): void {
  const part = state.partSlots[slot];
  if (part === null || part === undefined || working.disabledSlots.has(slot)) return;
  working.disabledSlots.add(slot);
  working.drafts.push({ type: "PART_DISABLED", partId: part.id, slot });
  dispatchSignal(state, currentBet, working, registrations, { type: "PART_DISABLED", partId: part.id });
}

function triggerOverload(currentBet: number, working: WorkingState): void {
  if (working.overloaded) return;
  working.queue.length = 0;
  working.overloaded = true;
  working.effectCount += 1;
  addPayout(working, 25 * currentBet, "overload", 1, "overload");
}

function applyEffect(
  state: RunState,
  currentBet: number,
  buffMultiplier: number,
  working: WorkingState,
  registrations: readonly EffectHandlerRegistration[],
  effect: Effect
): void {
  switch (effect.type) {
    case "ADD_PAYOUT":
      addPayout(working, effect.amount, effect.source, buffMultiplier, "effect");
      break;
    case "TRANSFORM_CELL": {
      const from = working.grid[effect.reel][effect.row];
      if (from !== effect.symbol) {
        const sourceIndex = modulo(working.stops[effect.reel] + effect.row, working.strips[effect.reel].length);
        working.strips[effect.reel][sourceIndex] = effect.symbol;
        refreshGrid(working, effect.reel);
        working.drafts.push({
          type: "SYMBOL_CHANGED",
          reel: effect.reel,
          row: effect.row,
          from: from!,
          to: effect.symbol
        });
      }
      break;
    }
    case "ADD_TO_REEL": {
      const count = boundedStructuralCount(effect.count);
      if (count === undefined) {
        triggerOverload(currentBet, working);
        break;
      }
      for (let index = 0; index < count; index += 1) working.strips[effect.reel].push(effect.symbol);
      refreshGrid(working, effect.reel);
      break;
    }
    case "REMOVE_FROM_REEL": {
      const count = boundedStructuralCount(effect.count);
      if (count === undefined) {
        triggerOverload(currentBet, working);
        break;
      }
      removeSymbol(working, effect.reel, effect.symbol, count);
      break;
    }
    case "DISABLE_PART":
      disablePart(state, currentBet, working, registrations, effect.slot);
      break;
    case "GRANT_FREE_SPIN": {
      const count = finiteInteger(effect.count);
      if (count > 0) {
        working.freeSpinQueue += count;
        working.drafts.push({ type: "RESOURCE_CHANGED", resource: "freeSpins", delta: count });
      }
      break;
    }
    case "REEVALUATE_LINES":
      awardNewLines(state, currentBet, buffMultiplier, working, registrations);
      break;
    case "INCREMENT_COUNTER": {
      const amount = Number.isFinite(effect.amount) ? Math.trunc(effect.amount) : 0;
      working.counters[effect.counter] += amount;
      break;
    }
  }
}

function drainEffects(
  state: RunState,
  currentBet: number,
  buffMultiplier: number,
  working: WorkingState,
  registrations: readonly EffectHandlerRegistration[]
): void {
  while (working.queue.length > 0) {
    const effect = working.queue.shift()!;
    working.effectCount += 1;
    applyEffect(state, currentBet, buffMultiplier, working, registrations, effect);
    if (working.overloaded) return;
    if (working.effectCount >= EFFECT_LIMIT) {
      triggerOverload(currentBet, working);
      return;
    }
    dispatchSignal(state, currentBet, working, registrations, { type: "EFFECT_APPLIED", effect });
  }
}

function consumeVisibleFood(
  state: RunState,
  currentBet: number,
  working: WorkingState,
  registrations: readonly EffectHandlerRegistration[]
): readonly TimedBuff[] {
  const granted: TimedBuff[] = [];
  for (const reel of [0, 1, 2] as const) {
    const foodIndices = working.grid[reel]
      .map((symbol, row) => ({ symbol, row: row as RowIndex }))
      .filter(({ symbol }) => symbol === "food")
      .map(({ row }) => modulo(working.stops[reel] + row, working.strips[reel].length))
      .filter((index) => working.strips[reel][index] === "food");
    const consumedCount = removeIndices(working, reel, foodIndices);
    for (let consumed = 0; consumed < consumedCount; consumed += 1) {
      granted.push({ id: "food", spinsRemaining: 3, additivePayout: 0.25 });
      working.drafts.push({ type: "FOOD_CONSUMED", reel });
      dispatchSignal(state, currentBet, working, registrations, { type: "FOOD_CONSUMED", reel });
    }
  }
  return granted;
}

function countVisible(grid: readonly (readonly SymbolId[])[], symbol: SymbolId): number {
  return grid.reduce((total, reel) => total + reel.filter((cell) => cell === symbol).length, 0);
}

function existingBuffsAfterSpin(buffs: readonly TimedBuff[]): readonly TimedBuff[] {
  return buffs
    .map((buff) => ({ ...buff, spinsRemaining: buff.spinsRemaining - 1 }))
    .filter((buff) => buff.spinsRemaining > 0);
}

function sequenceEvents(state: RunState, drafts: readonly GameEventDraft[]): readonly GameEvent[] {
  const start = state.pendingEvents.length + 1;
  return drafts.map((draft, index) => ({ ...draft, sequence: start + index }) as GameEvent);
}

function immutableReels(working: WorkingState): ReelSet {
  return [[...working.strips[0]], [...working.strips[1]], [...working.strips[2]]];
}

function immutableGrid(working: WorkingState): Grid {
  return [
    [...working.grid[0]] as unknown as ReelWindow,
    [...working.grid[1]] as unknown as ReelWindow,
    [...working.grid[2]] as unknown as ReelWindow
  ];
}

/** Resolves one accepted draw without mutating the input state or draw. */
export function resolveSpin(
  state: RunState,
  draw: ReelDraw,
  handlers: readonly EffectHandlerRegistration[] = []
): SettlementResult {
  const registrations = handlers.map((registration) => ({ ...registration }));
  let currentBet: number;
  try {
    currentBet = safeMoney(getCurrentBet(state));
  } catch {
    currentBet = 0;
  }
  const existingBuffAdditive = state.buffs.reduce(
    (total, buff) => total + (Number.isFinite(buff.additivePayout) ? buff.additivePayout : 0),
    0
  );
  const buffMultiplier = Math.max(0, 1 + existingBuffAdditive);
  const attribution = Object.fromEntries(ATTRIBUTION_SOURCES.map((source) => [source, 0])) as Record<
    AttributionSource,
    number
  >;
  const working: WorkingState = {
    grid: draw.grid.map((reel) => [...reel]) as [SymbolId[], SymbolId[], SymbolId[]],
    strips: draw.strips.map((strip) => [...strip]) as [SymbolId[], SymbolId[], SymbolId[]],
    stops: [...draw.stops],
    queue: [],
    drafts: [],
    triggeredKeys: new Set(),
    awardedWinKeys: new Set(),
    disabledSlots: new Set(),
    attribution,
    payout: 0,
    effectCount: 0,
    overloaded: false,
    freeSpinQueue: state.freeSpinQueue,
    counters: { ...state.counters }
  };

  const crackCount = countVisible(working.grid, "crack");
  const occupiedSlots = state.partSlots
    .map((part, slot) => ({ part, slot }))
    .filter((entry): entry is { part: PartInstance; slot: number } => entry.part !== null)
    .sort((left, right) => right.slot - left.slot);
  for (const { slot } of occupiedSlots.slice(0, crackCount)) {
    disablePart(state, currentBet, working, registrations, slot);
  }

  dispatchSignal(state, currentBet, working, registrations, { type: "GRID_ACCEPTED" });
  awardNewLines(state, currentBet, buffMultiplier, working, registrations);
  drainEffects(state, currentBet, buffMultiplier, working, registrations);

  const grantedBuffs = consumeVisibleFood(state, currentBet, working, registrations);
  drainEffects(state, currentBet, buffMultiplier, working, registrations);

  const preAgitationPayout = working.payout;
  let agitation = state.agitation;
  if (preAgitationPayout > 0 && agitation > 0) {
    addPayout(working, agitation * 0.5 * currentBet, "agitation", buffMultiplier, "effect");
    working.drafts.push({ type: "RESOURCE_CHANGED", resource: "agitation", delta: -agitation });
    agitation = 0;
  } else if (preAgitationPayout === 0 && agitation < 5) {
    agitation += 1;
    working.drafts.push({ type: "RESOURCE_CHANGED", resource: "agitation", delta: 1 });
  }

  working.drafts.push({ type: "PAYOUT_COMPLETE", total: working.payout });
  const reels = immutableReels(working);
  const grid = immutableGrid(working);
  const stops = [...working.stops] as StopSet;
  const resolvedDraw: ReelDraw = { ...draw, strips: reels, stops, grid };
  const cumulativeAttribution = { ...state.attribution };
  for (const source of ATTRIBUTION_SOURCES) {
    cumulativeAttribution[source] = safeMoney(cumulativeAttribution[source] + working.attribution[source]);
  }
  const nextState: RunState = {
    ...state,
    bankroll: safeMoney(state.bankroll + working.payout),
    shiftPayout: safeMoney(state.shiftPayout + working.payout),
    reels,
    pendingSpin: state.pendingSpin === null ? null : { ...state.pendingSpin, draw: resolvedDraw },
    freeSpinQueue: working.freeSpinQueue,
    agitation,
    counters: working.counters,
    buffs: [...existingBuffsAfterSpin(state.buffs), ...grantedBuffs],
    attribution: cumulativeAttribution
  };

  return {
    state: nextState,
    events: sequenceEvents(state, working.drafts),
    payout: working.payout,
    attribution: { ...working.attribution },
    effectCount: working.effectCount
  };
}
