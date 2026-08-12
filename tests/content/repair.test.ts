import { describe, expect, it } from "vitest";
import { removeCracks, lockAndRespinOthers } from "@/content/services/repair";
import { nextInt } from "@/core/random";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";

function dispatch(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function repairRun(seed = 1): RunState {
  const initial = createRun(seed);
  return dispatchCommand(initial, { type: "SELECT_SERVICE", serviceId: "repair" }).ok
    ? dispatchCommand(initial, { type: "SELECT_SERVICE", serviceId: "repair" }).state
    : { ...initial, phase: "READY_TO_SPIN", service: "repair", interventionPoints: 3, maxInterventionPoints: 3 };
}

function awaitingRepair(seed = 1): RunState {
  let state = repairRun(seed);
  state = dispatch(state, { type: "SPIN" });
  return dispatch(state, { type: "REELS_STOPPED" });
}

describe("repair lock service", () => {
  it("starts every repair shift with three points", () => {
    const initial = createRun(8);
    const selected = dispatchCommand(
      { ...initial, serviceCandidates: ["repair", "kitchen", "chapel"] },
      { type: "SELECT_SERVICE", serviceId: "repair" }
    );
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error(selected.error.message);
    expect(selected.state).toMatchObject({ interventionPoints: 3, maxInterventionPoints: 3 });
  });

  it("keeps the locked reel and independently moves the other two with exactly two draws", () => {
    const state = awaitingRepair(41);
    const before = state.pendingSpin!.draw;
    const first = nextInt(state.rng, before.strips[1].length - 1);
    const second = nextInt(first.rng, before.strips[2].length - 1);
    const snapshot = structuredClone(state);

    const result = lockAndRespinOthers(state, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state).toMatchObject({
      phase: "SPINNING",
      rng: second.rng,
      interventionPoints: 2,
      interventionUsedThisSpin: true,
      shiftFlags: { repairLockUsed: true }
    });
    expect(result.state.pendingSpin!.draw.stops[0]).toBe(before.stops[0]);
    expect(result.state.pendingSpin!.draw.grid[0]).toEqual(before.grid[0]);
    expect(result.state.pendingSpin!.draw.stops[1]).toBe((before.stops[1] + first.value + 1) % before.strips[1].length);
    expect(result.state.pendingSpin!.draw.stops[2]).toBe((before.stops[2] + second.value + 1) % before.strips[2].length);
    expect(result.state.pendingSpin!.draw.entryIds).toEqual(before.strips.map((strip) => strip.map((_symbol, index) => index)));
    expect(result.events.map((event) => event.type)).toEqual(["INTERVENTION_USED", "REELS_DRAWN"]);
    expect(state).toEqual(snapshot);
  });

  it("still consumes one RNG draw per unlocked reel when a recovered strip has length one", () => {
    const state = awaitingRepair(42);
    const draw = {
      ...state.pendingSpin!.draw,
      strips: [state.pendingSpin!.draw.strips[0], ["blank"], ["blank"]] as const,
      stops: [state.pendingSpin!.draw.stops[0], 0, 0] as const,
      grid: [state.pendingSpin!.draw.grid[0], ["blank", "blank", "blank"], ["blank", "blank", "blank"]] as const
    };
    const first = nextInt(state.rng, 1);
    const second = nextInt(first.rng, 1);
    const result = lockAndRespinOthers({ ...state, pendingSpin: { ...state.pendingSpin!, draw } }, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.rng).toEqual(second.rng);
    expect(result.state.pendingSpin!.draw.stops).toEqual([draw.stops[0], 0, 0]);
  });

  it("rejects an invalid lock without changing the original", () => {
    const state = awaitingRepair(43);
    for (const invalid of [
      { ...state, phase: "READY_TO_SPIN" as const },
      { ...state, service: "kitchen" as const },
      { ...state, interventionPoints: 0 },
      { ...state, interventionUsedThisSpin: true },
      { ...state, shiftFlags: { ...state.shiftFlags, repairLockUsed: true } },
      { ...state, pendingSpin: null }
    ]) {
      const snapshot = structuredClone(invalid);
      const result = lockAndRespinOthers(invalid, 0);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(invalid);
      expect(invalid).toEqual(snapshot);
    }
  });
});

describe("repair crack removal", () => {
  it("spends one tip to remove the first two permanent cracks and keeps a nonempty fallback", () => {
    const state: RunState = {
      ...repairRun(50),
      phase: "CHOOSING_UPGRADE",
      tips: 2,
      reels: [["crack", "cherry", "crack", "crack"], ["blank"], ["lemon"]],
      currentCandidates: { synergy: "scrap-magnet", pivot: "artificial-crack", wildcard: "calculator" }
    };
    const snapshot = structuredClone(state);
    const result = removeCracks(state, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.tips).toBe(1);
    expect(result.state.reels[0]).toEqual(["cherry", "crack"]);
    expect(result.events).toEqual([{ sequence: state.pendingEvents.length + 1, type: "RESOURCE_CHANGED", resource: "tips", delta: -1 }]);
    expect(state).toEqual(snapshot);

    const allCracks = removeCracks({ ...state, reels: [["crack", "crack"], ["blank"], ["lemon"]] }, 0);
    expect(allCracks.ok).toBe(true);
    if (!allCracks.ok) throw new Error(allCracks.error.message);
    expect(allCracks.state.reels[0]).toEqual(["blank"]);
  });

  it("allows only a completed boundary and rejects missing cracks or tips immutably", () => {
    const base: RunState = { ...repairRun(51), phase: "SHIFT_COMPLETE", tips: 1, reels: [["crack"], ["blank"], ["lemon"]] };
    expect(removeCracks(base, 0).ok).toBe(true);
    expect(removeCracks({ ...base, phase: "AFTER_HOURS" }, 0).ok).toBe(true);

    for (const invalid of [
      { ...base, phase: "READY_TO_SPIN" as const },
      { ...base, pendingSpin: base.pendingSpin ?? ({ draw: { strips: base.reels, stops: [0, 0, 0], grid: [["crack", "crack", "crack"], ["blank", "blank", "blank"], ["lemon", "lemon", "lemon"]], rng: base.rng }, isFree: false } as const) },
      { ...base, service: "chapel" as const },
      { ...base, tips: 0 },
      { ...base, reels: [["cherry"], ["blank"], ["lemon"]] as const }
    ]) {
      const snapshot = structuredClone(invalid);
      const result = removeCracks(invalid, 0);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(invalid);
      expect(invalid).toEqual(snapshot);
    }
  });

  it("dispatches both repair commands through serializable command history", () => {
    const awaiting = awaitingRepair(52);
    const locked = dispatchCommand(awaiting, { type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex: 1 });
    expect(locked.ok).toBe(true);
    if (!locked.ok) throw new Error(locked.error.message);
    expect(locked.state.commandHistory.at(-1)).toEqual({ type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex: 1 });

    const boundary: RunState = { ...repairRun(53), phase: "SHIFT_COMPLETE", tips: 1, reels: [["crack"], ["blank"], ["lemon"]] };
    const removed = dispatchCommand(boundary, { type: "REMOVE_CRACKS", reelIndex: 0 });
    expect(removed.ok).toBe(true);
    if (!removed.ok) throw new Error(removed.error.message);
    expect(removed.state.commandHistory.at(-1)).toEqual({ type: "REMOVE_CRACKS", reelIndex: 0 });
  });
});
