import { beforeEach, describe, expect, it } from "vitest";
import { createRun } from "@/core/run";
import { BLUEPRINT_STORAGE_KEY, captureBlueprint, deleteBlueprint, isBlueprint, MAX_BLUEPRINTS, readBlueprints, saveBlueprint } from "@/workshop/blueprints";

beforeEach(() => localStorage.clear());

describe("construction collection", () => {
  it("captures an independent recipe without wallet, RNG, pending board or stored charges", () => {
    const state = createRun(123, true);
    const blueprint = captureBlueprint(state, "  水果试作  ");
    expect(blueprint.name).toBe("水果试作");
    expect(isBlueprint(blueprint)).toBe(true);
    expect(blueprint.reels).not.toBe(state.reels);
    expect(blueprint.reels[0]).not.toBe(state.reels[0]);
    expect(blueprint).not.toHaveProperty("rng");
    expect(blueprint).not.toHaveProperty("bankroll");
    expect(blueprint).not.toHaveProperty("pendingSpin");
    expect(blueprint).not.toHaveProperty("counters");
    expect(saveBlueprint(blueprint).error).toBeNull();
    expect(readBlueprints().entries).toEqual([blueprint]);
    expect(deleteBlueprint(blueprint.id).entries).toEqual([]);
  });

  it("never evicts an old build to make room", () => {
    for (let index = 0; index < MAX_BLUEPRINTS; index += 1) {
      expect(saveBlueprint(captureBlueprint(createRun(index), `构筑 ${index}`)).error).toBeNull();
    }
    const old = localStorage.getItem(BLUEPRINT_STORAGE_KEY);
    expect(saveBlueprint(captureBlueprint(createRun(99), "第十三台")).error).not.toBeNull();
    expect(localStorage.getItem(BLUEPRINT_STORAGE_KEY)).toBe(old);
    const first = readBlueprints().entries[0]!;
    expect(saveBlueprint({ ...first, name: "重新命名" }).error).toBeNull();
    expect(readBlueprints().entries).toHaveLength(MAX_BLUEPRINTS);
  });

  it("rejects malformed, oversized or future data without silently overwriting it", () => {
    const blueprint = captureBlueprint(createRun(1), "验证");
    expect(isBlueprint({ ...blueprint, partSlots: [
      { id: "fruit-salad", level: 1 }, { id: "fruit-salad", level: 2 }, null, null, null
    ] })).toBe(false);
    expect(isBlueprint({ ...blueprint, partSlots: [{ id: "__proto__", level: 1 }, null, null, null, null] })).toBe(false);
    expect(isBlueprint({ ...blueprint, reels: [Array(129).fill("cherry"), ["lemon"], ["seven"]] })).toBe(false);
    expect(isBlueprint({ ...blueprint, reels: [["unknown"], ["lemon"], ["seven"]] })).toBe(false);
    expect(isBlueprint({ ...blueprint, service: "unknown" })).toBe(false);
    expect(() => captureBlueprint(createRun(1), "x\ny")).toThrow();
    for (const raw of ["invalid JSON", JSON.stringify({ version: 2, entries: [blueprint] }), "x".repeat(200_001)]) {
      localStorage.setItem(BLUEPRINT_STORAGE_KEY, raw);
      expect(readBlueprints().error).not.toBeNull();
      expect(saveBlueprint(blueprint).error).not.toBeNull();
      expect(deleteBlueprint(blueprint.id).error).not.toBeNull();
      expect(localStorage.getItem(BLUEPRINT_STORAGE_KEY)).toBe(raw);
    }
  });

  it("keeps valid old-rule recipes inspectable and reports storage failure", () => {
    const old = { ...captureBlueprint(createRun(1), "旧构筑"), rulesVersion: "rules-old-version" };
    expect(saveBlueprint(old).error).toBeNull();
    expect(readBlueprints().entries[0]).toEqual(old);
    const unavailable = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readBlueprints(unavailable).error).not.toBeNull();
    const full = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(saveBlueprint(old, full)).toMatchObject({ entries: [], error: expect.any(String) });
  });
});
