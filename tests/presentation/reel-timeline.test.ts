import { describe, expect, it } from "vitest";
import { dispatchCommand, createRun } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { RunState, ServiceId } from "@/core/types";
import { reelMotionPlan } from "@/presentation/reel-timeline";

function accept<T extends { readonly ok: boolean }>(result: T): Extract<T, { readonly ok: true }> {
  if (!result.ok) throw new Error("fixture command failed");
  return result as Extract<T, { readonly ok: true }>;
}

function spinningState(seed: number, service: ServiceId, intervention?: GameCommand): RunState {
  const alternatives = (["kitchen", "chapel", "repair", "security"] as const).filter((candidate) => candidate !== service);
  let state: RunState = {
    ...createRun(seed),
    serviceCandidates: [service, alternatives[0]!, alternatives[1]!]
  };
  state = accept(dispatchCommand(state, { type: "SELECT_SERVICE", serviceId: service })).state;
  state = accept(dispatchCommand(state, { type: "SPIN" })).state;
  if (intervention === undefined) return state;
  state = accept(dispatchCommand(state, { type: "REELS_STOPPED" })).state;
  return accept(dispatchCommand(state, intervention)).state;
}

const cases = [
  {
    name: "base spin",
    state: () => spinningState(401, "kitchen"),
    expected: {
      cycleKey: "2:SPIN",
      kind: "base",
      spinningReels: [0, 1, 2],
      revealAtMs: { 0: 1000, 1: 1220, 2: 1440 },
      completeAtMs: 1440
    }
  },
  {
    name: "normal respin",
    state: () => spinningState(402, "kitchen", { type: "RESPIN_REEL", reelIndex: 1 }),
    expected: {
      cycleKey: "4:RESPIN_REEL:1",
      kind: "respin",
      spinningReels: [1],
      revealAtMs: { 1: 620 },
      completeAtMs: 620
    }
  },
  {
    name: "repair lock",
    state: () => spinningState(403, "repair", { type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex: 1 }),
    expected: {
      cycleKey: "4:LOCK_AND_RESPIN_OTHERS:1",
      kind: "repair-lock",
      spinningReels: [0, 2],
      revealAtMs: { 0: 480, 2: 620 },
      completeAtMs: 620
    }
  },
  {
    name: "security kick",
    state: () => spinningState(404, "security", { type: "KICK_REEL", reelIndex: 2 }),
    expected: {
      cycleKey: "4:KICK_REEL:2",
      kind: "kick",
      spinningReels: [2],
      revealAtMs: { 2: 620 },
      completeAtMs: 620
    }
  }
] as const;

describe("reelMotionPlan", () => {
  it.each(cases)("returns the literal $name motion plan", ({ state, expected }) => {
    expect(reelMotionPlan(state(), false)).toEqual(expected);
  });

  it.each(cases)("reduces every moving reel in $name to a 160ms static reveal", ({ state, expected }) => {
    const reduced = reelMotionPlan(state(), true);
    expect(reduced).toEqual({
      ...expected,
      revealAtMs: Object.fromEntries(expected.spinningReels.map((reel) => [reel, 160])),
      completeAtMs: 160
    });
  });

  it("returns null outside a spinning motion cycle", () => {
    expect(reelMotionPlan(createRun(405), false)).toBeNull();
  });
});
