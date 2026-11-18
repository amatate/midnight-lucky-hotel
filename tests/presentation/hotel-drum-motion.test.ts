import { describe, expect, it } from "vitest";
import { drumDistance, drumSymbol, type DrumPath } from "@/presentation/hotel-drum-motion";
import type { SymbolId } from "@/core/types";

describe("hotel mechanical presentation, not a new draw algorithm", () => {
  it.each([480, 620, 1000, 1220, 1440])("accelerates, brakes and seats inside the existing %d ms deadline", duration => {
    const travel = 28, stop = duration - Math.min(110, duration * .18);
    expect(drumDistance(0, duration, travel)).toBe(0);
    let previous = 0;
    for (let ms = 0; ms <= stop; ms++) {
      const distance = drumDistance(ms, duration, travel);
      expect(distance).toBeGreaterThanOrEqual(previous); previous = distance;
    }
    expect(drumDistance(stop, duration, travel)).toBeCloseTo(travel);
    expect(drumDistance(stop + (duration - stop) / 4, duration, travel)).toBeGreaterThan(travel);
    expect(drumDistance(duration, duration, travel)).toBe(travel);
    expect(drumDistance(duration + 500, duration, travel)).toBe(travel);
  });
  it("resumes at the frozen offset, then still seats at the target", () => {
    expect(drumDistance(0, 1000, 28, 11.4)).toBe(11.4);
    expect(drumDistance(100, 1000, 28, 11.4)).toBeGreaterThan(11.4);
    expect(drumDistance(1000, 1000, 28, 11.4)).toBe(28);
  });
  it.each([1, 17, 20, 2000])("supports a %d-entry strip and a transformed non-canonical target", length => {
    const path: DrumPath = { from: ["bell", "lemon", "blank"], to: ["wild", "food", "crack"],
      strip: Object.freeze(Array<SymbolId>(length).fill("cherry")), travel: 24 };
    const before = JSON.stringify(path);
    expect([1, 0, -1].map(index => drumSymbol(path, index))).toEqual(path.from);
    expect([25, 24, 23].map(index => drumSymbol(path, index))).toEqual(path.to);
    expect(drumSymbol(path, 12)).toBe("cherry");
    expect(JSON.stringify(path)).toBe(before);
  });
});
