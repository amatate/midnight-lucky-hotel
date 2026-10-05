import { beforeEach, describe, expect, it } from "vitest";
import { HOTEL_ROOMS } from "@/content/hotel";
import type { GameCommand } from "@/core/commands";
import { buildSpinReceipt, isSpinReceipt } from "@/core/receipts";
import { dispatchCommand } from "@/core/run";
import { createLegacyRun as createRun } from "../fixtures/legacy-run";
import type { BaseSpinIndex, RoomTier, RunState } from "@/core/types";
import {
  activeRecord, canMigrateArchive, exportArchive, importArchive, initializeLibrary, migrateArchive,
  openArchiveSession, readLibrary, recordAction, verifyArchive
} from "@/persistence/archives";
import { isGameEventV2 } from "@/persistence/codec-shared";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { saveRun } from "@/persistence/storage";

const PREVIOUS_RULES = "rules-54eb1749df08ea12";
function roomState(tier: RoomTier = 6, patch: Partial<RunState> = {}): RunState {
  const room = HOTEL_ROOMS[tier];
  return {
    ...createRun(8), phase: "READY_TO_SPIN", service: "kitchen", shift: 5,
    afterHoursLevel: tier, exitUnlocked: true, bankroll: 10_000,
    hotel: { cleared: (tier - 1) as 0 | RoomTier, challenge: {
      tier, status: "playing", target: room.target, paidSpins: room.paidSpins, objective: room.objective
    } },
    ...patch
  };
}
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

beforeEach(() => localStorage.clear());

describe("six-room persistence compatibility", () => {
  it.each([4, 5] as const)("retains and validates paid-spin receipt %s", (index) => {
    const result = buildSpinReceipt({
      ordinal: index, shift: 5, afterHoursLevel: 6, isFree: false, baseSpinIndex: index as BaseSpinIndex,
      bankrollBefore: 1000, wager: 200, bankrollAfter: 800,
      finalGrid: [["blank", "blank", "blank"], ["blank", "blank", "blank"], ["blank", "blank", "blank"]],
      settlementEvents: [{ sequence: 1, type: "PAYOUT_COMPLETE", total: 0 }]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isSpinReceipt(result.receipt)).toBe(true);
    expect(isSpinReceipt({ ...result.receipt, baseSpinIndex: 6 })).toBe(false);
    expect(isSpinReceipt({ ...result.receipt, afterHoursLevel: 0 })).toBe(false);
    const state = roomState(6, { baseSpinsInShift: index, spinHistory: [result.receipt], nextSpinOrdinal: index + 1 });
    expect(decodeRunStateV2(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("uses room-specific or captured boundaries without widening ordinary shifts and overtime", () => {
    const fourth = roomState(4, {
      phase: "AFTER_HOURS", baseSpinsInShift: 4,
      hotel: { cleared: 3, challenge: { tier: 4, status: "failed", paidSpins: 4, objective: { kind: "best-spin" }, target: 2500, progress: 1100 } }
    });
    expect(decodeRunStateV2(fourth)).toEqual(fourth);
    expect(decodeRunStateV2({ ...fourth, baseSpinsInShift: 3 })).toBeNull();
    const captured = { ...fourth, baseSpinsInShift: 5, hotel: { ...fourth.hotel!, challenge: { ...fourth.hotel!.challenge!, paidSpins: 5 } } };
    expect(decodeRunStateV2(captured)).toEqual(captured);
    expect(decodeRunStateV2({ ...fourth, hotel: { cleared: 3, challenge: null } })).toBeNull();
    expect(decodeRunStateV2({ ...createRun(8), phase: "READY_TO_SPIN", service: "kitchen", baseSpinsInShift: 4 })).toBeNull();
    expect(decodeRunStateV2(roomState(6, { baseSpinsInShift: 6 }))).toBeNull();
  });

  it("accepts legacy room events and exact new objective metadata but rejects malformed fields", () => {
    const old = { sequence: 1, type: "ROOM_COMPLETED", tier: 2, payout: 1185, target: 2000, cleared: false };
    expect(isGameEventV2(old)).toBe(true);
    const fresh = { ...old, tier: 5, paidSpins: 4, objective: { kind: "scoring-spins", count: 3 }, progress: 2 };
    expect(isGameEventV2(fresh)).toBe(true);
    expect(isGameEventV2({ ...fresh, tier: 7 })).toBe(false);
    expect(isGameEventV2({ ...fresh, paidSpins: 6 })).toBe(false);
    expect(isGameEventV2({ ...fresh, progress: 2.5 })).toBe(false);
    expect(isGameEventV2({ ...fresh, objective: { kind: "scoring-spins", count: 0 } })).toBe(false);
    expect(isGameEventV2({ ...fresh, objective: { kind: "best-spin", count: 3 } })).toBe(false);
    const state = roomState(5);
    expect(decodeRunStateV2({ ...state, hotel: { ...state.hotel!, challenge: { ...state.hotel!.challenge!, paidSpins: 6 } } })).toBeNull();
    expect(decodeRunStateV2({ ...state, hotel: { ...state.hotel!, challenge: { ...state.hotel!.challenge!, objective: { kind: "unknown" } } } })).toBeNull();
  });

  it("exports, imports and replays the fourth room through its fourth paid spin", () => {
    saveRun(roomState(3, {
      phase: "AFTER_HOURS", baseSpinsInShift: 3,
      hotel: { cleared: 3, challenge: { tier: 3, status: "cleared" } },
      reels: [["blank", "blank", "blank"], ["blank", "blank", "blank"], ["blank", "blank", "blank"]]
    }));
    const session = openArchiveSession(activeRecord(initializeLibrary())!.snapshot);
    const log = (command: GameCommand) => {
      const before = session.record.snapshot;
      const result = dispatchCommand(before, command);
      expect(result.ok).toBe(true);
      recordAction(session, before, command, result);
      expect(session.warning).toBeNull();
    };
    log({ type: "ENTER_ROOM" });
    for (let spin = 0; spin < 4; spin++) {
      for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) log({ type });
    }
    expect(session.record.snapshot.baseSpinsInShift).toBe(4);
    expect(session.record.snapshot.hotel?.challenge).toMatchObject({ tier: 4, status: "failed", paidSpins: 4, objective: { kind: "best-spin" }, progress: 0 });
    expect(session.record.entries.flatMap((entry) => entry.events)).toContainEqual(expect.objectContaining({ type: "ROOM_COMPLETED", tier: 4, paidSpins: 4, progress: 0 }));
    const imported = importArchive(readLibrary(), exportArchive(session.record)).runs.at(-1)!;
    expect(verifyArchive(imported)).toContain("核验通过");
  });

  it("migrates a previous-version mid-block READY checkpoint exactly, retaining queued free spins and its source", () => {
    let state: RunState = { ...createRun(8), phase: "READY_TO_SPIN", service: "kitchen", bankroll: 1000 };
    for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
    state = { ...state, freeSpinQueue: 1 };
    saveRun(state);
    let library = initializeLibrary();
    const original = { ...activeRecord(library)!, rulesVersion: PREVIOUS_RULES };
    library = importArchive(library, exportArchive(original));
    const source = library.runs.at(-1)!;
    const raw = JSON.stringify(source);
    expect(canMigrateArchive(source)).toBe(true);
    const migratedLibrary = migrateArchive(library, source);
    const migrated = activeRecord(migratedLibrary)!;
    expect(migrated.snapshot).toEqual(state);
    expect(migrated.initialState).toEqual(state);
    expect(migrated.entries).toHaveLength(0);
    expect(migrated.parentId).toBe(source.id);
    expect(verifyArchive(migrated)).toContain("仅覆盖保存检查点之后");
    expect(JSON.stringify(migratedLibrary.runs.find((run) => run.id === source.id))).toBe(raw);
    expect(canMigrateArchive({ ...source, rulesVersion: "rules-705e0a792a2c3847" })).toBe(false);
    expect(canMigrateArchive({ ...source, snapshot: { ...state, phase: "RUN_WON" } })).toBe(false);
    expect(canMigrateArchive({ ...source, snapshot: { ...state, phase: "RUN_LOST" } })).toBe(false);
  });

  it.each(["SPINNING", "AWAITING_INTERVENTION", "RESOLVING_EFFECTS"] as const)("preserves an in-flight %s snapshot from the immediate previous version", (phase) => {
    let state: RunState = { ...createRun(8), phase: "READY_TO_SPIN", service: "kitchen", bankroll: 1000 };
    state = send(state, { type: "SPIN" });
    if (phase !== "SPINNING") state = send(state, { type: "REELS_STOPPED" });
    if (phase === "RESOLVING_EFFECTS") state = send(state, { type: "ACCEPT_OUTCOME" });
    expect(state.phase).toBe(phase);
    saveRun(state);
    let library = initializeLibrary();
    library = importArchive(library, exportArchive({ ...activeRecord(library)!, rulesVersion: PREVIOUS_RULES }));
    const source = library.runs.at(-1)!;
    expect(canMigrateArchive(source)).toBe(true);
    expect(canMigrateArchive({ ...source, rulesVersion: "rules-705e0a792a2c3847" })).toBe(false);
    const migrated = activeRecord(migrateArchive(library, source))!;
    expect(migrated.snapshot).toEqual(state);
    expect(migrated.initialState).toEqual(state);
    expect(migrated.entries).toHaveLength(0);
    const recovery: GameCommand = phase === "SPINNING" ? { type: "REELS_STOPPED" }
      : phase === "AWAITING_INTERVENTION" ? { type: "ACCEPT_OUTCOME" } : { type: "PRESENTATION_COMPLETE" };
    expect(send(migrated.snapshot, recovery)).toEqual(send(state, recovery));
  });

  it("keeps captured historical goals and completed workshop accounting when migrating the previous release", () => {
    const state = roomState(3, {
      phase: "AFTER_HOURS", baseSpinsInShift: 3,
      hotel: { cleared: 2, challenge: { tier: 3, status: "failed", target: 5000, objective: { kind: "total-payout" }, paidSpins: 3, progress: 3456 } },
      workshop: { cost: 200, status: "finished" }, blockStartBankroll: 8500,
      expenses: { wagers: 300, kitchen: 75, chapel: 0, repair: 0, workshop: 200 }
    });
    saveRun(state);
    let library = initializeLibrary();
    library = importArchive(library, exportArchive({ ...activeRecord(library)!, rulesVersion: PREVIOUS_RULES }));
    const source = library.runs.at(-1)!;
    const migrated = activeRecord(migrateArchive(library, source))!;
    expect(migrated.snapshot).toEqual(state);
  });
});
