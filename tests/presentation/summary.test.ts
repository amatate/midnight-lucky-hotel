import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/core/events";
import { summarizePresentation } from "@/presentation/summary";

describe("summarizePresentation", () => {
  it("returns a literal empty summary when authoritative payout is zero", () => {
    const events: GameEvent[] = [
      { sequence: 1, type: "BET_PLACED", amount: 10 },
      { sequence: 2, type: "PAYOUT_COMPLETE", total: 0 }
    ];

    expect(summarizePresentation(events, 10)).toEqual({
      total: 0,
      lines: [],
      partTriggers: [],
      effectCount: 0,
      chainLength: 0,
      freeSpinsGranted: 0,
      tier: "none"
    });
  });

  it("maps every payline id to literal cells without deriving expectations from PAYLINES", () => {
    const events: GameEvent[] = [
      { sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 1, source: "base" },
      { sequence: 2, type: "LINE_WIN", lineId: "middle", symbol: "lemon", amount: 2, source: "base" },
      { sequence: 3, type: "LINE_WIN", lineId: "bottom", symbol: "bell", amount: 3, source: "base" },
      { sequence: 4, type: "LINE_WIN", lineId: "diagonal-down", symbol: "seven", amount: 4, source: "base" },
      { sequence: 5, type: "LINE_WIN", lineId: "diagonal-up", symbol: "wild", amount: 5, source: "base" },
      { sequence: 6, type: "PAYOUT_COMPLETE", total: 15 }
    ];

    expect(summarizePresentation(events, 10).lines).toEqual([
      { sequence: 1, lineId: "top", symbol: "cherry", amount: 1, cells: [[0, 0], [1, 0], [2, 0]] },
      { sequence: 2, lineId: "middle", symbol: "lemon", amount: 2, cells: [[0, 1], [1, 1], [2, 1]] },
      { sequence: 3, lineId: "bottom", symbol: "bell", amount: 3, cells: [[0, 2], [1, 2], [2, 2]] },
      {
        sequence: 4,
        lineId: "diagonal-down",
        symbol: "seven",
        amount: 4,
        cells: [[0, 0], [1, 1], [2, 2]]
      },
      {
        sequence: 5,
        lineId: "diagonal-up",
        symbol: "wild",
        amount: 5,
        cells: [[0, 2], [1, 1], [2, 0]]
      }
    ]);
  });

  it("enters chain at two line wins and counts only lines plus part triggers in chainLength", () => {
    const events: GameEvent[] = [
      { sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 1, source: "base" },
      { sequence: 2, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 },
      { sequence: 3, type: "RESOURCE_CHANGED", resource: "tips", delta: 1 },
      { sequence: 4, type: "LINE_WIN", lineId: "bottom", symbol: "cherry", amount: 1, source: "base" },
      { sequence: 5, type: "PAYOUT_COMPLETE", total: 2 }
    ];

    expect(summarizePresentation(events, 10)).toMatchObject({
      effectCount: 2,
      chainLength: 3,
      tier: "chain"
    });
  });

  it("enters chain at two part triggers", () => {
    const events: GameEvent[] = [
      { sequence: 1, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 },
      { sequence: 2, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 },
      { sequence: 3, type: "PAYOUT_COMPLETE", total: 1 }
    ];

    expect(summarizePresentation(events, 10)).toMatchObject({
      partTriggers: [
        { sequence: 1, partId: "jam-jar", level: 1 },
        { sequence: 2, partId: "jam-jar", level: 1 }
      ],
      effectCount: 2,
      chainLength: 2,
      tier: "chain"
    });
  });

  it("counts only positive free-spin grants and enters chain when one is present", () => {
    const events: GameEvent[] = [
      { sequence: 1, type: "RESOURCE_CHANGED", resource: "freeSpins", delta: 2 },
      { sequence: 2, type: "RESOURCE_CHANGED", resource: "freeSpins", delta: -1 },
      { sequence: 3, type: "PAYOUT_COMPLETE", total: 1 }
    ];

    expect(summarizePresentation(events, 10)).toMatchObject({
      freeSpinsGranted: 2,
      effectCount: 2,
      chainLength: 0,
      tier: "chain"
    });
  });

  it("enters runaway at six visible rule effects while excluding meta events", () => {
    const events: GameEvent[] = [
      { sequence: 1, type: "BET_PLACED", amount: 10 },
      { sequence: 2, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 },
      { sequence: 3, type: "PART_DISABLED", partId: "jam-jar", slot: 0 },
      { sequence: 4, type: "PAYOUT_ADDED", amount: 1, source: "part" },
      { sequence: 5, type: "SYMBOL_CHANGED", reel: 0, row: 0, from: "blank", to: "cherry" },
      { sequence: 6, type: "RESOURCE_CHANGED", resource: "tips", delta: 1 },
      { sequence: 7, type: "FOOD_CONSUMED", reel: 2 },
      { sequence: 8, type: "PAYOUT_COMPLETE", total: 1 },
      { sequence: 9, type: "BLOCK_COMPLETED", bankroll: 101 }
    ];

    expect(summarizePresentation(events, 10)).toMatchObject({
      total: 1,
      effectCount: 6,
      chainLength: 1,
      tier: "runaway"
    });
  });

  it("changes from win to chain exactly at three times the current bet", () => {
    expect(
      summarizePresentation([{ sequence: 1, type: "PAYOUT_COMPLETE", total: 29.99 }], 10).tier
    ).toBe("win");
    expect(
      summarizePresentation([{ sequence: 1, type: "PAYOUT_COMPLETE", total: 30 }], 10).tier
    ).toBe("chain");
  });

  it("changes from chain to runaway exactly at eight times the current bet", () => {
    expect(
      summarizePresentation([{ sequence: 1, type: "PAYOUT_COMPLETE", total: 79.99 }], 10).tier
    ).toBe("chain");
    expect(
      summarizePresentation([{ sequence: 1, type: "PAYOUT_COMPLETE", total: 80 }], 10).tier
    ).toBe("runaway");
  });

  it("gives overload runaway priority even when authoritative total is zero", () => {
    const events: GameEvent[] = [
      { sequence: 1, type: "OVERLOAD", amount: 250 },
      { sequence: 2, type: "PAYOUT_COMPLETE", total: 0 }
    ];

    expect(summarizePresentation(events, 10)).toMatchObject({
      total: 0,
      effectCount: 1,
      tier: "runaway"
    });
  });

  it("uses the last payout completion and otherwise falls back to award-event amounts", () => {
    const authoritative: GameEvent[] = [
      { sequence: 1, type: "PAYOUT_ADDED", amount: 100, source: "part" },
      { sequence: 2, type: "PAYOUT_COMPLETE", total: 10 },
      { sequence: 3, type: "PAYOUT_COMPLETE", total: 20 }
    ];
    const fallback: GameEvent[] = [
      { sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 3, source: "base" },
      { sequence: 2, type: "PAYOUT_ADDED", amount: 2, source: "part" },
      { sequence: 3, type: "OVERLOAD", amount: 4 }
    ];

    expect(summarizePresentation(authoritative, 10).total).toBe(20);
    expect(summarizePresentation(fallback, 10).total).toBe(9);
  });
});
