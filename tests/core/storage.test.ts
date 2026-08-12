import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRun } from "@/core/run";
import { clearRun, loadRun, RUN_STORAGE_KEY, saveRun } from "@/persistence/storage";

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
