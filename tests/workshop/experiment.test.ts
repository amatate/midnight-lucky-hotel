import { describe, expect, it } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import type { RunState } from "@/core/types";
import { captureBlueprint } from "@/workshop/blueprints";
import { runExperiment } from "@/workshop/experiment";

describe("isolated passive experiments", () => {
  it("accepts seed zero and uses the same initialized RNG as the real core", () => {
    let actual: RunState = { ...createRun(0), phase: "READY_TO_SPIN" };
    const report = runExperiment(captureBlueprint(actual, "零种子"), 0, 1);
    for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME"] as const) {
      const result = dispatchCommand(actual, { type });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      actual = result.state;
    }
    expect(report.spins[0]!.finalGrid).toEqual(actual.spinHistory[0]!.finalGrid);
    expect(report.spins[0]!.totalPayout).toEqual(actual.spinHistory[0]!.totalPayout);
    expect(report.seed).toBe(0);
    expect(report.warningsEn).toHaveLength(report.warnings.length);
    expect(report.warningsEn.join(" ")).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("is deterministic, keeps all stakes at 10 across four rounds, and never mutates the official run", () => {
    const state = { ...createRun(987, true), bankroll: 42, counters: { blankCharge: 2, cherryWinsThisShift: 4, harvestCharge: 2, votiveCharge: 3 } };
    const snapshot = structuredClone(state);
    const blueprint = captureBlueprint(state, "原型");
    const recipe = structuredClone(blueprint);
    const report = runExperiment(blueprint, 1234);
    expect(runExperiment(blueprint, 1234)).toEqual(report);
    expect(runExperiment(blueprint, 1235).spins).not.toEqual(report.spins);
    expect(state).toEqual(snapshot);
    expect(blueprint).toEqual(recipe);
    expect(report.paidSpins).toBe(12);
    expect(report.totalWager).toBe(120);
    expect(new Set(report.spins.filter((spin) => !spin.isFree).map((spin) => spin.wager))).toEqual(new Set([10]));
    expect(new Set(report.spins.map((spin) => spin.afterHoursLevel))).toEqual(new Set([1, 2, 3, 4]));
    expect(report.net).toBe(Math.round((report.totalPayout - report.totalWager) * 100) / 100);
    expect(report.truncated).toBe(false);
  });

  it("includes earned free spins, drains the last free spin and starts charges at zero", () => {
    const state: RunState = { ...createRun(1),
      reels: [["blank", "blank", "blank"], ["blank", "blank", "blank"], ["blank", "blank", "blank"]],
      partSlots: [{ id: "blank-capacitor", level: 1 }, null, null, null, null],
      counters: { blankCharge: 2, cherryWinsThisShift: 0 }
    };
    const report = runExperiment(captureBlueprint(state, "电容"), 11, 3);
    expect(report.paidSpins).toBe(3);
    expect(report.freeSpins).toBe(3);
    expect(report.totalWager).toBe(30);
    expect(report.spins.at(-1)?.isFree).toBe(true);
    expect(report.spins.filter((spin) => spin.isFree).every((spin) => spin.wager === 0)).toBe(true);
  });

  it("uses real part settlement and reports only directly attributed part bonuses", () => {
    const state: RunState = { ...createRun(1), reels: [["cherry"], ["cherry"], ["cherry"]],
      partSlots: [{ id: "cherry-press", level: 1 }, null, null, null, null] };
    const report = runExperiment(captureBlueprint(state, "压榨机"), 5, 3);
    expect(report.winningSpins).toBe(3);
    expect(report.partIncome["cherry-press"]).toBeGreaterThan(0);
    expect(report.totalPayout).toBeGreaterThan(90);
    expect(report.spins.every((spin) => spin.awards.some((award) => award.kind === "part-bonus" && award.partId === "cherry-press"))).toBe(true);
  });

  it("requires explicit consent for other rules and rejects unbounded or invalid inputs", () => {
    const blueprint = captureBlueprint(createRun(1), "版本");
    const old = { ...blueprint, rulesVersion: "rules-obsolete" };
    expect(() => runExperiment(old, 1)).toThrow("规则版本");
    const report = runExperiment(old, 1, 1, { allowCurrentRules: true });
    expect(report.warnings.some((warning) => warning.includes("当前规则重测"))).toBe(true);
    expect(report.warningsEn.some((warning) => warning.includes("current rules"))).toBe(true);
    expect(report.warningsEn).toHaveLength(report.warnings.length);
    expect(old.rulesVersion).toBe("rules-obsolete");
    expect(() => runExperiment(blueprint, -1)).toThrow();
    expect(() => runExperiment(blueprint, Number.NaN)).toThrow();
    expect(() => runExperiment(blueprint, 1, 25)).toThrow();
    expect(() => runExperiment(blueprint, 1, 0)).toThrow();
  });
});
