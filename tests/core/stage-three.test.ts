import { beforeEach, describe, expect, it } from "vitest";
import { HOTEL_ROOMS } from "@/content/hotel";
import { createRun, dispatchCommand } from "@/core/run";
import { getCurrentBet } from "@/core/progression";
import { resolveSpin } from "@/core/settlement";
import type { GameCommand } from "@/core/commands";
import type { Grid, ReelDraw, ReelSet, RunState, SymbolId } from "@/core/types";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { saveRun, RUN_STORAGE_KEY } from "@/persistence/storage";
import { activeRecord, exportArchive, importArchive, initializeLibrary, openArchiveSession, readLibrary, recordAction, restoreArchive, verifyArchive } from "@/persistence/archives";

const solid = (symbol: SymbolId): ReelSet => [Array(12).fill(symbol), Array(12).fill(symbol), Array(12).fill(symbol)];
function ready(patch: Partial<RunState> = {}): RunState {
  return { ...createRun(8), phase: "READY_TO_SPIN", service: "kitchen", reels: solid("lemon"), ...patch };
}
function boundary(patch: Partial<RunState> = {}): RunState {
  return ready({ phase: "SHIFT_COMPLETE", shift: 5, baseSpinsInShift: 3, exitUnlocked: true, bankroll: 1000, ...patch });
}
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(result.error.message);
  expect(decodeRunStateV2(result.state), command.type).not.toBeNull();
  return result.state;
}
function pull(state: RunState): RunState {
  for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
  return state;
}
function resolveGrid(grid: Grid, patch: Partial<RunState> = {}) {
  const reels: ReelSet = grid.map((strip) => [...strip, "blank", "blank", "blank"]) as unknown as ReelSet;
  const draw: ReelDraw = { strips: reels, grid, stops: [0, 0, 0], rng: { value: 8 } };
  const state = ready({ phase: "AWAITING_INTERVENTION", reels, pendingSpin: { draw, isFree: false, bankrollBefore: 110, wager: 10 }, ...patch });
  return resolveSpin(state, draw);
}
beforeEach(() => localStorage.clear());

describe("third-stage meals and fruit branches", () => {
  it("makes a purchased meal useful immediately, even when its food symbol is not drawn", () => {
    const state = send(ready(), { type: "BUY_FOOD", reelIndex: 0 });
    const grid: Grid = [["lemon", "lemon", "lemon"], ["lemon", "lemon", "lemon"], ["lemon", "lemon", "lemon"]];
    const result = resolveGrid(grid, { buffs: state.buffs });
    expect(result.payout).toBe(67.5); // 5 lines × 0.9 × ¥10 × 1.5
    expect(result.events.some((event) => event.type === "FOOD_CONSUMED")).toBe(false);
    expect(result.state.buffs).toEqual([{ id: "food", spinsRemaining: 2, additivePayout: 0.5 }]);
    expect(dispatchCommand(state, { type: "BUY_FOOD", reelIndex: 1 }).ok).toBe(false);
    const free = pull(ready({ freeSpinQueue: 1, buffs: state.buffs }));
    expect(free.buffs[0]?.spinsRemaining).toBe(2);
    expect(free.spinHistory.at(-1)?.wager).toBe(0);
  });

  it("upgrades a chosen part without spending RNG or a candidate, and rejects duplicate/late purchases", () => {
    const state = ready({ tips: 4, partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null] });
    const next = send(state, { type: "UPGRADE_PART", slot: 0 });
    expect(next.partSlots[0]).toEqual({ id: "jam-jar", level: 2 });
    expect(next.tips).toBe(1);
    expect(next.rng).toEqual(state.rng);
    expect(next.currentCandidates).toBeNull();
    for (const command of [{ type: "UPGRADE_PART", slot: 0 }, { type: "UPGRADE_PART", slot: 7 }] as const) {
      const result = dispatchCommand(next, command);
      expect(result.ok).toBe(false); expect(result.state).toEqual(next);
    }
    expect(dispatchCommand({ ...state, tips: 2 }, { type: "UPGRADE_PART", slot: 0 }).ok).toBe(false);
    expect(dispatchCommand({ ...state, baseSpinsInShift: 1 }, { type: "UPGRADE_PART", slot: 0 }).ok).toBe(false);
  });

  it.each([1, 2] as const)("pays cherry density once at L%s and creates a valid attributed receipt", (level) => {
    let state = ready({ reels: solid("cherry"), partSlots: [{ id: "cherry-press", level }, null, null, null, null] });
    state = pull(state);
    const receipt = state.spinHistory[0]!;
    expect(receipt.totalPayout).toBe(level === 1 ? 60 : 90);
    expect(receipt.awards.filter((award) => award.kind === "part-bonus")).toHaveLength(1);
    expect(receipt.awards).toContainEqual(expect.objectContaining({ kind: "part-bonus", partId: "cherry-press", amount: level === 1 ? 30 : 60 }));
  });

  it.each([1, 2] as const)("dresses each salad once at L%s without multiplying food twice", (level) => {
    const state = pull(ready({ reels: [solid("cherry")[0], solid("lemon")[0], solid("bell")[0]],
      buffs: [{ id: "food", spinsRemaining: 3, additivePayout: 0.5 }],
      partSlots: [{ id: "fruit-salad", level: 1 }, { id: "salad-dressing", level }, null, null, null] }));
    expect(state.spinHistory[0]!.totalPayout).toBe(level === 1 ? 168.75 : 225);
    expect(state.spinHistory[0]!.awards.filter((award) => award.kind === "part-bonus")).toHaveLength(5);
  });

  it("does not pay fruit branch bonuses for an all-lemon machine", () => {
    const state = pull(ready({ partSlots: [{ id: "cherry-press", level: 2 }, { id: "salad-dressing", level: 2 }, null, null, null] }));
    expect(state.spinHistory[0]!.totalPayout).toBe(45);
  });
});

describe("fixed hotel challenges and compatible archives", () => {
  it("discloses and locks stakes, ignores old wealth, and allows failed-room retry or free overtime", () => {
    let state = send(boundary({ bankroll: 1_000_000, nextShiftFocusBonus: 9 }), { type: "ENTER_ROOM" });
    expect(getCurrentBet(state)).toBe(25);
    expect(state.maxInterventionPoints).toBe(3);
    expect(dispatchCommand(state, { type: "SET_BET_MODE", mode: "aggressive" }).ok).toBe(false);
    expect(dispatchCommand(state, { type: "CONTINUE" }).ok).toBe(false);
    state = pull(pull(pull(state)));
    expect(state.hotel?.challenge).toMatchObject({ tier: 1, status: "failed" });
    expect(state.shiftPayout).toBe(337.5); // Big balance does not buy a pass.
    expect(state.currentCandidates).toBeNull();
    const retry = send(state, { type: "ENTER_ROOM" });
    expect(retry.hotel?.challenge).toMatchObject({ tier: 1, status: "playing" });
    expect(retry.shiftPayout).toBe(0);
    const free = send(state, { type: "CONTINUE" });
    expect(free.hotel?.challenge).toBeNull();
    expect(getCurrentBet(free)).toBe(12.5);
    expect(send(state, { type: "CASH_OUT" }).phase).toBe("RUN_WON");
  });

  it("logs, saves, imports and replays all three rooms and their upgrade boundaries", () => {
    saveRun(boundary({ reels: solid("cherry"), tips: 3, partSlots: [{ id: "jam-jar", level: 1 }, { id: "cherry-press", level: 1 }, null, null, null] }));
    const session = openArchiveSession(activeRecord(initializeLibrary())!.snapshot);
    const log = (command: GameCommand) => {
      const before = session.record.snapshot;
      const result = dispatchCommand(before, command);
      expect(result.ok, command.type).toBe(true);
      recordAction(session, before, command, result);
      expect(session.warning).toBeNull();
    };
    for (const tier of [1, 2, 3] as const) {
      log({ type: "ENTER_ROOM" });
      if (tier === 1) log({ type: "UPGRADE_PART", slot: 0 });
      // The upper rooms now require amplifying the engine, not just holding old wealth.
      log({ type: "BUY_FOOD", reelIndex: 0 });
      expect(getCurrentBet(session.record.snapshot)).toBe(HOTEL_ROOMS[tier].bet);
      expect(session.record.snapshot.maxInterventionPoints).toBeLessThanOrEqual(HOTEL_ROOMS[tier].focusCap);
      for (let spin = 0; spin < 3; spin++) for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) log({ type });
      expect(session.record.snapshot.hotel?.cleared).toBe(tier);
      expect(session.record.snapshot.currentCandidates).not.toBeNull();
      expect(dispatchCommand(session.record.snapshot, { type: "ENTER_ROOM" }).ok).toBe(false);
      log({ type: "DECLINE_UPGRADE" });
    }
    expect(dispatchCommand(session.record.snapshot, { type: "ENTER_ROOM" }).ok).toBe(true);
    log({ type: "CONTINUE" });
    expect(session.record.snapshot.hotel).toEqual({ cleared: 3, challenge: null });
    const imported = importArchive(readLibrary(), exportArchive(session.record));
    expect(verifyArchive(imported.runs.at(-1)!)).toContain("核验通过");
    expect(session.record.entries.filter((entry) => entry.events.some((event) => event.type === "ROOM_COMPLETED"))).toHaveLength(3);
  });

  it("waits for earned free spins before judging a room", () => {
    let state = send(boundary(), { type: "ENTER_ROOM" });
    state = { ...state, baseSpinsInShift: 2, shiftPayout: 300, freeSpinQueue: 1 };
    state = pull(state);
    expect(state.baseSpinsInShift).toBe(2);
    expect(state.hotel?.challenge?.status).toBe("playing");
    state = pull(state);
    expect(state.hotel?.challenge?.status).toBe("cleared");
  });

  it("rejects early or unaffordable entry and ends a mid-room bankruptcy without inventing a pass", () => {
    expect(dispatchCommand(boundary({ bankroll: 74.99 }), { type: "ENTER_ROOM" }).ok).toBe(false);
    expect(dispatchCommand(boundary({ shift: 2 }), { type: "ENTER_ROOM" }).ok).toBe(false);
    let state = send(boundary(), { type: "ENTER_ROOM" });
    state = pull({ ...state, bankroll: 25, reels: solid("blank") });
    expect(state.phase).toBe("RUN_LOST");
    expect(state.hotel?.cleared).toBe(0);
  });

  it("reads missing hotel fields as old, read-only archives without rewriting their source save", () => {
    const { hotel: _hotel, ...old } = ready();
    expect(decodeRunStateV2(old)).not.toBeNull();
    const raw = JSON.stringify(old);
    localStorage.setItem(RUN_STORAGE_KEY, raw);
    const library = initializeLibrary();
    const record = activeRecord(library)!;
    expect(record.snapshot).not.toHaveProperty("hotel");
    expect(record.rulesVersion).toBe("legacy-before-hotel");
    expect(localStorage.getItem(RUN_STORAGE_KEY)).toBe(raw);
    expect(() => restoreArchive(library, record)).toThrow("规则版本不同");
    expect(importArchive(library, exportArchive(record)).runs.at(-1)!.snapshot).toEqual(old);
  });

  it("rejects malformed hotel progress instead of dropping it", () => {
    expect(decodeRunStateV2({ ...ready(), hotel: { cleared: 9, challenge: null } })).toBeNull();
    expect(decodeRunStateV2({ ...ready(), hotel: { cleared: 0, challenge: { tier: 3, status: "playing" } } })).toBeNull();
  });
});
