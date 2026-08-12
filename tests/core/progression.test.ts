import { describe, expect, it } from "vitest";
import { getCurrentBet, roundMoney } from "@/core/progression";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";

function dispatch(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function readyRun(seed = 1): RunState {
  const initial = createRun(seed);
  return dispatch(initial, { type: "SELECT_SERVICE", serviceId: initial.serviceCandidates[0] });
}

function completeSpin(state: RunState): RunState {
  state = dispatch(state, { type: "SPIN" });
  state = dispatch(state, { type: "REELS_STOPPED" });
  state = dispatch(state, { type: "ACCEPT_OUTCOME" });
  return dispatch(state, { type: "PRESENTATION_COMPLETE" });
}

describe("bet progression", () => {
  it("applies mode and after-hours multipliers with cent rounding", () => {
    const state = readyRun();

    expect(getCurrentBet({ ...state, betMode: "conservative" })).toBe(5);
    expect(getCurrentBet({ ...state, betMode: "normal" })).toBe(10);
    expect(getCurrentBet({ ...state, betMode: "aggressive" })).toBe(20);
    expect(getCurrentBet({ ...state, betMode: "normal", afterHoursLevel: 3 })).toBe(19.53);
    expect(roundMoney(1.005)).toBe(1);
    expect(() => roundMoney(Number.POSITIVE_INFINITY)).toThrow("money must be finite");
  });

  it("changes bet mode only while ready to spin", () => {
    const ready = readyRun();
    const changed = dispatchCommand(ready, { type: "SET_BET_MODE", mode: "conservative" });
    expect(changed).toEqual({
      ok: true,
      state: expect.objectContaining({ betMode: "conservative" }),
      events: []
    });
    if (!changed.ok) throw new Error(changed.error.message);

    const spinning = dispatch(changed.state, { type: "SPIN" });
    expect(dispatchCommand(spinning, { type: "SET_BET_MODE", mode: "aggressive" })).toEqual({
      ok: false,
      state: spinning,
      error: { code: "INVALID_PHASE", message: "SET_BET_MODE is invalid during SPINNING" }
    });
  });
});

describe("spin progression", () => {
  it("counts three paid spins, clears presentation events, and generates the first-four-shift upgrade boundary", () => {
    let state = readyRun(33);
    state = completeSpin(state);
    expect(state).toMatchObject({ phase: "READY_TO_SPIN", baseSpinsInShift: 1, pendingSpin: null, pendingEvents: [] });
    state = completeSpin(state);
    state = completeSpin(state);

    expect(state).toMatchObject({
      phase: "CHOOSING_UPGRADE",
      shift: 1,
      baseSpinsInShift: 3,
      pendingSpin: null,
      interventionUsedThisSpin: false,
      pendingEvents: []
    });
    expect(state.currentCandidates).not.toBeNull();
    expect(new Set(Object.values(state.currentCandidates!)).size).toBe(3);
  });

  it("enters SHIFT_COMPLETE after the third paid spin of shift five", () => {
    let state: RunState = { ...readyRun(34), shift: 5, baseSpinsInShift: 2 };
    state = completeSpin(state);
    expect(state.phase).toBe("SHIFT_COMPLETE");
    expect(state.baseSpinsInShift).toBe(3);
  });

  it("uses queued free spins before funds, spends no wager, and does not replace a paid base spin", () => {
    const ready: RunState = { ...readyRun(35), bankroll: 0, freeSpinQueue: 1 };
    const spun = dispatchCommand(ready, { type: "SPIN" });

    expect(spun.ok).toBe(true);
    if (!spun.ok) throw new Error(spun.error.message);
    expect(spun.state).toMatchObject({
      bankroll: 0,
      freeSpinQueue: 0,
      shiftWager: 0,
      pendingSpin: { isFree: true },
      expenses: { wagers: 0 }
    });
    expect(spun.events.map((event) => [event.sequence, event.type])).toEqual([
      [1, "RESOURCE_CHANGED"],
      [2, "REELS_DRAWN"]
    ]);

    let completed = dispatch(spun.state, { type: "REELS_STOPPED" });
    completed = dispatch(completed, { type: "ACCEPT_OUTCOME" });
    completed = dispatch(completed, { type: "PRESENTATION_COMPLETE" });
    expect(completed.baseSpinsInShift).toBe(0);
  });

  it("plays free spins granted by the third paid spin before entering the shift boundary", () => {
    let state: RunState = { ...readyRun(39), baseSpinsInShift: 2 };
    state = dispatch(state, { type: "SPIN" });
    state = dispatch(state, { type: "REELS_STOPPED" });
    state = dispatch(state, { type: "ACCEPT_OUTCOME" });
    state = dispatch({ ...state, freeSpinQueue: 1 }, { type: "PRESENTATION_COMPLETE" });

    expect(state).toMatchObject({ phase: "READY_TO_SPIN", baseSpinsInShift: 3, freeSpinQueue: 1 });
    state = completeSpin(state);
    expect(state).toMatchObject({ phase: "CHOOSING_UPGRADE", baseSpinsInShift: 3, freeSpinQueue: 0 });
  });

  it("loses after presentation when funds are below the minimum bet and no free spin remains", () => {
    let state: RunState = { ...readyRun(36), bankroll: 10 };
    state = dispatch(state, { type: "SPIN" });
    state = dispatch(state, { type: "REELS_STOPPED" });
    state = dispatch(state, { type: "ACCEPT_OUTCOME" });
    const resolving: RunState = { ...state, bankroll: 4.99 };
    const completed = dispatchCommand(resolving, { type: "PRESENTATION_COMPLETE" });

    expect(completed.ok).toBe(true);
    if (!completed.ok) throw new Error(completed.error.message);
    expect(completed.state.phase).toBe("RUN_LOST");
    expect(completed.events).toEqual([{ sequence: 1, type: "RUN_ENDED", outcome: "lost" }]);
  });

  it("ends a resumed ready state below the minimum bet instead of returning an unactionable funds error", () => {
    const ready: RunState = { ...readyRun(38), bankroll: 4.99 };
    const result = dispatchCommand(ready, { type: "SPIN" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.phase).toBe("RUN_LOST");
    expect(result.state.pendingSpin).toBeNull();
    expect(result.events).toEqual([{ sequence: 1, type: "RUN_ENDED", outcome: "lost" }]);
  });

  it("does not lose below the minimum bet while another free spin is queued", () => {
    let state = readyRun(37);
    state = dispatch(state, { type: "SPIN" });
    state = dispatch(state, { type: "REELS_STOPPED" });
    state = dispatch(state, { type: "ACCEPT_OUTCOME" });
    const resolving: RunState = { ...state, bankroll: 0, freeSpinQueue: 1 };
    const completed = dispatch(resolving, { type: "PRESENTATION_COMPLETE" });

    expect(completed.phase).toBe("READY_TO_SPIN");
  });
});
