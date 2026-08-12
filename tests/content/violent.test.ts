import { describe, expect, it } from "vitest";
import { reactViolentParts } from "@/content/effects/violent";
import { applyUpgrade } from "@/core/upgrades";
import { createRun } from "@/core/run";
import { resolveSpin, type EffectHandler } from "@/core/settlement";
import type { Effect, Grid, PartInstance, ReelDraw, ReelSet, ResolveContext, RunState } from "@/core/types";

const filler = ["blank", "cherry", "lemon"] as const;

function makeDraw(grid: Grid): ReelDraw {
  const strips: ReelSet = [
    [...grid[0], ...filler],
    [...grid[1], ...filler],
    [...grid[2], ...filler]
  ];
  return { strips, stops: [0, 0, 0], grid, rng: { value: 303 } };
}

function settlementState(draw: ReelDraw, parts: RunState["partSlots"], patch: Partial<RunState> = {}): RunState {
  return {
    ...createRun(77),
    phase: "AWAITING_INTERVENTION",
    reels: draw.strips,
    pendingSpin: { draw, isFree: false },
    partSlots: parts,
    ...patch
  };
}

function withPart(part: PartInstance, slot = 0): RunState["partSlots"] {
  const slots: (PartInstance | null)[] = [null, null, null, null, null];
  slots[slot] = part;
  return slots as unknown as RunState["partSlots"];
}

const deadGrid: Grid = [
  ["blank", "cherry", "lemon"],
  ["lemon", "blank", "cherry"],
  ["cherry", "lemon", "blank"]
];

describe("violent reel modification", () => {
  it("acquires an artificial crack and carries its one-point focus bonus into only the next shift", () => {
    const state: RunState = {
      ...createRun(4),
      phase: "CHOOSING_UPGRADE",
      service: "repair",
      currentCandidates: { synergy: "artificial-crack", pivot: "calculator", wildcard: "ledger" }
    };

    const result = applyUpgrade(state, {
      id: "artificial-crack",
      action: "apply",
      target: { kind: "reel", reel: 2 }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.reels[2].filter((symbol) => symbol === "crack")).toHaveLength(1);
    expect(result.state.interventionPoints).toBe(4);
    expect(result.state.maxInterventionPoints).toBe(4);
    expect(result.state.nextShiftFocusBonus).toBe(0);
  });
});

describe("scrap magnet", () => {
  it.each([
    [1, 20],
    [2, 40]
  ] as const)("pays and removes the exact physical crack line at level %i", (level, payout) => {
    const draw = makeDraw([
      ["crack", "blank", "cherry"],
      ["crack", "cherry", "lemon"],
      ["crack", "lemon", "blank"]
    ]);
    const state = settlementState(draw, [
      { id: "scrap-magnet", level },
      { id: "jam-jar", level: 1 },
      { id: "omen-collector", level: 1 },
      { id: "loose-spring", level: 1 },
      null
    ]);

    const result = resolveSpin(state, draw);

    expect(result.attribution.part).toBe(payout);
    expect(result.events.filter((event) => event.type === "PAYOUT_ADDED")).toContainEqual(
      expect.objectContaining({ amount: payout, source: "part" })
    );
    expect(result.state.reels.map((strip) => strip.filter((symbol) => symbol === "crack").length)).toEqual([0, 0, 0]);
  });

  it("pays each qualifying fixed line once and deduplicates shared physical crack removals", () => {
    const draw = makeDraw(deadGrid);
    const makeCracks: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? [
            ...([0, 1, 2] as const).flatMap((reel) =>
              ([0, 1, 2] as const).map((row): Effect => ({ type: "TRANSFORM_CELL", reel, row, symbol: "crack" }))
            ),
            { type: "REEVALUATE_LINES" }
          ]
        : [];

    const result = resolveSpin(
      settlementState(draw, withPart({ id: "scrap-magnet", level: 1 })),
      draw,
      [{ kind: "system", handler: makeCracks }]
    );

    expect(result.attribution.part).toBe(100);
    expect(result.events.filter((event) => event.type === "PAYOUT_ADDED" && event.source === "part")).toHaveLength(5);
    expect(result.state.reels.map((strip) => strip.filter((symbol) => symbol === "crack").length)).toEqual([0, 0, 0]);
  });

  it("does not let wild substitute for a literal crack", () => {
    const draw = makeDraw([
      ["crack", "blank", "blank"],
      ["wild", "blank", "blank"],
      ["crack", "blank", "blank"]
    ]);
    const result = resolveSpin(settlementState(draw, withPart({ id: "scrap-magnet", level: 1 })), draw);

    expect(result.attribution.part).toBe(0);
    expect(result.state.reels[0]).toContain("crack");
    expect(result.state.reels[2]).toContain("crack");
  });

  it("removes captured crack identities after an earlier queued removal shifts numeric indices", () => {
    const strips: ReelSet = [
      ["crack", "blank", "cherry", "crack", "lemon", "bell"],
      ["blank", "lemon", "cherry", "seven", "bell", "blank"],
      ["blank", "bell", "cherry", "seven", "lemon", "blank"]
    ];
    const draw: ReelDraw = {
      strips,
      stops: [2, 2, 2],
      grid: [
        ["cherry", "crack", "lemon"],
        ["cherry", "seven", "bell"],
        ["cherry", "seven", "lemon"]
      ],
      rng: { value: 303 }
    };
    const createTopCrackLineThenShift: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? [
            { type: "TRANSFORM_CELL", reel: 0, row: 0, symbol: "crack" },
            { type: "TRANSFORM_CELL", reel: 1, row: 0, symbol: "crack" },
            { type: "TRANSFORM_CELL", reel: 2, row: 0, symbol: "crack" },
            { type: "REEVALUATE_LINES" },
            { type: "REMOVE_FROM_REEL", reel: 0, symbol: "crack", count: 1 }
          ]
        : [];
    const state = settlementState(draw, [
      { id: "scrap-magnet", level: 1 },
      null,
      null,
      null,
      { id: "jam-jar", level: 1 }
    ]);

    const result = resolveSpin(state, draw, [
      { kind: "system", handler: createTopCrackLineThenShift }
    ]);

    expect(result.attribution.part).toBe(20);
    expect(result.state.reels[0].filter((symbol) => symbol === "crack")).toHaveLength(1);
    expect(result.state.reels[0][1]).toBe("crack");
    expect(result.state.reels[1].filter((symbol) => symbol === "crack")).toHaveLength(0);
    expect(result.state.reels[2].filter((symbol) => symbol === "crack")).toHaveLength(0);
    const resolvedDraw = result.state.pendingSpin?.draw as ReelDraw & {
      readonly entryIds?: readonly (readonly number[])[];
    };
    expect(resolvedDraw.entryIds?.[0]).toContain(3);
    expect(resolvedDraw.entryIds?.[0]).not.toContain(2);
  });
});

describe("blank capacitor", () => {
  it("retains the remainder and grants the floor of cumulative level-one thresholds as queued free spins", () => {
    const firstDraw = makeDraw([
      ["blank", "cherry", "lemon"],
      ["lemon", "blank", "cherry"],
      ["cherry", "lemon", "bell"]
    ]);
    const parts = withPart({ id: "blank-capacitor", level: 1 });
    const first = resolveSpin(settlementState(firstDraw, parts), firstDraw);
    expect(first.state.counters.blankCharge).toBe(2);
    expect(first.state.freeSpinQueue).toBe(0);

    const secondDraw = makeDraw([
      ["blank", "blank", "lemon"],
      ["blank", "cherry", "lemon"],
      ["blank", "lemon", "cherry"]
    ]);
    const secondState = settlementState(secondDraw, parts, {
      counters: first.state.counters,
      freeSpinQueue: first.state.freeSpinQueue
    });
    const second = resolveSpin(secondState, secondDraw);

    expect(second.state.counters.blankCharge).toBe(0);
    expect(second.state.freeSpinQueue).toBe(2);
    expect(second.events).toContainEqual(
      expect.objectContaining({ type: "RESOURCE_CHANGED", resource: "freeSpins", delta: 2 })
    );
  });

  it("uses a threshold of two at level two and counts a wrapped physical blank only once", () => {
    const strips: ReelSet = [["blank"], ["cherry"], ["lemon"]];
    const draw: ReelDraw = {
      strips,
      stops: [0, 0, 0],
      grid: [
        ["blank", "blank", "blank"],
        ["cherry", "cherry", "cherry"],
        ["lemon", "lemon", "lemon"]
      ],
      rng: { value: 1 }
    };
    const state = settlementState(draw, withPart({ id: "blank-capacitor", level: 2 }));
    const reevaluate: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED" ? [{ type: "REEVALUATE_LINES" }] : [];

    const result = resolveSpin(state, draw, [{ kind: "system", handler: reevaluate }]);

    expect(result.state.counters.blankCharge).toBe(1);
    expect(result.state.freeSpinQueue).toBe(0);
  });

  it("settles stored charge against an upgraded threshold without requiring a newly visible blank", () => {
    const draw = makeDraw([
      ["cherry", "lemon", "bell"],
      ["lemon", "bell", "seven"],
      ["bell", "seven", "cherry"]
    ]);
    const charged = settlementState(draw, withPart({ id: "blank-capacitor", level: 2 }), {
      counters: { ...createRun(1).counters, blankCharge: 2 }
    });

    const result = resolveSpin(charged, draw);

    expect(result.state.counters.blankCharge).toBe(0);
    expect(result.state.freeSpinQueue).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: "RESOURCE_CHANGED", resource: "freeSpins", delta: 1 })
    );
  });

  it("does not grant a phantom free spin when stored charge remains below the threshold", () => {
    const draw = makeDraw([
      ["cherry", "lemon", "bell"],
      ["lemon", "bell", "seven"],
      ["bell", "seven", "cherry"]
    ]);
    const charged = settlementState(draw, withPart({ id: "blank-capacitor", level: 1 }), {
      counters: { ...createRun(1).counters, blankCharge: 1 }
    });

    const result = resolveSpin(charged, draw);

    expect(result.state.counters.blankCharge).toBe(1);
    expect(result.state.freeSpinQueue).toBe(0);
  });
});

describe("warranty fraud", () => {
  it.each([
    [1, 30],
    [2, 60]
  ] as const)("pays only the first disabled-part signal in a shift at level %i", (level, payout) => {
    const draw = makeDraw([
      ["crack", "crack", "blank"],
      ["blank", "cherry", "lemon"],
      ["lemon", "blank", "cherry"]
    ]);
    const parts: RunState["partSlots"] = [
      { id: "warranty-fraud", level },
      null,
      { id: "jam-jar", level: 1 },
      null,
      { id: "omen-collector", level: 1 }
    ];

    const result = resolveSpin(settlementState(draw, parts), draw);

    expect(result.attribution.part).toBe(payout);
    expect(result.state.shiftFlags.warrantyPaid).toBe(true);
    expect(result.events.filter((event) => event.type === "PAYOUT_ADDED" && event.source === "part")).toHaveLength(1);
  });

  it("does not pay when the warranty part itself is crack-disabled before dispatch", () => {
    const draw = makeDraw([
      ["crack", "blank", "blank"],
      ["blank", "cherry", "lemon"],
      ["lemon", "blank", "cherry"]
    ]);
    const state = settlementState(draw, withPart({ id: "warranty-fraud", level: 2 }, 4));

    const result = resolveSpin(state, draw);

    expect(result.attribution.part).toBe(0);
    expect(result.state.shiftFlags.warrantyPaid).toBe(false);
  });

  it("does not pay again after the shift flag has been set", () => {
    const draw = makeDraw([
      ["crack", "blank", "blank"],
      ["blank", "cherry", "lemon"],
      ["lemon", "blank", "cherry"]
    ]);
    const parts: RunState["partSlots"] = [
      { id: "warranty-fraud", level: 1 },
      null,
      null,
      null,
      { id: "jam-jar", level: 1 }
    ];
    const state = settlementState(draw, parts, {
      shiftFlags: { ...createRun(1).shiftFlags, warrantyPaid: true }
    });

    expect(resolveSpin(state, draw).attribution.part).toBe(0);
  });
});

describe("overload motor", () => {
  function sixCoreEffects(): EffectHandler {
    return (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? Array.from({ length: 6 }, (): Effect => ({
            type: "INCREMENT_COUNTER",
            counter: "cherryWinsThisShift",
            amount: 1
          }))
        : [];
  }

  it.each([
    [1, 12.5],
    [2, 25]
  ] as const)("pays for core effect ordinals two through six and cracks every reel once at level %i", (level, payout) => {
    const draw = makeDraw(deadGrid);
    const state = settlementState(draw, withPart({ id: "overload-motor", level }));

    const result = resolveSpin(state, draw, [{ kind: "system", handler: sixCoreEffects() }]);

    expect(result.attribution.part).toBe(payout);
    expect(result.events.filter((event) => event.type === "PAYOUT_ADDED" && event.source === "part")).toHaveLength(5);
    expect(result.state.reels.map((strip) => strip.filter((symbol) => symbol === "crack").length)).toEqual([1, 1, 1]);
    expect(result.effectCount).toBeLessThan(30);
    expect(result.events.some((event) => event.type === "OVERLOAD")).toBe(false);
  });

  it("does not add cracks before the sixth core applied effect", () => {
    const draw = makeDraw(deadGrid);
    const onlyFive: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? Array.from({ length: 5 }, (): Effect => ({ type: "CHANGE_OMEN", amount: 0 }))
        : [];

    const result = resolveSpin(
      settlementState(draw, withPart({ id: "overload-motor", level: 1 })),
      draw,
      [{ kind: "system", handler: onlyFive }]
    );

    expect(result.attribution.part).toBe(10);
    expect(result.state.reels.flat().filter((symbol) => symbol === "crack")).toHaveLength(0);
  });

  it("does not count effects descended from its own payout as new motor ordinals", () => {
    const draw = makeDraw(deadGrid);
    const initial: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? [
            { type: "CHANGE_OMEN", amount: 0 },
            { type: "CHANGE_OMEN", amount: 0 }
          ]
        : [];
    const payoutResponder: EffectHandler = (_context, signal) =>
      signal.type === "EFFECT_APPLIED" && signal.effect.type === "ADD_PAYOUT"
        ? [{ type: "INCREMENT_COUNTER", counter: "cherryWinsThisShift", amount: 1 }]
        : [];
    const state = settlementState(draw, withPart({ id: "overload-motor", level: 1 }));

    const result = resolveSpin(state, draw, [
      { kind: "system", handler: initial },
      { kind: "system", handler: payoutResponder }
    ]);

    expect(result.attribution.part).toBe(2.5);
    expect(result.state.counters.cherryWinsThisShift).toBe(1);
    expect(result.effectCount).toBe(4);
    expect(result.events.some((event) => event.type === "OVERLOAD")).toBe(false);
  });

  it("keeps motor ancestry through synchronous reevaluation and line-awarded descendants", () => {
    const draw = makeDraw(deadGrid);
    const initial: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? [
            { type: "CHANGE_OMEN", amount: 0 },
            { type: "CHANGE_OMEN", amount: 0 }
          ]
        : [];
    const motorPayoutCreatesLine: EffectHandler = (_context, signal) =>
      signal.type === "EFFECT_APPLIED" &&
      signal.effect.type === "ADD_PAYOUT" &&
      signal.effect.amount === 2.5
        ? [
            { type: "TRANSFORM_CELL", reel: 0, row: 0, symbol: "seven" },
            { type: "TRANSFORM_CELL", reel: 1, row: 0, symbol: "seven" },
            { type: "TRANSFORM_CELL", reel: 2, row: 0, symbol: "seven" },
            { type: "REEVALUATE_LINES" }
          ]
        : [];
    const linePart: EffectHandler = (_context, signal) =>
      signal.type === "LINE_AWARDED" && signal.win.lineId === "top"
        ? [{ type: "INCREMENT_COUNTER", counter: "cherryWinsThisShift", amount: 1 }]
        : [];
    const state = settlementState(draw, withPart({ id: "overload-motor", level: 1 }));

    const result = resolveSpin(state, draw, [
      { kind: "system", handler: initial },
      { kind: "system", handler: motorPayoutCreatesLine },
      { kind: "system", handler: linePart }
    ]);

    expect(result.attribution.part).toBe(2.5);
    expect(result.state.counters.cherryWinsThisShift).toBe(1);
    expect(result.state.reels.flat().filter((symbol) => symbol === "crack")).toHaveLength(0);
    expect(result.events.some((event) => event.type === "OVERLOAD")).toBe(false);
  });

  it("keeps motor ancestry through synchronous part-disabled and warranty descendants", () => {
    const draw = makeDraw(deadGrid);
    const initial: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? [
            { type: "CHANGE_OMEN", amount: 0 },
            { type: "CHANGE_OMEN", amount: 0 }
          ]
        : [];
    const motorPayoutDisables: EffectHandler = (_context, signal) =>
      signal.type === "EFFECT_APPLIED" &&
      signal.effect.type === "ADD_PAYOUT" &&
      signal.effect.amount === 2.5
        ? [{ type: "DISABLE_PART", slot: 4 }]
        : [];
    const parts: RunState["partSlots"] = [
      { id: "overload-motor", level: 1 },
      { id: "warranty-fraud", level: 1 },
      null,
      null,
      { id: "jam-jar", level: 1 }
    ];
    const state = settlementState(draw, parts);

    const result = resolveSpin(state, draw, [
      { kind: "system", handler: initial },
      { kind: "system", handler: motorPayoutDisables }
    ]);

    expect(result.attribution.part).toBe(32.5);
    expect(result.state.shiftFlags.warrantyPaid).toBe(true);
    expect(result.state.reels.flat().filter((symbol) => symbol === "crack")).toHaveLength(0);
    expect(result.events.filter((event) => event.type === "PAYOUT_ADDED" && event.source === "part")).toHaveLength(2);
    expect(result.events.some((event) => event.type === "OVERLOAD")).toBe(false);
  });

  it("applies existing food buffs to motor payouts while preserving part attribution", () => {
    const draw = makeDraw(deadGrid);
    const state = settlementState(draw, withPart({ id: "overload-motor", level: 1 }), {
      buffs: [{ id: "food", spinsRemaining: 2, additivePayout: 0.25 }]
    });

    const result = resolveSpin(state, draw, [{ kind: "system", handler: sixCoreEffects() }]);

    expect(result.attribution.part).toBe(15.65);
    expect(result.events.flatMap((event) => event.type === "PAYOUT_ADDED" && event.source === "part" ? [event.amount] : []))
      .toEqual([3.13, 3.13, 3.13, 3.13, 3.13]);
  });
});

describe("violent resolve capability isolation", () => {
  it("does not react to a forgeable public context outside central settlement registration", () => {
    const draw = makeDraw(deadGrid);
    const state = settlementState(draw, withPart({ id: "blank-capacitor", level: 1 }));
    const context = {
      state,
      grid: draw.grid,
      currentBet: 10,
      queue: [],
      triggeredKeys: new Set<string>(),
      awardedWinKeys: new Set<string>(),
      eventCount: 0,
      violentSlot: 0
    } as unknown as ResolveContext;

    expect(reactViolentParts(context, { type: "GRID_ACCEPTED" })).toEqual([]);
  });
});
