import { describe, expect, it } from "vitest";
import {
  confidenceInterval95,
  mean,
  sampleVariance,
  standardError
} from "@/sim/statistics";

describe("sample statistics", () => {
  it("computes hand-checked sample moments and a 95% normal interval", () => {
    const samples = [1, 2, 3, 4];

    expect(mean(samples)).toBe(2.5);
    expect(sampleVariance(samples)).toBeCloseTo(5 / 3, 12);
    expect(standardError(samples)).toBeCloseTo(Math.sqrt(5 / 3) / 2, 12);
    expect(confidenceInterval95(samples)).toEqual([
      2.5 - 1.96 * Math.sqrt(5 / 3) / 2,
      2.5 + 1.96 * Math.sqrt(5 / 3) / 2
    ]);
  });

  it("defines one-sample variance, error, and interval with zero width", () => {
    expect(sampleVariance([7])).toBe(0);
    expect(standardError([7])).toBe(0);
    expect(confidenceInterval95([7])).toEqual([7, 7]);
  });

  it.each([
    { samples: [] },
    { samples: [1, Number.NaN] },
    { samples: [1, Number.POSITIVE_INFINITY] },
    { samples: [Number.NEGATIVE_INFINITY] }
  ])("rejects empty or non-finite samples %#", ({ samples }) => {
    expect(() => mean(samples)).toThrow(RangeError);
    expect(() => sampleVariance(samples)).toThrow(RangeError);
    expect(() => standardError(samples)).toThrow(RangeError);
    expect(() => confidenceInterval95(samples)).toThrow(RangeError);
  });
});
