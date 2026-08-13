import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import type { ReelDraw, RunState } from "@/core/types";
import { clearRun, loadRun, RUN_STORAGE_KEY, saveRun } from "@/persistence/storage";

function accept(state: RunState, command: Parameters<typeof dispatchCommand>[1]): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type} fixture failed`);
  return result.state;
}

function spinningState(seed = 101): RunState {
  let state = createRun(seed);
  state = accept(state, { type: "SELECT_SERVICE", serviceId: state.serviceCandidates[0] });
  return accept(state, { type: "SPIN" });
}

function resolvingState(seed = 101): RunState {
  let state = spinningState(seed);
  state = accept(state, { type: "REELS_STOPPED" });
  return accept(state, { type: "ACCEPT_OUTCOME" });
}

function upgradeBoundaryState(seed = 102): RunState {
  let state = createRun(seed);
  state = accept(state, { type: "SELECT_SERVICE", serviceId: state.serviceCandidates[0] });
  for (let spin = 0; spin < 3; spin += 1) {
    state = accept(state, { type: "SPIN" });
    state = accept(state, { type: "REELS_STOPPED" });
    state = accept(state, { type: "ACCEPT_OUTCOME" });
    state = accept(state, { type: "PRESENTATION_COMPLETE" });
  }
  if (state.phase !== "CHOOSING_UPGRADE") throw new Error("upgrade boundary fixture failed");
  return state;
}

function afterHoursBoundaryState(seed = 103): RunState {
  let state = spinningState(seed);
  state = accept(state, { type: "REELS_STOPPED" });
  state = accept(state, { type: "ACCEPT_OUTCOME" });
  state = accept({ ...state, shift: 5, baseSpinsInShift: 2, bankroll: 200 }, { type: "PRESENTATION_COMPLETE" });
  state = accept(state, { type: "CONTINUE" });
  for (let spin = 0; spin < 3; spin += 1) {
    state = accept(state, { type: "SPIN" });
    state = accept(state, { type: "REELS_STOPPED" });
    state = accept(state, { type: "ACCEPT_OUTCOME" });
    state = accept(state, { type: "PRESENTATION_COMPLETE" });
  }
  if (state.phase !== "AFTER_HOURS" || state.currentCandidates === null) {
    throw new Error("after-hours boundary fixture failed");
  }
  return state;
}

function drawWithDuplicateAssociation(draw: ReelDraw): ReelDraw {
  if (draw.entryIds === undefined || draw.visibleSourceIds === undefined) throw new Error("draw identity missing");
  for (let reel = 0; reel < 3; reel += 1) {
    for (let row = 0; row < 3; row += 1) {
      const symbol = draw.grid[reel]![row]!;
      const currentId = draw.visibleSourceIds[reel]![row]!;
      const alternateIndex = draw.strips[reel]!.findIndex((candidate, index) =>
        candidate === symbol && draw.entryIds![reel]![index] !== currentId
      );
      if (alternateIndex < 0) continue;
      const visibleSourceIds = draw.visibleSourceIds.map((ids) => [...ids]) as [number[], number[], number[]];
      visibleSourceIds[reel]![row] = draw.entryIds[reel]![alternateIndex]!;
      return { ...draw, visibleSourceIds: visibleSourceIds as unknown as NonNullable<ReelDraw["visibleSourceIds"]> };
    }
  }
  throw new Error("fixture has no duplicate visible symbol");
}

function expectInvalid(value: unknown): void {
  localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(value));
  expect(loadRun()).toEqual({ ok: false, reason: "INVALID_SNAPSHOT" });
}

describe("run storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a schema 1 run as an independent value", () => {
    const state = { ...createRun(42), bankroll: 87.5 };
    saveRun(state);

    const loaded = loadRun();
    expect(loaded).toEqual({ ok: true, state });
    if (loaded.ok) expect(loaded.state).not.toBe(state);
  });

  it("returns MISSING when no saved run exists", () => {
    expect(loadRun()).toEqual({ ok: false, reason: "MISSING" });
  });

  it.each([
    ["malformed JSON", "{"],
    ["wrong schema", JSON.stringify({ ...createRun(1), schemaVersion: 2 })],
    ["invalid phase", JSON.stringify({ ...createRun(1), phase: "BROKEN" })],
    ["non-finite money", JSON.stringify({ ...createRun(1), bankroll: "NaN" })],
    ["missing RNG", JSON.stringify((({ rng: _rng, ...rest }) => rest)(createRun(1)))]
  ])("rejects %s without throwing", (_label, snapshot) => {
    localStorage.setItem(RUN_STORAGE_KEY, snapshot);
    expect(loadRun()).toEqual({ ok: false, reason: "INVALID_SNAPSHOT" });
  });

  it("rejects corrupt critical nested state", () => {
    const corruptions = [
      { reels: [["cherry"], [], ["bell"]] },
      { partSlots: [null] },
      { partSlots: [{ id: "unknown", level: 1 }, null, null, null, null] },
      { rng: { value: 1.5 } },
      { betMode: "reckless" },
      { serviceCandidates: ["repair", "unknown", "chapel"] },
      { shift: "tomorrow" },
      { pendingEvents: {} },
      { pendingEvents: [{ sequence: 1, type: "UNKNOWN_EVENT" }] },
      { commandHistory: "SPIN" },
      { commandHistory: [{ type: "UNKNOWN_COMMAND" }] },
      { phase: "RESOLVING_EFFECTS", pendingSpin: null }
    ];

    for (const patch of corruptions) {
      localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify({ ...createRun(2), ...patch }));
      expect(loadRun()).toEqual({ ok: false, reason: "INVALID_SNAPSHOT" });
    }
  });

  it("rejects a snapshot missing any required root field", () => {
    const valid = createRun(7);
    for (const key of Object.keys(valid)) {
      const copy = structuredClone(valid) as unknown as Record<string, unknown>;
      delete copy[key];
      expectInvalid(copy);
    }
  });

  it("round-trips valid persisted draws exactly without normalizing or mutating them", () => {
    const state = resolvingState(107);
    const before = structuredClone(state);
    saveRun(state);
    const serialized = localStorage.getItem(RUN_STORAGE_KEY);

    const loaded = loadRun();
    expect(loaded).toEqual({ ok: true, state: before });
    expect(state).toEqual(before);
    expect(localStorage.getItem(RUN_STORAGE_KEY)).toBe(serialized);
  });

  it("rejects semantically inconsistent pending-spin draws", () => {
    const state = spinningState(108);
    const draw = state.pendingSpin!.draw;
    const replacement = draw.grid[0][0] === "cherry" ? "lemon" : "cherry";
    const badGrid = draw.grid.map((window, reel) => reel === 0
      ? [replacement, window[1], window[2]]
      : [...window]);
    const { entryIds: _entryIds, ...missingIdentity } = draw;
    const { visibleSourceIds: _visibleSourceIds, ...missingVisibleIdentity } = draw;

    expectInvalid({ ...state, pendingSpin: { ...state.pendingSpin!, draw: { ...draw, grid: badGrid } } });
    expectInvalid({
      ...state,
      pendingSpin: { ...state.pendingSpin!, draw: { ...draw, stops: [draw.stops[0] + draw.strips[0].length, ...draw.stops.slice(1)] } }
    });
    expectInvalid({ ...state, pendingSpin: { ...state.pendingSpin!, draw: missingIdentity } });
    expectInvalid({ ...state, pendingSpin: { ...state.pendingSpin!, draw: missingVisibleIdentity } });
    expectInvalid({ ...state, pendingSpin: { ...state.pendingSpin!, draw: drawWithDuplicateAssociation(draw) } });
  });

  it("rejects semantically inconsistent REELS_DRAWN history without repairing it", () => {
    const state = spinningState(109);
    const pendingEvents = state.pendingEvents.map((event) => event.type === "REELS_DRAWN"
      ? { ...event, draw: drawWithDuplicateAssociation(event.draw) }
      : event);
    expectInvalid({ ...state, pendingEvents });
  });

  it("round-trips real ended and after-hours states with controller-reachable phase fields", () => {
    const boundary = { ...upgradeBoundaryState(), exitUnlocked: true };
    const won = accept(boundary, { type: "CASH_OUT" });
    expect(won.phase).toBe("RUN_WON");
    expect(won.currentCandidates).toBeNull();

    saveRun(won);
    const loaded = loadRun();
    expect(loaded).toEqual({ ok: true, state: won });

    const offer = afterHoursBoundaryState();
    saveRun(offer);
    expect(loadRun()).toEqual({ ok: true, state: offer });
    const rerollableOffer = afterHoursBoundaryState(118);
    expect(rerollableOffer.tips).toBeGreaterThanOrEqual(1);
    const rerolled = accept(rerollableOffer, { type: "REROLL_CANDIDATES" });
    saveRun(rerolled);
    expect(loadRun()).toEqual({ ok: true, state: rerolled });
    const decided = accept(offer, { type: "DECLINE_UPGRADE" });
    saveRun(decided);
    expect(loadRun()).toEqual({ ok: true, state: decided });
  });

  it.each([
    ["contract omitted during resolution", () => {
      const state = resolvingState();
      const copy = { ...state } as unknown as Record<string, unknown>;
      delete copy.contract;
      return copy;
    }],
    ["partial contract", () => ({ ...createRun(8), contract: { id: "discipline", target: 1 } })],
    ["invalid food buff", () => ({ ...createRun(8), buffs: [{ id: "luck", spinsRemaining: 1, additivePayout: 2 }] })],
    ["invalid shift snapshot", () => ({ ...createRun(8), shiftHistory: [{ shift: 1, bankroll: 20 }] })],
    ["duplicate candidates", () => ({
      ...createRun(8), phase: "CHOOSING_UPGRADE", service: "repair",
      currentCandidates: { synergy: "jam-jar", pivot: "jam-jar", wildcard: "calculator" }
    })],
    ["upgrade phase without candidates", () => ({
      ...createRun(8), phase: "CHOOSING_UPGRADE", service: "repair", currentCandidates: null
    })],
    ["shift complete with candidates", () => ({
      ...afterHoursBoundaryState(110), phase: "SHIFT_COMPLETE", afterHoursLevel: 0
    })],
    ["run won with candidates", () => ({ ...afterHoursBoundaryState(111), phase: "RUN_WON" })],
    ["after hours before level one", () => ({ ...afterHoursBoundaryState(112), afterHoursLevel: 0 })],
    ["after hours outside shift five", () => ({ ...afterHoursBoundaryState(113), shift: 4 })],
    ["after hours before its three-spin boundary", () => ({ ...afterHoursBoundaryState(114), baseSpinsInShift: 2 })],
    ["after hours without unlocked exit", () => ({ ...afterHoursBoundaryState(115), exitUnlocked: false })],
    ["after hours with a queued free spin", () => ({ ...afterHoursBoundaryState(116), freeSpinQueue: 1 })],
    ["ready phase with pending spin", () => ({
      ...resolvingState(8), phase: "READY_TO_SPIN"
    })],
    ["non-increasing event sequences", () => ({
      ...createRun(8), pendingEvents: [
        { sequence: 2, type: "PAYOUT_COMPLETE", total: 1 },
        { sequence: 2, type: "SHIFT_CHANGED", shift: 2 }
      ]
    })],
    ["malformed event variant", () => ({
      ...createRun(8), pendingEvents: [{ sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "dragon", amount: 1, source: "base" }]
    })],
    ["malformed command variant", () => ({
      ...createRun(8), commandHistory: [{ type: "RESPIN_REEL", reelIndex: 7 }]
    })]
  ])("rejects %s", (_label, snapshot) => expectInvalid(snapshot()))

  it("bounds serialized and collection sizes before recovery", () => {
    localStorage.setItem(RUN_STORAGE_KEY, " ".repeat(1_000_001));
    expect(loadRun()).toEqual({ ok: false, reason: "INVALID_SNAPSHOT" });

    expectInvalid({ ...createRun(9), reels: [Array(10_001).fill("cherry"), ["lemon"], ["bell"]] });
    expectInvalid({ ...createRun(9), commandHistory: Array(10_001).fill({ type: "SPIN" }) });
  });

  it("rejects dangerous object keys and non-plain nested records", () => {
    const serialized = JSON.stringify(createRun(10)).replace(
      '"counters":{"blankCharge":0',
      '"counters":{"__proto__":{"polluted":true},"blankCharge":0'
    );
    localStorage.setItem(RUN_STORAGE_KEY, serialized);
    expect(loadRun()).toEqual({ ok: false, reason: "INVALID_SNAPSHOT" });
  });

  it("save and clear tolerate localStorage security failures", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("denied"); });
    expect(() => saveRun(createRun(3))).not.toThrow();
    set.mockRestore();
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new DOMException("denied"); });
    expect(() => clearRun()).not.toThrow();
    remove.mockRestore();
  });

  it("load treats localStorage access failures as invalid snapshots", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("denied"); });
    expect(loadRun()).toEqual({ ok: false, reason: "INVALID_SNAPSHOT" });
    get.mockRestore();
  });
});
