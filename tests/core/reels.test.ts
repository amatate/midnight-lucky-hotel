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

    expect(normalizeDrawIdentity(draw)).toMatchObject({
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

    expect(normalizeDrawIdentity(draw)).toMatchObject({
      entryIds: [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]],
      visibleSourceIds: [[2, 3, 0], [2, 3, 0], [3, 0, 1]]
    });
  });

  it.each([
    ["null reel", [null, ["lemon", "bell", "seven"], ["bell", "seven", "cherry"]]],
    ["missing reel", [["cherry", "lemon", "bell"], ["lemon", "bell", "seven"]]],
    ["holey outer", (() => { const value = Array(3); value[1] = ["lemon"]; return value; })()],
    ["wrong outer", { reels: [] }],
    ["empty reel", [[], ["lemon"], ["bell"]]],
    ["invalid symbol", [["bogus"], ["lemon"], ["bell"]]],
    ["holey reel", [[...Array(2), "cherry"], ["lemon"], ["bell"]]]
  ])("recovers malformed strips into nonempty known-symbol reels: %s", (_name, rawStrips) => {
    const draw = {
      strips: rawStrips,
      stops: [99, 0, 0],
      grid: [["cherry", "cherry", "cherry"], ["lemon", "lemon", "lemon"], ["bell", "bell", "bell"]],
      rng: { value: 9 },
      entryIds: [[0], [0], [0]],
      visibleSourceIds: [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    } as unknown as ReelDraw;

    const normalized = normalizeDrawIdentity(draw);

    expect(normalized.strips).toHaveLength(3);
    expect(normalized.strips.every((strip) => strip.length > 0)).toBe(true);
    expect(normalized.strips.flat().every((symbol) =>
      ["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"].includes(symbol)
    )).toBe(true);
    expect(normalized.stops.every((stop, reel) =>
      Number.isInteger(stop) && stop >= 0 && stop < normalized.strips[reel]!.length
    )).toBe(true);
    expect(() => advanceReel(draw, 0, 1)).not.toThrow();
  });

  it.each([
    ["null grid", null],
    ["missing reel", [["cherry", "lemon", "bell"], ["lemon", "bell", "seven"]]],
    ["null row", [null, ["lemon", "bell", "seven"], ["bell", "seven", "cherry"]]],
    ["holey outer", Array(3)],
    ["holey row", [Array(3), ["lemon", "bell", "seven"], ["bell", "seven", "cherry"]]],
    ["wrong row length", [["cherry"], ["lemon", "bell", "seven"], ["bell", "seven", "cherry"]]],
    ["object grid", { rows: [] }],
    ["invalid grid symbol", [["bogus", "lemon", "bell"], ["lemon", "bell", "seven"], ["bell", "seven", "cherry"]]]
  ])("rebuilds malformed accepted grids instead of dereferencing them: %s", (_name, rawGrid) => {
    const draw = {
      strips,
      stops: [1, 0, 0],
      grid: rawGrid,
      rng: { value: 9 },
      entryIds: [[100, 200, 300, 400], [10, 20, 30, 40], [1, 3, 5, 7]],
      visibleSourceIds: [[200, 300, 400], [10, 20, 30], [1, 3, 5]]
    } as unknown as ReelDraw;

    const normalized = normalizeDrawIdentity(draw);

    expect(normalized.grid).toEqual([
      ["lemon", "bell", "seven"],
      ["lemon", "bell", "seven"],
      ["bell", "seven", "cherry"]
    ]);
    expect(normalized.visibleSourceIds).toEqual([[1, 2, 3], [0, 1, 2], [0, 1, 2]]);
    expect(() => advanceReel(draw, 2, 1)).not.toThrow();
  });

  it.each([
    ["null stops", null],
    ["missing stop", [1, 0]],
    ["holey stops", Array(3)],
    ["object stops", { first: 1 }],
    ["NaN stop", [Number.NaN, 0, 0]],
    ["infinite stop", [Number.POSITIVE_INFINITY, 0, 0]],
    ["fractional stop", [1.5, 0, 0]]
  ])("recovers malformed stops to valid in-range integers: %s", (_name, rawStops) => {
    const draw = {
      strips,
      stops: rawStops,
      grid: [["cherry", "lemon", "bell"], ["lemon", "bell", "seven"], ["bell", "seven", "cherry"]],
      rng: { value: 9 }
    } as unknown as ReelDraw;

    const normalized = normalizeDrawIdentity(draw);

    expect(normalized.stops).toEqual([0, 0, 0]);
    expect(normalized.grid).toEqual([
      ["cherry", "lemon", "bell"],
      ["lemon", "bell", "seven"],
      ["bell", "seven", "cherry"]
    ]);
  });

  it("drawReels returns a fully valid draw when given malformed serialized strips", () => {
    const malformed = [[], null, ["bogus", "seven"]] as unknown as ReelSet;

    const draw = drawReels(malformed, { value: 7 });

    expect(draw.strips).toEqual([["blank"], ["blank"], ["blank", "seven"]]);
    expect(draw.stops.every((stop, reel) => stop >= 0 && stop < draw.strips[reel]!.length)).toBe(true);
    expect(draw.grid).toHaveLength(3);
    expect(draw.entryIds).toEqual([[0], [0], [0, 1]]);
  });
});
