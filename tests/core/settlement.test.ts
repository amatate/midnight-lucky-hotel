import { describe, expect, it } from "vitest";
import { resolveSpin, type EffectHandler } from "@/core/settlement";
import { createRun } from "@/core/run";
import type { Grid, PartInstance, ReelDraw, ReelSet, RunState } from "@/core/types";

const filler = ["blank", "cherry", "lemon"] as const;

function makeDraw(grid: Grid): ReelDraw {
  const strips: ReelSet = [
    [...grid[0], ...filler],
    [...grid[1], ...filler],
    [...grid[2], ...filler]
  ];
  return { strips, stops: [0, 0, 0], grid, rng: { value: 99 } };
}

function settlementState(draw: ReelDraw, patch: Partial<RunState> = {}): RunState {
  const state = createRun(123);
  return {
    ...state,
    phase: "AWAITING_INTERVENTION",
    reels: draw.strips,
    pendingSpin: { draw, isFree: false },
    ...patch
  };
}

const deadGrid: Grid = [
  ["blank", "cherry", "lemon"],
  ["lemon", "blank", "cherry"],
  ["cherry", "lemon", "blank"]
];

const lemonLineGrid: Grid = [
  ["blank", "lemon", "blank"],
  ["blank", "wild", "blank"],
  ["blank", "lemon", "blank"]
];

describe("resolveSpin special symbols", () => {
  it("consumes each visible food occurrence from its source reel and grants independent future buffs", () => {
    const draw = makeDraw([
      ["food", "food", "blank"],
      ["blank", "cherry", "lemon"],
      ["lemon", "blank", "cherry"]
    ]);
    const state = settlementState(draw);
    const snapshot = structuredClone(state);

    const result = resolveSpin(state, draw);

    expect(result.state.reels[0]).toEqual(["blank", "blank", "cherry", "lemon"]);
    expect(result.state.pendingSpin?.draw.strips[0]).toEqual(result.state.reels[0]);
    expect(result.state.pendingSpin?.draw.grid[0]).toEqual(["blank", "blank", "cherry"]);
    expect(result.state.buffs).toEqual([
      { id: "food", spinsRemaining: 3, additivePayout: 0.25 },
      { id: "food", spinsRemaining: 3, additivePayout: 0.25 }
    ]);
    expect(result.events.filter((event) => event.type === "FOOD_CONSUMED")).toEqual([
      { sequence: 1, type: "FOOD_CONSUMED", reel: 0 },
      { sequence: 2, type: "FOOD_CONSUMED", reel: 0 }
    ]);
    expect(state).toEqual(snapshot);
  });

  it("does not apply newly consumed food to the payout of the consuming spin", () => {
    const draw = makeDraw([
      ["food", "lemon", "blank"],
      ["blank", "wild", "blank"],
      ["blank", "lemon", "blank"]
    ]);

    const result = resolveSpin(settlementState(draw), draw);

    expect(result.payout).toBe(12);
    expect(result.attribution.base).toBe(12);
    expect(result.state.buffs).toEqual([{ id: "food", spinsRemaining: 3, additivePayout: 0.25 }]);
  });

  it("combines existing food buffs additively and decrements each once after settlement", () => {
    const draw = makeDraw(lemonLineGrid);
    const state = settlementState(draw, {
      buffs: [
        { id: "food", spinsRemaining: 3, additivePayout: 0.25 },
        { id: "food", spinsRemaining: 2, additivePayout: 0.25 }
      ]
    });

    const result = resolveSpin(state, draw);

    expect(result.payout).toBe(18);
    expect(result.attribution.base).toBe(18);
    expect(result.state.buffs).toEqual([
      { id: "food", spinsRemaining: 2, additivePayout: 0.25 },
      { id: "food", spinsRemaining: 1, additivePayout: 0.25 }
    ]);
  });

  it("disables the rightmost occupied part slots for this settlement without removing parts", () => {
    const draw = makeDraw([
      ["crack", "crack", "blank"],
      ["blank", "cherry", "lemon"],
      ["lemon", "blank", "cherry"]
    ]);
    const parts: readonly [PartInstance, null, PartInstance, null, PartInstance] = [
      { id: "jam-jar", level: 1 },
      null,
      { id: "omen-collector", level: 1 },
      null,
      { id: "overload-motor", level: 2 }
    ];
    const state = settlementState(draw, { partSlots: parts });

    const result = resolveSpin(state, draw);

    expect(result.events.filter((event) => event.type === "PART_DISABLED")).toEqual([
      { sequence: 1, type: "PART_DISABLED", partId: "overload-motor", slot: 4 },
      { sequence: 2, type: "PART_DISABLED", partId: "omen-collector", slot: 2 }
    ]);
    expect(result.state.partSlots).toEqual(parts);
    expect(state.partSlots).toEqual(parts);
  });

  it("counts only literal food and crack symbols instead of wild substitutes", () => {
    const draw = makeDraw([
      ["food", "blank", "blank"],
      ["wild", "blank", "blank"],
      ["food", "blank", "blank"]
    ]);
    const state = settlementState(draw, { partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null] });

    const result = resolveSpin(state, draw);

    expect(result.payout).toBe(0);
    expect(result.events.filter((event) => event.type === "FOOD_CONSUMED")).toHaveLength(2);
    expect(result.events.some((event) => event.type === "PART_DISABLED")).toBe(false);
  });
});

describe("resolveSpin payout and queue behavior", () => {
  it("increments dead-spin agitation to five and never exceeds the cap", () => {
    const draw = makeDraw(deadGrid);

    expect(resolveSpin(settlementState(draw, { agitation: 4 }), draw).state.agitation).toBe(5);
    const capped = resolveSpin(settlementState(draw, { agitation: 5 }), draw);
    expect(capped.state.agitation).toBe(5);
    expect(capped.events.filter((event) => event.type === "RESOURCE_CHANGED")).toEqual([]);
  });

  it("uses pre-agitation payout to release agitation as a separate award and clears it", () => {
    const draw = makeDraw(lemonLineGrid);

    const result = resolveSpin(settlementState(draw, { agitation: 3 }), draw);

    expect(result.payout).toBe(27);
    expect(result.attribution).toMatchObject({ base: 12, agitation: 15 });
    expect(result.state.agitation).toBe(0);
    expect(result.events).toEqual([
      { sequence: 1, type: "LINE_WIN", lineId: "middle", symbol: "lemon", amount: 12, source: "base" },
      { sequence: 2, type: "PAYOUT_ADDED", amount: 15, source: "agitation" },
      { sequence: 3, type: "RESOURCE_CHANGED", resource: "agitation", delta: -3 },
      { sequence: 4, type: "PAYOUT_COMPLETE", total: 27 }
    ]);
  });

  it("applies existing buffs to every ordinary payout source while keeping attribution distinct", () => {
    const draw = makeDraw(lemonLineGrid);
    const handler: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? [
            { type: "ADD_PAYOUT", amount: 2, source: "part" },
            { type: "ADD_PAYOUT", amount: 3, source: "intervention" },
            { type: "ADD_PAYOUT", amount: 4, source: "service" }
          ]
        : [];
    const state = settlementState(draw, {
      agitation: 2,
      buffs: [{ id: "food", spinsRemaining: 2, additivePayout: 0.25 }]
    });

    const result = resolveSpin(state, draw, [handler]);

    expect(result.attribution).toEqual({
      base: 15,
      part: 2.5,
      intervention: 3.75,
      service: 5,
      agitation: 12.5,
      overload: 0
    });
    expect(result.payout).toBe(38.75);
    expect(result.state.attribution).toEqual(result.attribution);
  });

  it("processes effects FIFO even when an earlier effect appends recursive work", () => {
    const draw = makeDraw(deadGrid);
    const handler: EffectHandler = (_context, signal) => {
      if (signal.type === "GRID_ACCEPTED") {
        return [
          { type: "ADD_PAYOUT", amount: 1, source: "part" },
          { type: "ADD_PAYOUT", amount: 2, source: "service" }
        ];
      }
      if (signal.type === "EFFECT_APPLIED" && signal.effect.type === "ADD_PAYOUT" && signal.effect.amount === 1) {
        return [{ type: "ADD_PAYOUT", amount: 3, source: "intervention" }];
      }
      return [];
    };

    const result = resolveSpin(settlementState(draw), draw, [handler]);

    expect(
      result.events.filter((event) => event.type === "PAYOUT_ADDED").map((event) => event.amount)
    ).toEqual([1, 2, 3]);
  });

  it("presents handlers with the latest working counters after each applied effect", () => {
    const draw = makeDraw(deadGrid);
    const observedCounters: number[] = [];
    const handler: EffectHandler = (context, signal) => {
      if (signal.type === "GRID_ACCEPTED") {
        return [{ type: "INCREMENT_COUNTER", counter: "blankCharge", amount: 1 }];
      }
      if (signal.type === "EFFECT_APPLIED") observedCounters.push(context.state.counters.blankCharge);
      return [];
    };

    resolveSpin(settlementState(draw), draw, [handler]);

    expect(observedCounters).toEqual([1]);
  });

  it("ignores non-finite awards and clamps extreme finite awards to safe cents", () => {
    const draw = makeDraw(deadGrid);
    const handler: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? [
            { type: "ADD_PAYOUT", amount: Number.NaN, source: "part" },
            { type: "ADD_PAYOUT", amount: Number.POSITIVE_INFINITY, source: "service" },
            { type: "ADD_PAYOUT", amount: Number.MAX_VALUE, source: "intervention" }
          ]
        : [];

    const result = resolveSpin(settlementState(draw), draw, [handler]);

    expect(Number.isFinite(result.payout)).toBe(true);
    expect(Number.isSafeInteger(result.payout * 100)).toBe(true);
    expect(Number.isFinite(result.state.bankroll)).toBe(true);
    expect(Number.isSafeInteger(result.state.bankroll * 100)).toBe(true);
    expect(result.attribution.part).toBe(0);
    expect(result.attribution.service).toBe(0);
  });

  it("deduplicates already-awarded lines during reevaluation", () => {
    const draw = makeDraw(lemonLineGrid);
    const handler: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED" ? [{ type: "REEVALUATE_LINES" }] : [];

    const result = resolveSpin(settlementState(draw), draw, [handler]);

    expect(result.events.filter((event) => event.type === "LINE_WIN")).toEqual([
      { sequence: 1, type: "LINE_WIN", lineId: "middle", symbol: "lemon", amount: 12, source: "base" }
    ]);
    expect(result.payout).toBe(12);
  });

  it("allows exactly 100 finite effects without overload", () => {
    const draw = makeDraw(deadGrid);
    const handler: EffectHandler = (context, signal) => {
      if (signal.type === "GRID_ACCEPTED" || (signal.type === "EFFECT_APPLIED" && context.eventCount < 100)) {
        return [{ type: "INCREMENT_COUNTER", counter: "blankCharge", amount: 1 }];
      }
      return [];
    };

    const result = resolveSpin(settlementState(draw), draw, [handler]);

    expect(result.effectCount).toBe(100);
    expect(result.state.counters.blankCharge).toBe(100);
    expect(result.attribution.overload).toBe(0);
    expect(result.events.some((event) => event.type === "OVERLOAD")).toBe(false);
  });

  it("replaces work beyond 100 effects with one exact unbuffed overload award and never re-enters handlers", () => {
    const draw = makeDraw(deadGrid);
    const handler: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED" || signal.type === "EFFECT_APPLIED"
        ? [{ type: "INCREMENT_COUNTER", counter: "blankCharge", amount: 1 }]
        : [];
    const state = settlementState(draw, {
      buffs: [{ id: "food", spinsRemaining: 1, additivePayout: 0.25 }]
    });

    const result = resolveSpin(state, draw, [handler]);

    expect(result.effectCount).toBe(101);
    expect(result.state.counters.blankCharge).toBe(100);
    expect(result.payout).toBe(250);
    expect(result.attribution.overload).toBe(250);
    expect(result.events.filter((event) => event.type === "OVERLOAD")).toEqual([
      { sequence: 1, type: "OVERLOAD", amount: 250 }
    ]);
  });
});
