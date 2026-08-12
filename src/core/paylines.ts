import type { Grid, LineWin, PaySymbolId, Paytable, SymbolId } from "@/core/types";

type Payline = Pick<LineWin, "lineId" | "cells">;

export const PAYLINES: readonly Payline[] = [
  { lineId: "top", cells: [[0, 0], [1, 0], [2, 0]] },
  { lineId: "middle", cells: [[0, 1], [1, 1], [2, 1]] },
  { lineId: "bottom", cells: [[0, 2], [1, 2], [2, 2]] },
  { lineId: "diagonal-down", cells: [[0, 0], [1, 1], [2, 2]] },
  { lineId: "diagonal-up", cells: [[0, 2], [1, 1], [2, 0]] }
];

function isPaySymbol(symbol: SymbolId): symbol is PaySymbolId {
  return symbol === "cherry" || symbol === "lemon" || symbol === "bell" || symbol === "seven" || symbol === "wild";
}

function winningSymbol(symbols: readonly [SymbolId, SymbolId, SymbolId]): PaySymbolId | undefined {
  const baseSymbol = symbols.find((symbol) => symbol !== "wild");

  if (baseSymbol === undefined) {
    return "wild";
  }
  if (!isPaySymbol(baseSymbol)) {
    return undefined;
  }

  return symbols.every((symbol) => symbol === baseSymbol || symbol === "wild") ? baseSymbol : undefined;
}

export function evaluateBaseWins(grid: Grid, paytable: Paytable): readonly LineWin[] {
  return PAYLINES.flatMap((line) => {
    const symbols = line.cells.map(([reelIndex, rowIndex]) => grid[reelIndex][rowIndex]) as [
      SymbolId,
      SymbolId,
      SymbolId
    ];
    const symbol = winningSymbol(symbols);

    return symbol === undefined
      ? []
      : [{ lineId: line.lineId, symbol, cells: line.cells, multiplier: paytable[symbol] }];
  });
}
