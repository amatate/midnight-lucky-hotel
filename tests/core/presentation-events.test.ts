import { describe, expect, it } from "vitest";
import { createRun } from "@/core/run";
import { resolveSpin } from "@/core/settlement";
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

function settlementState(
  draw: ReelDraw,
  part: PartInstance,
  slot = 0,
  patch: Partial<RunState> = {}
): RunState {
  const slots: (PartInstance | null)[] = [null, null, null, null, null];
  slots[slot] = part;
  return {
    ...createRun(123),
    phase: "AWAITING_INTERVENTION",
    reels: draw.strips,
    pendingSpin: { draw, isFree: false },
    partSlots: slots as unknown as RunState["partSlots"],
    ...patch
  };
}

describe("resolveSpin presentation part events", () => {
  it("emits the equipped fruit part and level immediately before its visible effects", () => {
    const draw = makeDraw([
      ["lemon", "cherry", "bell"],
      ["lemon", "seven", "cherry"],
      ["lemon", "bell", "seven"]
    ]);

    const result = resolveSpin(settlementState(draw, { id: "lemon-infection", level: 2 }), draw);

    expect(result.events.slice(0, 3).map((event) => event.type)).toEqual([
      "LINE_WIN",
      "PART_TRIGGERED",
      "SYMBOL_CHANGED"
    ]);
    expect(result.events[1]).toEqual({
      sequence: 2,
      type: "PART_TRIGGERED",
      partId: "lemon-infection",
      level: 2
    });
    expect(result.events[2]).toEqual({
      sequence: 3,
      type: "SYMBOL_CHANGED",
      reel: 0,
      row: 1,
      from: "cherry",
      to: "lemon"
    });
  });

  it("does not emit a trigger for a crack-disabled part", () => {
    const draw = makeDraw([
      ["lemon", "crack", "bell"],
      ["lemon", "seven", "cherry"],
      ["lemon", "bell", "seven"]
    ]);

    const result = resolveSpin(settlementState(draw, { id: "lemon-infection", level: 1 }, 4), draw);

    expect(result.events).toContainEqual({
      sequence: 1,
      type: "PART_DISABLED",
      partId: "lemon-infection",
      slot: 4
    });
    expect(result.events.some((event) => event.type === "PART_TRIGGERED")).toBe(false);
  });

  it("does not emit a trigger when an active part reaction returns no effects", () => {
    const draw = makeDraw([
      ["blank", "cherry", "lemon"],
      ["lemon", "blank", "cherry"],
      ["cherry", "lemon", "blank"]
    ]);

    const result = resolveSpin(settlementState(draw, { id: "jam-jar", level: 1 }), draw);

    expect(result.events.some((event) => event.type === "PART_TRIGGERED")).toBe(false);
  });

  it("emits for an active public part handler but not a system handler", () => {
    const draw = makeDraw([
      ["blank", "cherry", "lemon"],
      ["lemon", "blank", "cherry"],
      ["cherry", "lemon", "blank"]
    ]);
    const state = settlementState(draw, { id: "jam-jar", level: 2 });

    const result = resolveSpin(state, draw, [
      {
        kind: "part",
        slot: 0,
        partId: "jam-jar",
        handler: (_context, signal) => signal.type === "GRID_ACCEPTED"
          ? [{ type: "ADD_PAYOUT", amount: 2, source: "part" }]
          : []
      },
      {
        kind: "system",
        handler: (_context, signal) => signal.type === "GRID_ACCEPTED"
          ? [{ type: "ADD_PAYOUT", amount: 3, source: "service" }]
          : []
      }
    ]);

    expect(result.events.filter((event) => event.type === "PART_TRIGGERED")).toEqual([
      { sequence: 1, type: "PART_TRIGGERED", partId: "jam-jar", level: 2 }
    ]);
    expect(result.attribution).toMatchObject({ part: 2, service: 3 });
  });

  it("does not emit for a forged inactive public part registration", () => {
    const draw = makeDraw([
      ["blank", "cherry", "lemon"],
      ["lemon", "blank", "cherry"],
      ["cherry", "lemon", "blank"]
    ]);
    const state = settlementState(draw, { id: "jam-jar", level: 1 });

    const result = resolveSpin(state, draw, [{
      kind: "part",
      slot: 0,
      partId: "overload-motor",
      handler: () => [{ type: "ADD_PAYOUT", amount: 100, source: "part" }]
    }]);

    expect(result.events.some((event) => event.type === "PART_TRIGGERED")).toBe(false);
    expect(result.attribution.part).toBe(0);
  });

  it("keeps one ordered jam-jar trigger after each awarded cherry line", () => {
    const draw = makeDraw([
      ["cherry", "lemon", "cherry"],
      ["cherry", "bell", "cherry"],
      ["cherry", "seven", "cherry"]
    ]);

    const result = resolveSpin(settlementState(draw, { id: "jam-jar", level: 1 }), draw);

    expect(
      result.events.flatMap((event) => {
        if (event.type === "LINE_WIN") return [[event.type, event.lineId]];
        if (event.type === "PART_TRIGGERED") return [[event.type, event.partId]];
        return [];
      })
    ).toEqual([
      ["LINE_WIN", "top"],
      ["PART_TRIGGERED", "jam-jar"],
      ["LINE_WIN", "bottom"],
      ["PART_TRIGGERED", "jam-jar"]
    ]);
  });

  it("preserves rule-state fields while presentation events change independently", () => {
    const draw = makeDraw([
      ["cherry", "blank", "blank"],
      ["lemon", "blank", "blank"],
      ["bell", "blank", "blank"]
    ]);
    const state = settlementState(draw, { id: "fruit-salad", level: 1 });

    const result = resolveSpin(state, draw);

    expect({
      payout: result.payout,
      bankroll: result.state.bankroll,
      stateRng: result.state.rng,
      drawRng: result.state.pendingSpin?.draw.rng,
      settlementAttribution: result.attribution,
      cumulativeAttribution: result.state.attribution,
      reels: result.state.reels,
      counters: result.state.counters,
      flags: result.state.shiftFlags,
      buffs: result.state.buffs,
      progression: {
        phase: result.state.phase,
        checkoutTarget: result.state.checkoutTarget,
        shift: result.state.shift,
        baseSpinsInShift: result.state.baseSpinsInShift,
        shiftWager: result.state.shiftWager,
        shiftPayout: result.state.shiftPayout,
        baseBet: result.state.baseBet,
        betMode: result.state.betMode,
        interventionPoints: result.state.interventionPoints,
        maxInterventionPoints: result.state.maxInterventionPoints,
        nextShiftFocusBonus: result.state.nextShiftFocusBonus,
        freeSpinQueue: result.state.freeSpinQueue,
        agitation: result.state.agitation,
        omen: result.state.omen,
        afterHoursLevel: result.state.afterHoursLevel,
        exitUnlocked: result.state.exitUnlocked,
        acquiredUpgrades: result.state.acquiredUpgrades
      }
    }).toEqual({
      payout: 15,
      bankroll: 115,
      stateRng: state.rng,
      drawRng: { value: 99 },
      settlementAttribution: { base: 0, part: 15, intervention: 0, service: 0, agitation: 0, overload: 0 },
      cumulativeAttribution: { base: 0, part: 15, intervention: 0, service: 0, agitation: 0, overload: 0 },
      reels: [
        ["cherry", "blank", "blank", "blank", "cherry", "lemon"],
        ["lemon", "blank", "blank", "blank", "cherry", "lemon"],
        ["bell", "blank", "blank", "blank", "cherry", "lemon"]
      ],
      counters: { blankCharge: 0, cherryWinsThisShift: 0 },
      flags: {
        foodBought: false,
        prayerUsed: false,
        kickUsed: false,
        repairLockUsed: false,
        martyrEnabled: false,
        warrantyPaid: false,
        returnedFoodCount: 0
      },
      buffs: [],
      progression: {
        phase: "AWAITING_INTERVENTION",
        checkoutTarget: 200,
        shift: 1,
        baseSpinsInShift: 0,
        shiftWager: 0,
        shiftPayout: 15,
        baseBet: 10,
        betMode: "normal",
        interventionPoints: 2,
        maxInterventionPoints: 2,
        nextShiftFocusBonus: 0,
        freeSpinQueue: 0,
        agitation: 0,
        omen: 0,
        afterHoursLevel: 0,
        exitUnlocked: false,
        acquiredUpgrades: []
      }
    });
  });
});
