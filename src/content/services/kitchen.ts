import type { DispatchResult } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { roundMoney } from "@/core/progression";
import type { ReelIndex, RunState } from "@/core/types";

function rejected(
  state: RunState,
  code: "INVALID_PHASE" | "INSUFFICIENT_FUNDS" | "INVALID_TARGET" | "RESOURCE_EXHAUSTED",
  message: string
): DispatchResult {
  return { ok: false, state, error: { code, message } };
}

function isReelIndex(value: number): value is ReelIndex {
  return value === 0 || value === 1 || value === 2;
}

/** Buys the kitchen's once-per-shift food and appends it to one selected reel. */
export function buyFood(state: RunState, reel: ReelIndex): DispatchResult {
  if (state.phase !== "READY_TO_SPIN") {
    return rejected(state, "INVALID_PHASE", `BUY_FOOD is invalid during ${state.phase}`);
  }
  if (state.pendingSpin !== null) {
    return rejected(state, "INVALID_PHASE", "BUY_FOOD requires no pending spin");
  }
  if (state.baseSpinsInShift !== 0) {
    return rejected(state, "RESOURCE_EXHAUSTED", "food is only available before the first base spin");
  }
  if (state.service !== "kitchen") {
    return rejected(state, "INVALID_TARGET", "kitchen service is not equipped");
  }
  if (state.shiftFlags.foodBought) {
    return rejected(state, "RESOURCE_EXHAUSTED", "food was already bought this shift");
  }
  if (state.bankroll < 10) {
    return rejected(state, "INSUFFICIENT_FUNDS", "bankroll is below the kitchen cost");
  }
  if (!isReelIndex(reel)) {
    return rejected(state, "INVALID_TARGET", "reel index must be 0, 1, or 2");
  }

  const command = { type: "BUY_FOOD", reelIndex: reel } as const;
  const event = {
    sequence: state.pendingEvents.length + 1,
    type: "SERVICE_USED",
    serviceId: "kitchen",
    cost: 10
  } as const satisfies GameEvent;
  const reels = state.reels.map((strip, reelIndex) =>
    reelIndex === reel ? [...strip, "food"] : [...strip]
  ) as unknown as RunState["reels"];

  return {
    ok: true,
    events: [event],
    state: {
      ...state,
      bankroll: roundMoney(state.bankroll - 10),
      reels,
      shiftFlags: { ...state.shiftFlags, foodBought: true },
      expenses: { ...state.expenses, kitchen: roundMoney(state.expenses.kitchen + 10) },
      pendingEvents: [...state.pendingEvents, event],
      commandHistory: [...state.commandHistory, command]
    }
  };
}
