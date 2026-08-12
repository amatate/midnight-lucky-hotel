import { BASE_PAYTABLE } from "@/content/base-machine";
import { isChapelPartId, reactChapelParts } from "@/content/effects/chapel";
import { isFruitPartId, reactFruitParts } from "@/content/effects/fruit";
import { isViolentPartId, reactViolentParts } from "@/content/effects/violent";
import type { GameEvent, GameEventDraft } from "@/core/events";
import { safeMoney, safePayout } from "@/core/money";
import { evaluateBaseWins } from "@/core/paylines";
import { getCurrentBet } from "@/core/progression";
import { normalizeDrawIdentity } from "@/core/reels";
import type {
  AttributionSource,
  Effect,
  FruitPartResolveContext,
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
  ShiftFlags,
  TimedBuff
} from "@/core/types";

const EFFECT_LIMIT = 100;
const MAX_STRUCTURAL_COUNT = 100;
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

const INTERNAL_FRUIT_REGISTRATION: unique symbol = Symbol("internal-fruit-registration");
const INTERNAL_CHAPEL_REGISTRATION: unique symbol = Symbol("internal-chapel-registration");
const INTERNAL_VIOLENT_REGISTRATION: unique symbol = Symbol("internal-violent-registration");

type InternalEffectHandlerRegistration = EffectHandlerRegistration & {
  readonly [INTERNAL_FRUIT_REGISTRATION]?: number;
  readonly [INTERNAL_CHAPEL_REGISTRATION]?: number;
  readonly [INTERNAL_VIOLENT_REGISTRATION]?: number;
};

interface PhysicalCell {
  readonly reel: ReelIndex;
  readonly entryId: number;
  readonly symbol: SymbolId;
}

interface AuthorizedViolentPart {
  readonly slot: number;
  readonly part: PartInstance;
  readonly claimTrigger: (key: string) => boolean;
  readonly visiblePhysicalCount: (symbol: SymbolId) => number;
  readonly physicalCell: (reel: ReelIndex, row: RowIndex) => PhysicalCell;
  readonly claimMotorOrdinal: () => number | null;
}

const AUTHORIZED_VIOLENT_CONTEXTS = new WeakMap<ResolveContext, AuthorizedViolentPart>();

/** Reads settlement-private violent-route data only for the exact currently executing central context. */
export function readAuthorizedViolentPart(context: ResolveContext): AuthorizedViolentPart | undefined {
  return AUTHORIZED_VIOLENT_CONTEXTS.get(context);
}

interface AuthorizedChapelPart {
  readonly slot: number;
  readonly part: PartInstance;
  readonly claimTrigger: (key: string) => boolean;
}

const AUTHORIZED_CHAPEL_CONTEXTS = new WeakMap<ResolveContext, AuthorizedChapelPart>();

/** Reads settlement-private Chapel data only for the exact currently executing central context. */
export function readAuthorizedChapelPart(context: ResolveContext): AuthorizedChapelPart | undefined {
  return AUTHORIZED_CHAPEL_CONTEXTS.get(context);
}

interface FruitRuntime {
  readonly initialCherryWins: number;
  cherryWinsSeen: number;
  readonly initialReturnedFoodCount: number;
  returnedFoodsSeen: number;
  plannedFoodAdds: [number, number, number];
}

interface ViolentRuntime {
  coreEffectsSeen: number;
}

interface QueuedEffect {
  readonly effect: Effect;
  readonly origin?: InternalEffectHandlerRegistration;
  readonly motorGenerated: boolean;
}

interface WorkingState {
  grid: [SymbolId[], SymbolId[], SymbolId[]];
  strips: [SymbolId[], SymbolId[], SymbolId[]];
  entryIds: [number[], number[], number[]];
  visibleSourceIds: [[number, number, number], [number, number, number], [number, number, number]];
  nextEntryIds: [number, number, number];
  temporaryEntries: [boolean[], boolean[], boolean[]];
  stops: [number, number, number];
  queue: QueuedEffect[];
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
  shiftFlags: ShiftFlags;
  omen: number;
  fruitRuntimes: Map<number, FruitRuntime>;
  violentRuntimes: Map<number, ViolentRuntime>;
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
    const ids = working.entryIds[reelIndex];
    const start = modulo(working.stops[reelIndex], ids.length);
    working.visibleSourceIds[reelIndex] = [
      ids[start]!,
      ids[(start + 1) % ids.length]!,
      ids[(start + 2) % ids.length]!
    ];
  }
}

function entryIndex(working: WorkingState, reel: ReelIndex, entryId: number): number {
  return working.entryIds[reel].indexOf(entryId);
}

function boundedStructuralCount(value: number): number | undefined {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_STRUCTURAL_COUNT ? value : undefined;
}

function finiteInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
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
  working: WorkingState,
  registration?: InternalEffectHandlerRegistration
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
      omen: working.omen,
      counters: { ...working.counters },
      shiftFlags: { ...working.shiftFlags },
      attribution
    },
    working.disabledSlots
  );
  const context: ResolveContext = {
    state: structuredClone(contextState),
    grid: structuredClone(grid),
    currentBet,
    queue: working.queue.map(({ effect }) => ({ ...effect })),
    triggeredKeys: new Set(working.triggeredKeys),
    awardedWinKeys: new Set(working.awardedWinKeys),
    eventCount: working.effectCount
  };
  const fruitSlot = registration?.[INTERNAL_FRUIT_REGISTRATION];
  const fruitPartInstance = fruitSlot === undefined ? undefined : state.partSlots[fruitSlot];
  const runtime = fruitSlot === undefined ? undefined : working.fruitRuntimes.get(fruitSlot);
  if (fruitSlot !== undefined && fruitPartInstance !== undefined && fruitPartInstance !== null && runtime !== undefined) {
    const fruitPart: FruitPartResolveContext = Object.freeze({
      slot: fruitSlot,
      part: Object.freeze({ ...fruitPartInstance }),
      claimTrigger(key: string): boolean {
        if (working.triggeredKeys.has(key)) return false;
        working.triggeredKeys.add(key);
        return true;
      },
      observeCherryLine(): number {
        const prior = runtime.initialCherryWins + runtime.cherryWinsSeen;
        runtime.cherryWinsSeen += 1;
        return prior;
      },
      claimFoodReturn(limit: number): ReelIndex | null {
        if (runtime.initialReturnedFoodCount + runtime.returnedFoodsSeen >= limit) return null;
        let shortest: ReelIndex = 0;
        for (const reel of [1, 2] as const) {
          const reelLength = working.strips[reel].length + runtime.plannedFoodAdds[reel];
          const shortestLength = working.strips[shortest].length + runtime.plannedFoodAdds[shortest];
          if (reelLength < shortestLength) shortest = reel;
        }
        runtime.returnedFoodsSeen += 1;
        runtime.plannedFoodAdds[shortest] += 1;
        return shortest;
      }
    });
    return { ...context, fruitPart };
  }

  return context;
}

function registrationIsActive(
  state: RunState,
  disabledSlots: ReadonlySet<number>,
  registration: InternalEffectHandlerRegistration
): boolean {
  if (registration.kind === "system") return true;
  if (disabledSlots.has(registration.slot)) return false;
  return state.partSlots[registration.slot]?.id === registration.partId;
}

function cloneSignal(signal: ResolveSignal): ResolveSignal {
  return structuredClone(signal);
}

function enqueueEffects(
  working: WorkingState,
  effects: readonly Effect[],
  origin: InternalEffectHandlerRegistration,
  inheritedMotorGenerated: boolean
): void {
  const fromMotor =
    origin.kind === "part" &&
    origin.partId === "overload-motor" &&
    origin[INTERNAL_VIOLENT_REGISTRATION] !== undefined;
  for (const effect of effects) {
    working.queue.push({ effect: { ...effect }, origin, motorGenerated: inheritedMotorGenerated || fromMotor });
  }
}

function dispatchSignal(
  state: RunState,
  currentBet: number,
  working: WorkingState,
  registrations: readonly InternalEffectHandlerRegistration[],
  signal: ResolveSignal,
  appliedOrigin?: InternalEffectHandlerRegistration,
  appliedMotorGenerated = false
): void {
  if (working.overloaded) return;
  for (const registration of registrations) {
    if (!registrationIsActive(state, working.disabledSlots, registration)) continue;
    const context = createContext(state, currentBet, working, registration);
    const chapelSlot = registration[INTERNAL_CHAPEL_REGISTRATION];
    const chapelPart = chapelSlot === undefined ? undefined : state.partSlots[chapelSlot];
    if (chapelSlot !== undefined && chapelPart !== undefined && chapelPart !== null) {
      AUTHORIZED_CHAPEL_CONTEXTS.set(context, Object.freeze({
        slot: chapelSlot,
        part: Object.freeze({ ...chapelPart }),
        claimTrigger(key: string): boolean {
          const scopedKey = `chapel:${chapelSlot}:${key}`;
          if (working.triggeredKeys.has(scopedKey)) return false;
          working.triggeredKeys.add(scopedKey);
          return true;
        }
      }));
    }
    const violentSlot = registration[INTERNAL_VIOLENT_REGISTRATION];
    const violentPart = violentSlot === undefined ? undefined : state.partSlots[violentSlot];
    const violentRuntime = violentSlot === undefined ? undefined : working.violentRuntimes.get(violentSlot);
    if (violentSlot !== undefined && violentPart !== undefined && violentPart !== null && violentRuntime !== undefined) {
      AUTHORIZED_VIOLENT_CONTEXTS.set(context, Object.freeze({
        slot: violentSlot,
        part: Object.freeze({ ...violentPart }),
        claimTrigger(key: string): boolean {
          const scopedKey = `violent:${violentSlot}:${key}`;
          if (working.triggeredKeys.has(scopedKey)) return false;
          working.triggeredKeys.add(scopedKey);
          return true;
        },
        visiblePhysicalCount(symbol: SymbolId): number {
          const cells = new Set<string>();
          for (const reel of [0, 1, 2] as const) {
            for (const row of [0, 1, 2] as const) {
              if (working.grid[reel][row] !== symbol) continue;
              const entryId = working.visibleSourceIds[reel][row];
              const index = entryIndex(working, reel, entryId);
              if (index >= 0 && working.strips[reel][index] === symbol) cells.add(`${reel}:${entryId}`);
            }
          }
          return cells.size;
        },
        physicalCell(reel: ReelIndex, row: RowIndex): PhysicalCell {
          const entryId = working.visibleSourceIds[reel][row];
          const index = entryIndex(working, reel, entryId);
          return Object.freeze({ reel, entryId, symbol: working.strips[reel][index]! });
        },
        claimMotorOrdinal(): number | null {
          if (signal.type !== "EFFECT_APPLIED" || appliedOrigin === registration || appliedMotorGenerated) return null;
          violentRuntime.coreEffectsSeen += 1;
          return violentRuntime.coreEffectsSeen;
        }
      }));
    }
    try {
      const effects = registration.handler(context, cloneSignal(signal));
      enqueueEffects(working, effects, registration, appliedMotorGenerated);
    } finally {
      AUTHORIZED_CHAPEL_CONTEXTS.delete(context);
      AUTHORIZED_VIOLENT_CONTEXTS.delete(context);
    }
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
  registrations: readonly InternalEffectHandlerRegistration[],
  appliedOrigin?: InternalEffectHandlerRegistration,
  appliedMotorGenerated = false
): void {
  const wins = evaluateBaseWins(working.grid as unknown as Grid, BASE_PAYTABLE);
  for (const win of wins) {
    if (working.triggeredKeys.has(`fruit-salad:${win.lineId}`)) continue;
    const key = lineWinKey(win);
    if (working.awardedWinKeys.has(key)) continue;
    working.awardedWinKeys.add(key);
    addPayout(working, win.multiplier * currentBet, "base", buffMultiplier, "line", win);
    dispatchSignal(
      state,
      currentBet,
      working,
      registrations,
      { type: "LINE_AWARDED", win },
      appliedOrigin,
      appliedMotorGenerated
    );
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
  const remainingEntryIds = working.entryIds[reel].filter((_entryId, index) => !unique.has(index));
  const remainingTemporaryEntries = working.temporaryEntries[reel].filter((_temporary, index) => !unique.has(index));
  working.strips[reel] = remaining.length > 0 ? remaining : ["blank"];
  working.entryIds[reel] = remaining.length > 0 ? remainingEntryIds : [working.nextEntryIds[reel]++];
  working.temporaryEntries[reel] = remaining.length > 0 ? remainingTemporaryEntries : [false];
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
  registrations: readonly InternalEffectHandlerRegistration[],
  slot: number,
  appliedOrigin?: InternalEffectHandlerRegistration,
  appliedMotorGenerated = false
): void {
  const part = state.partSlots[slot];
  if (part === null || part === undefined || working.disabledSlots.has(slot)) return;
  working.disabledSlots.add(slot);
  working.drafts.push({ type: "PART_DISABLED", partId: part.id, slot });
  dispatchSignal(
    state,
    currentBet,
    working,
    registrations,
    { type: "PART_DISABLED", partId: part.id },
    appliedOrigin,
    appliedMotorGenerated
  );
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
  registrations: readonly InternalEffectHandlerRegistration[],
  effect: Effect,
  appliedOrigin?: InternalEffectHandlerRegistration,
  appliedMotorGenerated = false
): void {
  switch (effect.type) {
    case "ADD_PAYOUT":
      addPayout(working, effect.amount, effect.source, buffMultiplier, "effect");
      break;
    case "TRANSFORM_CELL": {
      const from = working.grid[effect.reel][effect.row];
      if (from !== effect.symbol) {
        const sourceId = working.visibleSourceIds[effect.reel][effect.row];
        const sourceIndex = entryIndex(working, effect.reel, sourceId);
        if (sourceIndex < 0) break;
        working.strips[effect.reel][sourceIndex] = effect.symbol;
        for (const row of [0, 1, 2] as const) {
          if (working.visibleSourceIds[effect.reel][row] === sourceId) {
            working.grid[effect.reel][row] = effect.symbol;
          }
        }
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
      for (let index = 0; index < count; index += 1) {
        working.entryIds[effect.reel].push(working.nextEntryIds[effect.reel]++);
      }
      for (let index = 0; index < count; index += 1) working.temporaryEntries[effect.reel].push(false);
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
    case "REMOVE_PHYSICAL_CELLS": {
      for (const reel of [0, 1, 2] as const) {
        const indices = effect.cells
          .filter((cell) => cell.reel === reel)
          .flatMap((cell) => {
            const index = entryIndex(working, reel, cell.entryId);
            return index >= 0 && working.strips[reel][index] === cell.symbol ? [index] : [];
          });
        removeIndices(working, reel, indices);
      }
      break;
    }
    case "DISABLE_PART":
      disablePart(
        state,
        currentBet,
        working,
        registrations,
        effect.slot,
        appliedOrigin,
        appliedMotorGenerated
      );
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
      awardNewLines(
        state,
        currentBet,
        buffMultiplier,
        working,
        registrations,
        appliedOrigin,
        appliedMotorGenerated
      );
      break;
    case "INCREMENT_COUNTER": {
      const amount = Number.isFinite(effect.amount) ? Math.trunc(effect.amount) : 0;
      working.counters[effect.counter] += amount;
      break;
    }
    case "CHANGE_OMEN": {
      const amount = Number.isFinite(effect.amount) ? Math.trunc(effect.amount) : 0;
      const nextOmen = Math.max(0, working.omen + amount);
      const delta = nextOmen - working.omen;
      if (delta !== 0) {
        working.omen = nextOmen;
        working.drafts.push({ type: "RESOURCE_CHANGED", resource: "omen", delta });
      }
      break;
    }
    case "INCREMENT_SHIFT_FLAG": {
      const amount = boundedStructuralCount(effect.amount);
      if (amount === undefined) {
        triggerOverload(currentBet, working);
        break;
      }
      working.shiftFlags = {
        ...working.shiftFlags,
        [effect.flag]: Math.min(MAX_STRUCTURAL_COUNT, working.shiftFlags[effect.flag] + amount)
      };
      break;
    }
    case "SET_SHIFT_FLAG":
      working.shiftFlags = { ...working.shiftFlags, [effect.flag]: true };
      break;
  }
}

function drainEffects(
  state: RunState,
  currentBet: number,
  buffMultiplier: number,
  working: WorkingState,
  registrations: readonly InternalEffectHandlerRegistration[]
): void {
  while (working.queue.length > 0) {
    const queued = working.queue.shift()!;
    const effect = queued.effect;
    working.effectCount += 1;
    applyEffect(
      state,
      currentBet,
      buffMultiplier,
      working,
      registrations,
      effect,
      queued.origin,
      queued.motorGenerated
    );
    if (working.overloaded) return;
    if (working.effectCount >= EFFECT_LIMIT) {
      triggerOverload(currentBet, working);
      return;
    }
    dispatchSignal(
      state,
      currentBet,
      working,
      registrations,
      { type: "EFFECT_APPLIED", effect },
      queued.origin,
      queued.motorGenerated
    );
  }
}

function consumeVisibleFood(
  state: RunState,
  currentBet: number,
  working: WorkingState,
  registrations: readonly InternalEffectHandlerRegistration[]
): readonly TimedBuff[] {
  const granted: TimedBuff[] = [];
  for (const reel of [0, 1, 2] as const) {
    const foodIndices = working.grid[reel]
      .map((symbol, row) => ({ symbol, row: row as RowIndex }))
      .filter(({ symbol }) => symbol === "food")
      .map(({ row }) => entryIndex(working, reel, working.visibleSourceIds[reel][row]))
      .filter((index) => index >= 0 && working.strips[reel][index] === "food");
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

function permanentReels(working: WorkingState): ReelSet {
  return working.strips.map((strip, reel) => {
    const permanent = strip.filter((_symbol, index) => !working.temporaryEntries[reel]![index]);
    return permanent.length === 0 ? ["blank"] : permanent;
  }) as unknown as ReelSet;
}

function temporaryEntryMarkers(state: RunState, draw: ReelDraw): [boolean[], boolean[], boolean[]] {
  return draw.strips.map((strip, reel) => {
    const stateReel: unknown = (state.reels as unknown as readonly unknown[])?.[reel];
    const additions: unknown = (state.temporaryReelAdditions as unknown as readonly unknown[])?.[reel];
    const temporaryLength = Array.isArray(additions) ? additions.length : 0;
    const permanentLength = Array.isArray(stateReel)
      ? Math.min(stateReel.length, strip.length)
      : Math.max(0, strip.length - temporaryLength);
    return strip.map((_symbol, index) => index >= permanentLength && index < permanentLength + temporaryLength);
  }) as [boolean[], boolean[], boolean[]];
}

/** Resolves one accepted draw without mutating the input state or draw. */
export function resolveSpin(
  state: RunState,
  draw: ReelDraw,
  handlers: readonly EffectHandlerRegistration[] = []
): SettlementResult {
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
  const normalizedDraw = normalizeDrawIdentity(draw);
  const initialEntryIds = normalizedDraw.entryIds;
  const initialVisibleSourceIds = normalizedDraw.visibleSourceIds;
  const working: WorkingState = {
    grid: normalizedDraw.grid.map((reel) => [...reel]) as [SymbolId[], SymbolId[], SymbolId[]],
    strips: normalizedDraw.strips.map((strip) => [...strip]) as [SymbolId[], SymbolId[], SymbolId[]],
    entryIds: initialEntryIds.map((ids) => [...ids]) as [number[], number[], number[]],
    visibleSourceIds: initialVisibleSourceIds.map((ids) => [...ids]) as WorkingState["visibleSourceIds"],
    nextEntryIds: initialEntryIds.map((ids) => Math.max(-1, ...ids) + 1) as [number, number, number],
    temporaryEntries: temporaryEntryMarkers(state, normalizedDraw),
    stops: [...normalizedDraw.stops],
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
    counters: { ...state.counters },
    shiftFlags: { ...state.shiftFlags },
    omen: state.omen,
    fruitRuntimes: new Map(
      state.partSlots.flatMap((part, slot) =>
        part !== null && isFruitPartId(part.id)
          ? [[slot, {
              initialCherryWins: state.counters.cherryWinsThisShift,
              cherryWinsSeen: 0,
              initialReturnedFoodCount: state.shiftFlags.returnedFoodCount,
              returnedFoodsSeen: 0,
              plannedFoodAdds: [0, 0, 0]
            } satisfies FruitRuntime] as const]
          : []
      )
    ),
    violentRuntimes: new Map(
      state.partSlots.flatMap((part, slot) =>
        part !== null && isViolentPartId(part.id)
          ? [[slot, { coreEffectsSeen: 0 } satisfies ViolentRuntime] as const]
          : []
      )
    )
  };

  const fruitRegistrations: InternalEffectHandlerRegistration[] = state.partSlots.flatMap((part, slot) => {
    if (part === null || !isFruitPartId(part.id)) return [];
    return [{
      kind: "part",
      slot,
      partId: part.id,
      handler: reactFruitParts,
      [INTERNAL_FRUIT_REGISTRATION]: slot
    }];
  });
  const chapelRegistrations: InternalEffectHandlerRegistration[] = state.partSlots.flatMap((part, slot) => {
    if (part === null || !isChapelPartId(part.id)) return [];
    return [{
      kind: "part",
      slot,
      partId: part.id,
      handler: reactChapelParts,
      [INTERNAL_CHAPEL_REGISTRATION]: slot
    }];
  });
  const violentRegistrations: InternalEffectHandlerRegistration[] = state.partSlots.flatMap((part, slot) => {
    if (part === null || !isViolentPartId(part.id)) return [];
    return [{
      kind: "part",
      slot,
      partId: part.id,
      handler: reactViolentParts,
      [INTERNAL_VIOLENT_REGISTRATION]: slot
    }];
  });
  const registrations: InternalEffectHandlerRegistration[] = [
    ...fruitRegistrations,
    ...chapelRegistrations,
    ...violentRegistrations,
    ...handlers.map((registration): EffectHandlerRegistration =>
      registration.kind === "system"
        ? { kind: "system", handler: registration.handler }
        : {
            kind: "part",
            slot: registration.slot,
            partId: registration.partId,
            handler: registration.handler
          }
    )
  ];

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

  const prayerSucceeded = state.pendingPrayer !== null && evaluateBaseWins(immutableGrid(working), BASE_PAYTABLE)
    .some((win) => win.symbol === state.pendingPrayer && working.awardedWinKeys.has(lineWinKey(win)));
  if (state.pendingPrayer !== null && !prayerSucceeded) {
    working.omen += 1;
    working.drafts.push({ type: "RESOURCE_CHANGED", resource: "omen", delta: 1 });
  }

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
  const resolvedReels = immutableReels(working);
  const reels = permanentReels(working);
  const grid = immutableGrid(working);
  const stops = [...working.stops] as StopSet;
  const entryIds = working.entryIds.map((ids) => [...ids]) as unknown as NonNullable<ReelDraw["entryIds"]>;
  const visibleSourceIds = working.visibleSourceIds.map((ids) => [...ids]) as unknown as NonNullable<
    ReelDraw["visibleSourceIds"]
  >;
  const resolvedDraw: ReelDraw = {
    ...normalizedDraw,
    strips: resolvedReels,
    stops,
    grid,
    entryIds,
    visibleSourceIds
  };
  const cumulativeAttribution = { ...state.attribution };
  for (const source of ATTRIBUTION_SOURCES) {
    cumulativeAttribution[source] = safeMoney(cumulativeAttribution[source] + working.attribution[source]);
  }
  const nextState: RunState = {
    ...state,
    bankroll: safeMoney(state.bankroll + working.payout),
    shiftPayout: safeMoney(state.shiftPayout + working.payout),
    reels,
    temporaryReelAdditions: [[], [], []],
    pendingPrayer: null,
    pendingSpin: state.pendingSpin === null ? null : { ...state.pendingSpin, draw: resolvedDraw },
    freeSpinQueue: working.freeSpinQueue,
    agitation,
    omen: working.omen,
    counters: working.counters,
    shiftFlags: working.shiftFlags,
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
