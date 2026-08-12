import { describe, expect, it } from "vitest";
import { buyFood } from "@/content/services/kitchen";
import { createRun, dispatchCommand } from "@/core/run";
import { resolveSpin } from "@/core/settlement";
import type { ReelDraw, ReelIndex, ReelWindow, RunState, SymbolId } from "@/core/types";

function kitchenReady(patch: Partial<RunState> = {}): RunState {
  return {
    ...createRun(55),
    phase: "READY_TO_SPIN",
    service: "kitchen",
    ...patch
  };
}

function firstWindow(strip: readonly SymbolId[]): ReelWindow {
  return [strip[0]!, strip[1]!, strip[2]!];
}

describe("buyFood", () => {
  it("charges kitchen expense and immutably appends one food to the selected reel", () => {
    const state = kitchenReady({
      bankroll: 30,
      pendingEvents: [{ sequence: 1, type: "SHIFT_CHANGED", shift: 1 }]
    });
    const snapshot = structuredClone(state);

    const result = buyFood(state, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.events).toEqual([{ sequence: 2, type: "SERVICE_USED", serviceId: "kitchen", cost: 10 }]);
    expect(result.state.bankroll).toBe(20);
    expect(result.state.expenses).toMatchObject({ kitchen: 10 });
    expect(result.state.shiftFlags.foodBought).toBe(true);
    expect(result.state.reels[1]).toEqual([...state.reels[1], "food"]);
    expect(result.state.reels[0]).toEqual(state.reels[0]);
    expect(result.state.reels[2]).toEqual(state.reels[2]);
    expect(result.state.pendingEvents.at(-1)).toEqual(result.events[0]);
    expect(result.state.commandHistory.at(-1)).toEqual({ type: "BUY_FOOD", reelIndex: 1 });
    expect(state).toEqual(snapshot);
  });

  it("is wired through dispatchCommand", () => {
    const result = dispatchCommand(kitchenReady(), { type: "BUY_FOOD", reelIndex: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.reels[2].at(-1)).toBe("food");
    expect(result.state.commandHistory.at(-1)).toEqual({ type: "BUY_FOOD", reelIndex: 2 });
  });

  it.each([
    {
      name: "wrong phase",
      state: () => kitchenReady({ phase: "SPINNING" }),
      reel: 0,
      code: "INVALID_PHASE",
      message: "BUY_FOOD is invalid during SPINNING"
    },
    {
      name: "pending spin",
      state: () => {
        const ready = kitchenReady();
        const draw: ReelDraw = {
          strips: ready.reels,
          stops: [0, 0, 0],
          grid: [
            firstWindow(ready.reels[0]),
            firstWindow(ready.reels[1]),
            firstWindow(ready.reels[2])
          ],
          rng: ready.rng
        };
        return { ...ready, pendingSpin: { draw, isFree: false } };
      },
      reel: 0,
      code: "INVALID_PHASE",
      message: "BUY_FOOD requires no pending spin"
    },
    {
      name: "after the first base spin",
      state: () => kitchenReady({ baseSpinsInShift: 1 }),
      reel: 0,
      code: "RESOURCE_EXHAUSTED",
      message: "food is only available before the first base spin"
    },
    {
      name: "without kitchen",
      state: () => kitchenReady({ service: "repair" }),
      reel: 0,
      code: "INVALID_TARGET",
      message: "kitchen service is not equipped"
    },
    {
      name: "after the shift purchase",
      state: () => kitchenReady({ shiftFlags: { ...kitchenReady().shiftFlags, foodBought: true } }),
      reel: 0,
      code: "RESOURCE_EXHAUSTED",
      message: "food was already bought this shift"
    },
    {
      name: "below ten bankroll",
      state: () => kitchenReady({ bankroll: 9.99 }),
      reel: 0,
      code: "INSUFFICIENT_FUNDS",
      message: "bankroll is below the kitchen cost"
    },
    {
      name: "invalid reel",
      state: () => kitchenReady(),
      reel: 3,
      code: "INVALID_TARGET",
      message: "reel index must be 0, 1, or 2"
    }
  ] as const)("rejects $name without changing state, history, or expenses", ({ state: makeState, reel, code, message }) => {
    const state = makeState();
    const snapshot = structuredClone(state);

    const result = buyFood(state, reel as ReelIndex);

    expect(result).toEqual({ ok: false, state, error: { code, message } });
    expect(state).toEqual(snapshot);
  });

  it("keeps the purchased food coherent when settlement consumes it", () => {
    const purchased = buyFood(kitchenReady(), 0);
    expect(purchased.ok).toBe(true);
    if (!purchased.ok) throw new Error(purchased.error.message);
    const foodIndex = purchased.state.reels[0].length - 1;
    const draw: ReelDraw = {
      strips: purchased.state.reels,
      stops: [foodIndex, 0, 0],
      grid: [
        ["food", purchased.state.reels[0][0]!, purchased.state.reels[0][1]!],
        firstWindow(purchased.state.reels[1]),
        firstWindow(purchased.state.reels[2])
      ],
      rng: purchased.state.rng
    };
    const state: RunState = {
      ...purchased.state,
      phase: "AWAITING_INTERVENTION",
      pendingSpin: { draw, isFree: false }
    };

    const result = resolveSpin(state, draw);

    expect(result.events.filter((event) => event.type === "FOOD_CONSUMED")).toEqual([
      expect.objectContaining({ type: "FOOD_CONSUMED", reel: 0 })
    ]);
    expect(result.state.reels[0]).toEqual(kitchenReady().reels[0]);
    expect(result.state.pendingSpin?.draw.strips[0]).toEqual(result.state.reels[0]);
    expect(result.state.buffs).toContainEqual({ id: "food", spinsRemaining: 3, additivePayout: 0.25 });
  });
});
