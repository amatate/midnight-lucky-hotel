import { describe, expect, it } from "vitest";
import { BASE_REELS } from "@/content/base-machine";
import { estimateMachine } from "@/sim/monte-carlo";
import type { EstimateRequest } from "@/sim/types";

function request(patch: Partial<EstimateRequest> = {}): EstimateRequest {
  return {
    reels: BASE_REELS,
    parts: [],
    toolLevel: 3,
    bankroll: 1_000_000,
    bet: 10,
    horizonSpins: 20,
    sampleCount: 20,
    simulationSeed: 820_126,
    ...patch
  };
}

describe("estimateMachine", () => {
  it("is deterministic, seed-sensitive, and leaves the complete request unchanged", () => {
    const input = request();
    const snapshot = structuredClone(input);

    const first = estimateMachine(input);
    const repeated = estimateMachine(input);
    const otherSeed = estimateMachine({ ...input, simulationSeed: 820_127 });

    expect(repeated).toEqual(first);
    expect(otherSeed).not.toEqual(first);
    expect(input).toEqual(snapshot);
  });

  it("reveals only the fields purchased by each information-tool level", () => {
    const estimates = ([0, 1, 2, 3] as const).map((toolLevel) =>
      estimateMachine(request({ toolLevel, sampleCount: 2, horizonSpins: 2 }))
    );

    expect(estimates[0]!).toMatchObject({
      symbolProbabilities: null,
      rtpMean: null,
      rtp95: null,
      payoutStandardDeviation: null,
      ruinProbability: null,
      expectedAffordableSpins: null
    });
    expect(estimates[1]!.symbolProbabilities).not.toBeNull();
    expect(estimates[1]!).toMatchObject({
      rtpMean: null,
      rtp95: null,
      payoutStandardDeviation: null,
      ruinProbability: null,
      expectedAffordableSpins: null
    });
    expect(estimates[2]!.rtpMean).not.toBeNull();
    expect(estimates[2]!.rtp95).not.toBeNull();
    expect(estimates[2]!).toMatchObject({
      payoutStandardDeviation: null,
      ruinProbability: null,
      expectedAffordableSpins: null
    });
    expect(estimates[3]!.payoutStandardDeviation).not.toBeNull();
    expect(estimates[3]!.ruinProbability).not.toBeNull();
    expect(estimates[3]!.expectedAffordableSpins).not.toBeNull();
    expect(estimates.map(({ band }) => band)).toEqual(Array(4).fill(estimates[0]!.band));
  });

  it("derives all three bands from hidden RTP even at tool level zero", () => {
    const common = { toolLevel: 0 as const, sampleCount: 1 };
    const danger = estimateMachine(request({
      ...common,
      reels: [["blank"], ["blank"], ["blank"]],
      horizonSpins: 1
    }));
    const nearBreakEven = estimateMachine(request({
      ...common,
      reels: [["blank"], ["blank"], ["blank"]],
      parts: [{ id: "safety-fuse", level: 1 }],
      bankroll: 0,
      horizonSpins: 3
    }));
    const favorable = estimateMachine(request({
      ...common,
      reels: [["cherry"], ["cherry"], ["cherry"]],
      horizonSpins: 1
    }));

    expect([danger.band, nearBreakEven.band, favorable.band]).toEqual([
      "danger",
      "near-break-even",
      "favorable"
    ]);
  });

  it("returns exact per-reel symbol probabilities in stable symbol order", () => {
    const estimate = estimateMachine(request({
      reels: [
        ["cherry", "cherry", "food", "crack"],
        ["wild", "blank"],
        ["lemon", "bell", "seven"]
      ],
      toolLevel: 1,
      sampleCount: 1,
      horizonSpins: 1
    }));

    expect(estimate.symbolProbabilities).toEqual([
      { cherry: 0.5, lemon: 0, bell: 0, seven: 0, wild: 0, blank: 0, food: 0.25, crack: 0.25 },
      { cherry: 0, lemon: 0, bell: 0, seven: 0, wild: 0.5, blank: 0.5, food: 0, crack: 0 },
      { cherry: 0, lemon: 1 / 3, bell: 1 / 3, seven: 1 / 3, wild: 0, blank: 0, food: 0, crack: 0 }
    ]);
  });

  it("keeps the 100,000-spin base-machine estimate in its designed RTP range", () => {
    const estimate = estimateMachine(request({ horizonSpins: 1_000, sampleCount: 100 }));

    expect(estimate.rtpMean).toBeGreaterThanOrEqual(0.75);
    expect(estimate.rtpMean).toBeLessThanOrEqual(0.85);
  });

  it("marks ruin before the horizon and caps completed-spin expectancy at the horizon", () => {
    const estimate = estimateMachine(request({
      reels: [["blank"], ["blank"], ["blank"]],
      bankroll: 10,
      bet: 10,
      horizonSpins: 2,
      sampleCount: 4
    }));

    expect(estimate.rtpMean).toBe(0);
    expect(estimate.ruinProbability).toBe(1);
    expect(estimate.expectedAffordableSpins).toBe(1);
  });

  it("uses the settlement kernel for part-granted free spins without charging their wager", () => {
    const estimate = estimateMachine(request({
      reels: [["blank"], ["blank"], ["blank"]],
      parts: [{ id: "blank-capacitor", level: 1 }],
      bankroll: 10,
      bet: 10,
      horizonSpins: 4,
      sampleCount: 1
    }));

    expect(estimate.ruinProbability).toBe(0);
    expect(estimate.expectedAffordableSpins).toBe(4);
    expect(estimate.rtpMean).toBe(0);
  });

  it("uses settlement food consumption and future buffs even without equipped parts", () => {
    const estimate = estimateMachine(request({
      reels: [["food", "lemon"], ["lemon"], ["lemon"]],
      bankroll: 100,
      bet: 10,
      horizonSpins: 3,
      sampleCount: 1,
      simulationSeed: 820_126
    }));

    expect(estimate.rtpMean).toBe(6.6);
  });

  it("sanitizes invalid strip entries through the core reel boundary", () => {
    const estimate = estimateMachine(request({
      reels: [["not-a-symbol"], ["blank"], ["blank"]] as never,
      toolLevel: 1,
      horizonSpins: 1,
      sampleCount: 1
    }));

    expect(estimate.symbolProbabilities?.[0]).toEqual({
      cherry: 0,
      lemon: 0,
      bell: 0,
      seven: 0,
      wild: 0,
      blank: 1,
      food: 0,
      crack: 0
    });
  });

  it("applies an equipped Safety Fuse before declaring ruin", () => {
    const estimate = estimateMachine(request({
      reels: [["blank"], ["blank"], ["blank"]],
      parts: [{ id: "safety-fuse", level: 1 }],
      bankroll: 0,
      bet: 10,
      horizonSpins: 3,
      sampleCount: 1
    }));

    expect(estimate.rtpMean).toBe(1);
    expect(estimate.ruinProbability).toBe(1);
    expect(estimate.expectedAffordableSpins).toBe(2);
  });

  it("uses the shared cent-rounded wager for affordability and the RTP denominator", () => {
    const estimate = estimateMachine(request({
      reels: [["cherry"], ["cherry"], ["cherry"]],
      bankroll: 0.01,
      bet: 0.006,
      horizonSpins: 1,
      sampleCount: 1
    }));

    expect(estimate.ruinProbability).toBe(0);
    expect(estimate.expectedAffordableSpins).toBe(1);
    expect(estimate.rtpMean).toBe(5);
  });

  it.each([
    [{ bankroll: -1 }, "bankroll"],
    [{ bankroll: Number.NaN }, "bankroll"],
    [{ bankroll: Number.MAX_VALUE }, "bankroll"],
    [{ bet: 0 }, "bet"],
    [{ bet: 0.001 }, "bet"],
    [{ bet: Number.MAX_VALUE }, "bet"],
    [{ horizonSpins: 0 }, "horizonSpins"],
    [{ horizonSpins: 1.5 }, "horizonSpins"],
    [{ sampleCount: 0 }, "sampleCount"],
    [{ horizonSpins: 10_001 }, "horizonSpins"],
    [{ sampleCount: 100_001 }, "sampleCount"],
    [{ horizonSpins: 1_001, sampleCount: 1_000 }, "work"],
    [{ reels: [[], ["blank"], ["blank"]] as never }, "reels"],
    [{ parts: [{ id: "unknown-part", level: 1 }] as never }, "parts"]
  ] as const)("rejects invalid requests %#", (patch, expected) => {
    expect(() => estimateMachine(request(patch))).toThrowError(new RegExp(expected));
  });
});
