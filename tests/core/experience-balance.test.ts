import { describe, expect, it } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import { getCurrentBet, getMealCost, getMartyrCost } from "@/core/progression";
import { resolveSpin } from "@/core/settlement";
import { describeEquippedPart } from "@/content/player-copy";
import { HOTEL_ROOMS } from "@/content/hotel";
import type { GameCommand } from "@/core/commands";
import type { Grid, ReelDraw, ReelSet, RunState } from "@/core/types";

const ready = (patch: Partial<RunState> = {}): RunState => ({ ...createRun(8), phase: "READY_TO_SPIN", service: "kitchen", ...patch });
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
function resolveGrid(grid: Grid, parts: RunState["partSlots"]) {
  const reels = grid.map((strip) => [...strip, "blank", "cherry", "lemon"]) as unknown as ReelSet;
  const draw: ReelDraw = { strips: reels, stops: [0, 0, 0], grid, rng: { value: 8 } };
  return resolveSpin(ready({ reels, partSlots: parts, phase: "AWAITING_INTERVENTION", pendingSpin: { draw, isFree: false, wager: 10, bankrollBefore: 110 } }), draw);
}

describe("bounded experience balance", () => {
  it("quotes and charges scale-aware meals, without a bet-switch discount or RNG consumption", () => {
    for (const mode of ["conservative", "normal", "aggressive"] as const) {
      const state = ready({ betMode: mode, afterHoursLevel: 2 });
      expect(getMealCost(state)).toBe(11.72);
      const next = send(state, { type: "BUY_FOOD", reelIndex: 0 });
      expect(next.bankroll).toBe(88.28);
      expect(next.expenses.kitchen).toBe(11.72);
      expect(next.rng).toEqual(state.rng);
    }
    expect(getMealCost(ready({ hotel: { cleared: 2, challenge: { tier: 3, status: "playing" } } }))).toBe(75);
    expect(getMealCost(ready({ baseBet: 100 }))).toBe(75);
  });
  it("caps offerings for wealthy builds, but preserves small-balance rounding and actual expense", () => {
    const state = ready({ bankroll: 1000, partSlots: [{ id: "martyr-coin", level: 1 }, null, null, null, null] });
    expect(getMartyrCost(state)).toBe(20);
    const next = send(state, { type: "ENABLE_MARTYR" });
    expect(next.bankroll).toBe(980); expect(next.expenses.chapel).toBe(20);
    expect(getMartyrCost({ ...state, bankroll: 31 })).toBe(4);
    expect(getMartyrCost({ ...state, bankroll: 0 })).toBe(0);
    expect(describeEquippedPart(state, state.partSlots[0]! ).currentImpact).toContain("献祭成本 ¥20");
  });
  it("caps jam at six effective layers while preserving within-block counting and reset", () => {
    let state = ready({ reels: [Array(12).fill("cherry"), Array(12).fill("cherry"), Array(12).fill("cherry")],
      partSlots: [{ id: "jam-jar", level: 2 }, { id: "cherry-press", level: 2 }, null, null, null] });
    for (let i = 0; i < 3; i++) {
      for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
    }
    // Base 9B + press 18B + jam (0+1+2+3+4+5 + 9*6)B = 96B.
    expect(state.shiftPayout).toBe(960);
    expect(state.counters.cherryWinsThisShift).toBe(15);
    expect(describeEquippedPart(state, state.partSlots[0]!).currentImpact).toContain("下一条额外赔付 ¥60");
    state = send(state, { type: "DECLINE_UPGRADE" });
    expect(state.counters.cherryWinsThisShift).toBe(0);
  });
  it("allows a lone magnet to resolve literal cracks without disabling itself", () => {
    const result = resolveGrid([["crack", "cherry", "lemon"], ["crack", "bell", "seven"], ["crack", "seven", "bell"]],
      [{ id: "scrap-magnet", level: 1 }, null, null, null, null]);
    expect(result.events.filter((event) => event.type === "PART_DISABLED")).toEqual([]);
    expect(result.payout).toBe(40);
    expect(result.state.reels.flat().includes("crack")).toBe(false);
  });
  it("skips insulated parts and empty slots, but still disables rightmost vulnerable parts and pays insurance only once", () => {
    const result = resolveGrid([["crack", "cherry", "lemon"], ["bell", "cherry", "seven"], ["seven", "lemon", "bell"]],
      [{ id: "jam-jar", level: 1 }, { id: "cherry-press", level: 1 }, null, { id: "warranty-fraud", level: 1 }, { id: "scrap-magnet", level: 1 }]);
    expect(result.events.filter((event) => event.type === "PART_DISABLED")).toEqual([expect.objectContaining({ slot: 1, partId: "cherry-press" })]);
    expect(result.state.shiftFlags.warrantyPaid).toBe(true);
    expect(result.payout).toBe(30);
  });
  it("compares total-payout pressure per available wager, not per spin across different room lengths", () => {
    const pressure = ([1, 2, 3] as const).map((tier) => {
      const room = HOTEL_ROOMS[tier];
      return room.target / (room.bet * room.paidSpins * (room.rounds ?? 1));
    });
    expect(pressure).toEqual([1000 / 225, 8, 12]);
    expect(getCurrentBet(ready({ betMode: "aggressive", hotel: { cleared: 1, challenge: { tier: 2, status: "playing" } } }))).toBe(50);
  });
});
