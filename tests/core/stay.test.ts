import { beforeEach, expect, it } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";
import { ROOM_RENT, rentDue } from "@/core/stay";
import { HOTEL_ROOMS, HOTEL_ROOM_TIERS, isRoomIntermission } from "@/content/hotel";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { saveRun } from "@/persistence/storage";
import { activeRecord, initializeLibrary, openArchiveSession, recordAction, verifyArchive, exportArchive, importArchive, readLibrary, migrateArchive, canMigrateArchive, startArchivedRun } from "@/persistence/archives";
import { syncGuestbook } from "@/meta/guestbook";
import { mioBrief } from "@/story/stay-copy";

beforeEach(() => localStorage.clear());
// Guaranteed winning checkpoint for lifecycle validation, NOT a balance simulation.
function checkout(): RunState { return { ...createRun(8, true), phase: "SHIFT_COMPLETE", shift: 3, baseSpinsInShift: 3, exitUnlocked: true,
  service: "repair", bankroll: 150, reels: [Array(12).fill("wild"), Array(12).fill("wild"), Array(12).fill("wild")] }; }
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw Error(`${command.type}: ${result.error.message}`);
  expect(decodeRunStateV2(JSON.parse(JSON.stringify(result.state))), command.type).not.toBeNull();
  return result.state;
}

it("makes the new journey opt-in, not an extra bill added to old saves", () => {
  expect(createRun(8).stay).toBeUndefined();
  expect(rentDue({ ...checkout(), stay: undefined } as unknown as RunState)).toBeNull();
  const book = startArchivedRun(readLibrary(), 8, true);
  expect(activeRecord(book)?.snapshot.stay?.paid).toEqual([]);
  expect(verifyArchive(activeRecord(book)!)).toContain("核验通过");
});
it("separates task and fee, charges exactly once, then opens the next room", () => {
  const state = checkout();
  expect(rentDue(state)).toEqual({ tier: 0, amount: 50 });
  expect(dispatchCommand(state, { type: "ENTER_ROOM" }).ok).toBe(false);
  expect(dispatchCommand(state, { type: "CONTINUE" }).ok).toBe(false);
  const paid = send(state, { type: "PAY_ROOM_RENT" });
  expect(paid.bankroll).toBe(100); expect(paid.expenses.rent).toBe(50);
  expect(paid.stay?.paid).toEqual([0]); expect(paid.currentCandidates).toBeNull();
  expect(paid.rng).toEqual(state.rng);
  expect(dispatchCommand(paid, { type: "PAY_ROOM_RENT" })).toMatchObject({ ok: false, state: paid });
  expect(send(paid, { type: "ENTER_ROOM" }).hotel?.challenge?.tier).toBe(1);
});
it("rejects an unaffordable fee and never pays before the task or after checkout", () => {
  const poor = { ...checkout(), bankroll: 49 };
  expect(dispatchCommand(poor, { type: "PAY_ROOM_RENT" })).toMatchObject({ ok: false, state: poor });
  expect(dispatchCommand(createRun(8, true), { type: "PAY_ROOM_RENT" }).ok).toBe(false);
  const ended = send(checkout(), { type: "CASH_OUT" });
  expect(rentDue(ended)).toBeNull();
  expect(dispatchCommand(ended, { type: "PAY_ROOM_RENT" }).ok).toBe(false);
  expect(mioBrief(ended).title).not.toContain("任务完成");
});
it("plays, saves, reloads and replays all seven paid rooms without double rewards", () => {
  saveRun(checkout());
  const session = openArchiveSession(activeRecord(initializeLibrary())!.snapshot);
  const log = (command: GameCommand) => {
    const before = session.record.snapshot, result = dispatchCommand(before, command);
    expect(result.ok, command.type).toBe(true);
    expect(decodeRunStateV2(result.state), command.type).not.toBeNull();
    recordAction(session, before, command, result); expect(session.warning).toBeNull();
  };
  log({ type: "PAY_ROOM_RENT" });
  for (const tier of HOTEL_ROOM_TIERS) {
    log({ type: "ENTER_ROOM" });
    const room = HOTEL_ROOMS[tier];
    for (let round = 1; round <= (room.rounds ?? 1); round++) {
      for (let spin = 0; spin < room.paidSpins; spin++) {
        for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) log({ type });
      }
      if (isRoomIntermission(session.record.snapshot)) log({ type: "DECLINE_UPGRADE" });
    }
    const pending = session.record.snapshot;
    expect(pending.hotel?.challenge?.status).toBe("billing");
    expect(pending.hotel?.cleared).toBe(tier - 1); expect(pending.currentCandidates).toBeNull();
    expect(pending.stay?.paid).not.toContain(tier);
    expect(activeRecord(readLibrary())?.snapshot).toEqual(pending);
    expect(dispatchCommand(pending, { type: "OPEN_WORKSHOP" }).ok).toBe(false);
    const poor = { ...pending, bankroll: ROOM_RENT[tier] - 1 };
    expect(dispatchCommand(poor, { type: "PAY_ROOM_RENT" })).toMatchObject({ ok: false, state: poor });
    log({ type: "PAY_ROOM_RENT" });
    expect(session.record.snapshot.bankroll).toBe(pending.bankroll - ROOM_RENT[tier]);
    expect(session.record.snapshot.hotel?.cleared).toBe(tier);
    expect(session.record.snapshot.currentCandidates).not.toBeNull();
    expect(dispatchCommand(session.record.snapshot, { type: "PAY_ROOM_RENT" }).ok).toBe(false);
    log({ type: "DECLINE_UPGRADE" });
  }
  expect(session.record.snapshot.stay?.paid).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(session.record.snapshot.expenses.rent).toBe(4250);
  expect(syncGuestbook(session.library).roomCards).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(syncGuestbook(startArchivedRun(session.library, 9, true)).roomCards).toHaveLength(7);
  expect(verifyArchive(session.record)).toContain("核验通过");
  const imported = importArchive(readLibrary(), exportArchive(session.record));
  expect(imported.runs.at(-1)?.snapshot.stay?.paid).toHaveLength(7);
  const ended = send(session.record.snapshot, { type: "CASH_OUT" });
  expect(mioBrief(ended).text).toContain("最高级");
});
it("rejects forged payment/card snapshots and legacy billing states", () => {
  expect(decodeRunStateV2({ ...checkout(), stay: { version: 1, paid: [0] } })).toBeNull();
  const paid = send(checkout(), { type: "PAY_ROOM_RENT" });
  expect(decodeRunStateV2({ ...paid, stay: { version: 1, paid: [0, 0] } })).toBeNull();
  expect(decodeRunStateV2({ ...paid, stay: { version: 1, paid: [1] } })).toBeNull();
});
it("keeps a failed room uncharged and allows paid workshop, retry or lounge recovery", () => {
  let state = send({ ...checkout(), bankroll: 5000 }, { type: "PAY_ROOM_RENT" });
  state = send({ ...state, reels: [Array(12).fill("blank"), Array(12).fill("blank"), Array(12).fill("blank")] }, { type: "ENTER_ROOM" });
  for (let round = 1; round <= 3; round++) {
    for (let spin = 0; spin < 3; spin++) for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
    if (isRoomIntermission(state)) state = send(state, { type: "DECLINE_UPGRADE" });
  }
  expect(state.hotel?.challenge?.status).toBe("failed");
  expect(state.stay?.paid).toEqual([0]); expect(state.expenses.rent).toBe(50);
  expect(rentDue(state)).toBeNull();
  expect(send(state, { type: "OPEN_WORKSHOP" }).workshop?.status).toBe("shopping");
  expect(send(state, { type: "ENTER_ROOM" }).hotel?.challenge?.status).toBe("playing");
  expect(send(state, { type: "CONTINUE" }).hotel?.challenge).toBeNull();
});
it("forks the previous published rules without changing its wallet or adding rent", () => {
  const library = startArchivedRun(readLibrary(), 8);
  const source = { ...activeRecord(library)!, rulesVersion: "rules-a3d7519aafedd7f5" };
  expect(canMigrateArchive(source)).toBe(true);
  const updated = migrateArchive({ ...library, runs: [source] }, source);
  expect(activeRecord(updated)?.snapshot).toEqual(source.snapshot);
  expect(activeRecord(updated)?.snapshot.stay).toBeUndefined();
  expect(syncGuestbook(updated).roomCards).toBeUndefined();
});
it("Mio distinguishes paid workshop choices from complimentary gifts", () => {
  expect(mioBrief({ ...checkout(), phase: "AFTER_HOURS", hotel: { cleared: 0, challenge: { tier: 1, status: "failed" } }, currentCandidates: { synergy: "safety-fuse", pivot: "fruit-salad", wildcard: "lemon-infection" }, workshop: { status: "shopping", cost: 100 } }).title).toContain("付费");
});
