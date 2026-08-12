import { describe, expect, it } from "vitest";
import { nextInt } from "@/core/random";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";

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

describe("createRun", () => {
  it("creates a complete serializable service-selection state with three unique seeded candidates", () => {
    const first = createRun(8675309);
    const repeated = createRun(8675309);

    expect(first).toEqual(repeated);
    expect(first).toMatchObject({
      schemaVersion: 1,
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

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state).toMatchObject({
      phase: "SPINNING",
      bankroll: 90,
      shiftWager: 10,
      rng: third.rng,
      pendingSpin: { isFree: false, draw: { stops: [first.value, second.value, third.value] } },
      expenses: { wagers: 10 }
    });
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
    expect(awaiting).toEqual(expect.objectContaining({ interventionPoints: 2, interventionUsedThisSpin: false }));
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
        isFree: false,
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
      bankroll: 102,
      shiftPayout: 12,
      attribution: { base: 12 }
    });
    expect(accepted.events).toEqual([
      { sequence: 3, type: "LINE_WIN", lineId: "middle", symbol: "lemon", amount: 12, source: "base" },
      { sequence: 4, type: "PAYOUT_COMPLETE", total: 12 }
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
