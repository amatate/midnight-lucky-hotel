import type { DispatchResult } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { roundMoney } from "@/core/progression";
import type { BaseSymbolId, RunState } from "@/core/types";

function rejected(
  state: RunState,
  code: "INVALID_PHASE" | "INSUFFICIENT_FUNDS" | "INVALID_TARGET" | "RESOURCE_EXHAUSTED",
  message: string
): DispatchResult {
  return { ok: false, state, error: { code, message } };
}

function isBaseSymbol(symbol: string): symbol is BaseSymbolId {
  return symbol === "cherry" || symbol === "lemon" || symbol === "bell" || symbol === "seven";
}

/** Uses the chapel's once-per-shift prayer on the next reel draw. */
export function pray(state: RunState, symbol: BaseSymbolId): DispatchResult {
  if (state.phase !== "READY_TO_SPIN") {
    return rejected(state, "INVALID_PHASE", `PRAY is invalid during ${state.phase}`);
  }
  if (state.pendingSpin !== null) return rejected(state, "INVALID_PHASE", "PRAY requires no pending spin");
  if (state.service !== "chapel") return rejected(state, "INVALID_TARGET", "chapel service is not equipped");
  if (state.shiftFlags.prayerUsed) {
    return rejected(state, "RESOURCE_EXHAUSTED", "prayer was already used this shift");
  }
  if (state.interventionPoints <= 0) {
    return rejected(state, "RESOURCE_EXHAUSTED", "no intervention points remain");
  }
  if (!isBaseSymbol(symbol)) return rejected(state, "INVALID_TARGET", "prayer requires a base symbol");

  const command = { type: "PRAY", symbol } as const;
  const events = [
    {
      sequence: state.pendingEvents.length + 1,
      type: "INTERVENTION_USED",
      kind: "prayer",
      target: symbol
    },
    {
      sequence: state.pendingEvents.length + 2,
      type: "RESOURCE_CHANGED",
      resource: "focus",
      delta: -1
    }
  ] as const satisfies readonly GameEvent[];
  const additions = [[symbol, symbol], [symbol, symbol], [symbol, symbol]] as const;

  return {
    ok: true,
    events,
    state: {
      ...state,
      interventionPoints: state.interventionPoints - 1,
      interventionUsedThisSpin: true,
      temporaryReelAdditions: additions,
      pendingPrayer: symbol,
      shiftFlags: { ...state.shiftFlags, prayerUsed: true },
      pendingEvents: [...state.pendingEvents, ...events],
      commandHistory: [...state.commandHistory, command]
    }
  };
}

/** Pays the martyr coin's once-per-shift offering before the first base spin. */
export function enableMartyr(state: RunState): DispatchResult {
  const command = { type: "ENABLE_MARTYR" } as const;
  if (state.phase !== "READY_TO_SPIN") {
    return rejected(state, "INVALID_PHASE", `${command.type} is invalid during ${state.phase}`);
  }
  if (state.pendingSpin !== null) {
    return rejected(state, "INVALID_PHASE", "ENABLE_MARTYR requires no pending spin");
  }
  if (state.baseSpinsInShift !== 0) {
    return rejected(state, "RESOURCE_EXHAUSTED", "martyr coin is only available before the first base spin");
  }
  if (state.shiftFlags.martyrEnabled) {
    return rejected(state, "RESOURCE_EXHAUSTED", "martyr coin was already enabled this shift");
  }
  if (!state.partSlots.some((part) => part?.id === "martyr-coin")) {
    return rejected(state, "INVALID_TARGET", "martyr coin is not equipped");
  }
  const cost = Number.isFinite(state.bankroll) && state.bankroll > 0 ? Math.ceil(state.bankroll * 0.1) : 0;
  if (cost <= 0 || state.bankroll < cost) {
    return rejected(state, "INSUFFICIENT_FUNDS", "bankroll is below the martyr offering");
  }

  const event = {
    sequence: state.pendingEvents.length + 1,
    type: "SERVICE_USED",
    serviceId: "chapel",
    cost
  } as const satisfies GameEvent;

  return {
    ok: true,
    events: [event],
    state: {
      ...state,
      bankroll: roundMoney(state.bankroll - cost),
      shiftFlags: { ...state.shiftFlags, martyrEnabled: true },
      expenses: { ...state.expenses, chapel: roundMoney(state.expenses.chapel + cost) },
      pendingEvents: [...state.pendingEvents, event],
      commandHistory: [...state.commandHistory, command]
    }
  };
}
