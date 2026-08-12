import { describe, expect, it } from "vitest";
import { nextInt } from "@/core/random";
import { advanceReel, drawReels } from "@/core/reels";
import type { ReelSet } from "@/core/types";

const strips: ReelSet = [
  ["cherry", "lemon", "bell", "seven"],
  ["lemon", "bell", "seven", "cherry"],
  ["bell", "seven", "cherry", "lemon"]
];

describe("drawReels", () => {
  it("wraps the visible window after the last strip index", () => {
    const draw = drawReels([["cherry"], ["lemon"], ["bell", "seven", "cherry"]], {
      value: 7
    });

    expect(draw).toMatchObject({ stops: [0, 0, 2], grid: [["cherry", "cherry", "cherry"], ["lemon", "lemon", "lemon"], ["cherry", "bell", "seven"]] });
    expect(draw.strips).toEqual([["cherry"], ["lemon"], ["bell", "seven", "cherry"]]);
  });

  it("consumes exactly three random draws", () => {
    const seed = { value: 123456789 };
    const first = nextInt(seed, strips[0].length);
    const second = nextInt(first.rng, strips[1].length);
    const third = nextInt(second.rng, strips[2].length);

    expect(drawReels(strips, seed)).toMatchObject({
      stops: [first.value, second.value, third.value],
      rng: third.rng
    });
  });
});

describe("advanceReel", () => {
  it("advances through the full selected strip and reveals its fourth symbol without consuming RNG", () => {
    const draw = drawReels(strips, { value: 7 });
    const advanced = advanceReel(draw, 0, 1);

    expect(draw.stops[0]).toBe(0);
    expect(advanced.stops).toEqual([1, draw.stops[1], draw.stops[2]]);
    expect(advanced.rng).toEqual(draw.rng);
    expect(advanced.strips).toBe(draw.strips);
    expect(advanced.grid[0]).toEqual(["lemon", "bell", "seven"]);
    expect(advanced.grid[1]).toEqual(draw.grid[1]);
    expect(advanced.grid[2]).toEqual(draw.grid[2]);
  });

  it("uses the full selected strip to reveal the preceding symbol for negative steps", () => {
    const draw = drawReels(strips, { value: 7 });
    const advanced = advanceReel(draw, 0, -1);

    expect(advanced.stops[0]).toBe(3);
    expect(advanced.grid[0]).toEqual(["seven", "cherry", "lemon"]);
  });
});
