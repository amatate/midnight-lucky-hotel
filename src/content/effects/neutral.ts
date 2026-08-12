import { getMinimumBet, roundMoney } from "@/core/progression";
import type { BaseSymbolId, ReelIndex, ReelSet, RunState, SymbolId } from "@/core/types";

const BASE_SYMBOLS = new Set<SymbolId>(["cherry", "lemon", "bell", "seven"]);

function cloneReels(reels: ReelSet): [SymbolId[], SymbolId[], SymbolId[]] {
  return [[...reels[0]], [...reels[1]], [...reels[2]]];
}

export function isBaseSymbol(symbol: SymbolId): symbol is BaseSymbolId {
  return BASE_SYMBOLS.has(symbol);
}

export function pruneOneSymbol(reels: ReelSet, reel: ReelIndex, symbol: Exclude<SymbolId, "wild">): ReelSet | null {
  const strip = reels[reel];
  if (strip.length <= 6) return null;
  const index = strip.indexOf(symbol);
  if (index < 0) return null;
  const next = cloneReels(reels);
  next[reel].splice(index, 1);
  return next;
}

export function copyBaseSymbol(reels: ReelSet, reel: ReelIndex, symbol: BaseSymbolId): ReelSet {
  const next = cloneReels(reels);
  next[reel].push(symbol, symbol);
  return next;
}

export interface SafetyFuseResult {
  readonly state: RunState;
  readonly consumed: boolean;
  readonly payout: number;
}

/** Returns the leftmost fuse's rescue payout without consuming or mutating it. */
export function getSafetyFuseRescuePayout(state: RunState): number {
  if (state.bankroll >= getMinimumBet(state)) return 0;
  const fuse = state.partSlots.find((part) => part?.id === "safety-fuse");
  return fuse === undefined || fuse === null ? 0 : fuse.level === 2 ? 40 : 20;
}

/** Consumes the leftmost safety fuse once when bankroll is strictly below the minimum bet. */
export function consumeSafetyFuse(state: RunState): SafetyFuseResult {
  const payout = getSafetyFuseRescuePayout(state);
  if (payout === 0) return { state, consumed: false, payout: 0 };

  const slot = state.partSlots.findIndex((part) => part?.id === "safety-fuse");
  if (slot < 0) return { state, consumed: false, payout: 0 };
  const partSlots = state.partSlots.map((part, index) => (index === slot ? null : part)) as unknown as RunState["partSlots"];
  return {
    consumed: true,
    payout,
    state: {
      ...state,
      bankroll: roundMoney(state.bankroll + payout),
      shiftPayout: roundMoney(state.shiftPayout + payout),
      attribution: { ...state.attribution, part: roundMoney(state.attribution.part + payout) },
      partSlots
    }
  };
}
