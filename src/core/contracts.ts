import { BASE_PAYTABLE } from "@/content/base-machine";
import { getSafetyFuseRescuePayout } from "@/content/effects/neutral";
import type { GameEvent } from "@/core/events";
import { evaluateBaseWins, PAYLINES } from "@/core/paylines";
import { getCurrentBet, getMinimumBet, roundMoney } from "@/core/progression";
import { nextInt } from "@/core/random";
import type {
  BaseSymbolId,
  ContractId,
  ContractState,
  Grid,
  ReelIndex,
  ReelStrip,
  ReelWindow,
  RngState,
  RunState
} from "@/core/types";

export interface ContractTemplate {
  readonly id: ContractId;
  readonly canGenerate: (state: RunState) => boolean;
}

export interface ContractResult {
  readonly contract: ContractState;
  readonly rng: RngState;
}

interface WindowWitness {
  readonly key: string;
  readonly window: ReelWindow;
}

interface ContractWitnesses {
  readonly combinationSymbols: readonly BaseSymbolId[];
  readonly discipline: boolean;
  readonly rescue: boolean;
}

const BASE_SYMBOLS = ["cherry", "lemon", "bell", "seven"] as const;
/** Bounds exact Cartesian searches while analytic combination checks remain available for evolved reels. */
const MAX_EXACT_WINDOW_TRIPLES = 50_000;
const MAX_EXACT_RESCUE_TRANSITIONS = 1_000_000;
const MAX_EXACT_REPAIR_TRANSITIONS = 100_000;

function remainingBaseSpins(state: RunState): number {
  return Math.max(0, 3 - state.baseSpinsInShift);
}

function hasPlayableFuturePull(state: RunState): boolean {
  if (state.freeSpinQueue > 0) return true;
  const minimumBet = getMinimumBet(state);
  if (state.bankroll >= minimumBet) return true;
  const fusePayout = getSafetyFuseRescuePayout(state);
  return fusePayout > 0 && roundMoney(state.bankroll + fusePayout) >= minimumBet;
}

function inertContract(state: RunState, rng: RngState): ContractResult {
  return {
    contract: {
      id: "discipline",
      target: 0,
      progress: 0,
      completed: true,
      rewardClaimed: true,
      startBankroll: state.bankroll,
      interventionsUsed: 0
    },
    rng
  };
}

function windowAt(strip: ReelStrip, stop: number): ReelWindow {
  const safe = strip.length === 0 ? (["blank"] as const) : strip;
  return [safe[stop % safe.length]!, safe[(stop + 1) % safe.length]!, safe[(stop + 2) % safe.length]!];
}

function windowKey(window: ReelWindow): string {
  return window.join("|");
}

function uniqueWindows(strip: ReelStrip): readonly WindowWitness[] {
  const safe = strip.length === 0 ? (["blank"] as const) : strip;
  const unique = new Map<string, WindowWitness>();
  for (let stop = 0; stop < safe.length; stop += 1) {
    const window = windowAt(safe, stop);
    const key = windowKey(window);
    if (!unique.has(key)) unique.set(key, { key, window });
  }
  return [...unique.values()];
}

function exactSearchIsBounded(windows: readonly (readonly WindowWitness[])[]): boolean {
  return windows.reduce((product, reel) => product * reel.length, 1) <= MAX_EXACT_WINDOW_TRIPLES;
}

function gridOf(first: WindowWitness, second: WindowWitness, third: WindowWitness): Grid {
  return [first.window, second.window, third.window];
}

function isPaying(grid: Grid): boolean {
  return evaluateBaseWins(grid, BASE_PAYTABLE).length > 0;
}

function witnessedCombinationSymbols(windows: readonly (readonly WindowWitness[])[]): readonly BaseSymbolId[] {
  return BASE_SYMBOLS.filter((symbol) => PAYLINES.some((line) => {
    let hasLiteral = false;
    for (const [reel, row] of line.cells) {
      const cells = windows[reel]!.map((candidate) => candidate.window[row]);
      if (!cells.some((cell) => cell === symbol || cell === "wild")) return false;
      if (cells.includes(symbol)) hasLiteral = true;
    }
    return hasLiteral;
  }));
}

function maxReachableBasePayout(state: RunState, windows: readonly (readonly WindowWitness[])[]): number | null {
  if (!exactSearchIsBounded(windows)) return null;
  const bet = getCurrentBet(state);
  let maximum = 0;
  for (const first of windows[0]!) {
    for (const second of windows[1]!) {
      for (const third of windows[2]!) {
        const multiplier = evaluateBaseWins(gridOf(first, second, third), BASE_PAYTABLE)
          .reduce((total, win) => total + win.multiplier, 0);
        maximum = Math.max(maximum, roundMoney(multiplier * bet));
      }
    }
  }
  return maximum;
}

function disciplineHasWitness(state: RunState, windows: readonly (readonly WindowWitness[])[]): boolean {
  const remaining = remainingBaseSpins(state);
  if (state.baseSpinsInShift !== 0 || remaining === 0) return false;
  const maximum = maxReachableBasePayout(state, windows);
  if (maximum === null) return false;
  const paidWagers = roundMoney(getCurrentBet(state) * remaining);
  const reachablePayout = roundMoney(maximum * (remaining + state.freeSpinQueue));
  return reachablePayout >= paidWagers;
}

function replaceWindow(grid: Grid, reel: ReelIndex, window: ReelWindow): Grid {
  const next = [...grid] as [ReelWindow, ReelWindow, ReelWindow];
  next[reel] = window;
  return next;
}

function respinCanRescue(
  state: RunState,
  windows: readonly (readonly WindowWitness[])[],
  accepted: readonly [WindowWitness, WindowWitness, WindowWitness]
): boolean {
  if (state.interventionPoints <= 0) return false;
  const grid = gridOf(...accepted);
  for (const reel of [0, 1, 2] as const) {
    for (const alternative of windows[reel]!) {
      if (alternative.key !== accepted[reel].key && isPaying(replaceWindow(grid, reel, alternative.window))) return true;
    }
  }
  return false;
}

function repairSearchIsBounded(windows: readonly (readonly WindowWitness[])[]): boolean {
  const triples = windows.reduce((product, reel) => product * reel.length, 1);
  const alternatives = [0, 1, 2].reduce((total, locked) => {
    const unlocked = [0, 1, 2].filter((reel) => reel !== locked);
    return total + Math.max(0, windows[unlocked[0]!]!.length - 1) * Math.max(0, windows[unlocked[1]!]!.length - 1);
  }, 0);
  return triples * alternatives <= MAX_EXACT_REPAIR_TRANSITIONS;
}

function repairCanRescue(
  state: RunState,
  windows: readonly (readonly WindowWitness[])[],
  accepted: readonly [WindowWitness, WindowWitness, WindowWitness]
): boolean {
  if (
    state.service !== "repair" || state.interventionPoints <= 0 || state.shiftFlags.repairLockUsed ||
    !repairSearchIsBounded(windows)
  ) return false;
  for (const locked of [0, 1, 2] as const) {
    const unlocked = [0, 1, 2].filter((reel): reel is ReelIndex => reel !== locked);
    for (const first of windows[unlocked[0]!]!) {
      if (first.key === accepted[unlocked[0]!].key) continue;
      for (const second of windows[unlocked[1]!]!) {
        if (second.key === accepted[unlocked[1]!].key) continue;
        const next = [...accepted] as [WindowWitness, WindowWitness, WindowWitness];
        next[unlocked[0]!] = first;
        next[unlocked[1]!] = second;
        if (isPaying(gridOf(...next))) return true;
      }
    }
  }
  return false;
}

function securityKickCanRescue(
  state: RunState,
  accepted: readonly [WindowWitness, WindowWitness, WindowWitness]
): boolean {
  if (state.service !== "security" || state.shiftFlags.kickUsed) return false;
  const spring = state.partSlots.find((part) => part?.id === "loose-spring");
  const steps = spring === undefined || spring === null ? 1 : spring.level === 1 ? 2 : 3;
  for (const reel of [0, 1, 2] as const) {
    const strip = state.reels[reel];
    const beforeKey = accepted[reel].key;
    for (let stop = 0; stop < strip.length; stop += 1) {
      if (windowKey(windowAt(strip, stop)) !== beforeKey) continue;
      const kicked = windowAt(strip, (stop + steps) % strip.length);
      if (isPaying(replaceWindow(gridOf(...accepted), reel, kicked))) return true;
    }
  }
  return false;
}

function rescueHasWitness(state: RunState, windows: readonly (readonly WindowWitness[])[]): boolean {
  const triples = windows.reduce((product, reel) => product * reel.length, 1);
  const standardTransitions = triples * windows.reduce((total, reel) => total + reel.length, 0);
  const securityTransitions = state.service === "security"
    ? triples * state.reels.reduce((total, strip) => total + strip.length, 0)
    : 0;
  if (
    remainingBaseSpins(state) === 0 || !exactSearchIsBounded(windows) ||
    standardTransitions + securityTransitions > MAX_EXACT_RESCUE_TRANSITIONS
  ) return false;
  for (const first of windows[0]!) {
    for (const second of windows[1]!) {
      for (const third of windows[2]!) {
        const accepted = [first, second, third] as const;
        if (isPaying(gridOf(...accepted))) continue;
        if (
          respinCanRescue(state, windows, accepted) ||
          repairCanRescue(state, windows, accepted) ||
          securityKickCanRescue(state, accepted)
        ) return true;
      }
    }
  }
  return false;
}

/** Builds deterministic, RNG-free witnesses from the permanent reel geometry and current block economy. */
function findContractWitnesses(state: RunState): ContractWitnesses {
  const windows = state.reels.map(uniqueWindows) as [
    readonly WindowWitness[],
    readonly WindowWitness[],
    readonly WindowWitness[]
  ];
  return {
    combinationSymbols: remainingBaseSpins(state) > 0 ? witnessedCombinationSymbols(windows) : [],
    discipline: disciplineHasWitness(state, windows),
    rescue: rescueHasWitness(state, windows)
  };
}

export const CONTRACT_TEMPLATES = [
  { id: "combination", canGenerate: (state) => findContractWitnesses(state).combinationSymbols.length > 0 },
  { id: "discipline", canGenerate: (state) => findContractWitnesses(state).discipline },
  { id: "rescue", canGenerate: (state) => findContractWitnesses(state).rescue }
] as const satisfies readonly ContractTemplate[];

/** Selects one concretely witnessed contract while consuming exactly one RNG draw. */
export function generateContract(state: RunState): ContractResult {
  const remaining = remainingBaseSpins(state);
  if (remaining === 0 || !hasPlayableFuturePull(state)) {
    const selected = nextInt(state.rng, 1);
    return inertContract(state, selected.rng);
  }

  const witnesses = findContractWitnesses(state);
  const choices: readonly { readonly id: ContractId; readonly targetSymbol?: BaseSymbolId }[] = [
    ...witnesses.combinationSymbols.map((targetSymbol) => ({ id: "combination" as const, targetSymbol })),
    ...(witnesses.discipline ? [{ id: "discipline" as const }] : []),
    ...(witnesses.rescue ? [{ id: "rescue" as const }] : [])
  ];
  const pool = choices.length > 0 ? choices : [{ id: "discipline" as const }];
  const selected = nextInt(state.rng, pool.length);
  const choice = pool[selected.value]!;
  const inertFallback = choices.length === 0;
  return {
    contract: {
      id: choice.id,
      ...(choice.targetSymbol === undefined ? {} : { targetSymbol: choice.targetSymbol }),
      target: inertFallback ? 0 : 1,
      progress: 0,
      completed: inertFallback,
      rewardClaimed: inertFallback,
      startBankroll: state.bankroll,
      interventionsUsed: 0
    },
    rng: selected.rng
  };
}

/** Reduces only committed game events into immutable contract progress. */
export function updateContract(contract: ContractState, events: readonly GameEvent[]): ContractState {
  if (contract.completed) return contract;
  const interventions = events.filter((event) => event.type === "INTERVENTION_USED").length;
  const interventionsUsed = contract.interventionsUsed + interventions;
  let progress = contract.progress;

  if (contract.id === "combination") {
    progress += events.filter(
      (event) => event.type === "LINE_WIN" && event.source === "base" && event.symbol === contract.targetSymbol
    ).length;
  } else if (contract.id === "discipline") {
    if (
      interventionsUsed === 0 &&
      events.some((event) => event.type === "BLOCK_COMPLETED" && event.bankroll >= contract.startBankroll)
    ) progress = contract.target;
  } else if (events.some(
    (event) => event.type === "SPIN_COMMITTED" && event.interventionUsed && !event.preInterventionPaying && event.finalPayout > 0
  )) {
    progress = contract.target;
  }

  progress = Math.min(contract.target, progress);
  return { ...contract, progress, interventionsUsed, completed: progress >= contract.target };
}
