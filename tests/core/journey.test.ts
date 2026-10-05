import { beforeEach, describe, expect, it } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import { getIntroShiftLimit } from "@/core/progression";
import { getRoomProgress, getRoomRewardsGranted, HOTEL_ROOMS } from "@/content/hotel";
import { buildDefaultUpgradeChoice } from "@/app/upgrade-choice";
import type { GameCommand } from "@/core/commands";
import type { ReelSet, RunState, SymbolId } from "@/core/types";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { activeRecord, canMigrateArchive, exportArchive, importArchive, initializeLibrary, migrateArchive,
  openArchiveSession, recordAction, verifyArchive } from "@/persistence/archives";
import { saveRun } from "@/persistence/storage";
import { createLegacyRun } from "../fixtures/legacy-run";

const solid = (symbol: SymbolId): ReelSet => [Array(12).fill(symbol), Array(12).fill(symbol), Array(12).fill(symbol)];
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
const boundary = (tier: 1 | 2 | 3, symbol: SymbolId = "wild"): RunState => ({ ...createRun(8),
  phase: "SHIFT_COMPLETE", shift: 3, baseSpinsInShift: 3, service: "kitchen", exitUnlocked: true,
  bankroll: 10_000, reels: solid(symbol), hotel: { cleared: (tier - 1) as 0 | 1 | 2, challenge: null } });

beforeEach(() => localStorage.clear());
describe("three-shift opening and three-room journey", () => {
  it("offers two opening upgrades, unlocks rooms after nine pulls, and preserves legacy openings", () => {
    const initial = createRun(8);
    expect(initial.checkoutTarget).toBe(150);
    expect(getIntroShiftLimit(initial)).toBe(3);
    expect(getIntroShiftLimit(createLegacyRun(8))).toBe(5);
    let state = send({ ...initial, reels: solid("lemon") }, { type: "SELECT_SERVICE", serviceId: initial.serviceCandidates[0] });
    for (let shift = 1; shift <= 3; shift++) {
      state = round(state);
      if (shift < 3) {
        expect(state.phase).toBe("CHOOSING_UPGRADE");
        expect(dispatchCommand(state, { type: "ENTER_ROOM" }).ok).toBe(false);
        state = send(state, { type: "DECLINE_UPGRADE" });
      }
    }
    expect(state.phase).toBe("SHIFT_COMPLETE");
    expect(state.spinHistory).toHaveLength(9);
    expect(send(state, { type: "ENTER_ROOM" }).hotel?.challenge?.rounds?.current).toBe(1);
    expect(send(state, { type: "CONTINUE" }).freeAfterHoursLevel).toBe(1);
  });

  it.each([149, 150])("judges the new final opening balance %s against 150", (balance) => {
    let state = { ...boundary(1, "blank"), phase: "READY_TO_SPIN" as const, exitUnlocked: false, baseSpinsInShift: 2 };
    for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME"] as const) state = send(state, { type }) as typeof state;
    const next = send({ ...state, bankroll: balance }, { type: "PRESENTATION_COMPLETE" });
    expect(next.phase).toBe(balance < 150 ? "RUN_LOST" : "SHIFT_COMPLETE");
    expect(next.currentCandidates).toBeNull();
  });

  it.each([1, 2, 3] as const)("room %s gives two real growth choices and judges only after nine paid pulls", (tier) => {
    let state = send(boundary(tier), { type: "ENTER_ROOM" });
    for (let current = 1; current <= 3; current++) {
      state = round(state);
      expect(state.hotel?.challenge?.status).toBe(current < 3 ? "playing" : "cleared");
      expect(state.currentCandidates).not.toBeNull();
      if (current < 3) {
        expect(getRoomRewardsGranted(state)).toBe(current);
        const id = state.currentCandidates!.synergy;
        const choice = buildDefaultUpgradeChoice(state, id)!;
        const next = send(state, { type: "CHOOSE_UPGRADE", choice });
        expect(next.acquiredUpgrades).toContain(id);
        expect(next.hotel?.challenge?.rounds?.current).toBe(current + 1);
        expect(getRoomProgress(next)?.value).toBe(getRoomProgress(state)?.value);
        state = next;
      }
    }
    expect(state.spinHistory.filter((spin) => !spin.isFree)).toHaveLength(9);
    expect(state.hotel?.cleared).toBe(tier);
    expect(state.freeAfterHoursLevel).toBe(0);
  });

  it.each([2, 3] as const)("room %s cannot farm rest rewards by retrying or taking an overtime detour", (tier) => {
    let state = send(boundary(tier, "blank"), { type: "ENTER_ROOM" });
    for (let current = 1; current <= 3; current++) {
      state = round(state);
      if (current < 3) state = send(state, { type: "DECLINE_UPGRADE" });
    }
    expect(state.hotel?.challenge?.status).toBe("failed");
    expect(getRoomRewardsGranted(state)).toBe(2);
    state = send(state, { type: "CONTINUE" });
    state = send(round(state), { type: "DECLINE_UPGRADE" });
    state = send(state, { type: "ENTER_ROOM" });
    expect(getRoomProgress(state)?.value).toBe(0);
    state = round(state);
    expect(state.currentCandidates).toBeNull();
    expect(dispatchCommand(state, { type: "DECLINE_UPGRADE" }).ok).toBe(false);
    expect(send(state, { type: "NEXT_ROOM_ROUND" }).hotel?.challenge?.rounds?.current).toBe(2);
  });

  it("records independent rewards and replays the three-room journey including a reload at every rest", () => {
    saveRun(boundary(1));
    const session = openArchiveSession(activeRecord(initializeLibrary())!.snapshot);
    const log = (command: GameCommand) => {
      const before = session.record.snapshot;
      const result = dispatchCommand(before, command);
      expect(result.ok).toBe(true);
      recordAction(session, before, command, result);
      expect(session.warning).toBeNull();
      expect(decodeRunStateV2(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state);
    };
    for (const tier of [1, 2, 3] as const) {
      log({ type: "ENTER_ROOM" });
      for (let current = 1; current <= 3; current++) {
        for (let spin = 0; spin < 3; spin++)
          for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) log({ type });
        expect(getRoomRewardsGranted(session.record.snapshot)).toBe(Math.min(current, 2));
        log({ type: "DECLINE_UPGRADE" });
      }
      expect(session.record.snapshot.hotel?.cleared).toBe(tier);
    }
    expect(session.record.snapshot.hotel?.roomRewardsGranted).toEqual({ 2: 2, 3: 2 });
    expect(verifyArchive(importArchive(initializeLibrary(), exportArchive(session.record)).runs.at(-1)!)).toContain("核验通过");
  });

  it("migrates the published version without changing a pending draw, opening or Garden reward history", () => {
    const legacy = createLegacyRun(8);
    let state: RunState = { ...legacy, phase: "READY_TO_SPIN", service: "kitchen", shift: 5,
      bankroll: 2000, exitUnlocked: true, afterHoursLevel: 4,
      hotel: { cleared: 1, gardenRewardsGranted: 2, challenge: { tier: 2, status: "playing", target: 1200, paidSpins: 3, objective: { kind: "total-payout" } } } };
    state = send(state, { type: "SPIN" });
    saveRun(state);
    let library = initializeLibrary();
    library = importArchive(library, exportArchive({ ...activeRecord(library)!, rulesVersion: "rules-b5bc23b088249f53" }));
    const source = library.runs.at(-1)!;
    expect(canMigrateArchive(source)).toBe(true);
    const migrated = migrateArchive(library, source);
    const resumed = activeRecord(migrated)!;
    expect(migrated.runs.find((run) => run.id === source.id)).toEqual(source);
    expect(resumed.snapshot).toEqual(state);
    expect(resumed.snapshot.pendingSpin).toEqual(state.pendingSpin);
    expect(resumed.snapshot.checkoutTarget).toBe(200);
    expect(getRoomProgress(resumed.snapshot)?.target).toBe(1200);
    expect(HOTEL_ROOMS[2].target).toBe(2400);
    expect(verifyArchive(resumed)).toContain("核验通过");
  });

  it("rejects forged room reward counts and does not reset earlier room rewards", () => {
    const state = send(boundary(2), { type: "ENTER_ROOM" });
    expect(decodeRunStateV2({ ...state, hotel: { ...state.hotel, roomRewardsGranted: { 2: 3, 3: 0 } } })).toBeNull();
    const rest = round(state);
    expect(decodeRunStateV2({ ...rest, hotel: { ...rest.hotel, roomRewardsGranted: { 2: 0, 3: 0 } } })).toBeNull();
    const legacy = createLegacyRun(8);
    expect(decodeRunStateV2(legacy)).toEqual(legacy);
    expect(decodeRunStateV2({ ...legacy, introShifts: 4 })).toBeNull();
  });
});
