import type { DispatchResult } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { advanceReel, normalizeDrawIdentity } from "@/core/reels";
import type { ReelDraw, ReelIndex, ReelWindow, RunState, SymbolId } from "@/core/types";

function rejected(
  state: RunState,
  code: "INVALID_PHASE" | "INVALID_TARGET" | "RESOURCE_EXHAUSTED",
  message: string
): DispatchResult {
  return { ok: false, state, error: { code, message } };
}

function isReelIndex(value: number): value is ReelIndex {
  return value === 0 || value === 1 || value === 2;
}

function looseSpring(state: RunState): { readonly steps: number; readonly cracks: number } {
  const spring = state.partSlots.find((part) => part?.id === "loose-spring");
  if (spring === undefined || spring === null) return { steps: 1, cracks: 1 };
  return { steps: spring.level === 1 ? 2 : 3, cracks: 2 };
}

function legalityError(
  state: RunState,
  reel: number
): { readonly code: "INVALID_PHASE" | "INVALID_TARGET" | "RESOURCE_EXHAUSTED"; readonly message: string } | null {
  if (state.phase !== "AWAITING_INTERVENTION") {
    return { code: "INVALID_PHASE", message: `KICK_REEL is invalid during ${state.phase}` };
  }
  if (!isReelIndex(reel)) return { code: "INVALID_TARGET", message: "reel index must be 0, 1, or 2" };
  if (state.service !== "security") return { code: "INVALID_TARGET", message: "security service is not equipped" };
  if (state.pendingSpin === null) return { code: "INVALID_TARGET", message: "there is no pending spin" };
  if (state.interventionUsedThisSpin) {
    return { code: "RESOURCE_EXHAUSTED", message: "an intervention was already used this spin" };
  }
  if (state.shiftFlags.kickUsed) {
    return { code: "RESOURCE_EXHAUSTED", message: "kick was already used this shift" };
  }
  if (state.pendingSpin.draw.strips[reel].length === 0) {
    return { code: "INVALID_TARGET", message: "selected reel has no symbols" };
  }
  return null;
}

function kickPreviewDraw(state: RunState, reel: ReelIndex): ReelDraw {
  return advanceReel(state.pendingSpin!.draw, reel, looseSpring(state).steps);
}

/** Returns the exact window a currently legal deterministic kick would show. */
export function previewKick(state: RunState, reel: ReelIndex): ReelWindow {
  const error = legalityError(state, reel);
  if (error !== null) {
    if (error.code === "INVALID_TARGET" && !isReelIndex(reel)) throw new RangeError(error.message);
    throw new Error(error.message);
  }
  return kickPreviewDraw(state, reel).grid[reel];
}

function insertPermanentCracks(
  state: RunState,
  draw: ReelDraw,
  reel: ReelIndex,
  count: number
): { readonly draw: ReelDraw; readonly reels: RunState["reels"] } {
  const permanentLength = state.reels[reel].length;
  const cracks = Array.from({ length: count }, (): SymbolId => "crack");
  const currentEntryIds = normalizeDrawIdentity(draw).entryIds;
  const nextEntryId = Math.max(-1, ...currentEntryIds[reel]) + 1;
  const crackEntryIds = Array.from({ length: count }, (_unused, index) => nextEntryId + index);
  const strips = draw.strips.map((strip, index) =>
    index === reel
      ? [...strip.slice(0, permanentLength), ...cracks, ...strip.slice(permanentLength)]
      : [...strip]
  ) as unknown as ReelDraw["strips"];
  const entryIds = currentEntryIds.map((ids, index) =>
    index === reel
      ? [...ids.slice(0, permanentLength), ...crackEntryIds, ...ids.slice(permanentLength)]
      : [...ids]
  ) as unknown as NonNullable<ReelDraw["entryIds"]>;
  const reels = state.reels.map((strip, index) =>
    index === reel ? [...strip, ...cracks] : [...strip]
  ) as unknown as RunState["reels"];
  return { draw: { ...draw, strips, entryIds }, reels };
}

/** Advances one selected pending reel deterministically and appends permanent crack damage. */
export function kickReel(state: RunState, reel: ReelIndex): DispatchResult {
  const error = legalityError(state, reel);
  if (error !== null) return rejected(state, error.code, error.message);

  const command = { type: "KICK_REEL", reelIndex: reel } as const;
  const moved = kickPreviewDraw(state, reel);
  const damaged = insertPermanentCracks(state, moved, reel, looseSpring(state).cracks);
  const draw = damaged.draw;
  const events = [
    {
      sequence: state.pendingEvents.length + 1,
      type: "INTERVENTION_USED",
      kind: "kick",
      target: reel
    },
    {
      sequence: state.pendingEvents.length + 2,
      type: "REELS_DRAWN",
      draw
    }
  ] as const satisfies readonly GameEvent[];

  return {
    ok: true,
    events,
    state: {
      ...state,
      phase: "SPINNING",
      reels: damaged.reels,
      pendingSpin: { ...state.pendingSpin!, draw },
      interventionUsedThisSpin: true,
      shiftFlags: { ...state.shiftFlags, kickUsed: true },
      pendingEvents: [...state.pendingEvents, ...events],
      commandHistory: [...state.commandHistory, command]
    }
  };
}
