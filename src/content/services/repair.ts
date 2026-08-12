import type { DispatchResult } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { nextInt } from "@/core/random";
import { advanceReel, normalizeDrawIdentity } from "@/core/reels";
import type { ReelIndex, RunState, SymbolId } from "@/core/types";

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

/** Locks one pending reel and independently resamples the other two exactly once. */
export function lockAndRespinOthers(state: RunState, lockedReelIndex: ReelIndex): DispatchResult {
  if (state.phase !== "AWAITING_INTERVENTION") {
    return rejected(state, "INVALID_PHASE", `LOCK_AND_RESPIN_OTHERS is invalid during ${state.phase}`);
  }
  if (!isReelIndex(lockedReelIndex)) return rejected(state, "INVALID_TARGET", "reel index must be 0, 1, or 2");
  if (state.service !== "repair") return rejected(state, "INVALID_TARGET", "repair service is not equipped");
  if (state.pendingSpin === null) return rejected(state, "INVALID_TARGET", "there is no pending spin");
  if (state.interventionUsedThisSpin) {
    return rejected(state, "RESOURCE_EXHAUSTED", "an intervention was already used this spin");
  }
  if (state.shiftFlags.repairLockUsed) {
    return rejected(state, "RESOURCE_EXHAUSTED", "repair lock was already used this shift");
  }
  if (state.interventionPoints <= 0) return rejected(state, "RESOURCE_EXHAUSTED", "no intervention points remain");

  let draw = normalizeDrawIdentity(state.pendingSpin.draw);
  let rng = state.rng;
  for (const reel of [0, 1, 2] as const) {
    if (reel === lockedReelIndex) continue;
    const length = draw.strips[reel].length;
    const sampled = nextInt(rng, Math.max(1, length - 1));
    rng = sampled.rng;
    if (length > 1) draw = normalizeDrawIdentity(advanceReel(draw, reel, sampled.value + 1));
  }
  draw = { ...draw, rng };
  const command = { type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex } as const;
  const events = [
    { sequence: state.pendingEvents.length + 1, type: "INTERVENTION_USED", kind: "repair-lock", target: lockedReelIndex },
    { sequence: state.pendingEvents.length + 2, type: "REELS_DRAWN", draw }
  ] as const satisfies readonly GameEvent[];

  return {
    ok: true,
    events,
    state: {
      ...state,
      phase: "SPINNING",
      rng,
      pendingSpin: { ...state.pendingSpin, draw },
      interventionPoints: state.interventionPoints - 1,
      interventionUsedThisSpin: true,
      shiftFlags: { ...state.shiftFlags, repairLockUsed: true },
      pendingEvents: [...state.pendingEvents, ...events],
      commandHistory: [...state.commandHistory, command]
    }
  };
}

/** Removes up to two literal permanent cracks from one reel for exactly one tip. */
export function removeCracks(state: RunState, reelIndex: ReelIndex): DispatchResult {
  const boundary = state.phase === "CHOOSING_UPGRADE" || state.phase === "SHIFT_COMPLETE" || state.phase === "AFTER_HOURS";
  if (!boundary || state.pendingSpin !== null) {
    return rejected(state, "INVALID_PHASE", `REMOVE_CRACKS is invalid during ${state.phase}`);
  }
  if (!isReelIndex(reelIndex)) return rejected(state, "INVALID_TARGET", "reel index must be 0, 1, or 2");
  if (state.service !== "repair") return rejected(state, "INVALID_TARGET", "repair service is not equipped");
  if (state.tips < 1) return rejected(state, "RESOURCE_EXHAUSTED", "no tips remain");
  if (!state.reels[reelIndex].includes("crack")) {
    return rejected(state, "INVALID_TARGET", "selected reel has no permanent cracks");
  }

  let removed = 0;
  const repaired = state.reels[reelIndex].filter((symbol) => {
    if (symbol === "crack" && removed < 2) {
      removed += 1;
      return false;
    }
    return true;
  });
  const reels = state.reels.map((strip, reel) =>
    reel === reelIndex ? (repaired.length === 0 ? ["blank"] : repaired) : [...strip]
  ) as [SymbolId[], SymbolId[], SymbolId[]];
  const command = { type: "REMOVE_CRACKS", reelIndex } as const;
  const event = {
    sequence: state.pendingEvents.length + 1,
    type: "RESOURCE_CHANGED",
    resource: "tips",
    delta: -1
  } as const satisfies GameEvent;
  return {
    ok: true,
    events: [event],
    state: {
      ...state,
      tips: state.tips - 1,
      reels,
      pendingEvents: [...state.pendingEvents, event],
      commandHistory: [...state.commandHistory, command]
    }
  };
}
