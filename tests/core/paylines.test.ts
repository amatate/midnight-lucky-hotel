import { describe, expect, it } from "vitest";
import { BASE_PAYTABLE, BASE_REELS } from "@/content/base-machine";
import { evaluateBaseWins } from "@/core/paylines";
import type { Grid, SymbolId } from "@/core/types";

function gridWith(left: SymbolId, middle: SymbolId, right: SymbolId): Grid {
  return [
    ["blank", left, "blank"],
    ["blank", middle, "blank"],
    ["blank", right, "blank"]
  ];
}

describe("evaluateBaseWins", () => {
  it("pays three identical base symbols", () => {
    expect(evaluateBaseWins(gridWith("bell", "bell", "bell"), BASE_PAYTABLE)).toContainEqual(
      expect.objectContaining({ lineId: "middle", symbol: "bell", multiplier: 1.5 })
    );
  });

  it("uses wild as a substitute for a base pay symbol", () => {
    expect(evaluateBaseWins(gridWith("lemon", "wild", "lemon"), BASE_PAYTABLE)).toContainEqual(
      expect.objectContaining({ lineId: "middle", symbol: "lemon", multiplier: 0.9 })
    );
  });

  it("pays three wilds using the wild award", () => {
    expect(evaluateBaseWins(gridWith("wild", "wild", "wild"), BASE_PAYTABLE)).toContainEqual(
      expect.objectContaining({ lineId: "middle", symbol: "wild", multiplier: 5.5 })
    );
  });

  it("does not pay mixed base symbols", () => {
    expect(evaluateBaseWins(gridWith("cherry", "lemon", "bell"), BASE_PAYTABLE)).toEqual([]);
  });

  it("evaluates the five fixed paylines with their typed coordinates", () => {
    const grid: Grid = [
      ["cherry", "cherry", "cherry"],
      ["cherry", "cherry", "cherry"],
      ["cherry", "cherry", "cherry"]
    ];

    expect(evaluateBaseWins(grid, BASE_PAYTABLE)).toEqual([
      { lineId: "top", symbol: "cherry", cells: [[0, 0], [1, 0], [2, 0]], multiplier: 0.6 },
      { lineId: "middle", symbol: "cherry", cells: [[0, 1], [1, 1], [2, 1]], multiplier: 0.6 },
      { lineId: "bottom", symbol: "cherry", cells: [[0, 2], [1, 2], [2, 2]], multiplier: 0.6 },
      { lineId: "diagonal-down", symbol: "cherry", cells: [[0, 0], [1, 1], [2, 2]], multiplier: 0.6 },
      { lineId: "diagonal-up", symbol: "cherry", cells: [[0, 2], [1, 1], [2, 0]], multiplier: 0.6 }
    ]);
  });

  it("never lets wild substitute for food or crack", () => {
    expect(evaluateBaseWins(gridWith("food", "wild", "food"), BASE_PAYTABLE)).toEqual([]);
    expect(evaluateBaseWins(gridWith("crack", "wild", "crack"), BASE_PAYTABLE)).toEqual([]);
  });
});

describe("base-machine content", () => {
  it("provides the specified ordered strips and paytable", () => {
    expect(BASE_REELS).toEqual([
      ["cherry", "lemon", "cherry", "bell", "blank", "lemon", "cherry", "seven", "lemon", "bell", "cherry", "wild"],
      ["lemon", "cherry", "bell", "cherry", "wild", "lemon", "blank", "cherry", "seven", "lemon", "cherry", "bell"],
      ["bell", "cherry", "lemon", "blank", "cherry", "seven", "lemon", "cherry", "wild", "bell", "lemon", "cherry"]
    ]);
    expect(BASE_PAYTABLE).toEqual({ cherry: 0.6, lemon: 0.9, bell: 1.5, seven: 3.5, wild: 5.5 });
  });
});
