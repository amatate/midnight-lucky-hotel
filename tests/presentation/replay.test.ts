import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/core/events";
import type { Grid, ReelDraw } from "@/core/types";
import { buildGridReplay } from "@/presentation/replay";

function makeDraw(grid: Grid, rng: number): ReelDraw {
  return { strips: grid, stops: [0, 0, 0], grid, rng: { value: rng } };
}

describe("buildGridReplay", () => {
  it("uses the last draw and applies only valid matching changes in sequence order without mutation", () => {
    const firstGrid: Grid = [
      ["lemon", "lemon", "lemon"],
      ["lemon", "lemon", "lemon"],
      ["lemon", "lemon", "lemon"]
    ];
    const secondGrid: Grid = [
      ["cherry", "blank", "lemon"],
      ["lemon", "bell", "cherry"],
      ["blank", "seven", "bell"]
    ];
    const events: GameEvent[] = [
      { sequence: 1, type: "REELS_DRAWN", draw: makeDraw(firstGrid, 1) },
      { sequence: 2, type: "SYMBOL_CHANGED", reel: 0, row: 0, from: "lemon", to: "wild" },
      { sequence: 10, type: "REELS_DRAWN", draw: makeDraw(secondGrid, 2) },
      { sequence: 13, type: "SYMBOL_CHANGED", reel: 2, row: 2, from: "bell", to: "seven" },
      {
        sequence: 11,
        type: "SYMBOL_CHANGED",
        reel: 3,
        row: 0,
        from: "blank",
        to: "wild"
      } as unknown as GameEvent,
      { sequence: 12, type: "SYMBOL_CHANGED", reel: 0, row: 0, from: "cherry", to: "wild" },
      { sequence: 14, type: "SYMBOL_CHANGED", reel: 1, row: 1, from: "cherry", to: "wild" }
    ];
    const snapshot = structuredClone(events);

    const replay = buildGridReplay(events);

    expect(replay).toEqual({
      initialGrid: [
        ["cherry", "blank", "lemon"],
        ["lemon", "bell", "cherry"],
        ["blank", "seven", "bell"]
      ],
      frames: [
        {
          sequence: 12,
          grid: [
            ["wild", "blank", "lemon"],
            ["lemon", "bell", "cherry"],
            ["blank", "seven", "bell"]
          ],
          changedCells: [{ reel: 0, row: 0 }]
        },
        {
          sequence: 13,
          grid: [
            ["wild", "blank", "lemon"],
            ["lemon", "bell", "cherry"],
            ["blank", "seven", "seven"]
          ],
          changedCells: [{ reel: 2, row: 2 }]
        }
      ],
      finalGrid: [
        ["wild", "blank", "lemon"],
        ["lemon", "bell", "cherry"],
        ["blank", "seven", "seven"]
      ]
    });
    expect(events).toEqual(snapshot);
    expect(events[2]).toEqual({ sequence: 10, type: "REELS_DRAWN", draw: makeDraw(secondGrid, 2) });
  });

  it("returns a null and empty replay when there is no draw", () => {
    const events: GameEvent[] = [
      { sequence: 1, type: "SYMBOL_CHANGED", reel: 0, row: 0, from: "blank", to: "wild" },
      { sequence: 2, type: "PAYOUT_COMPLETE", total: 0 }
    ];

    expect(buildGridReplay(events)).toEqual({ initialGrid: null, frames: [], finalGrid: null });
  });
});
