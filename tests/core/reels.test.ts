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
  it("changes only its selected stop modulo that reel length without consuming RNG", () => {
    const draw = drawReels(strips, { value: 22 });
    const advanced = advanceReel(draw, 1, 5);

    expect(advanced.stops).toEqual([draw.stops[0], (draw.stops[1] + 5) % 3, draw.stops[2]]);
    expect(advanced.rng).toEqual(draw.rng);
    expect(advanced.grid[0]).toEqual(draw.grid[0]);
    expect(advanced.grid[2]).toEqual(draw.grid[2]);
    expect(advanced.grid[1]).toEqual([draw.grid[1][2], draw.grid[1][0], draw.grid[1][1]]);
  });

  it("wraps negative steps into the selected reel range", () => {
    const draw = drawReels(strips, { value: 22 });
    const advanced = advanceReel(draw, 0, -1);

    expect(advanced.stops[0]).toBe((draw.stops[0] + 2) % 3);
    expect(advanced.grid[0]).toEqual([draw.grid[0][2], draw.grid[0][0], draw.grid[0][1]]);
  });
});
