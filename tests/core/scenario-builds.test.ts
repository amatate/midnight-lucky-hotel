import { describe, expect, it } from "vitest";
import { dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import type { RunState } from "@/core/types";
import {
  createChapelScenario,
  createFruitScenario,
  createViolentScenario
} from "../fixtures/run-fixtures";

function send(state: RunState, command: GameCommand): { readonly state: RunState; readonly events: readonly GameEvent[] } {
  const result = dispatchCommand(state, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

describe("deterministic route scenarios", () => {
  it("fruit produces several small wins, additive food value, and attributed part payouts", () => {
    const scenario = createFruitScenario(820_127, "chain");
    const settled = send(scenario, { type: "ACCEPT_OUTCOME" });

    expect(settled.events.filter((event) => event.type === "LINE_WIN")).toHaveLength(2);
    expect(settled.events).toContainEqual(expect.objectContaining({ type: "FOOD_CONSUMED", reel: 0 }));
    expect(settled.events).toContainEqual(expect.objectContaining({ type: "PAYOUT_ADDED", amount: 6.25, source: "part" }));
    expect(settled.events).toContainEqual(expect.objectContaining({
      type: "PATTERN_LINE_WIN",
      patternId: "fruit-salad",
      partId: "fruit-salad",
      amount: 18.75
    }));
    expect(settled.state.buffs).toEqual(expect.arrayContaining([
      { id: "food", spinsRemaining: 1, additivePayout: 0.25 },
      { id: "food", spinsRemaining: 3, additivePayout: 0.25 }
    ]));
    expect(settled.state.attribution.base).toBe(15);
    expect(settled.state.attribution.part).toBe(25);
  });

  it("chapel releases accumulated omen through a high-value seven chain", () => {
    const scenario = createChapelScenario(820_128);
    expect(scenario.omen).toBe(3);

    const settled = send(scenario, { type: "ACCEPT_OUTCOME" });
    expect(settled.events).toContainEqual(expect.objectContaining({ type: "LINE_WIN", symbol: "seven", amount: 35 }));
    expect(settled.events).toContainEqual(expect.objectContaining({ type: "PAYOUT_ADDED", amount: 15, source: "part" }));
    expect(settled.events).toContainEqual(expect.objectContaining({ type: "PAYOUT_ADDED", amount: 35, source: "part" }));
    expect(settled.events).toContainEqual(expect.objectContaining({ type: "RESOURCE_CHANGED", resource: "omen", delta: -3 }));
    expect(settled.state.omen).toBe(0);
    expect(settled.state.attribution).toMatchObject({ base: 35, part: 50 });
  });

  it("violent kick commits damage, disables vulnerable parts and still pays immune parts", () => {
    let state = createViolentScenario(820_129);
    const before = state.reels[0].filter((symbol) => symbol === "crack").length;
    const kicked = send(state, { type: "KICK_REEL", reelIndex: 0 });
    state = kicked.state;
    expect(kicked.events).toContainEqual(expect.objectContaining({ type: "INTERVENTION_USED", kind: "kick", target: 0 }));
    expect(state.reels[0].filter((symbol) => symbol === "crack")).toHaveLength(before + 1);

    state = send(state, { type: "REELS_STOPPED" }).state;
    const settled = send(state, { type: "ACCEPT_OUTCOME" });
    expect(settled.events).toContainEqual(expect.objectContaining({ type: "PART_DISABLED", partId: "blank-capacitor" }));
    expect(settled.events).toContainEqual(expect.objectContaining({ type: "PAYOUT_ADDED", partId: "warranty-fraud", amount: 30 }));
    expect(settled.events).toContainEqual(expect.objectContaining({ type: "PAYOUT_ADDED", partId: "scrap-magnet", amount: 40 }));
    expect(settled.state.freeSpinQueue).toBe(0);
    expect(settled.state.shiftFlags.kickUsed).toBe(true);
  });
});
