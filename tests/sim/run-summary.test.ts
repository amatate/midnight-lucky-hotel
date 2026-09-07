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
  it("does not recommend infection as the missing piece of a salad or jam engine", () => {
    for (const id of ["fruit-salad", "jam-jar"] as const) {
      const state: RunState = { ...createRun(2), service: "kitchen",
        acquiredUpgrades: ["cherry-press", "salad-dressing", "lemon-crate", "cherry-pitter", "jam-jar", "fruit-salad", "leftovers"],
        partSlots: [{ id, level: 1 }, null, null, null, null] };
      expect(buildRunSummary(state, []).buildSuggestion).toBeNull();
    }
  });
  it("uses ledger totals and declared source order for equal nonzero income", () => {
    const state: RunState = {
      ...createRun(1),
      attribution: { base: 20, part: 20, intervention: 1, service: 0, agitation: 0, overload: 0 },
      expenses: { wagers: 10, kitchen: 10, chapel: 10, repair: 10 }
    };

    const summary = buildRunSummary(state, []);

    expect(summary.totalWager).toBe(10);
    expect(summary.totalPayout).toBe(41);
    expect(summary.bankrollDelta).toBe(0);
    expect(summary.largestIncome).toEqual({ source: "base", amount: 20 });
    expect(summary.currentRtp).toBeNull();
  });

  it("finds the stable highest-overlap eligible unowned upgrade on the dominant route", () => {
    const state: RunState = {
      ...createRun(2),
      service: "kitchen",
      acquiredUpgrades: ["lemon-crate"],
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null]
    };

    const summary = buildRunSummary(state, []);

    expect(summary.buildSuggestion).toBe("fruit-salad");
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

    expect(summary.buildSuggestion).toBeNull();
  });

  it("returns no largest income at zero and gates current RTP at ledger level", () => {
    const trajectory = [estimate({ rtpMean: 0.9 }), estimate(), estimate({ rtpMean: 1.01 })];
    expect(buildRunSummary(createRun(4), trajectory)).toMatchObject({ largestIncome: null, currentRtp: null });
    expect(buildRunSummary({ ...createRun(4), toolLevel: 2 }, trajectory)).toMatchObject({
      largestIncome: null,
      currentRtp: 1.01
    });
  });
});
