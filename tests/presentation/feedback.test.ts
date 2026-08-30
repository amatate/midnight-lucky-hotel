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
      { index: 0, x: -50, y: -70, rotation: -180, delayMs: 0 },
      { index: 1, x: -13, y: -99, rotation: -97, delayMs: 18 },
      { index: 2, x: 24, y: -128, rotation: -14, delayMs: 36 }
    ]);
    expect(coinBurstPaths(-4)).toHaveLength(0);
    expect(coinBurstPaths(80)).toHaveLength(48);
    expect(random).not.toHaveBeenCalled();
  });
});
