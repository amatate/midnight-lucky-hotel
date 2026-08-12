import { describe, expect, it } from "vitest";
import { applyUpgrade } from "@/core/upgrades";
import { createRun } from "@/core/run";
import { resolveSpin, type EffectHandler } from "@/core/settlement";
import type {
  Grid,
  PartInstance,
  ReelDraw,
  ReelSet,
  RunState,
  UpgradeId,
  UpgradeTarget
} from "@/core/types";

const filler = ["blank", "cherry", "lemon"] as const;

function makeDraw(grid: Grid): ReelDraw {
  const strips: ReelSet = [
    [...grid[0], ...filler],
    [...grid[1], ...filler],
    [...grid[2], ...filler]
  ];
  return { strips, stops: [0, 0, 0], grid, rng: { value: 99 } };
}

function settlementState(draw: ReelDraw, part: PartInstance, patch: Partial<RunState> = {}): RunState {
  const state = createRun(123);
  return {
    ...state,
    phase: "AWAITING_INTERVENTION",
    reels: draw.strips,
    pendingSpin: { draw, isFree: false },
    partSlots: [part, null, null, null, null],
    ...patch
  };
}

function choosing(id: UpgradeId, patch: Partial<RunState> = {}): RunState {
  return {
    ...createRun(41),
    phase: "CHOOSING_UPGRADE",
    currentCandidates: { synergy: id, pivot: "calculator", wildcard: "carbon-copy" },
    ...patch
  };
}

function acquireReelModification(id: UpgradeId, target: UpgradeTarget, patch: Partial<RunState> = {}): RunState {
  const result = applyUpgrade(choosing(id, patch), { id, action: "apply", target });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

describe("fruit reel modifications", () => {
  it("adds two lemons to each selected reel for every lemon-crate acquisition", () => {
    const first = acquireReelModification("lemon-crate", { kind: "two-reels", reels: [0, 2] });

    expect(first.reels.map((strip) => strip.filter((symbol) => symbol === "lemon").length)).toEqual([5, 3, 5]);

    const second = acquireReelModification(
      "lemon-crate",
      { kind: "two-reels", reels: [0, 1] },
      { reels: first.reels }
    );
    expect(second.reels.map((strip) => strip.filter((symbol) => symbol === "lemon").length)).toEqual([7, 5, 5]);
  });

  it("replaces exactly one selected eligible symbol with a cherry", () => {
    const original = createRun(41).reels;
    const changed = acquireReelModification("cherry-pitter", {
      kind: "symbol-on-reel",
      reel: 1,
      symbol: "bell"
    });

    expect(changed.reels[1].filter((symbol) => symbol === "bell")).toHaveLength(
      original[1].filter((symbol) => symbol === "bell").length - 1
    );
    expect(changed.reels[1].filter((symbol) => symbol === "cherry")).toHaveLength(
      original[1].filter((symbol) => symbol === "cherry").length + 1
    );
    expect(changed.reels[0]).toEqual(original[0]);
    expect(changed.reels[2]).toEqual(original[2]);
  });
});

describe("lemon-infection", () => {
  it.each([
    { level: 1 as const, changed: [[1, 0]] as const, lines: ["middle", "top"], payout: 24 },
    {
      level: 2 as const,
      changed: [[1, 0], [0, 2]] as const,
      lines: ["middle", "top", "diagonal-up"],
      payout: 36
    }
  ])("transforms the first $level-level scan targets once per spin and reevaluates new lines", ({ level, changed, lines, payout }) => {
    const draw = makeDraw([
      ["lemon", "lemon", "bell"],
      ["cherry", "lemon", "blank"],
      ["lemon", "lemon", "seven"]
    ]);

    const result = resolveSpin(settlementState(draw, { id: "lemon-infection", level }), draw);

    expect(
      result.events
        .filter((event) => event.type === "SYMBOL_CHANGED")
        .map((event) => [event.reel, event.row])
    ).toEqual(changed);
    expect(result.events.filter((event) => event.type === "LINE_WIN").map((event) => event.lineId)).toEqual(lines);
    expect(result.payout).toBe(payout);
  });

  it("does not run when the exact equipped slot is crack-disabled", () => {
    const grid: Grid = [
      ["crack", "lemon", "bell"],
      ["cherry", "lemon", "blank"],
      ["lemon", "lemon", "seven"]
    ];
    const draw = makeDraw(grid);
    const state = settlementState(draw, { id: "jam-jar", level: 1 }, {
      partSlots: [
        { id: "jam-jar", level: 1 },
        null,
        null,
        null,
        { id: "lemon-infection", level: 2 }
      ]
    });

    const result = resolveSpin(state, draw);

    expect(result.events.filter((event) => event.type === "PART_DISABLED")).toEqual([
      { sequence: 1, type: "PART_DISABLED", partId: "lemon-infection", slot: 4 }
    ]);
    expect(result.events.some((event) => event.type === "SYMBOL_CHANGED")).toBe(false);
    expect(result.state.partSlots[4]).toEqual({ id: "lemon-infection", level: 2 });
  });
});

describe("jam-jar", () => {
  it.each([
    { level: 1 as const, expectedPartPayout: 50 },
    { level: 2 as const, expectedPartPayout: 100 }
  ])("adds level $level future-line bonuses in award order", ({ level, expectedPartPayout }) => {
    const grid: Grid = [
      ["cherry", "cherry", "cherry"],
      ["cherry", "cherry", "cherry"],
      ["cherry", "cherry", "cherry"]
    ];
    const draw = makeDraw(grid);

    const result = resolveSpin(settlementState(draw, { id: "jam-jar", level }), draw);

    expect(result.attribution.base).toBe(40);
    expect(result.attribution.part).toBe(expectedPartPayout);
    expect(result.state.counters.cherryWinsThisShift).toBe(5);
    expect(
      result.events.filter((event) => event.type === "PAYOUT_ADDED").map((event) => event.amount)
    ).toEqual(level === 1 ? [5, 10, 15, 20] : [10, 20, 30, 40]);
  });

  it("uses earlier shift wins and applies active food buffs to its attributed award", () => {
    const draw = makeDraw([
      ["blank", "cherry", "blank"],
      ["blank", "cherry", "blank"],
      ["blank", "cherry", "blank"]
    ]);
    const state = settlementState(draw, { id: "jam-jar", level: 1 }, {
      counters: { blankCharge: 0, cherryWinsThisShift: 2 },
      buffs: [{ id: "food", spinsRemaining: 2, additivePayout: 0.25 }]
    });

    const result = resolveSpin(state, draw);

    expect(result.attribution).toMatchObject({ base: 10, part: 12.5 });
    expect(result.state.counters.cherryWinsThisShift).toBe(3);
  });
});

describe("fruit-salad", () => {
  it.each([
    { level: 1 as const, expected: 15 },
    { level: 2 as const, expected: 25 }
  ])("pays the literal three-fruit pattern at level $level", ({ level, expected }) => {
    const draw = makeDraw([
      ["cherry", "blank", "blank"],
      ["lemon", "blank", "blank"],
      ["bell", "blank", "blank"]
    ]);

    const result = resolveSpin(settlementState(draw, { id: "fruit-salad", level }), draw);

    expect(result.payout).toBe(expected);
    expect(result.attribution).toMatchObject({ base: 0, part: expected });
    expect(result.events.filter((event) => event.type === "PAYOUT_ADDED")).toEqual([
      { sequence: 1, type: "PAYOUT_ADDED", amount: expected, source: "part" }
    ]);
  });

  it("does not let wild substitute and awards a newly created salad line only once on reevaluation", () => {
    const wildDraw = makeDraw([
      ["cherry", "blank", "blank"],
      ["wild", "blank", "blank"],
      ["bell", "blank", "blank"]
    ]);
    const wild = resolveSpin(settlementState(wildDraw, { id: "fruit-salad", level: 2 }), wildDraw);
    expect(wild.attribution.part).toBe(0);

    const draw = makeDraw([
      ["cherry", "lemon", "blank"],
      ["bell", "lemon", "blank"],
      ["cherry", "lemon", "blank"]
    ]);
    const state = settlementState(draw, { id: "lemon-infection", level: 1 }, {
      partSlots: [
        { id: "lemon-infection", level: 1 },
        { id: "fruit-salad", level: 1 },
        null,
        null,
        null
      ]
    });

    const result = resolveSpin(state, draw);

    expect(result.events.filter((event) => event.type === "PAYOUT_ADDED" && event.source === "part")).toEqual([
      { sequence: 3, type: "PAYOUT_ADDED", amount: 15, source: "part" }
    ]);
    expect(result.attribution).toMatchObject({ base: 12, part: 15 });
  });

  it("treats a salad award as the alternate result for those cells during later reevaluation", () => {
    const draw = makeDraw([
      ["cherry", "blank", "blank"],
      ["lemon", "blank", "blank"],
      ["bell", "blank", "blank"]
    ]);
    const transformToCherry: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? [
            { type: "TRANSFORM_CELL", reel: 1, row: 0, symbol: "cherry" },
            { type: "TRANSFORM_CELL", reel: 2, row: 0, symbol: "cherry" },
            { type: "REEVALUATE_LINES" }
          ]
        : [];

    const result = resolveSpin(settlementState(draw, { id: "fruit-salad", level: 1 }), draw, [
      { kind: "system", handler: transformToCherry }
    ]);

    expect(result.attribution).toMatchObject({ base: 0, part: 15 });
    expect(result.events.filter((event) => event.type === "LINE_WIN" && event.lineId === "top")).toEqual([]);
  });
});

describe("leftovers", () => {
  it.each([
    { level: 1 as const, expectedLengths: [7, 6, 6], expectedReturned: 1 },
    { level: 2 as const, expectedLengths: [7, 7, 6], expectedReturned: 2 }
  ])(
    "returns the first allowed foods at level $level to deterministic shortest reels",
    ({ level, expectedLengths, expectedReturned }) => {
      const strips: ReelSet = [
        ["blank", "cherry", "lemon", "bell", "seven", "blank"],
        ["blank", "lemon", "bell", "seven", "cherry", "blank"],
        ["food", "food", "cherry", "lemon", "bell", "seven", "blank", "blank"]
      ];
      const grid: Grid = [
        ["blank", "cherry", "lemon"],
        ["blank", "lemon", "bell"],
        ["food", "food", "cherry"]
      ];
      const draw: ReelDraw = { strips, stops: [0, 0, 0], grid, rng: { value: 7 } };

      const result = resolveSpin(settlementState(draw, { id: "leftovers", level }), draw);

      expect(result.events.filter((event) => event.type === "FOOD_CONSUMED")).toHaveLength(2);
      expect(result.state.reels.map((strip) => strip.length)).toEqual(expectedLengths);
      expect(result.state.reels[0].at(-1)).toBe("food");
      expect(result.state.reels[1].at(-1)).toBe(level === 2 ? "food" : "blank");
      expect(result.state.shiftFlags.returnedFoodCount).toBe(expectedReturned);
      expect(result.state.buffs).toHaveLength(2);
    }
  );

  it("honors the persisted per-shift guard", () => {
    const strips: ReelSet = [
      ["blank", "cherry", "lemon", "bell", "seven", "blank"],
      ["blank", "lemon", "bell", "seven", "cherry", "blank"],
      ["food", "food", "cherry", "lemon", "bell", "seven", "blank", "blank"]
    ];
    const grid: Grid = [
      ["blank", "cherry", "lemon"],
      ["blank", "lemon", "bell"],
      ["food", "food", "cherry"]
    ];
    const draw: ReelDraw = { strips, stops: [0, 0, 0], grid, rng: { value: 8 } };
    const state = settlementState(draw, { id: "leftovers", level: 2 }, {
      shiftFlags: { ...createRun(8).shiftFlags, returnedFoodCount: 1 }
    });

    const result = resolveSpin(state, draw);

    expect(result.state.shiftFlags.returnedFoodCount).toBe(2);
    expect(result.state.reels.flat().filter((symbol) => symbol === "food")).toHaveLength(1);
  });
});
