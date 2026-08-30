import { describe, expect, it } from "vitest";
import { availableInterventions } from "@/app/intervention-options";
import type { GameCommand } from "@/core/commands";
import { createRun, dispatchCommand } from "@/core/run";
import type { RunState, ServiceId } from "@/core/types";

const CANDIDATES = [
  { type: "RESPIN_REEL", reelIndex: 0 },
  { type: "RESPIN_REEL", reelIndex: 1 },
  { type: "RESPIN_REEL", reelIndex: 2 },
  { type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex: 0 },
  { type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex: 1 },
  { type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex: 2 },
  { type: "KICK_REEL", reelIndex: 0 },
  { type: "KICK_REEL", reelIndex: 1 },
  { type: "KICK_REEL", reelIndex: 2 }
] as const satisfies readonly GameCommand[];

function accept<T extends { readonly ok: boolean }>(result: T): Extract<T, { readonly ok: true }> {
  if (!result.ok) throw new Error("fixture command failed");
  return result as Extract<T, { readonly ok: true }>;
}

function awaitingState(seed: number, service: ServiceId): RunState {
  const alternatives = (["kitchen", "chapel", "repair", "security"] as const).filter((candidate) => candidate !== service);
  let state: RunState = {
    ...createRun(seed),
    serviceCandidates: [service, alternatives[0]!, alternatives[1]!]
  };
  state = accept(dispatchCommand(state, { type: "SELECT_SERVICE", serviceId: service })).state;
  state = accept(dispatchCommand(state, { type: "SPIN" })).state;
  return accept(dispatchCommand(state, { type: "REELS_STOPPED" })).state;
}

function withShortStrips(state: RunState, lengths: readonly [number, number, number]): RunState {
  const strips = lengths.map((length, reel) => Array.from({ length }, () => state.pendingSpin!.draw.strips[reel]![0]!)) as unknown as NonNullable<RunState["pendingSpin"]>["draw"]["strips"];
  return {
    ...state,
    pendingSpin: {
      ...state.pendingSpin!,
      draw: { ...state.pendingSpin!.draw, strips }
    }
  };
}

describe("availableInterventions", () => {
  it.each([
    {
      name: "normal focus",
      state: () => awaitingState(301, "kitchen"),
      expected: CANDIDATES.slice(0, 3)
    },
    {
      name: "no focus",
      state: () => ({ ...awaitingState(302, "kitchen"), interventionPoints: 0 }),
      expected: []
    },
    {
      name: "repair service",
      state: () => awaitingState(303, "repair"),
      expected: CANDIDATES.slice(0, 6)
    },
    {
      name: "security service",
      state: () => awaitingState(304, "security"),
      expected: [...CANDIDATES.slice(0, 3), ...CANDIDATES.slice(6)]
    },
    {
      name: "already used",
      state: () => ({ ...awaitingState(305, "security"), interventionUsedThisSpin: true }),
      expected: []
    },
    {
      name: "one malformed short strip",
      state: () => withShortStrips(awaitingState(306, "kitchen"), [1, 2, 2]),
      expected: CANDIDATES.slice(1, 3)
    },
    {
      name: "three malformed short strips",
      state: () => withShortStrips(awaitingState(307, "kitchen"), [1, 1, 1]),
      expected: []
    }
  ])("matches real immutable controller acceptance for $name", ({ state: makeState, expected }) => {
    const state = makeState();
    const before = structuredClone(state);

    const available = availableInterventions(state);

    expect(available).toEqual(expected);
    expect(available).not.toContainEqual({ type: "ACCEPT_OUTCOME" });
    for (const command of CANDIDATES) {
      expect(available.some((candidate) => JSON.stringify(candidate) === JSON.stringify(command)))
        .toBe(dispatchCommand(state, command).ok);
    }
    expect(state).toEqual(before);
  });
});
