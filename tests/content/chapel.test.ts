import { describe, expect, it } from "vitest";
import { reactChapelParts } from "@/content/effects/chapel";
import { enableMartyr, pray } from "@/content/services/chapel";
import { nextInt } from "@/core/random";
import { createRun, dispatchCommand } from "@/core/run";
import { resolveSpin, type EffectHandler } from "@/core/settlement";
import type {
  BaseSymbolId,
  Grid,
  PartInstance,
  ReelDraw,
  ReelSet,
  ResolveContext,
  RunState
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

function chapelReady(patch: Partial<RunState> = {}): RunState {
  return {
    ...createRun(17),
    phase: "READY_TO_SPIN",
    service: "chapel",
    pendingSpin: null,
    ...patch
  };
}

function settlementState(
  draw: ReelDraw,
  partSlots: RunState["partSlots"],
  patch: Partial<RunState> = {}
): RunState {
  return {
    ...createRun(23),
    phase: "AWAITING_INTERVENTION",
    reels: draw.strips,
    pendingSpin: { draw, isFree: false },
    partSlots,
    ...patch
  };
}

function withPart(part: PartInstance, slot = 0): RunState["partSlots"] {
  const slots: (PartInstance | null)[] = [null, null, null, null, null];
  slots[slot] = part;
  return slots as unknown as RunState["partSlots"];
}

function accept(result: ReturnType<typeof dispatchCommand>): RunState {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

const deadGrid: Grid = [
  ["blank", "cherry", "lemon"],
  ["lemon", "blank", "cherry"],
  ["cherry", "lemon", "blank"]
];

const sevenLineGrid: Grid = [
  ["seven", "blank", "cherry"],
  ["wild", "cherry", "lemon"],
  ["seven", "lemon", "blank"]
];

describe("chapel prayer", () => {
  it("spends one intervention and adds exactly two temporary copies per reel to the next draw", () => {
    const state = chapelReady({ interventionPoints: 2 });
    const originalReels = structuredClone(state.reels);

    const prayed = pray(state, "bell");

    expect(prayed.ok).toBe(true);
    if (!prayed.ok) throw new Error(prayed.error.message);
    expect(prayed.state).toMatchObject({
      interventionPoints: 1,
      interventionUsedThisSpin: true,
      pendingPrayer: "bell",
      shiftFlags: { prayerUsed: true }
    });
    expect(prayed.state.reels).toEqual(originalReels);
    expect(prayed.state.temporaryReelAdditions).toEqual([
      ["bell", "bell"],
      ["bell", "bell"],
      ["bell", "bell"]
    ]);
    expect(prayed.events).toEqual([
      { sequence: 1, type: "INTERVENTION_USED", kind: "prayer", target: "bell" },
      { sequence: 2, type: "RESOURCE_CHANGED", resource: "focus", delta: -1 }
    ]);
    expect(prayed.state.commandHistory.at(-1)).toEqual({ type: "PRAY", symbol: "bell" });

    const first = nextInt(prayed.state.rng, state.reels[0].length + 2);
    const second = nextInt(first.rng, state.reels[1].length + 2);
    const third = nextInt(second.rng, state.reels[2].length + 2);
    const spinning = accept(dispatchCommand(prayed.state, { type: "SPIN" }));

    expect(spinning.pendingSpin?.draw.strips.map((strip) => strip.length)).toEqual(
      state.reels.map((strip) => strip.length + 2)
    );
    expect(spinning.pendingSpin?.draw.stops).toEqual([first.value, second.value, third.value]);
    expect(spinning.rng).toEqual(third.rng);
    expect(spinning.reels).toEqual(originalReels);
    expect(spinning.interventionUsedThisSpin).toBe(true);
  });

  it("clears prayer state after settlement, adds omen on failure, and does not add omen on a wild-assisted success", () => {
    const failedPrayer = pray(chapelReady(), "bell");
    expect(failedPrayer.ok).toBe(true);
    if (!failedPrayer.ok) throw new Error(failedPrayer.error.message);
    let failed = accept(dispatchCommand(failedPrayer.state, { type: "SPIN" }));
    failed = accept(dispatchCommand(failed, { type: "REELS_STOPPED" }));
    failed = {
      ...failed,
      pendingSpin: { ...failed.pendingSpin!, draw: { ...failed.pendingSpin!.draw, grid: deadGrid } }
    };
    const failedOutcome = dispatchCommand(failed, { type: "ACCEPT_OUTCOME" });
    expect(failedOutcome.ok).toBe(true);
    if (!failedOutcome.ok) throw new Error(failedOutcome.error.message);
    expect(failedOutcome.state).toMatchObject({ pendingPrayer: null, omen: 1 });
    expect(failedOutcome.state.temporaryReelAdditions).toEqual([[], [], []]);
    expect(failedOutcome.events).toContainEqual(
      expect.objectContaining({ type: "RESOURCE_CHANGED", resource: "omen", delta: 1 })
    );

    const successfulPrayer = pray(chapelReady({ omen: 4 }), "seven");
    expect(successfulPrayer.ok).toBe(true);
    if (!successfulPrayer.ok) throw new Error(successfulPrayer.error.message);
    let successful = accept(dispatchCommand(successfulPrayer.state, { type: "SPIN" }));
    successful = accept(dispatchCommand(successful, { type: "REELS_STOPPED" }));
    successful = {
      ...successful,
      pendingSpin: { ...successful.pendingSpin!, draw: { ...successful.pendingSpin!.draw, grid: sevenLineGrid } }
    };
    const successfulOutcome = dispatchCommand(successful, { type: "ACCEPT_OUTCOME" });
    expect(successfulOutcome.ok).toBe(true);
    if (!successfulOutcome.ok) throw new Error(successfulOutcome.error.message);
    expect(successfulOutcome.state.omen).toBe(4);
    expect(successfulOutcome.events).toContainEqual(
      expect.objectContaining({ type: "LINE_WIN", symbol: "seven", source: "base" })
    );
    expect(successfulOutcome.events).not.toContainEqual(
      expect.objectContaining({ type: "RESOURCE_CHANGED", resource: "omen" })
    );
  });

  it("removes only prayer-tagged copies while preserving permanent settlement additions", () => {
    const original = chapelReady({
      partSlots: withPart({ id: "triple-blessing", level: 1 })
    });
    const originalSevens = original.reels.map((strip) => strip.filter((symbol) => symbol === "seven").length);
    const prayed = pray(original, "seven");
    expect(prayed.ok).toBe(true);
    if (!prayed.ok) throw new Error(prayed.error.message);
    let state = accept(dispatchCommand(prayed.state, { type: "SPIN" }));
    state = accept(dispatchCommand(state, { type: "REELS_STOPPED" }));
    state = { ...state, pendingSpin: { ...state.pendingSpin!, draw: { ...state.pendingSpin!.draw, grid: sevenLineGrid } } };

    const result = dispatchCommand(state, { type: "ACCEPT_OUTCOME" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.reels.map((strip) => strip.filter((symbol) => symbol === "seven").length)).toEqual(
      originalSevens
    );
    expect(result.state.reels.map((strip) => strip.filter((symbol) => symbol === "blank").length)).toEqual(
      original.reels.map((strip) => strip.filter((symbol) => symbol === "blank").length + 1)
    );
    expect(result.state.pendingSpin?.draw.strips.map((strip) => strip.length)).toEqual(
      result.state.reels.map((strip) => strip.length + 2)
    );
  });

  it("occupies the sole intervention so post-stop respin is rejected", () => {
    const prayed = dispatchCommand(chapelReady(), { type: "PRAY", symbol: "cherry" });
    expect(prayed.ok).toBe(true);
    if (!prayed.ok) throw new Error(prayed.error.message);
    let state = accept(dispatchCommand(prayed.state, { type: "SPIN" }));
    state = accept(dispatchCommand(state, { type: "REELS_STOPPED" }));
    const snapshot = structuredClone(state);

    const result = dispatchCommand(state, { type: "RESPIN_REEL", reelIndex: 1 });

    expect(result).toEqual({
      ok: false,
      state,
      error: { code: "RESOURCE_EXHAUSTED", message: "an intervention was already used this spin" }
    });
    expect(state).toEqual(snapshot);
  });

  it("keeps temporary identity aligned when settlement removes an earlier permanent entry", () => {
    const strips: ReelSet = [
      ["food", "blank", "lemon", "cherry", "cherry"],
      ["blank", "lemon", "cherry", "cherry"],
      ["blank", "lemon", "cherry", "cherry"]
    ];
    const draw: ReelDraw = {
      strips,
      stops: [0, 0, 0],
      grid: [
        ["food", "blank", "lemon"],
        ["blank", "lemon", "cherry"],
        ["blank", "lemon", "cherry"]
      ],
      rng: { value: 1 }
    };
    const state = settlementState(draw, [null, null, null, null, null], {
      reels: [
        ["food", "blank", "lemon", "cherry"],
        ["blank", "lemon", "cherry"],
        ["blank", "lemon", "cherry"]
      ],
      pendingPrayer: "cherry",
      temporaryReelAdditions: [["cherry"], ["cherry"], ["cherry"]]
    });

    const result = resolveSpin(state, draw);

    expect(result.state.reels).toEqual([
      ["blank", "lemon", "cherry"],
      ["blank", "lemon", "cherry"],
      ["blank", "lemon", "cherry"]
    ]);
    expect(result.state.pendingSpin?.draw.strips).toEqual([
      ["blank", "lemon", "cherry", "cherry"],
      ["blank", "lemon", "cherry", "cherry"],
      ["blank", "lemon", "cherry", "cherry"]
    ]);
  });

  it("requires the prayed final line to have received a base award", () => {
    const grid: Grid = [
      ["cherry", "blank", "blank"],
      ["lemon", "blank", "blank"],
      ["bell", "blank", "blank"]
    ];
    const draw = makeDraw(grid);
    const state = settlementState(draw, withPart({ id: "fruit-salad", level: 1 }), {
      service: "chapel",
      pendingPrayer: "lemon",
      temporaryReelAdditions: [["lemon", "lemon"], ["lemon", "lemon"], ["lemon", "lemon"]]
    });
    const forceUnawardedLine: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? [
            { type: "TRANSFORM_CELL", reel: 0, row: 0, symbol: "lemon" },
            { type: "TRANSFORM_CELL", reel: 2, row: 0, symbol: "lemon" },
            { type: "REEVALUATE_LINES" }
          ]
        : [];

    const result = resolveSpin(state, draw, [{ kind: "system", handler: forceUnawardedLine }]);

    expect(result.state.pendingSpin?.draw.grid[0][0]).toBe("lemon");
    expect(result.state.pendingSpin?.draw.grid[2][0]).toBe("lemon");
    expect(result.events).not.toContainEqual(expect.objectContaining({ type: "LINE_WIN", lineId: "top" }));
    expect(result.state.omen).toBe(1);
  });

  it.each([
    ["wrong phase", chapelReady({ phase: "SPINNING" }), "INVALID_PHASE"],
    ["pending spin", chapelReady({ pendingSpin: { draw: makeDraw(deadGrid), isFree: false } }), "INVALID_PHASE"],
    ["wrong service", chapelReady({ service: "kitchen" }), "INVALID_TARGET"],
    ["already prayed", chapelReady({ shiftFlags: { ...chapelReady().shiftFlags, prayerUsed: true } }), "RESOURCE_EXHAUSTED"],
    ["no focus", chapelReady({ interventionPoints: 0 }), "RESOURCE_EXHAUSTED"]
  ] as const)("rejects %s without mutation", (_name, state, code) => {
    const snapshot = structuredClone(state);
    const result = pray(state, "lemon");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe(code);
    expect(result.state).toBe(state);
    expect(state).toEqual(snapshot);
  });

  it("applies each seven part only to the first seven line in a multi-line spin", () => {
    const grid: Grid = [
      ["seven", "seven", "blank"],
      ["seven", "wild", "cherry"],
      ["wild", "seven", "lemon"]
    ];
    const draw = makeDraw(grid);
    const base = settlementState(
      draw,
      [
        { id: "omen-collector", level: 1 },
        { id: "triple-blessing", level: 1 },
        { id: "martyr-coin", level: 1 },
        null,
        null
      ],
      {
        omen: 2,
        shiftFlags: { ...createRun(1).shiftFlags, martyrEnabled: true }
      }
    );

    const result = resolveSpin(base, draw);

    expect(result.attribution).toMatchObject({ base: 100, part: 110 });
    expect(result.state.omen).toBe(0);
    expect(result.events.filter((event) => event.type === "LINE_WIN")).toHaveLength(2);
    expect(result.events.filter((event) => event.type === "PAYOUT_ADDED")).toHaveLength(3);
    for (const reel of [0, 1, 2] as const) expect(result.state.reels[reel].at(-1)).toBe("blank");
  });

  it("rejects non-base prayer targets", () => {
    const state = chapelReady();
    const result = pray(state, "wild" as BaseSymbolId);
    expect(result).toEqual({
      ok: false,
      state,
      error: { code: "INVALID_TARGET", message: "prayer requires a base symbol" }
    });
  });
});

describe("martyr coin service", () => {
  it("rounds ten percent up from the pre-payment bankroll and records the shift flag, expense, event, and command", () => {
    const state = chapelReady({
      bankroll: 100.01,
      partSlots: withPart({ id: "martyr-coin", level: 1 })
    });

    const result = dispatchCommand(state, { type: "ENABLE_MARTYR" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.bankroll).toBe(89.01);
    expect(result.state.expenses.chapel).toBe(11);
    expect(result.state.shiftFlags.martyrEnabled).toBe(true);
    expect(result.events).toEqual([{ sequence: 1, type: "SERVICE_USED", serviceId: "chapel", cost: 11 }]);
    expect(result.state.commandHistory.at(-1)).toEqual({ type: "ENABLE_MARTYR" });
  });

  it.each([
    ["after first base spin", chapelReady({ baseSpinsInShift: 1 }), "RESOURCE_EXHAUSTED"],
    ["already enabled", chapelReady({ shiftFlags: { ...chapelReady().shiftFlags, martyrEnabled: true } }), "RESOURCE_EXHAUSTED"],
    ["without the part", chapelReady(), "INVALID_TARGET"],
    ["zero bankroll", chapelReady({ bankroll: 0, partSlots: withPart({ id: "martyr-coin", level: 1 }) }), "INSUFFICIENT_FUNDS"],
    ["below rounded cost", chapelReady({ bankroll: 0.5, partSlots: withPart({ id: "martyr-coin", level: 1 }) }), "INSUFFICIENT_FUNDS"]
  ] as const)("rejects %s without mutation", (_name, patch, code) => {
    const state = patch;
    const snapshot = structuredClone(state);
    const result = enableMartyr(state);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe(code);
    expect(state).toEqual(snapshot);
  });
});

describe("chapel part settlement", () => {
  it.each([
    [1, 3, 65, 15],
    [2, 3, 80, 30],
    [1, 0, 50, 0]
  ] as const)("omen collector level %i with %i omen pays %i total and attributes %i to the part", (level, omen, total, part) => {
    const draw = makeDraw(sevenLineGrid);
    const state = settlementState(draw, withPart({ id: "omen-collector", level }), { omen });

    const result = resolveSpin(state, draw);

    expect(result.payout).toBe(total);
    expect(result.attribution).toMatchObject({ base: 50, part });
    expect(result.state.omen).toBe(0);
    expect(result.events.filter((event) => event.type === "RESOURCE_CHANGED" && event.resource === "omen")).toEqual(
      omen === 0 ? [] : [expect.objectContaining({ type: "RESOURCE_CHANGED", resource: "omen", delta: -omen })]
    );
  });

  it.each([
    [1, 100, 50, 1],
    [2, 150, 100, 2]
  ] as const)("triple blessing level %i repeats the exact first seven award and adds permanent blanks", (level, total, part, blanks) => {
    const draw = makeDraw(sevenLineGrid);
    const state = settlementState(draw, withPart({ id: "triple-blessing", level }));

    const result = resolveSpin(state, draw);

    expect(result.payout).toBe(total);
    expect(result.attribution).toMatchObject({ base: 50, part });
    expect(result.events.filter((event) => event.type === "LINE_WIN")).toHaveLength(1);
    for (const reel of [0, 1, 2] as const) {
      expect(result.state.reels[reel].slice(-blanks)).toEqual(Array(blanks).fill("blank"));
    }
  });

  it.each([
    [1, 0, 1, 40],
    [2, 0, 2, 120]
  ] as const)("midnight bell level %i transforms the leftmost literal bells once and reevaluates", (level, firstReel, changed, payout) => {
    const grid: Grid = [
      ["bell", "bell", "blank"],
      ["bell", "bell", "cherry"],
      ["wild", "bell", "lemon"]
    ];
    const draw = makeDraw(grid);
    const state = settlementState(draw, withPart({ id: "midnight-bell", level }));

    const result = resolveSpin(state, draw);

    const changes = result.events.filter((event) => event.type === "SYMBOL_CHANGED");
    expect(changes).toHaveLength(changed);
    expect(changes[0]).toMatchObject({ reel: firstReel, row: 0, from: "bell", to: "wild" });
    expect(changes.every((event) => event.row === 0)).toBe(true);
    expect(result.payout).toBe(payout);
  });

  it.each([
    [1, 100, 50],
    [2, 150, 100]
  ] as const)("martyr coin level %i adds exactly the promised seven repeats", (level, total, part) => {
    const draw = makeDraw(sevenLineGrid);
    const state = settlementState(draw, withPart({ id: "martyr-coin", level }), {
      shiftFlags: { ...createRun(1).shiftFlags, martyrEnabled: true }
    });

    const result = resolveSpin(state, draw);

    expect(result.payout).toBe(total);
    expect(result.attribution).toMatchObject({ base: 50, part });
  });

  it("coordinates martyr and triple blessing independently and applies food buffs to every copy", () => {
    const draw = makeDraw(sevenLineGrid);
    const state = settlementState(
      draw,
      [
        { id: "martyr-coin", level: 1 },
        { id: "triple-blessing", level: 1 },
        null,
        null,
        null
      ],
      {
        shiftFlags: { ...createRun(1).shiftFlags, martyrEnabled: true },
        buffs: [{ id: "food", spinsRemaining: 2, additivePayout: 0.25 }]
      }
    );

    const result = resolveSpin(state, draw);

    expect(result.payout).toBe(187.5);
    expect(result.attribution).toMatchObject({ base: 62.5, part: 125 });
    expect(result.events.filter((event) => event.type === "LINE_WIN")).toHaveLength(1);
    expect(result.events.filter((event) => event.type === "PAYOUT_ADDED")).toHaveLength(2);
  });

  it("suppresses the exact crack-disabled chapel slot", () => {
    const grid: Grid = [
      ["crack", "seven", "blank"],
      ["blank", "wild", "cherry"],
      ["cherry", "seven", "lemon"]
    ];
    const draw = makeDraw(grid);
    const state = settlementState(draw, withPart({ id: "omen-collector", level: 2 }, 4), { omen: 4 });

    const result = resolveSpin(state, draw);

    expect(result.payout).toBe(50);
    expect(result.attribution.part).toBe(0);
    expect(result.state.omen).toBe(4);
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: "PART_DISABLED", partId: "omen-collector", slot: 4 })
    );
  });

  it("does not expose chapel capabilities to public handlers or accept a context without one", () => {
    const draw = makeDraw(sevenLineGrid);
    const part = { id: "triple-blessing", level: 2 } as const;
    const state = settlementState(draw, withPart(part));
    let exposed = false;
    const attacker: EffectHandler = (context, signal) => {
      exposed ||= "chapelPart" in context;
      return reactChapelParts(context, signal);
    };

    const result = resolveSpin(state, draw, [{ kind: "system", handler: attacker }]);
    const publicContext: ResolveContext = {
      state,
      grid: draw.grid,
      currentBet: 10,
      queue: [],
      triggeredKeys: new Set(),
      awardedWinKeys: new Set(),
      eventCount: 0
    };

    expect(exposed).toBe(false);
    expect(result.payout).toBe(150);
    expect(reactChapelParts(publicContext, { type: "LINE_AWARDED", win: {
      lineId: "top",
      symbol: "seven",
      cells: [[0, 0], [1, 0], [2, 0]],
      multiplier: 5
    } })).toEqual([]);
  });

  it("strips spoofed chapel registration metadata from an external part handler", () => {
    const draw = makeDraw(sevenLineGrid);
    const state = settlementState(draw, withPart({ id: "triple-blessing", level: 1 }));
    let exposed = false;
    const malicious = {
      kind: "part",
      slot: 0,
      partId: "triple-blessing",
      chapelSlot: 0,
      handler(context: ResolveContext): readonly [] {
        exposed ||= context.chapelPart !== undefined;
        return [];
      }
    } as const;

    const result = resolveSpin(state, draw, [malicious]);

    expect(exposed).toBe(false);
    expect(result.payout).toBe(100);
    expect(result.events.filter((event) => event.type === "LINE_WIN")).toHaveLength(1);
  });
});
