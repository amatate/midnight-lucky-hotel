import { describe, expect, it } from "vitest";
import { createRun } from "@/core/run";
import type { RunState } from "@/core/types";
import { buildRunSummary } from "@/sim/run-summary";
import type { MachineEstimate } from "@/sim/types";

function estimate(patch: Partial<MachineEstimate> = {}): MachineEstimate {
  return {
    band: "near-break-even",
    symbolProbabilities: null,
    rtpMean: null,
    rtp95: null,
    payoutStandardDeviation: null,
    ruinProbability: null,
    expectedAffordableSpins: null,
    ...patch
  };
}

describe("buildRunSummary", () => {
  it("uses declared source order to break equal income and expense totals", () => {
    const state: RunState = {
      ...createRun(1),
      attribution: { base: 20, part: 20, intervention: 1, service: 0, agitation: 0, overload: 0 },
      expenses: { wagers: 10, kitchen: 10, chapel: 10, repair: 10 }
    };

    const summary = buildRunSummary(state, []);

    expect(summary.largestIncomeSource).toBe("base");
    expect(summary.largestExpenseSource).toBe("wagers");
    expect(summary.rtpTrajectory).toEqual([]);
    expect(summary.explanation).toBe("主要收入来自基础赔付，主要支出是下注。");
  });

  it("finds the stable highest-overlap eligible unowned upgrade on the dominant route", () => {
    const state: RunState = {
      ...createRun(2),
      service: "kitchen",
      acquiredUpgrades: ["lemon-crate"],
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null]
    };

    const summary = buildRunSummary(state, []);

    expect(summary.incompleteSynergy).toBe("fruit-salad");
  });

  it("excludes owned, level-two, and requirement-failing upgrades from incomplete synergy", () => {
    const state: RunState = {
      ...createRun(3),
      service: "security",
      acquiredUpgrades: ["artificial-crack", "scrap-magnet", "loose-spring", "blank-capacitor", "warranty-fraud"],
      partSlots: [
        { id: "scrap-magnet", level: 2 },
        { id: "loose-spring", level: 1 },
        { id: "blank-capacitor", level: 1 },
        { id: "warranty-fraud", level: 1 },
        { id: "overload-motor", level: 2 }
      ]
    };

    const summary = buildRunSummary(state, []);

    expect(summary.incompleteSynergy).toBeNull();
  });

  it("states that positive expectation can coexist with high bankruptcy risk", () => {
    const trajectory = [estimate({ rtpMean: 1.01, ruinProbability: 0.26 })];

    const summary = buildRunSummary(createRun(4), trajectory);

    expect(summary.rtpTrajectory).toEqual(trajectory);
    expect(summary.explanation).toBe("机器具有正期望，但当前本金下仍有较高破产风险。");
  });
});
