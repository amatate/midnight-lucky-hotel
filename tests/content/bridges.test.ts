import { describe, expect, it } from "vitest";
import { createRun } from "@/core/run";
import { resolveSpin } from "@/core/settlement";
import { buildSpinReceipt } from "@/core/receipts";
import type { Grid, PartInstance, ReelDraw, RunState } from "@/core/types";

function stateFor(grid: Grid, parts: readonly PartInstance[], patch: Partial<RunState> = {}): RunState {
  const draw: ReelDraw = { strips: grid, stops: [0, 0, 0], grid, rng: { value: 42 } };
  return { ...createRun(42), phase: "AWAITING_INTERVENTION", reels: grid,
    pendingSpin: { draw, isFree: false, bankrollBefore: 110, wager: 10 },
    partSlots: [parts[0] ?? null, parts[1] ?? null, parts[2] ?? null, parts[3] ?? null, parts[4] ?? null],
    ...patch };
}
const cherry: Grid = [["cherry", "cherry", "cherry"], ["cherry", "cherry", "cherry"], ["cherry", "cherry", "cherry"]];
const blanks: Grid = [["blank", "cherry", "lemon"], ["lemon", "blank", "cherry"], ["cherry", "lemon", "blank"]];
const move = [{ sequence: 1, type: "INTERVENTION_USED", kind: "respin", target: 0 }] as const;

describe("neutral bridge parts", () => {
  it.each([1, 2] as const)("relay L%i rewards one paid-spin manual win once, even with five lines", (level) => {
    const state = stateFor(cherry, [{ id: "intervention-relay", level }], { pendingEvents: move });
    const result = resolveSpin(state, state.pendingSpin!.draw);
    const bonuses = result.events.filter((event) => event.type === "PAYOUT_ADDED" && event.source === "part");
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0]).toMatchObject({ partId: "intervention-relay", amount: level * 10 });
  });
  it("relay accepts Salad patterns but not prayer, free spins or a losing manual move", () => {
    const salad: Grid = [["cherry", "cherry", "cherry"], ["lemon", "lemon", "lemon"], ["bell", "bell", "bell"]];
    const state = stateFor(salad, [{ id: "fruit-salad", level: 1 }, { id: "intervention-relay", level: 1 }], { pendingEvents: move });
    const result = resolveSpin(state, state.pendingSpin!.draw);
    expect(result.events.filter((event) => event.type === "PAYOUT_ADDED" && event.source === "part" && event.partId === "intervention-relay")).toHaveLength(1);
    for (const candidate of [
      stateFor(cherry, [{ id: "intervention-relay", level: 1 }]),
      stateFor(cherry, [{ id: "intervention-relay", level: 1 }], { pendingEvents: [{ sequence: 1, type: "INTERVENTION_USED", kind: "prayer", target: "cherry" }] }),
      stateFor(blanks, [{ id: "intervention-relay", level: 1 }], { pendingEvents: move }),
      { ...state, pendingSpin: { ...state.pendingSpin!, isFree: true, wager: 0 } }
    ]) {
      const resolved = resolveSpin(candidate, candidate.pendingSpin!.draw);
      expect(resolved.events.some((event) => event.type === "PART_TRIGGERED" && event.partId === "intervention-relay")).toBe(false);
    }
  });
  it.each([1, 2] as const)("blank dividend L%i pays once with at least two physical blanks", (level) => {
    const state = stateFor(blanks, [{ id: "blank-dividend", level }]);
    const result = resolveSpin(state, state.pendingSpin!.draw);
    expect(result.attribution.part).toBe(level * 10);
    expect(result.events.filter((event) => event.type === "PART_TRIGGERED")).toHaveLength(1);
    const free = { ...state, pendingSpin: { ...state.pendingSpin!, isFree: true, wager: 0 } };
    expect(resolveSpin(free, free.pendingSpin.draw).attribution.part).toBe(0);
    const receipt = buildSpinReceipt({ ordinal: 1, shift: 1, afterHoursLevel: 0, isFree: false, baseSpinIndex: 1,
      bankrollBefore: 110, wager: 10, finalGrid: result.state.pendingSpin!.draw.grid, bankrollAfter: 100 + result.payout, settlementEvents: result.events });
    expect(receipt.ok).toBe(true);
  });
  it("counts a repeated physical blank only once on a one-entry test reel", () => {
    const grid: Grid = [["blank", "blank", "blank"], ["cherry", "lemon", "bell"], ["lemon", "bell", "cherry"]];
    const state = stateFor(grid, [{ id: "blank-dividend", level: 1 }]);
    const draw = { ...state.pendingSpin!.draw, strips: [["blank"], grid[1], grid[2]] as const };
    expect(resolveSpin({ ...state, reels: draw.strips, pendingSpin: { ...state.pendingSpin!, draw } }, draw).attribution.part).toBe(0);
  });
  it("bridge parts still obey crack disable rules", () => {
    const grid: Grid = [["crack", "blank", "blank"], ["cherry", "lemon", "bell"], ["lemon", "bell", "cherry"]];
    const state = stateFor(grid, [{ id: "blank-dividend", level: 1 }]);
    const result = resolveSpin(state, state.pendingSpin!.draw);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "PART_DISABLED", partId: "blank-dividend" }));
    expect(result.attribution.part).toBe(0);
  });
});
