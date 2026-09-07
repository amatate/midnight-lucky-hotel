import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import { saveRun, RUN_STORAGE_KEY } from "@/persistence/storage";
import {
  activeRecord, ARCHIVE_KEY, backupSession, exportArchive, importArchive, initializeLibrary, openArchiveSession,
  persistSession, readLibrary, recordAction, restoreArchive, RULES_VERSION, startArchivedRun, verifyArchive,
  type ArchiveSession
} from "@/persistence/archives";

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

function session(seed = 6): ArchiveSession {
  const library = startArchivedRun(initializeLibrary(), seed);
  return openArchiveSession(activeRecord(library)!.snapshot);
}
function send(run: ArchiveSession, command: GameCommand): void {
  const before = run.record.snapshot;
  recordAction(run, before, command, dispatchCommand(before, command));
}

describe("game archives", () => {
  it("reloads and replays block blanks alongside one-spin prayer copies without permanent pollution", () => {
    const state = { ...createRun(8), phase: "READY_TO_SPIN" as const, service: "chapel" as const,
      bankroll: 1000, reels: [Array(12).fill("seven"), Array(12).fill("seven"), Array(12).fill("seven")] as const,
      blockReelAdditions: [["blank"], ["blank"], ["blank"]] as const,
      partSlots: [{ id: "triple-blessing" as const, level: 2 as const }, null, null, null, null] as const };
    saveRun(state);
    const run = openArchiveSession(activeRecord(initializeLibrary())!.snapshot);
    send(run, { type: "PRAY", symbol: "seven" });
    send(run, { type: "SPIN" });
    expect(run.record.snapshot.pendingSpin!.draw.strips.map((strip) => strip.length)).toEqual([15, 15, 15]);
    const reloaded = openArchiveSession(activeRecord(readLibrary())!.snapshot);
    for (const type of ["REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) send(reloaded, { type });
    expect(reloaded.record.snapshot.reels).toEqual(state.reels);
    expect(reloaded.record.snapshot.temporaryReelAdditions).toEqual([[], [], []]);
    expect(reloaded.record.snapshot.blockReelAdditions).toEqual(state.blockReelAdditions);
    expect(reloaded.record.entries.some((entry) => entry.changes.blockReelAdditions !== undefined)).toBe(false);
    expect(verifyArchive(reloaded.record)).toContain("核验通过");
  });
  it("keeps a legacy checkpoint and its source key without fabricating old entries", () => {
    const initial = createRun(5);
    const result = dispatchCommand(initial, { type: "SELECT_SERVICE", serviceId: initial.serviceCandidates[0] });
    expect(result.ok).toBe(true);
    saveRun(result.state);
    const source = localStorage.getItem(RUN_STORAGE_KEY);
    const library = initializeLibrary();
    expect(activeRecord(library)).toMatchObject({ coverage: "from-checkpoint", origin: "legacy", entries: [], initialState: result.state, snapshot: result.state });
    expect(localStorage.getItem(RUN_STORAGE_KEY)).toBe(source);
    expect(initializeLibrary()).toEqual(library);
  });

  it("records rejected attempts beyond 100 entries without advancing the RNG", () => {
    const run = session();
    const before = run.record.snapshot;
    for (let index = 0; index < 105; index++) send(run, { type: "SPIN" });
    expect(run.warning).toBeNull();
    expect(run.record.entries).toHaveLength(105);
    expect(run.record.entries[104]).toMatchObject({ ordinal: 105, ok: false, error: { code: "INVALID_PHASE" }, changes: {}, events: [] });
    expect(run.record.snapshot).toEqual(before);
    expect(activeRecord(readLibrary())!.entries).toHaveLength(105);
  });

  it("captures actions, full draws, settlement events and boundaries for deterministic verification", () => {
    const run = session();
    send(run, { type: "SELECT_SERVICE", serviceId: run.record.snapshot.serviceCandidates[0] });
    for (let spin = 0; spin < 3; spin++) {
      for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) send(run, { type });
    }
    expect(run.warning).toBeNull();
    expect(run.record.entries.some((entry) => entry.events.some((event) => event.type === "REELS_DRAWN"))).toBe(true);
    expect(run.record.entries.some((entry) => entry.events.some((event) => event.type === "PAYOUT_COMPLETE"))).toBe(true);
    expect(run.record.entries.at(-1)!.changes.currentCandidates).toBeDefined();
    expect(run.record.snapshot.spinHistory).toHaveLength(3);
    const raw = localStorage.getItem(ARCHIVE_KEY);
    expect(verifyArchive(run.record)).toContain("核验通过");
    expect(localStorage.getItem(ARCHIVE_KEY)).toBe(raw);
    expect(RULES_VERSION).toMatch(/^rules-[a-f0-9]{16}$/);
  });

  it("retains previous games and creates separate checkpoint/restore branches", () => {
    const run = session();
    send(run, { type: "SELECT_SERVICE", serviceId: run.record.snapshot.serviceCandidates[0] });
    backupSession(run, "水果实验");
    const backup = run.library.runs.find((record) => record.origin === "backup")!;
    const next = startArchivedRun(run.library, 45);
    expect(next.runs).toHaveLength(3);
    const restored = restoreArchive(next, backup);
    expect(restored.runs).toHaveLength(4);
    expect(activeRecord(restored)!.snapshot).toEqual(backup.snapshot);
    expect(activeRecord(restored)!.id).not.toBe(backup.id);
    expect(restored.runs.find((record) => record.id === backup.id)).toEqual(backup);
  });

  it("round trips exported archives without changing the active game", () => {
    const run = session();
    send(run, { type: "SELECT_SERVICE", serviceId: run.record.snapshot.serviceCandidates[0] });
    const imported = importArchive(run.library, exportArchive(run.record));
    expect(imported.activeId).toBe(run.record.id);
    expect(imported.runs.at(-1)!.id).not.toBe(run.record.id);
    expect(imported.runs.at(-1)!.entries).toEqual(run.record.entries);
    expect(verifyArchive(imported.runs.at(-1)!)).toContain("核验通过");
  });

  it("fails closed on damaged archives and unsupported imports", () => {
    const run = session();
    const raw = localStorage.getItem(ARCHIVE_KEY);
    const malformed = JSON.parse(exportArchive(run.record));
    malformed.run.snapshot.bankroll = "not money";
    expect(() => importArchive(run.library, JSON.stringify(malformed))).toThrow();
    expect(() => importArchive(run.library, '{"__proto__": {"unsafe": true}}')).toThrow();
    expect(localStorage.getItem(ARCHIVE_KEY)).toBe(raw);
    localStorage.setItem(ARCHIVE_KEY, "broken");
    expect(() => initializeLibrary()).toThrow();
    expect(localStorage.getItem(ARCHIVE_KEY)).toBe("broken");
  });

  it("preserves the disk save and in-memory action when storage is full, then retries exactly once", () => {
    const run = session();
    const original = localStorage.getItem(ARCHIVE_KEY);
    const setter = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    send(run, { type: "SELECT_SERVICE", serviceId: run.record.snapshot.serviceCandidates[0] });
    expect(run.warning).toContain("自动保存失败");
    expect(run.record.entries).toHaveLength(1);
    expect(localStorage.getItem(ARCHIVE_KEY)).toBe(original);
    setter.mockRestore();
    persistSession(run);
    expect(run.warning).toBeNull();
    expect(activeRecord(readLibrary())!.entries).toHaveLength(1);
    expect(activeRecord(readLibrary())!.snapshot).toEqual(run.record.snapshot);
  });

  it("does not let a stale tab overwrite another tab", () => {
    const first = session();
    const second = openArchiveSession(first.record.snapshot);
    send(first, { type: "SELECT_SERVICE", serviceId: first.record.snapshot.serviceCandidates[0] });
    const written = localStorage.getItem(ARCHIVE_KEY);
    send(second, { type: "SPIN" });
    expect(second.warning).toContain("另一个标签页");
    expect(localStorage.getItem(ARCHIVE_KEY)).toBe(written);
    expect(second.record.entries).toHaveLength(1);
  });

  it("keeps mismatched rules read-only and reports tampered logs", () => {
    const run = session();
    const foreign = { ...run.record, rulesVersion: "rules-old" };
    expect(verifyArchive(foreign)).toContain("规则版本不同");
    expect(() => restoreArchive(run.library, foreign)).toThrow("规则版本不同");
    send(run, { type: "SPIN" });
    expect(verifyArchive({ ...run.record, entries: [{ ...run.record.entries[0]!, ok: true }] })).toContain("不一致");
  });
});
