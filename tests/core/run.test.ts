import { describe, expect, it } from "vitest";
import { nextInt } from "@/core/random";
import { createRun, dispatchCommand, appendSettlementReceipt } from "@/core/run";
import { SpinReceiptInvariantError } from "@/core/receipts";
import { resolveSpin } from "@/core/settlement";
import { normalizeDrawIdentity } from "@/core/reels";
import type { GameCommand } from "@/core/commands";
import type { Grid, RunState, SettlementResult } from "@/core/types";

function selectService(state: RunState): RunState {
  const result = dispatchCommand(state, {
    type: "SELECT_SERVICE",
    serviceId: state.serviceCandidates[0]
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function dispatch(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function asPreV2State(state: RunState): Record<string, unknown> {
  const projected = structuredClone(state) as unknown as Record<string, unknown>;
  delete projected.schemaVersion;
  delete projected.spinHistory;
  delete projected.nextSpinOrdinal;
  if (projected.pendingSpin !== null && typeof projected.pendingSpin === "object") {
    delete (projected.pendingSpin as Record<string, unknown>).bankrollBefore;
    delete (projected.pendingSpin as Record<string, unknown>).wager;
  }
  return projected;
}

function winningAwaitingState(seed = 7): RunState {
  let state = selectService(createRun(seed));
  state = dispatch(state, { type: "SPIN" });
  state = dispatch(state, { type: "REELS_STOPPED" });
  return {
    ...state,
    pendingSpin: {
      ...state.pendingSpin!,
      draw: {
        ...state.pendingSpin!.draw,
        grid: [
          ["blank", "lemon", "blank"],
          ["blank", "wild", "blank"],
          ["blank", "lemon", "blank"]
        ]
      }
    }
  };
}

describe("createRun", () => {
  it("creates a complete serializable service-selection state with three unique seeded candidates", () => {
    const first = createRun(8675309);
    const repeated = createRun(8675309);

    expect(first).toEqual(repeated);
    expect(first).toMatchObject({
      schemaVersion: 2,
      initialSeed: 8675309,
      phase: "CHOOSING_SERVICE",
      bankroll: 100,
      checkoutTarget: 200,
      shift: 1,
      baseSpinsInShift: 0,
      shiftWager: 0,
      shiftPayout: 0,
      baseBet: 10,
      betMode: "normal",
      interventionPoints: 2,
      maxInterventionPoints: 2,
      nextShiftFocusBonus: 0,
      interventionUsedThisSpin: false,
      pendingPrayer: null,
      pendingSpin: null,
      freeSpinQueue: 0,
      service: null,
      tips: 0,
      agitation: 0,
      omen: 0,
      counters: { blankCharge: 0, cherryWinsThisShift: 0 },
      toolLevel: 0,
      buffs: [],
      contract: null,
      afterHoursLevel: 0,
      exitUnlocked: false,
      currentCandidates: null,
      acquiredUpgrades: [],
      pendingEvents: [],
      spinHistory: [],
      nextSpinOrdinal: 1,
      attribution: { base: 0, part: 0, intervention: 0, service: 0, agitation: 0, overload: 0 },
      expenses: { wagers: 0, kitchen: 0, chapel: 0, repair: 0 },
      shiftHistory: [],
      commandHistory: []
    });
    expect(first.partSlots).toEqual([null, null, null, null, null]);
    expect(first.temporaryReelAdditions).toEqual([[], [], []]);
    expect(new Set(first.serviceCandidates).size).toBe(3);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});

describe("dispatchCommand", () => {
  it("captures paid-spin metadata before deduction and appends exactly one receipt on accept", () => {
    const before = selectService(createRun(42));
    const spinning = dispatch(before, { type: "SPIN" });
    expect(spinning.pendingSpin).toMatchObject({ bankrollBefore: 100, wager: 10, isFree: false });

    const awaiting = dispatch(spinning, { type: "REELS_STOPPED" });
    const resolving = dispatch(awaiting, { type: "ACCEPT_OUTCOME" });
    expect(resolving.spinHistory).toHaveLength(1);
    expect(resolving.nextSpinOrdinal).toBe(2);

    const completed = dispatch(resolving, { type: "PRESENTATION_COMPLETE" });
    expect(completed.pendingEvents).toEqual([]);
    expect(completed.spinHistory).toEqual(resolving.spinHistory);
  });

  it("captures free-spin identity with zero wager and the undeducted bankroll", () => {
    const ready = { ...selectService(createRun(43)), freeSpinQueue: 1 };
    const spinning = dispatch(ready, { type: "SPIN" });

    expect(spinning.pendingSpin).toMatchObject({
      bankrollBefore: ready.bankroll,
      wager: 0,
      isFree: true
    });
    expect(spinning.bankroll).toBe(ready.bankroll);
  });

  it("does not append a duplicate receipt when accept is rejected or presentation completes", () => {
    const awaiting = dispatch(dispatch(selectService(createRun(44)), { type: "SPIN" }), { type: "REELS_STOPPED" });
    const resolving = dispatch(awaiting, { type: "ACCEPT_OUTCOME" });
    const duplicate = dispatchCommand(resolving, { type: "ACCEPT_OUTCOME" });

    expect(duplicate).toEqual({
      ok: false,
      state: resolving,
      error: { code: "INVALID_PHASE", message: "ACCEPT_OUTCOME is invalid during RESOLVING_EFFECTS" }
    });
    const completed = dispatch(resolving, { type: "PRESENTATION_COMPLETE" });
    expect(completed.spinHistory).toEqual(resolving.spinHistory);
    expect(completed.nextSpinOrdinal).toBe(resolving.nextSpinOrdinal);
  });

  it("records the settlement-resolved final grid rather than the initially accepted grid", () => {
    const base = dispatch(dispatch(selectService(createRun(45)), { type: "SPIN" }), { type: "REELS_STOPPED" });
    const acceptedGrid: Grid = [
      ["food", "cherry", "lemon"],
      ["blank", "cherry", "lemon"],
      ["blank", "lemon", "bell"]
    ];
    const strips = [
      ["food", "cherry", "lemon", "blank"],
      ["blank", "cherry", "lemon", "bell"],
      ["blank", "lemon", "bell", "seven"]
    ] as const;
    const awaiting: RunState = {
      ...base,
      reels: strips,
      pendingSpin: {
        ...base.pendingSpin!,
        draw: normalizeDrawIdentity({ strips, stops: [0, 0, 0], grid: acceptedGrid, rng: base.rng })
      }
    };

    const resolving = dispatch(awaiting, { type: "ACCEPT_OUTCOME" });

    expect(resolving.spinHistory[0]!.finalGrid).toEqual(resolving.pendingSpin!.draw.grid);
    expect(resolving.spinHistory[0]!.finalGrid).not.toEqual(acceptedGrid);
  });

  it("caps retained receipt history at 100 while preserving increasing ordinals", () => {
    const firstAwaiting = winningAwaitingState(46);
    const firstResolving = dispatch(firstAwaiting, { type: "ACCEPT_OUTCOME" });
    const template = firstResolving.spinHistory[0]!;
    const ready = dispatch(firstResolving, { type: "PRESENTATION_COMPLETE" });
    const withHistory: RunState = {
      ...ready,
      spinHistory: Array.from({ length: 100 }, (_unused, index) => ({ ...template, ordinal: index + 1 })),
      nextSpinOrdinal: 101
    };
    const awaiting = dispatch(dispatch(withHistory, { type: "SPIN" }), { type: "REELS_STOPPED" });
    const resolving = dispatch(awaiting, { type: "ACCEPT_OUTCOME" });

    expect(resolving.spinHistory).toHaveLength(100);
    expect(resolving.spinHistory[0]!.ordinal).toBe(2);
    expect(resolving.spinHistory.at(-1)!.ordinal).toBe(101);
    expect(resolving.nextSpinOrdinal).toBe(102);
  });

  it("throws a typed invariant reason in strict receipt mode without mutating the awaiting state", () => {
    const awaiting = winningAwaitingState(47);
    const before = structuredClone(awaiting);
    const settlement = resolveSpin(awaiting, awaiting.pendingSpin!.draw);
    const badSettlement: SettlementResult = {
      ...settlement,
      events: settlement.events.map((event) => event.type === "PAYOUT_COMPLETE"
        ? { ...event, total: event.total + 1 }
        : event)
    };

    expect(() => appendSettlementReceipt(awaiting, badSettlement, "strict")).toThrowError(
      expect.objectContaining({ name: "SpinReceiptInvariantError", reason: "PAYOUT_MISMATCH" })
    );
    expect(awaiting).toEqual(before);
    expect(SpinReceiptInvariantError).toBeDefined();
  });

  it("uses one conserved opaque award for the same malformed candidate in production fallback mode", () => {
    const awaiting = winningAwaitingState(48);
    const settlement = resolveSpin(awaiting, awaiting.pendingSpin!.draw);
    const badSettlement: SettlementResult = {
      ...settlement,
      events: settlement.events.map((event) => event.type === "LINE_WIN"
        ? { ...event, preMultiplierAmount: event.preMultiplierAmount + 1 }
        : event)
    };

    const resolving = appendSettlementReceipt(awaiting, badSettlement, "production-fallback");

    expect(resolving.spinHistory).toHaveLength(1);
    expect(resolving.spinHistory[0]!.awards).toEqual([expect.objectContaining({
      kind: "opaque",
      amount: resolving.spinHistory[0]!.totalPayout,
      formula: { kind: "legacy-unavailable" }
    })]);
    expect(resolving.spinHistory[0]!.bankrollAfter).toBe(
      resolving.spinHistory[0]!.bankrollBefore - resolving.spinHistory[0]!.wager + resolving.spinHistory[0]!.totalPayout
    );
  });

  it("selects only an offered service and enters READY_TO_SPIN", () => {
    const initial = createRun(12);
    const selected = dispatchCommand(initial, {
      type: "SELECT_SERVICE",
      serviceId: initial.serviceCandidates[1]
    });

    expect(selected).toEqual({
      ok: true,
      state: expect.objectContaining({
        phase: "READY_TO_SPIN",
        service: initial.serviceCandidates[1],
        commandHistory: [{ type: "SELECT_SERVICE", serviceId: initial.serviceCandidates[1] }]
      }),
      events: []
    });
    expect(initial.phase).toBe("CHOOSING_SERVICE");

    const unoffered = (["repair", "kitchen", "chapel", "security"] as const).find(
      (service) => !initial.serviceCandidates.includes(service)
    );
    expect(unoffered).toBeDefined();
    const rejected = dispatchCommand(initial, { type: "SELECT_SERVICE", serviceId: unoffered! });
    expect(rejected).toEqual({
      ok: false,
      state: initial,
      error: { code: "INVALID_TARGET", message: "service is not an offered candidate" }
    });
  });

  it("places a paid bet, draws three reels, and advances exactly three RNG transitions", () => {
    const ready = selectService(createRun(42));
    const first = nextInt(ready.rng, ready.reels[0].length);
    const second = nextInt(first.rng, ready.reels[1].length);
    const third = nextInt(second.rng, ready.reels[2].length);
    const result = dispatchCommand(ready, { type: "SPIN" });

    const expectedDraw = {
      strips: ready.reels,
      stops: [2, 6, 3] as const,
      grid: [
        ["cherry", "bell", "blank"],
        ["blank", "cherry", "seven"],
        ["blank", "cherry", "seven"]
      ] as const,
      rng: { value: 4_231_026_141 },
      entryIds: [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      ],
      visibleSourceIds: [[2, 3, 4], [6, 7, 8], [3, 4, 5]]
    } as const;
    const {
      schemaVersion: _schemaVersion,
      spinHistory: _spinHistory,
      nextSpinOrdinal: _nextSpinOrdinal,
      ...readyPreV2
    } = ready;
    const expectedPreV2State = {
      ...readyPreV2,
      phase: "SPINNING",
      bankroll: 90,
      rng: { value: 4_231_026_141 },
      shiftWager: 10,
      pendingSpin: { isFree: false, draw: expectedDraw },
      pendingEvents: [
        { sequence: 1, type: "BET_PLACED", amount: 10 },
        { sequence: 2, type: "REELS_DRAWN", draw: expectedDraw }
      ],
      expenses: { ...ready.expenses, wagers: 10 },
      commandHistory: [...ready.commandHistory, { type: "SPIN" }]
    };

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(ready.rng).toEqual({ value: 3_031_295_998 });
    expect(first).toEqual({ value: 2, rng: { value: 567_894_515 } });
    expect(second).toEqual({ value: 6, rng: { value: 2_399_460_328 } });
    expect(third).toEqual({ value: 3, rng: { value: 4_231_026_141 } });
    expect(asPreV2State(result.state)).toEqual(expectedPreV2State);
    expect(result.events.map((event) => [event.sequence, event.type])).toEqual([
      [1, "BET_PLACED"],
      [2, "REELS_DRAWN"]
    ]);
    expect(ready.bankroll).toBe(100);
    expect(ready.pendingSpin).toBeNull();
  });

  it("moves through stopped reels and respins only the selected reel with one RNG transition", () => {
    const ready = selectService(createRun(91));
    const spinning = dispatch(ready, { type: "SPIN" });
    const awaiting = dispatch(spinning, { type: "REELS_STOPPED" });
    const snapshot = structuredClone(awaiting);
    const before = awaiting.pendingSpin!.draw;
    const randomOffset = nextInt(awaiting.rng, before.strips[1].length - 1);
    const respun = dispatchCommand(awaiting, { type: "RESPIN_REEL", reelIndex: 1 });

    expect(awaiting.phase).toBe("AWAITING_INTERVENTION");
    expect(respun.ok).toBe(true);
    if (!respun.ok) throw new Error(respun.error.message);
    expect(respun.state.phase).toBe("SPINNING");
    expect(respun.state.rng).toEqual(randomOffset.rng);
    expect(respun.state.interventionPoints).toBe(1);
    expect(respun.state.interventionUsedThisSpin).toBe(true);
    expect(respun.state.pendingSpin!.draw.stops[0]).toBe(before.stops[0]);
    expect(respun.state.pendingSpin!.draw.stops[2]).toBe(before.stops[2]);
    expect(respun.state.pendingSpin!.draw.grid[0]).toEqual(before.grid[0]);
    expect(respun.state.pendingSpin!.draw.grid[2]).toEqual(before.grid[2]);
    expect(respun.state.pendingSpin!.draw.stops[1]).not.toBe(before.stops[1]);
    expect(respun.state.pendingSpin!.draw.stops[1]).toBe(
      (before.stops[1] + randomOffset.value + 1) % before.strips[1].length
    );
    expect(respun.events.map((event) => event.type)).toEqual(["INTERVENTION_USED", "REELS_DRAWN"]);
    expect(awaiting).toEqual(snapshot);
  });

  it("rejects a respin after a null selected strip recovers to a single blank without consuming RNG", () => {
    let state = selectService(createRun(92));
    state = dispatch(state, { type: "SPIN" });
    state = dispatch(state, { type: "REELS_STOPPED" });
    const malformed: RunState = {
      ...state,
      pendingSpin: {
        ...state.pendingSpin!,
        draw: {
          ...state.pendingSpin!.draw,
          strips: [state.pendingSpin!.draw.strips[0], null, state.pendingSpin!.draw.strips[2]]
        } as unknown as NonNullable<RunState["pendingSpin"]>["draw"]
      }
    };
    const snapshot = structuredClone(malformed);

    const result = dispatchCommand(malformed, { type: "RESPIN_REEL", reelIndex: 1 });

    expect(result).toEqual({
      ok: false,
      state: malformed,
      error: { code: "INVALID_TARGET", message: "selected reel cannot move to a different stop" }
    });
    expect(result.state).toBe(malformed);
    expect(result.state.rng).toEqual(snapshot.rng);
    expect(malformed).toEqual(snapshot);
  });

  it("normalizes malformed nonselected strips before a successful selected-reel respin", () => {
    let state = selectService(createRun(93));
    state = dispatch(state, { type: "SPIN" });
    state = dispatch(state, { type: "REELS_STOPPED" });
    const malformed: RunState = {
      ...state,
      pendingSpin: {
        ...state.pendingSpin!,
        draw: {
          strips: [null, ["cherry", "lemon"], ["seven", null]],
          stops: [0, 0, 0],
          grid: null,
          rng: { value: 999 },
          entryIds: [null, [8, 8], [4]],
          visibleSourceIds: null
        } as unknown as NonNullable<RunState["pendingSpin"]>["draw"]
      }
    };
    const snapshot = structuredClone(malformed);
    const expectedRng = nextInt(malformed.rng, 1).rng;

    const result = dispatchCommand(malformed, { type: "RESPIN_REEL", reelIndex: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.rng).toEqual(expectedRng);
    expect(result.state.pendingSpin!.draw).toEqual({
      strips: [["blank"], ["cherry", "lemon"], ["seven", "blank"]],
      stops: [0, 1, 0],
      grid: [
        ["blank", "blank", "blank"],
        ["lemon", "cherry", "lemon"],
        ["seven", "blank", "seven"]
      ],
      rng: expectedRng,
      entryIds: [[0], [0, 1], [0, 1]],
      visibleSourceIds: [[0, 0, 0], [1, 0, 1], [0, 1, 0]]
    });
    expect(result.events[1]).toEqual({ sequence: 4, type: "REELS_DRAWN", draw: result.state.pendingSpin!.draw });
    expect(malformed).toEqual(snapshot);
  });

  it("normalizes malformed grid, stops, and identity mapping before a successful respin", () => {
    let state = selectService(createRun(94));
    state = dispatch(state, { type: "SPIN" });
    state = dispatch(state, { type: "REELS_STOPPED" });
    const malformed: RunState = {
      ...state,
      pendingSpin: {
        ...state.pendingSpin!,
        draw: {
          strips: [["bell", "seven"], ["food", "blank"], ["crack", "wild"]],
          stops: [Number.NaN, 1.5, null],
          grid: null,
          rng: { value: 123 },
          entryIds: [[10, 10], [0], null],
          visibleSourceIds: [[0, 1, 0], null, [99, 99, 99]]
        } as unknown as NonNullable<RunState["pendingSpin"]>["draw"]
      }
    };
    const snapshot = structuredClone(malformed);
    const expectedRng = nextInt(malformed.rng, 1).rng;

    const result = dispatchCommand(malformed, { type: "RESPIN_REEL", reelIndex: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.rng).toEqual(expectedRng);
    expect(result.state.pendingSpin!.draw).toEqual({
      strips: [["bell", "seven"], ["food", "blank"], ["crack", "wild"]],
      stops: [0, 0, 1],
      grid: [
        ["bell", "seven", "bell"],
        ["food", "blank", "food"],
        ["wild", "crack", "wild"]
      ],
      rng: expectedRng,
      entryIds: [[0, 1], [0, 1], [0, 1]],
      visibleSourceIds: [[0, 1, 0], [0, 1, 0], [1, 0, 1]]
    });
    expect(result.events[1]).toEqual({ sequence: 4, type: "REELS_DRAWN", draw: result.state.pendingSpin!.draw });
    expect(malformed).toEqual(snapshot);
  });

  it("rejects a second intervention without mutating the input", () => {
    let state = selectService(createRun(25));
    state = dispatch(state, { type: "SPIN" });
    state = dispatch(state, { type: "REELS_STOPPED" });
    state = dispatch(state, { type: "RESPIN_REEL", reelIndex: 0 });
    state = dispatch(state, { type: "REELS_STOPPED" });
    const snapshot = structuredClone(state);

    const result = dispatchCommand(state, { type: "RESPIN_REEL", reelIndex: 2 });

    expect(result).toEqual({
      ok: false,
      state,
      error: { code: "RESOURCE_EXHAUSTED", message: "an intervention was already used this spin" }
    });
    expect(state).toEqual(snapshot);
  });

  it("commits rounded base line payouts before presentation and attributes each award", () => {
    let state = selectService(createRun(7));
    state = dispatch(state, { type: "SPIN" });
    state = dispatch(state, { type: "REELS_STOPPED" });
    const winningState: RunState = {
      ...state,
      pendingSpin: {
        ...state.pendingSpin!,
        draw: {
          ...state.pendingSpin!.draw,
          grid: [
            ["blank", "lemon", "blank"],
            ["blank", "wild", "blank"],
            ["blank", "lemon", "blank"]
          ]
        }
      }
    };

    const accepted = dispatchCommand(winningState, { type: "ACCEPT_OUTCOME" });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error(accepted.error.message);
    expect(accepted.state).toMatchObject({
      phase: "RESOLVING_EFFECTS",
      bankroll: 99,
      shiftPayout: 9,
      attribution: { base: 9 }
    });
    expect(accepted.events).toEqual([
      { sequence: 3, type: "LINE_WIN", lineId: "middle", symbol: "lemon", preMultiplierAmount: 9, appliedMultiplier: 1, amount: 9, source: "base" },
      { sequence: 4, type: "PAYOUT_COMPLETE", total: 9 }
    ]);
  });

  it("rejects SPIN during resolution and leaves the state deeply equal to its input", () => {
    let state = selectService(createRun(19));
    state = dispatch(state, { type: "SPIN" });
    state = dispatch(state, { type: "REELS_STOPPED" });
    state = dispatch(state, { type: "ACCEPT_OUTCOME" });
    const snapshot = structuredClone(state);

    const rejected = dispatchCommand(state, { type: "SPIN" });

    expect(rejected).toEqual({
      ok: false,
      state,
      error: { code: "INVALID_PHASE", message: "SPIN is invalid during RESOLVING_EFFECTS" }
    });
    expect(state).toEqual(snapshot);
  });

  it("rejects a selected bet that exceeds the bankroll without recording the command", () => {
    const ready = selectService(createRun(100));
    const poor: RunState = { ...ready, bankroll: 15, betMode: "aggressive" };
    const snapshot = structuredClone(poor);

    const result = dispatchCommand(poor, { type: "SPIN" });

    expect(result).toEqual({
      ok: false,
      state: poor,
      error: { code: "INSUFFICIENT_FUNDS", message: "bankroll is below the current bet" }
    });
    expect(poor).toEqual(snapshot);
  });
});
