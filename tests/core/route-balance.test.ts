import { describe, expect, it } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import { resolveSpin } from "@/core/settlement";
import { getSafetyFuseRescuePayout } from "@/content/effects/neutral";
import { UPGRADES } from "@/content/upgrades";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import type { GameCommand } from "@/core/commands";
import type { Grid, PartInstance, ReelSet, RunState } from "@/core/types";

function send(s: RunState, command: GameCommand): RunState {
  const r = dispatchCommand(s, command);
  if (!r.ok) throw new Error(r.error.message);
  expect(decodeRunStateV2(JSON.parse(JSON.stringify(r.state)))).not.toBeNull();
  return r.state;
}
function ready(parts: PartInstance[] = []): RunState {
  return { ...createRun(8), phase: "READY_TO_SPIN", service: "repair", bankroll: 1000,
    partSlots: Array.from({ length: 5 }, (_, i) => parts[i] ?? null) as unknown as RunState["partSlots"] };
}
function settle(grid: Grid, parts: PartInstance[], free = false) {
  const strips = grid.map((r) => [...r, "blank", "bell", "lemon"]) as unknown as ReelSet;
  const draw = { strips, grid, stops: [0, 0, 0] as const, rng: { value: 8 } };
  return resolveSpin({ ...ready(parts), phase: "AWAITING_INTERVENTION", reels: strips,
    pendingSpin: { draw, isFree: free, wager: free ? 0 : 10, bankrollBefore: 1010 } }, draw);
}
const oneSeven: Grid = [["seven", "blank", "cherry"], ["seven", "cherry", "lemon"], ["seven", "lemon", "blank"]];

describe("route risk/reward corrections", () => {
  it("does not make a fully built seven/martyr machine poorer by equipping blessing L1", () => {
    function averageBlockPayout(blessing: boolean) {
      let total = 0;
      for (let seed = 1; seed <= 24; seed++) {
        let state: RunState = { ...ready([{ id: "martyr-coin", level: 2 }, ...(blessing ? [{ id: "triple-blessing" as const, level: 1 as const }] : [])]),
          rng: { value: seed }, reels: [Array(12).fill("seven"), Array(12).fill("seven"), Array(12).fill("seven")] };
        state = send(state, { type: "ENABLE_MARTYR" });
        for (let spin = 0; spin < 3; spin++) {
          for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
        }
        total += state.shiftPayout;
      }
      return total / 24;
    }
    expect(averageBlockPayout(true)).toBeGreaterThan(averageBlockPayout(false));
  });
  it.each([1, 2] as const)("keeps blessing L%s pollution temporary with the same cost at both levels", (level) => {
    const r = settle(oneSeven, [{ id: "triple-blessing", level }]);
    expect(r.payout).toBe(level === 1 ? 70 : 105);
    expect(r.state.reels.map((s) => s.length)).toEqual([6, 6, 6]);
    expect(r.state.blockReelAdditions).toEqual([["blank"], [], []]);
    const state = { ...r.state, phase: "READY_TO_SPIN" as const, pendingSpin: null };
    const spinning = send(state, { type: "SPIN" });
    expect(spinning.pendingSpin!.draw.strips.map((s) => s.length)).toEqual([7, 6, 6]);
    const boundary: RunState = { ...state, phase: "CHOOSING_UPGRADE", currentCandidates: { synergy: "jam-jar", pivot: "carbon-copy", wildcard: "safety-fuse" } };
    expect(send(boundary, { type: "DECLINE_UPGRADE" }).blockReelAdditions).toEqual([[], [], []]);
    const room: RunState = { ...state, phase: "AFTER_HOURS", shift: 5, afterHoursLevel: 1, exitUnlocked: true, baseSpinsInShift: 3 };
    expect(send(room, { type: "ENTER_ROOM" }).blockReelAdditions).toEqual([[], [], []]);
  });

  it("ends an all-blank capacitor block after three paid and at most three free spins", () => {
    let state: RunState = { ...ready([{ id: "blank-capacitor", level: 2 }]), reels: [Array(12).fill("blank"), Array(12).fill("blank"), Array(12).fill("blank")] };
    for (let spin = 0; spin < 6; spin++) {
      for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
    }
    expect(state.phase).toBe("CHOOSING_UPGRADE");
    expect(state.baseSpinsInShift).toBe(3);
    expect(state.freeSpinQueue).toBe(0);
    expect(state.spinHistory.filter((s) => s.isFree)).toHaveLength(3);
  });
  it("does not recharge the capacitor during a free spin", () => {
    const r = settle([["blank", "blank", "blank"], ["blank", "blank", "blank"], ["blank", "blank", "blank"]], [{ id: "blank-capacitor", level: 2 }], true);
    expect(r.state.freeSpinQueue).toBe(0);
    expect(r.state.counters.blankCharge).toBe(0);
  });
  it("lets a three-literal-cherry line start the press without increasing its mature ceiling", () => {
    const grid: Grid = [["cherry", "blank", "seven"], ["cherry", "seven", "lemon"], ["cherry", "lemon", "blank"]];
    expect(settle(grid, [{ id: "cherry-press", level: 1 }]).payout).toBe(11);
    expect(settle([["cherry", "cherry", "cherry"], ["cherry", "cherry", "cherry"], ["cherry", "cherry", "cherry"]], [{ id: "cherry-press", level: 2 }]).payout).toBe(90);
  });
  it("keeps a mature lemon engine useful without paying a maturity bonus on a sparse lemon line", () => {
    const full = settle([["lemon", "lemon", "lemon"], ["lemon", "lemon", "lemon"], ["lemon", "lemon", "lemon"]], [{ id: "lemon-infection", level: 2 }]);
    expect(full.payout).toBe(95); // five 0.9B lines + one 5B mature harvest.
    const sparse = settle([["lemon", "blank", "blank"], ["lemon", "blank", "blank"], ["lemon", "blank", "blank"]], [{ id: "lemon-infection", level: 2 }]);
    expect(sparse.payout).toBe(9);
  });
  it.each([1, 2] as const)("makes a L%s fuse fund one or two minimum room stakes", (level) => {
    const state: RunState = { ...ready([{ id: "safety-fuse", level }]), bankroll: 0,
      hotel: { cleared: 2, challenge: { tier: 3, status: "playing" } } };
    expect(getSafetyFuseRescuePayout(state)).toBe(level === 1 ? 100 : 200);
    const rescued = send({ ...state, shift: 5, afterHoursLevel: 1, exitUnlocked: true }, { type: "SPIN" });
    expect(rescued.phase).toBe("READY_TO_SPIN");
    expect(send(rescued, { type: "SPIN" }).phase).toBe("SPINNING");
  });
  it("allows an earned omen to unlock its payoff even without chapel service", () => {
    expect(UPGRADES["omen-collector"].requires({ ...ready(), omen: 1 })).toBe(true);
    expect(UPGRADES["omen-collector"].requires(ready([{ id: "omen-collector", level: 1 }]))).toBe(true);
    expect(UPGRADES["omen-collector"].requires(ready())).toBe(false);
  });
});
