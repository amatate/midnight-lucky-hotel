import { describe, expect, it } from "vitest";
import { getBuildFit } from "@/content/build-fit";
import { getBuildInsights } from "@/workshop/insights";
import { createRun } from "@/core/run";
import { UPGRADES, UPGRADE_IDS } from "@/content/upgrades";
import type { PartId, RunState } from "@/core/types";

describe("workbench explanations", () => {
  it("has a concrete bilingual explanation for every active part and does not mutate the run", () => {
    for (const id of UPGRADE_IDS.filter((id): id is PartId => UPGRADES[id].kind === "part")) {
      const state: RunState = { ...createRun(66), service: "repair", partSlots: [{ id, level: 1 }, null, null, null, null] };
      const before = structuredClone(state);
      const row = getBuildInsights(state).find((entry) => entry.id === id);
      expect(row, id).toBeDefined();
      expect(row!.detail.length).toBeGreaterThan(15);
      expect(row!.detailEn).not.toMatch(/\p{Script=Han}/u);
      expect(row!.titleEn).not.toMatch(/\p{Script=Han}/u);
      expect(state).toEqual(before);
    }
  });
  it("explains infection conflicts, manual coin activation and reserve inactivity", () => {
    const state: RunState = { ...createRun(66), partSlots: [{ id: "lemon-infection", level: 1 }, { id: "fruit-salad", level: 1 }, { id: "martyr-coin", level: 1 }, null, null],
      workbench: { name: "Hybrid", reserve: [{ id: "blank-dividend", level: 1 }, null] } };
    const rows = getBuildInsights(state);
    expect(rows.find((row) => row.id === "lemon-infection")?.tone).toBe("conflict");
    expect(rows.find((row) => row.id === "martyr-coin")?.detail).toContain("启用");
    expect(rows.find((row) => row.id === "reserve")?.detail).toContain("不提供任何效果");
  });
  it("recognizes missing literal salads and Seven lines even with matching route history", () => {
    const state: RunState = { ...createRun(66), service: "chapel", reels: [
      ["cherry", "lemon", "bell", "cherry", "lemon", "bell"],
      ["blank", "blank", "blank", "blank", "blank", "blank"],
      ["cherry", "lemon", "bell", "cherry", "lemon", "bell"]
    ], acquiredUpgrades: ["seven-purification", "fruit-salad"] };
    expect(getBuildFit(state, "fruit-salad").kind).toBe("setup");
    expect(getBuildFit(state, "triple-blessing").kind).toBe("setup");
    expect(getBuildFit(state, "overload-motor").kind).toBe("setup");
  });
  it("treats reserve L1 as an upgrade but not as a running source of synergy", () => {
    const state: RunState = { ...createRun(66), workbench: { name: "Reserve", reserve: [{ id: "lemon-infection", level: 1 }, null] } };
    expect(getBuildFit(state, "lemon-infection").kind).toBe("fits");
    expect(getBuildFit(state, "lemon-infection").text).toContain("备用");
    expect(getBuildFit(state, "overload-motor").kind).toBe("setup");
  });
});
