import { describe, expect, it, vi } from "vitest";
import { coinBurstPaths, feedbackPlan } from "@/presentation/feedback";

describe("feedbackPlan", () => {
  it.each([
    ["none", { coinCount: 0, shakePx: 0, hapticPattern: 0, tone: "none" }],
    ["win", { coinCount: 8, shakePx: 0, hapticPattern: 12, tone: "win" }],
    ["chain", { coinCount: 24, shakePx: 3, hapticPattern: [10, 40, 10, 40, 22], tone: "chain" }],
    ["runaway", { coinCount: 48, shakePx: 6, hapticPattern: [22, 24, 12, 24, 30], tone: "runaway" }]
  ] as const)("maps %s to its literal feedback package", (tier, expected) => {
    expect(feedbackPlan(tier, false)).toEqual(expected);
  });

  it("removes particles and cabinet shake in reduced motion without hiding the feedback identity", () => {
    expect(feedbackPlan("runaway", true)).toEqual({
      coinCount: 0,
      shakePx: 0,
      hapticPattern: [22, 24, 12, 24, 30],
      tone: "runaway"
    });
  });
});

describe("coinBurstPaths", () => {
  it("uses literal index-derived paths, clamps invalid counts, and never calls random", () => {
    const random = vi.spyOn(Math, "random");

    expect(coinBurstPaths(3)).toEqual([
      { index: 0, startDx: -9, startDy: -5, apexDx: -12, apexLift: 44, endDx: -6, endDy: -4, rotation: -180, delayMs: 0 },
      { index: 1, startDx: 2, startDy: 2, apexDx: 5, apexLift: 57, endDx: -1, endDy: -1, rotation: -97, delayMs: 18 },
      { index: 2, startDx: -6, startDy: -2, apexDx: -3, apexLift: 70, endDx: 4, endDy: 2, rotation: -14, delayMs: 36 }
    ]);
    expect(coinBurstPaths(-4)).toHaveLength(0);
    expect(coinBurstPaths(80)).toHaveLength(48);
    expect(random).not.toHaveBeenCalled();
  });
});
