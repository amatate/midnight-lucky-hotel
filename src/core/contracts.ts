import { nextInt } from "@/core/random";
import type { GameEvent } from "@/core/events";
import type { BaseSymbolId, ContractId, ContractState, RngState, RunState } from "@/core/types";

export interface ContractTemplate {
  readonly id: ContractId;
  readonly canGenerate: (state: RunState) => boolean;
}

const BASE_SYMBOLS = ["cherry", "lemon", "bell", "seven"] as const;

function remainingBaseSpins(state: RunState): number {
  return Math.max(0, 3 - state.baseSpinsInShift);
}

function commonBaseSymbols(state: RunState): readonly BaseSymbolId[] {
  return BASE_SYMBOLS.filter((symbol) => state.reels.every((strip) => strip.includes(symbol)));
}

export const CONTRACT_TEMPLATES = [
  { id: "combination", canGenerate: (state) => remainingBaseSpins(state) > 0 && commonBaseSymbols(state).length > 0 },
  { id: "discipline", canGenerate: (state) => remainingBaseSpins(state) > 0 },
  {
    id: "rescue",
    canGenerate: (state) => remainingBaseSpins(state) > 0 && state.interventionPoints > 0 && state.reels.some((strip) => strip.length > 1)
  }
] as const satisfies readonly ContractTemplate[];

export interface ContractResult {
  readonly contract: ContractState;
  readonly rng: RngState;
}

/** Selects one currently completable template while consuming exactly one RNG draw. */
export function generateContract(state: RunState): ContractResult {
  const eligible = CONTRACT_TEMPLATES.filter((template) => template.canGenerate(state));
  const pool = eligible.length > 0 ? eligible : [CONTRACT_TEMPLATES[1]];
  const selected = nextInt(state.rng, pool.length);
  const id = pool[selected.value]!.id;
  const symbols = commonBaseSymbols(state);
  const targetSymbol = id === "combination" ? symbols[selected.value % symbols.length] : undefined;
  const maxTarget = Math.max(1, Math.min(3, remainingBaseSpins(state)));
  return {
    contract: {
      id,
      ...(targetSymbol === undefined ? {} : { targetSymbol }),
      target: id === "combination" ? 1 + (selected.value % maxTarget) : 1,
      progress: 0,
      completed: false,
      rewardClaimed: false,
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
