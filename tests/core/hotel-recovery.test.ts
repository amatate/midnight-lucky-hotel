import { beforeEach, expect, it } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import { getCurrentBet } from "@/core/progression";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { activeRecord, exportArchive, importArchive, initializeLibrary, migrateArchive, canMigrateArchive, openArchiveSession, recordAction, verifyArchive } from "@/persistence/archives";
import { saveRun } from "@/persistence/storage";
import { buildRunSummary } from "@/sim/run-summary";

const failed = (patch: Partial<RunState> = {}): RunState => ({
  ...createRun(20260812), phase: "AFTER_HOURS", service: "repair", shift: 5,
  baseSpinsInShift: 3, exitUnlocked: true, bankroll: 4043, afterHoursLevel: 12,
  hotel: { cleared: 1, challenge: { tier: 2, status: "failed" } },
  partSlots: [{ id: "martyr-coin", level: 2 }, null, null, null, null],
  ...patch
});
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(result.error.message);
  expect(decodeRunStateV2(JSON.parse(JSON.stringify(result.state))), command.type).not.toBeNull();
  return result.state;
}
beforeEach(() => localStorage.clear());

it("does not inflate free overtime stakes through room retries, including legacy counters", () => {
  const state = failed({ freeAfterHoursLevel: 1, betMode: "aggressive" });
  expect(getCurrentBet(send(state, { type: "CONTINUE" }))).toBe(31.25);
  const retry = send(state, { type: "ENTER_ROOM" });
  expect(retry.afterHoursLevel).toBe(13); // Log block IDs remain unique.
  expect(retry.freeAfterHoursLevel).toBe(1);
  expect(getCurrentBet(retry)).toBe(50);
  const { freeAfterHoursLevel: _free, ...legacy } = state;
  const legacyHistory = { ...legacy, commandHistory: [{ type: "CONTINUE" }, ...Array(11).fill({ type: "ENTER_ROOM" })] } as RunState;
  expect(getCurrentBet(send(legacyHistory, { type: "CONTINUE" }))).toBe(31.25);
});

it("opens one deterministic paid offer, charges only a valid purchase and cannot be farmed for tips", () => {
  const original = failed({ tips: 5 });
  const opened = send(original, { type: "OPEN_WORKSHOP" });
  expect(opened.bankroll).toBe(4043);
  expect(opened.currentCandidates).not.toBeNull();
  expect(opened).toEqual(send(original, { type: "OPEN_WORKSHOP" }));
  expect(dispatchCommand(opened, { type: "OPEN_WORKSHOP" }).ok).toBe(false);
  const declined = send(opened, { type: "DECLINE_UPGRADE" });
  expect(declined.tips).toBe(5);
  expect(declined.bankroll).toBe(4043);
  expect(send(opened, { type: "CASH_OUT" }).phase).toBe("RUN_WON");
  expect(dispatchCommand(declined, { type: "OPEN_WORKSHOP" }).ok).toBe(false);
  const offer = { ...opened, currentCandidates: { synergy: "carbon-copy", pivot: "fruit-salad", wildcard: "tithe-box" } } as RunState;
  const invalid = dispatchCommand(offer, { type: "CHOOSE_UPGRADE", choice: { id: "carbon-copy", action: "apply" } });
  expect(invalid.ok).toBe(false); expect(invalid.state).toEqual(offer);
  const purchased = send(offer, { type: "CHOOSE_UPGRADE", choice: { id: "fruit-salad", action: "apply" } });
  expect(purchased.bankroll).toBe(3943);
  expect(purchased.expenses.workshop).toBe(100);
  expect(purchased.partSlots[1]?.id).toBe("fruit-salad");
  expect(purchased.currentCandidates).toBeNull();
  expect(dispatchCommand(purchased, { type: "OPEN_WORKSHOP" }).ok).toBe(false);
  const poor = { ...offer, bankroll: 99 };
  expect(dispatchCommand(poor, { type: "CHOOSE_UPGRADE", choice: { id: "fruit-salad", action: "apply" } }).state).toEqual(poor);
});

it("keeps the free success reward and rejects workshop use during play or after cashout", () => {
  const reward = failed({ hotel: { cleared: 2, challenge: { tier: 2, status: "cleared" } },
    currentCandidates: { synergy: "fruit-salad", pivot: "carbon-copy", wildcard: "safety-fuse" } });
  expect(dispatchCommand(reward, { type: "OPEN_WORKSHOP" }).ok).toBe(false);
  const rewarded = send(reward, { type: "CHOOSE_UPGRADE", choice: { id: "fruit-salad", action: "apply" } });
  expect(rewarded.bankroll).toBe(4043);
  expect(send(rewarded, { type: "OPEN_WORKSHOP" }).currentCandidates).not.toBeNull();
  expect(dispatchCommand(send(failed(), { type: "ENTER_ROOM" }), { type: "OPEN_WORKSHOP" }).ok).toBe(false);
  expect(dispatchCommand(send(failed(), { type: "CASH_OUT" }), { type: "OPEN_WORKSHOP" }).ok).toBe(false);
});

it("persists and replays workshop actions and expenses", () => {
  saveRun(failed());
  const session = openArchiveSession(activeRecord(initializeLibrary())!.snapshot);
  for (const command of [{ type: "OPEN_WORKSHOP" }, { type: "DECLINE_UPGRADE" }, { type: "ENTER_ROOM" }] as const) {
    const before = session.record.snapshot;
    recordAction(session, before, command, dispatchCommand(before, command));
    expect(session.warning).toBeNull();
  }
  expect(verifyArchive(session.record)).toContain("核验通过");
});

it.each(["rules-76b3ccda2416e7f9", "rules-705e0a792a2c3847"])("migrates %s as a new checkpoint, without overwriting or rejudging the source", (rulesVersion) => {
  const old = failed({ commandHistory: [{ type: "CONTINUE" }, ...Array(11).fill({ type: "ENTER_ROOM" })] });
  saveRun(old);
  let library = initializeLibrary();
  const original = { ...activeRecord(library)!, rulesVersion };
  library = importArchive(library, exportArchive(original));
  const source = library.runs.at(-1)!;
  const sourceRaw = JSON.stringify(source);
  library = migrateArchive(library, source);
  const migrated = activeRecord(library)!;
  expect(migrated.parentId).toBe(source.id);
  expect(migrated.coverage).toBe("from-checkpoint");
  expect(migrated.entries).toHaveLength(0);
  expect(migrated.snapshot.bankroll).toBe(4043);
  expect(migrated.snapshot.freeAfterHoursLevel).toBe(1);
  expect(migrated.snapshot.hotel?.challenge?.status).toBe("failed");
  expect(verifyArchive(migrated)).toContain("仅覆盖保存检查点之后");
  expect(JSON.stringify(library.runs.find((run) => run.id === source.id))).toBe(sourceRaw);
  expect(canMigrateArchive({ ...source, rulesVersion: "unknown" })).toBe(false);
  expect(canMigrateArchive({ ...source, snapshot: { ...source.snapshot, phase: "RUN_WON" } })).toBe(false);
});

it("separates the last room ledger from lifetime money and post-room purchases", () => {
  const state = failed({ blockStartBankroll: 3108, bankroll: 3943, shiftPayout: 1185, shiftWager: 150,
    expenses: { wagers: 1380, kitchen: 0, chapel: 516, repair: 0, workshop: 100 },
    shiftHistory: [{ shift: 5, afterHoursLevel: 12, bankroll: 4043, reels: createRun(1).reels, parts: [], totalPayout: 1185, totalWager: 150 }] });
  const summary = buildRunSummary(state, []);
  expect(summary.block).toEqual({ start: 3108, end: 4043, payout: 1185, wager: 150, otherCosts: 100, net: 935, afterBlockCosts: 100 });
  expect(summary.serviceExpenses).toBe(516);
  expect(summary.workshopExpenses).toBe(100);
  expect(summary.buildSuggestion).not.toBe("safety-fuse");
});
