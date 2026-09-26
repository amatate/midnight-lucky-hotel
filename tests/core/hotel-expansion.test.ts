import { beforeEach, describe, expect, it } from "vitest";
import { getPaidSpinLimit, getRoomProgress, HOTEL_ROOMS, HOTEL_ROOM_TIERS, nextRoomTier } from "@/content/hotel";
import type { GameCommand } from "@/core/commands";
import { createRun, dispatchCommand } from "@/core/run";
import type { ReelSet, RoomTier, RunState, SymbolId } from "@/core/types";
import { activeRecord, exportArchive, importArchive, initializeLibrary, openArchiveSession, readLibrary, recordAction, verifyArchive } from "@/persistence/archives";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { saveRun } from "@/persistence/storage";

const solid = (symbol: SymbolId): ReelSet => [Array(12).fill(symbol), Array(12).fill(symbol), Array(12).fill(symbol)];

function boundary(tier: RoomTier, patch: Partial<RunState> = {}): RunState {
  return {
    ...createRun(8), phase: "SHIFT_COMPLETE", service: "kitchen", shift: 5,
    baseSpinsInShift: 3, exitUnlocked: true, bankroll: 10_000, reels: solid("wild"),
    hotel: { cleared: (tier - 1) as 0 | RoomTier, challenge: null },
    ...patch
  };
}

function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error.message}`);
  expect(decodeRunStateV2(result.state), command.type).not.toBeNull();
  return result.state;
}

function pull(state: RunState): RunState {
  for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) {
    state = send(state, { type });
  }
  return state;
}

const enter = (tier: RoomTier, patch: Partial<RunState> = {}): RunState => send(boundary(tier, patch), { type: "ENTER_ROOM" });

beforeEach(() => localStorage.clear());

describe("six-room hotel objectives", () => {
  it.each([4, 6] as const)("keeps room %s playing until its own paid-pull budget is used", (tier) => {
    const room = HOTEL_ROOMS[tier];
    let state = enter(tier);
    expect(state.hotel?.challenge).toMatchObject({
      tier, status: "playing", target: room.target, objective: room.objective, paidSpins: room.paidSpins
    });
    expect(getPaidSpinLimit(state)).toBe(room.paidSpins);
    for (let spin = 1; spin <= room.paidSpins; spin++) {
      state = pull(state);
      expect(state.spinHistory.at(-1)?.baseSpinIndex).toBe(spin);
      expect(state.baseSpinsInShift).toBe(spin);
      if (spin < room.paidSpins) {
        expect(state.phase).toBe("READY_TO_SPIN");
        expect(state.hotel?.challenge?.status).toBe("playing");
        expect(state.currentCandidates).toBeNull();
      }
    }
    expect(state.phase).toBe("AFTER_HOURS");
    expect(state.hotel?.challenge?.status).toBe("cleared");
    expect(state.currentCandidates).not.toBeNull();
    expect(getRoomProgress(state)?.cleared).toBe(true);
  });

  it("does not let four smaller wins satisfy the best-spin room", () => {
    let state = enter(4, { reels: solid("bell") });
    for (let spin = 0; spin < 4; spin++) state = pull(state);
    expect(state.shiftPayout).toBe(3750);
    expect(getRoomProgress(state)).toMatchObject({ value: 937.5, required: 2500, cleared: false });
    expect(state.hotel?.challenge).toMatchObject({ status: "failed", progress: 937.5 });
    expect(state.currentCandidates).toBeNull();
  });

  it("requires three scoring spins, not one jackpot or three consecutive hits", () => {
    let state = enter(5);
    state = pull(state);
    expect(state.shiftPayout).toBeGreaterThan(3 * HOTEL_ROOMS[5].target);
    for (let spin = 0; spin < 3; spin++) state = pull({ ...state, reels: solid("blank") });
    expect(getRoomProgress(state)).toMatchObject({ value: 1, required: 3, cleared: false });
    expect(state.hotel?.challenge?.status).toBe("failed");

    state = enter(5);
    for (const symbol of ["wild", "blank", "wild", "wild"] as const) state = pull({ ...state, reels: solid(symbol) });
    expect(getRoomProgress(state)).toMatchObject({ value: 3, required: 3, cleared: true });
    expect(state.hotel?.challenge).toMatchObject({ status: "cleared", progress: 3 });
  });

  it("resets retry progress without deleting or counting previous attempts' receipts", () => {
    let state = enter(5);
    for (const symbol of ["wild", "blank", "blank", "blank"] as const) state = pull({ ...state, reels: solid(symbol) });
    const firstAttemptLevel = state.afterHoursLevel;
    const receipts = state.spinHistory;
    state = send(state, { type: "ENTER_ROOM" });
    expect(state.afterHoursLevel).toBe(firstAttemptLevel + 1);
    expect(state.spinHistory).toEqual(receipts);
    expect(state.shiftPayout).toBe(0);
    expect(getRoomProgress(state)?.value).toBe(0);
    for (const symbol of ["wild", "blank", "wild", "blank"] as const) state = pull({ ...state, reels: solid(symbol) });
    expect(getRoomProgress(state)).toMatchObject({ value: 2, cleared: false });
    expect(state.hotel?.challenge?.status).toBe("failed");
    expect(state.hotel?.cleared).toBe(4);
  });

  it("counts an earned free spin toward the objective and judges only after the final queue drains", () => {
    let state = enter(4, { reels: solid("blank"), partSlots: [{ id: "blank-capacitor", level: 1 }, null, null, null, null] });
    for (let paid = 1; paid <= 4; paid++) {
      state = pull({ ...state, reels: solid("blank") });
      expect(state.baseSpinsInShift).toBe(paid);
      expect(state.freeSpinQueue).toBe(1);
      expect(state.hotel?.challenge?.status).toBe("playing");
      expect(state.currentCandidates).toBeNull();
      expect(state.phase).toBe("READY_TO_SPIN");
      state = pull({ ...state, reels: solid(paid === 4 ? "wild" : "blank") });
      expect(state.baseSpinsInShift).toBe(paid);
      expect(state.freeSpinQueue).toBe(0);
      expect(state.spinHistory.at(-1)).toMatchObject({ isFree: true, baseSpinIndex: null, wager: 0 });
    }
    expect(state.shiftWager).toBe(4 * HOTEL_ROOMS[4].bet);
    expect(state.spinHistory.filter((receipt) => !receipt.isFree)).toHaveLength(4);
    expect(state.hotel?.challenge?.status).toBe("cleared");
    expect(getRoomProgress(state)?.value).toBe(3750); // Five wild lines plus five stored agitation points.
    expect(state.phase).toBe("AFTER_HOURS");
  });

  it.each([4, 5, 6] as const)("requires room %s's full paid-pull reserve without charging an entry fee", (tier) => {
    const reserve = HOTEL_ROOMS[tier].bet * HOTEL_ROOMS[tier].paidSpins;
    expect(dispatchCommand(boundary(tier, { bankroll: reserve - 0.01 }), { type: "ENTER_ROOM" }).ok).toBe(false);
    expect(enter(tier, { bankroll: reserve }).bankroll).toBe(reserve);
  });

  it("exports, imports and deterministically replays all six rooms with their upgrade boundaries", () => {
    // A guaranteed winning fixture tests the lifecycle, not probabilistic balance.
    saveRun(boundary(1));
    const session = openArchiveSession(activeRecord(initializeLibrary())!.snapshot);
    const log = (command: GameCommand) => {
      const before = session.record.snapshot;
      const result = dispatchCommand(before, command);
      expect(result.ok, command.type).toBe(true);
      recordAction(session, before, command, result);
      expect(session.warning).toBeNull();
      expect(decodeRunStateV2(session.record.snapshot), command.type).not.toBeNull();
    };
    for (const tier of HOTEL_ROOM_TIERS) {
      log({ type: "ENTER_ROOM" });
      for (let spin = 0; spin < HOTEL_ROOMS[tier].paidSpins; spin++) {
        for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) log({ type });
      }
      expect(session.record.snapshot.hotel?.cleared).toBe(tier);
      expect(dispatchCommand(session.record.snapshot, { type: "ENTER_ROOM" }).ok).toBe(false);
      log({ type: "DECLINE_UPGRADE" });
    }
    expect(nextRoomTier(session.record.snapshot)).toBeNull();
    expect(dispatchCommand(session.record.snapshot, { type: "ENTER_ROOM" }).ok).toBe(false);
    log({ type: "CASH_OUT" });
    expect(session.record.snapshot.phase).toBe("RUN_WON");
    const imported = importArchive(readLibrary(), exportArchive(session.record));
    expect(verifyArchive(imported.runs.at(-1)!)).toContain("核验通过");
    expect(session.record.entries.flatMap((entry) => entry.events).filter((event) => event.type === "ROOM_COMPLETED")).toHaveLength(6);
  });
});
