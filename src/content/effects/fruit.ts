import type {
  Effect,
  Grid,
  LineWin,
  PartId,
  PartInstance,
  ReelIndex,
  ResolveContext,
  ResolveSignal,
  SymbolId
} from "@/core/types";

const FRUIT_PART_IDS = new Set<PartId>(["lemon-infection", "jam-jar", "fruit-salad", "leftovers"]);

const PAYLINES = [
  { lineId: "top", cells: [[0, 0], [1, 0], [2, 0]] },
  { lineId: "middle", cells: [[0, 1], [1, 1], [2, 1]] },
  { lineId: "bottom", cells: [[0, 2], [1, 2], [2, 2]] },
  { lineId: "diagonal-down", cells: [[0, 0], [1, 1], [2, 2]] },
  { lineId: "diagonal-up", cells: [[0, 2], [1, 1], [2, 0]] }
] as const satisfies readonly Pick<LineWin, "lineId" | "cells">[];

function isFruitPart(part: PartInstance): boolean {
  return FRUIT_PART_IDS.has(part.id);
}

function isTransformableBaseSymbol(symbol: SymbolId): boolean {
  return symbol === "cherry" || symbol === "bell" || symbol === "seven";
}

function infectionEffects(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (part.id !== "lemon-infection" || signal.type !== "LINE_AWARDED" || signal.win.symbol !== "lemon") {
    return [];
  }
  if (!context.fruitPart?.claimTrigger("lemon-infection")) return [];

  const winningCells = new Set(signal.win.cells.map(([reel, row]) => `${reel}:${row}`));
  const effects: Effect[] = [];
  const limit = part.level;
  for (const row of [0, 1, 2] as const) {
    for (const reel of [0, 1, 2] as const) {
      if (winningCells.has(`${reel}:${row}`)) continue;
      if (!isTransformableBaseSymbol(context.grid[reel][row])) continue;
      effects.push({ type: "TRANSFORM_CELL", reel, row, symbol: "lemon" });
      if (effects.length === limit) return [...effects, { type: "REEVALUATE_LINES" }];
    }
  }
  return effects.length === 0 ? [] : [...effects, { type: "REEVALUATE_LINES" }];
}

function jamJarEffects(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (part.id !== "jam-jar" || signal.type !== "LINE_AWARDED" || signal.win.symbol !== "cherry") return [];

  const priorCherryWins = context.fruitPart?.observeCherryLine();
  if (priorCherryWins === undefined) return [];
  const amount = priorCherryWins * (part.level === 1 ? 0.5 : 1) * context.currentBet;
  const effects: Effect[] = [];
  if (amount > 0) effects.push({ type: "ADD_PAYOUT", amount, source: "part" });
  effects.push({ type: "INCREMENT_COUNTER", counter: "cherryWinsThisShift", amount: 1 });
  return effects;
}

function isLiteralFruitSalad(grid: Grid, cells: LineWin["cells"]): boolean {
  const symbols = cells.map(([reel, row]) => grid[reel][row]);
  return (
    symbols.includes("cherry") &&
    symbols.includes("lemon") &&
    symbols.includes("bell") &&
    symbols.every((symbol) => symbol === "cherry" || symbol === "lemon" || symbol === "bell")
  );
}

function lineWasNormallyAwarded(context: ResolveContext, lineId: LineWin["lineId"]): boolean {
  return [...context.awardedWinKeys].some((key) => key.startsWith(`${lineId}:`));
}

function fruitSaladEffects(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (part.id !== "fruit-salad") return [];
  if (signal.type !== "GRID_ACCEPTED" && !(signal.type === "EFFECT_APPLIED" && signal.effect.type === "REEVALUATE_LINES")) {
    return [];
  }

  const multiplier = part.level === 1 ? 1.5 : 2.5;
  return PAYLINES.flatMap((line): readonly Effect[] => {
    const key = `fruit-salad:${line.lineId}`;
    if (
      lineWasNormallyAwarded(context, line.lineId) ||
      !isLiteralFruitSalad(context.grid, line.cells) ||
      !context.fruitPart?.claimTrigger(key)
    ) {
      return [];
    }
    return [{ type: "ADD_PAYOUT", amount: multiplier * context.currentBet, source: "part" }];
  });
}

function leftoversEffects(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (part.id !== "leftovers" || signal.type !== "FOOD_CONSUMED") return [];

  const reel = context.fruitPart?.claimFoodReturn(part.level);
  if (reel === undefined || reel === null) return [];
  return [
    { type: "ADD_TO_REEL", reel, symbol: "food", count: 1 },
    { type: "INCREMENT_SHIFT_FLAG", flag: "returnedFoodCount", amount: 1 }
  ];
}

function reactOneFruitPart(
  part: PartInstance,
  context: ResolveContext,
  signal: ResolveSignal
): readonly Effect[] {
  return [
    ...infectionEffects(part, context, signal),
    ...jamJarEffects(part, context, signal),
    ...fruitSaladEffects(part, context, signal),
    ...leftoversEffects(part, context, signal)
  ];
}

/** Returns fruit-route effects for the exact settlement-owned fruit-part registration in context. */
export function reactFruitParts(context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  const registration = context.fruitPart;
  if (registration === undefined) return [];
  const equipped = context.state.partSlots[registration.slot];
  if (
    equipped?.id !== registration.part.id ||
    equipped.level !== registration.part.level ||
    !isFruitPart(equipped)
  ) {
    return [];
  }
  return reactOneFruitPart(equipped, context, signal);
}

export function isFruitPartId(partId: PartId): boolean {
  return FRUIT_PART_IDS.has(partId);
}
