import { describe, expect, it } from "vitest";
import { getCurrentBet } from "@/core/progression";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";

function dispatch(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function ready(seed = 1): RunState {
  const initial = createRun(seed);
  return dispatch({ ...initial, serviceCandidates: ["repair", "kitchen", "chapel"] }, { type: "SELECT_SERVICE", serviceId: "repair" });
}

function completePaidSpin(state: RunState, bankrollAfter = state.bankroll): RunState {
  state = dispatch(state, { type: "SPIN" });
  state = dispatch(state, { type: "REELS_STOPPED" });
  state = dispatch(state, { type: "ACCEPT_OUTCOME" });
  return dispatch({ ...state, bankroll: bankrollAfter }, { type: "PRESENTATION_COMPLETE" });
}

function forceBoundary(state: RunState, bankroll: number): RunState {
  return completePaidSpin({ ...state, bankroll: Math.max(bankroll, getCurrentBet(state)), baseSpinsInShift: 2 }, bankroll);
}

describe("normal run boundaries", () => {
  it("offers upgrades after shifts one through four, snapshots once, and never offers a fifth", () => {
    let state = ready(81);
    for (let shift = 1; shift <= 4; shift += 1) {
      state = forceBoundary({ ...state, shift }, 100);
      expect(state).toMatchObject({ phase: "CHOOSING_UPGRADE", shift, baseSpinsInShift: 3 });
      expect(state.currentCandidates).not.toBeNull();
      expect(state.shiftHistory.filter((snapshot) => snapshot.shift === shift)).toHaveLength(1);
      state = dispatch(state, { type: "DECLINE_UPGRADE" });
      expect(state).toMatchObject({ phase: "READY_TO_SPIN", shift: shift + 1, baseSpinsInShift: 0 });
    }
    state = forceBoundary(state, 199);
    expect(state).toMatchObject({ phase: "RUN_LOST", shift: 5, currentCandidates: null });
    expect(state.shiftHistory).toHaveLength(5);
  });

  it("unlocks an early boundary cash-out but preserves loss risk after choosing to continue", () => {
    let state = forceBoundary(ready(82), 200);
    expect(state).toMatchObject({ phase: "CHOOSING_UPGRADE", exitUnlocked: true });
    const won = dispatchCommand(state, { type: "CASH_OUT" });
    expect(won.ok).toBe(true);
    if (!won.ok) throw new Error(won.error.message);
    expect(won.state.phase).toBe("RUN_WON");
    expect(won.events).toEqual([expect.objectContaining({ type: "RUN_ENDED", outcome: "won" })]);

    state = dispatch(state, { type: "DECLINE_UPGRADE" });
    state = forceBoundary({ ...state, shift: 5 }, 4);
    expect(state.phase).toBe("RUN_LOST");
    expect(state.exitUnlocked).toBe(true);
  });

  it("ends shift five below target as a loss and at target as a cash-out boundary", () => {
    expect(forceBoundary({ ...ready(83), shift: 5 }, 199).phase).toBe("RUN_LOST");
    const complete = forceBoundary({ ...ready(84), shift: 5 }, 200);
    expect(complete).toMatchObject({ phase: "SHIFT_COMPLETE", exitUnlocked: true, currentCandidates: null });
    expect(dispatch(complete, { type: "CASH_OUT" }).phase).toBe("RUN_WON");
  });

  it("rerolls only a live normal upgrade offer for one tip and declines the wildcard exactly once", () => {
    const boundary = { ...forceBoundary(ready(85), 120), tips: 2 };
    const oldCandidates = boundary.currentCandidates;
    const rerolled = dispatchCommand(boundary, { type: "REROLL_CANDIDATES" });
    expect(rerolled.ok).toBe(true);
    if (!rerolled.ok) throw new Error(rerolled.error.message);
    expect(rerolled.state.tips).toBe(1);
    expect(rerolled.state.currentCandidates).not.toEqual(oldCandidates);
    expect(rerolled.events).toEqual([expect.objectContaining({ type: "RESOURCE_CHANGED", resource: "tips", delta: -1 })]);
    expect(boundary.currentCandidates).toBe(oldCandidates);

    const declined = dispatchCommand(rerolled.state, { type: "DECLINE_UPGRADE" });
    expect(declined.ok).toBe(true);
    if (!declined.ok) throw new Error(declined.error.message);
    expect(declined.state.tips).toBe(2);
    expect(declined.state.commandHistory.at(-1)).toEqual({ type: "DECLINE_UPGRADE" });
  });

  it("safely declines stale wildcard offers without weakening strict serialized decline validation", () => {
    const boundary = forceBoundary(ready(86), 120);
    const snapshot = boundary.shiftHistory.at(-1)!;
    const staleCases: readonly RunState[] = [
      {
        ...boundary,
        currentCandidates: { synergy: "lemon-crate", pivot: "carbon-copy", wildcard: "pruning-shears" },
        reels: [boundary.reels[0].slice(0, 6), boundary.reels[1].slice(0, 6), boundary.reels[2].slice(0, 6)]
      },
      {
        ...boundary,
        currentCandidates: { synergy: "lemon-crate", pivot: "carbon-copy", wildcard: "scrap-magnet" },
        service: "repair",
        reels: [
          boundary.reels[0].filter((symbol) => symbol !== "crack"),
          boundary.reels[1].filter((symbol) => symbol !== "crack"),
          boundary.reels[2].filter((symbol) => symbol !== "crack")
        ]
      },
      {
        ...boundary,
        bankroll: 9,
        currentCandidates: { synergy: "lemon-crate", pivot: "carbon-copy", wildcard: "tithe-box" }
      }
    ];

    for (const state of staleCases) {
      const strict = dispatchCommand(state, {
        type: "CHOOSE_UPGRADE",
        choice: { id: state.currentCandidates!.wildcard, action: "decline" }
      });
      expect(strict.ok).toBe(false);
      expect(strict.state).toBe(state);

      const safe = dispatchCommand(state, { type: "DECLINE_UPGRADE" });
      expect(safe.ok).toBe(true);
      if (!safe.ok) throw new Error(safe.error.message);
      expect(safe.state).toMatchObject({
        phase: "READY_TO_SPIN",
        tips: state.tips + 1,
        currentCandidates: null,
        shift: state.shift + 1
      });
      expect(safe.events.filter((event) => event.type === "RESOURCE_CHANGED")).toHaveLength(1);
      expect(safe.state.commandHistory.slice(-1)).toEqual([{ type: "DECLINE_UPGRADE" }]);
      expect(safe.state.shiftHistory).toEqual(state.shiftHistory);
      expect(safe.state.shiftHistory.at(-1)).toEqual(snapshot);
    }
  });
});

describe("after-hours blocks", () => {
  it("starts at level one, scales every three paid spins, requires the upgrade before continuing, and cashes out at either boundary state", () => {
    const normalBoundary = forceBoundary({ ...ready(91), shift: 5 }, 220);
    let state = dispatch(normalBoundary, { type: "CONTINUE" });
    expect(state).toMatchObject({ phase: "READY_TO_SPIN", afterHoursLevel: 1, baseSpinsInShift: 0 });
    expect(getCurrentBet(state)).toBe(12.5);

    state = forceBoundary(state, 220);
    expect(state).toMatchObject({ phase: "AFTER_HOURS", afterHoursLevel: 1, baseSpinsInShift: 3 });
    expect(state.currentCandidates).not.toBeNull();
    expect(dispatch(state, { type: "CASH_OUT" }).phase).toBe("RUN_WON");
    const premature = dispatchCommand(state, { type: "CONTINUE" });
    expect(premature.ok).toBe(false);
    expect(premature.state).toBe(state);

    state = dispatch(state, { type: "DECLINE_UPGRADE" });
    expect(state).toMatchObject({ phase: "AFTER_HOURS", currentCandidates: null });
    expect(dispatch(state, { type: "CASH_OUT" }).phase).toBe("RUN_WON");
    state = dispatch(state, { type: "CONTINUE" });
    expect(state).toMatchObject({ phase: "READY_TO_SPIN", afterHoursLevel: 2, baseSpinsInShift: 0 });
    expect(getCurrentBet(state)).toBe(15.63);
  });
});
