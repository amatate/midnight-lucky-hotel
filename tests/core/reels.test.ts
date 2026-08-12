import { describe, expect, it } from "vitest";
import { nextInt } from "@/core/random";
import { advanceReel, drawReels, normalizeDrawIdentity } from "@/core/reels";
import type { ReelDraw, ReelSet } from "@/core/types";

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
    expect(draw.entryIds).toEqual([[0], [0], [0, 1, 2]]);
    expect(draw.visibleSourceIds).toEqual([[0, 0, 0], [0, 0, 0], [2, 0, 1]]);
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
    expect(advanced.visibleSourceIds?.[0]).toEqual([1, 2, 3]);
  });

  it("uses the full selected strip to reveal the preceding symbol for negative steps", () => {
    const draw = drawReels(strips, { value: 7 });
    const advanced = advanceReel(draw, 0, -1);

    expect(advanced.stops[0]).toBe(3);
    expect(advanced.grid[0]).toEqual(["seven", "cherry", "lemon"]);
  });

  it("canonicalizes duplicate serialized entry IDs and invalid visible references", () => {
    const draw: ReelDraw = {
      strips,
      stops: [1, 0, 0],
      grid: [
        ["lemon", "bell", "seven"],
        ["lemon", "bell", "seven"],
        ["bell", "seven", "cherry"]
      ],
      rng: { value: 9 },
      entryIds: [[4, 4, 5, 6], [0, 1, 2, 3], [0, 1, 2, 3]],
      visibleSourceIds: [[99, 99, 99], [0, 1, 2], [0, 1, 2]]
    };

    const identity = normalizeDrawIdentity(structuredClone(draw));

    expect(identity.entryIds[0]).toEqual([0, 1, 2, 3]);
    expect(identity.visibleSourceIds[0]).toEqual([1, 2, 3]);
  });

  it.each([
    ["null entries", null, [[0, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["null entry reel", [null, [], []], [[0, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["non-array entries", { reel: [] }, [[0, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["wrong entry depth", [1, 2, 3], [[0, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["sparse entry tuple", Array(3), [[0, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["sparse entries", [Array(4), [0, 1, 2, 3], [0, 1, 2, 3]], [[0, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["null visible", [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], null],
    ["non-array visible", [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], { reel: [] }],
    ["object visible reel", [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], [{ row: 0 }, [], []]],
    ["wrong visible length", [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], [[0], [0, 1, 2], [0, 1, 2]]],
    ["sparse visible", [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], [Array(3), [0, 1, 2], [0, 1, 2]]],
    ["NaN visible ID", [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], [[Number.NaN, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["negative visible ID", [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], [[-1, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["huge visible ID", [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], [[Number.MAX_VALUE, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["duplicate IDs", [[0, 0, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], [[0, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["NaN ID", [[0, Number.NaN, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], [[0, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["negative ID", [[0, -1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], [[0, 1, 2], [0, 1, 2], [0, 1, 2]]],
    ["unsafe ID", [[0, Number.MAX_VALUE, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], [[0, 1, 2], [0, 1, 2], [0, 1, 2]]]
  ])("safely canonicalizes malformed mapping metadata: %s", (_name, rawEntryIds, rawVisibleIds) => {
    const draw = {
      strips,
      stops: [1, 0, 0],
      grid: [
        ["lemon", "bell", "seven"],
        ["lemon", "bell", "seven"],
        ["bell", "seven", "cherry"]
      ],
      rng: { value: 9 },
      entryIds: rawEntryIds,
      visibleSourceIds: rawVisibleIds
    } as unknown as ReelDraw;

    expect(normalizeDrawIdentity(draw)).toEqual({
      entryIds: [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]],
      visibleSourceIds: [[1, 2, 3], [0, 1, 2], [0, 1, 2]]
    });
    expect(() => advanceReel(draw, 1, 1)).not.toThrow();
  });

  it("compacts valid high IDs while preserving their visible physical association", () => {
    const draw: ReelDraw = {
      strips,
      stops: [0, 0, 0],
      grid: [
        ["bell", "seven", "cherry"],
        ["seven", "cherry", "lemon"],
        ["lemon", "bell", "seven"]
      ],
      rng: { value: 9 },
      entryIds: [[100, 500, 900, 1_200], [20, 40, 60, 80], [9, 7, 5, 3]],
      visibleSourceIds: [[900, 1_200, 100], [60, 80, 20], [3, 9, 7]]
    };

    expect(normalizeDrawIdentity(draw)).toEqual({
      entryIds: [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]],
      visibleSourceIds: [[2, 3, 0], [2, 3, 0], [3, 0, 1]]
    });
  });
});
