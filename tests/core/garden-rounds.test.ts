import { beforeEach, describe, expect, it } from "vitest";
import { buildDefaultUpgradeChoice } from "@/app/upgrade-choice";
import { getRoomProgress, isRoomIntermission } from "@/content/hotel";
import type { GameCommand } from "@/core/commands";
import { dispatchCommand } from "@/core/run";
import { createLegacyRun as createRun } from "../fixtures/legacy-run";
import type { ReelSet, RunState, SymbolId } from "@/core/types";
import { activeRecord, canMigrateArchive, exportArchive, importArchive, initializeLibrary, migrateArchive,
  openArchiveSession, recordAction, verifyArchive } from "@/persistence/archives";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { saveRun } from "@/persistence/storage";

const solid = (symbol: SymbolId): ReelSet => [Array(12).fill(symbol), Array(12).fill(symbol), Array(12).fill(symbol)];
const boundary = (patch: Partial<RunState> = {}): RunState => ({ ...createRun(8),
  phase: "SHIFT_COMPLETE", shift: 5, baseSpinsInShift: 3, service: "kitchen", exitUnlocked: true,
  bankroll: 1000, reels: solid("lemon"), ...patch });
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error.message}`);
  expect(decodeRunStateV2(JSON.parse(JSON.stringify(result.state))), command.type).toEqual(result.state);
  return result.state;
}
function pull(state: RunState): RunState {
  for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
  return state;
}
const round = (state: RunState) => pull(pull(pull(state)));
beforeEach(() => localStorage.clear());

describe("Garden three-round journey", () => {
  it("counts nine paid pulls, presents two choices, and only judges the final round", () => {
    let state = send(boundary(), { type: "ENTER_ROOM" });
    expect(state.hotel?.challenge?.rounds).toEqual({ current: 1, total: 3, payout: 0 });
    for (let current = 1; current <= 3; current++) {
      state = round(state);
      expect(getRoomProgress(state)?.value).toBe(337.5 * current);
      expect(state.hotel?.challenge?.status).toBe(current === 3 ? "cleared" : "playing");
      expect(state.currentCandidates).not.toBeNull();
      if (current < 3) {
        for (const type of ["ENTER_ROOM", "CONTINUE", "CASH_OUT", "NEXT_ROOM_ROUND", "OPEN_WORKSHOP"] as const)
          expect(dispatchCommand(state, { type }).ok).toBe(false);
        state = send(state, { type: "DECLINE_UPGRADE" });
        expect(state.phase).toBe("READY_TO_SPIN");
        expect(state.baseSpinsInShift).toBe(0);
        expect(getRoomProgress(state)?.value).toBe(337.5 * current);
        expect(state.freeAfterHoursLevel).toBe(0);
      }
    }
    expect(state.spinHistory).toHaveLength(9);
    expect(state.hotel?.cleared).toBe(1);
    expect(state.hotel?.gardenRewardsGranted).toBe(2);
  });

  it("does not cut the room short after an early jackpot", () => {
    const state = round(send(boundary({ reels: solid("wild") }), { type: "ENTER_ROOM" }));
    expect(getRoomProgress(state)?.cleared).toBe(true);
    expect(isRoomIntermission(state)).toBe(true);
    expect(state.hotel?.cleared).toBe(0);
  });

  it("installs a real offered choice and resets uses without resetting stored power or remaining food", () => {
    let state = round(send(boundary(), { type: "ENTER_ROOM" }));
    state = { ...state, interventionPoints: 0, buffs: [{ id: "food", additivePayout: 0.5, spinsRemaining: 2 }],
      counters: { ...state.counters, harvestCharge: 2, cherryWinsThisShift: 4 },
      shiftFlags: { ...state.shiftFlags, foodBought: true }, blockReelAdditions: [["blank"], [], []] };
    const id = state.currentCandidates!.synergy;
    const choice = buildDefaultUpgradeChoice(state, id)!;
    const next = send(state, { type: "CHOOSE_UPGRADE", choice });
    expect(next.acquiredUpgrades).toContain(id);
    expect(next.hotel?.challenge?.rounds?.current).toBe(2);
    expect(next.interventionPoints).toBe(2);
    expect(next.shiftFlags.foodBought).toBe(false);
    expect(next.blockReelAdditions).toEqual([[], [], []]);
    expect(next.buffs).toEqual(state.buffs);
    expect(next.counters.harvestCharge).toBe(2);
    expect(next.counters.cherryWinsThisShift).toBe(0);
  });

  it("retains progress without exposing an unpresented payout", () => {
    let state = send(round(send(boundary(), { type: "ENTER_ROOM" })), { type: "DECLINE_UPGRADE" });
    for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME"] as const) state = send(state, { type });
    expect(getRoomProgress(state, 0)?.value).toBe(337.5);
    expect(getRoomProgress(state, 10)?.value).toBe(347.5);
    expect(getRoomProgress(state)?.value).toBe(450);
  });

  it("waits for the free-spin queue before granting the rest-stop reward", () => {
    let state = send(boundary(), { type: "ENTER_ROOM" });
    state = { ...state, baseSpinsInShift: 3, freeSpinQueue: 2 };
    state = pull(state);
    expect(state.phase).toBe("READY_TO_SPIN");
    expect(state.hotel?.gardenRewardsGranted).toBe(0);
    state = pull(state);
    expect(isRoomIntermission(state)).toBe(true);
    expect(state.hotel?.gardenRewardsGranted).toBe(1);
    expect(state.baseSpinsInShift).toBe(3);
    expect(getRoomProgress(state)?.value).toBe(225);
  });

  it("does not farm free rewards through retry or a detour to overtime", () => {
    let state = send(boundary({ reels: solid("blank") }), { type: "ENTER_ROOM" });
    for (let index = 0; index < 3; index++) {
      state = round(state);
      if (index < 2) state = send(state, { type: "DECLINE_UPGRADE" });
    }
    expect(state.hotel?.challenge?.status).toBe("failed");
    const tips = state.tips;
    const retry = send(state, { type: "ENTER_ROOM" });
    expect(getRoomProgress(retry)?.value).toBe(0);
    expect(retry.hotel?.gardenRewardsGranted).toBe(2);
    state = round(retry);
    expect(state.currentCandidates).toBeNull();
    expect(state.tips).toBeGreaterThanOrEqual(tips); // Contracts can still award tips.
    expect(dispatchCommand(state, { type: "DECLINE_UPGRADE" }).ok).toBe(false);
    state = send(state, { type: "NEXT_ROOM_ROUND" });
    expect(state.hotel?.challenge?.rounds?.current).toBe(2);
    expect(dispatchCommand(state, { type: "NEXT_ROOM_ROUND" }).ok).toBe(false);
    state = send(round(state), { type: "NEXT_ROOM_ROUND" });
    state = send(round(state), { type: "CONTINUE" });
    expect(state.hotel?.gardenRewardsGranted).toBe(2);
  });

  it("asks only for one-round reserve and handles bankruptcy after a rest choice", () => {
    let state = send(boundary({ bankroll: 75, reels: solid("blank") }), { type: "ENTER_ROOM" });
    expect(state.bankroll).toBe(75);
    state = round(state);
    state = send(state, { type: "DECLINE_UPGRADE" });
    expect(state.phase).toBe("RUN_LOST");
    expect(state.hotel?.cleared).toBe(0);
  });

  it("migrates the published three-spin Garden without rewriting its goal, draw or source archive", () => {
    let state: RunState = { ...boundary(), phase: "READY_TO_SPIN", baseSpinsInShift: 1, afterHoursLevel: 1,
      hotel: { cleared: 0, challenge: { tier: 1, status: "playing", target: 450, paidSpins: 3, objective: { kind: "total-payout" } } } };
    state = send(state, { type: "SPIN" });
    saveRun(state);
    let library = initializeLibrary();
    library = importArchive(library, exportArchive({ ...activeRecord(library)!, rulesVersion: "rules-56d5bd9d4b54c3c4" }));
    const source = library.runs.at(-1)!;
    const raw = JSON.stringify(source);
    expect(canMigrateArchive(source)).toBe(true);
    const migrated = migrateArchive(library, source);
    expect(activeRecord(migrated)?.snapshot).toEqual(state);
    expect(JSON.stringify(migrated.runs.find((run) => run.id === source.id))).toBe(raw);
    for (const type of ["REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
    state = pull(state);
    expect(state.hotel?.challenge?.status).toBe("failed");
    expect(state.hotel?.challenge?.rounds).toBeUndefined();
  });

  it("round-trips and replays a full multi-round archive", () => {
    saveRun(boundary());
    const session = openArchiveSession(activeRecord(initializeLibrary())!.snapshot);
    const log = (command: GameCommand) => {
      const before = session.record.snapshot;
      const result = dispatchCommand(before, command);
      expect(result.ok).toBe(true);
      recordAction(session, before, command, result);
      expect(session.warning).toBeNull();
    };
    log({ type: "ENTER_ROOM" });
    for (let current = 1; current <= 3; current++) {
      for (let spin = 0; spin < 3; spin++) for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) log({ type });
      if (current < 3) log({ type: "DECLINE_UPGRADE" });
      expect(verifyArchive(session.record)).toContain("核验通过");
    }
    const imported = importArchive(session.library, exportArchive(session.record)).runs.at(-1)!;
    expect(verifyArchive(imported)).toContain("核验通过");
    expect(imported.entries.flatMap((entry) => entry.events).filter((event) => event.type === "ROOM_ROUND_COMPLETED")).toHaveLength(3);
    expect(imported.entries.flatMap((entry) => entry.events).filter((event) => event.type === "ROOM_COMPLETED")).toHaveLength(1);
  });

  it("rejects malformed round counters and impossible rest points", () => {
    const state = send(boundary(), { type: "ENTER_ROOM" });
    for (const rounds of [{ current: 0, total: 3, payout: 0 }, { current: 4, total: 3, payout: 0 },
      { current: 1, total: 4, payout: 0 }, { current: 1, total: 3, payout: 1 }, { current: 2, total: 3, payout: -1 }]) {
      expect(decodeRunStateV2({ ...state, hotel: { ...state.hotel, challenge: { ...state.hotel!.challenge, rounds } } })).toBeNull();
    }
    expect(decodeRunStateV2({ ...state, phase: "AFTER_HOURS" })).toBeNull();
  });
});
