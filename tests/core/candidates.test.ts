import { describe, expect, it } from "vitest";
import { UPGRADES } from "@/content/upgrades";
import { generateCandidates, getDominantRoute } from "@/core/candidates";
import { createRun } from "@/core/run";
import type { RunState, UpgradeId } from "@/core/types";

function candidateState(patch: Partial<RunState> = {}): RunState {
  return {
    ...createRun(123),
    phase: "CHOOSING_UPGRADE",
    service: "kitchen",
    rng: { value: 123 },
    ...patch
  };
}

describe("generateCandidates", () => {
  it("returns the exact same seeded role set and consumes exactly one draw per role", () => {
    const state = candidateState();
    const snapshot = structuredClone(state);

    const result = generateCandidates(state);

    expect(result).toEqual({
      candidates: {
        synergy: "fruit-salad",
        pivot: "midnight-bell",
        wildcard: "martyr-coin"
      },
      rng: { value: 1199730266 }
    });
    expect(generateCandidates(state)).toEqual(result);
    expect(state).toEqual(snapshot);
  });

  it("returns three unique legal definitions carrying their assigned role", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const state = candidateState({ rng: { value: seed } });
      const result = generateCandidates(state);
      const ids = Object.values(result.candidates) as UpgradeId[];

      expect(new Set(ids).size).toBe(3);
      expect(UPGRADES[result.candidates.synergy].candidateRoles).toContain("synergy");
      expect(UPGRADES[result.candidates.pivot].candidateRoles).toContain("pivot");
      expect(UPGRADES[result.candidates.wildcard].candidateRoles).toContain("wildcard");
      for (const id of ids) expect(UPGRADES[id].requires(state)).toBe(true);
      expect(result.rng.value).toBe((seed + 3 * 0x6d2b79f5) >>> 0);
    }
  });

  it("selects a legal synergy from the dominant current route when one exists", () => {
    for (const [service, route] of [
      ["kitchen", "fruit"],
      ["chapel", "chapel"],
      ["security", "violent"],
      ["repair", "neutral"]
    ] as const) {
      const state = candidateState({ service, rng: { value: 77 } });
      const result = generateCandidates(state);
      expect(getDominantRoute(state)).toBe(route);
      expect(UPGRADES[result.candidates.synergy].route).toBe(route);
    }
  });

  it("counts equipped parts and repeated permanent reel modifications before service tie-breaking", () => {
    const fruitDominant = candidateState({
      service: "chapel",
      partSlots: [
        { id: "jam-jar", level: 1 },
        { id: "fruit-salad", level: 2 },
        { id: "midnight-bell", level: 1 },
        null,
        null
      ]
    });
    expect(getDominantRoute(fruitDominant)).toBe("fruit");

    const chapelDominant = candidateState({
      service: "kitchen",
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null],
      acquiredUpgrades: ["seven-purification", "tithe-box"]
    });
    expect(getDominantRoute(chapelDominant)).toBe("chapel");
  });

  it("can use an acquired tag for synergy and falls back when the dominant route has no legal synergy", () => {
    const acquiredFruitTag = candidateState({
      service: "chapel",
      rng: { value: 0 },
      acquiredUpgrades: ["lemon-crate"],
      partSlots: [
        { id: "omen-collector", level: 1 },
        { id: "midnight-bell", level: 1 },
        null,
        null,
        null
      ]
    });
    expect(getDominantRoute(acquiredFruitTag)).toBe("chapel");
    expect(UPGRADES[generateCandidates(acquiredFruitTag).candidates.synergy].route).toBe("fruit");

    const blankReels = [
      ["blank", "blank", "blank", "blank", "blank", "blank"],
      ["blank", "blank", "blank", "blank", "blank", "blank"],
      ["blank", "blank", "blank", "blank", "blank", "blank"]
    ] as const;
    const noChapelSynergy = candidateState({
      service: "chapel",
      bankroll: 9.99,
      reels: blankReels,
      partSlots: [
        { id: "omen-collector", level: 2 },
        { id: "triple-blessing", level: 2 },
        { id: "midnight-bell", level: 2 },
        { id: "martyr-coin", level: 2 },
        { id: "safety-fuse", level: 2 }
      ]
    });
    const fallback = generateCandidates(noChapelSynergy).candidates.synergy;
    expect(getDominantRoute(noChapelSynergy)).toBe("chapel");
    expect(UPGRADES[fallback].candidateRoles).toContain("synergy");
    expect(UPGRADES[fallback].route).not.toBe("chapel");
  });

  it("never offers a level-two part or a prerequisite-gated upgrade", () => {
    const state = candidateState({
      service: "repair",
      bankroll: 9.99,
      toolLevel: 0,
      partSlots: [
        { id: "jam-jar", level: 2 },
        { id: "omen-collector", level: 2 },
        { id: "scrap-magnet", level: 2 },
        { id: "overload-motor", level: 2 },
        { id: "safety-fuse", level: 2 }
      ]
    });

    for (let seed = 0; seed < 100; seed += 1) {
      const ids = Object.values(generateCandidates({ ...state, rng: { value: seed } }).candidates);
      expect(ids).not.toContain("jam-jar");
      expect(ids).not.toContain("omen-collector");
      expect(ids).not.toContain("scrap-magnet");
      expect(ids).not.toContain("overload-motor");
      expect(ids).not.toContain("safety-fuse");
      expect(ids).not.toContain("leftovers");
      expect(ids).not.toContain("tithe-box");
      expect(ids).not.toContain("ledger");
      expect(ids).not.toContain("statistics-terminal");
    }
  });
});
