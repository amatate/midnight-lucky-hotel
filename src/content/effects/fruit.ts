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

interface FruitRuntime {
  initialCherryWins?: number;
  cherryWinsSeen: number;
  initialReturnedFoodCount?: number;
  returnedFoodsSeen: number;
  plannedFoodAdds: [number, number, number];
}

type TriggerOnce = (key: string) => boolean;

function freshRuntime(): FruitRuntime {
  return {
    cherryWinsSeen: 0,
    returnedFoodsSeen: 0,
    plannedFoodAdds: [0, 0, 0]
  };
}

function isFruitPart(part: PartInstance): boolean {
  return FRUIT_PART_IDS.has(part.id);
}

function isTransformableBaseSymbol(symbol: SymbolId): boolean {
  return symbol === "cherry" || symbol === "bell" || symbol === "seven";
}

function infectionEffects(part: PartInstance, context: ResolveContext, signal: ResolveSignal, trigger: TriggerOnce): readonly Effect[] {
  if (part.id !== "lemon-infection" || signal.type !== "LINE_AWARDED" || signal.win.symbol !== "lemon") {
    return [];
  }
  if (!trigger("lemon-infection")) return [];

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

function jamJarEffects(part: PartInstance, context: ResolveContext, signal: ResolveSignal, runtime: FruitRuntime): readonly Effect[] {
  if (part.id !== "jam-jar" || signal.type !== "LINE_AWARDED" || signal.win.symbol !== "cherry") return [];

  runtime.initialCherryWins ??= context.state.counters.cherryWinsThisShift;
  const priorCherryWins = runtime.initialCherryWins + runtime.cherryWinsSeen;
  runtime.cherryWinsSeen += 1;
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

function fruitSaladEffects(part: PartInstance, context: ResolveContext, signal: ResolveSignal, trigger: TriggerOnce): readonly Effect[] {
  if (part.id !== "fruit-salad") return [];
  if (signal.type !== "GRID_ACCEPTED" && !(signal.type === "EFFECT_APPLIED" && signal.effect.type === "REEVALUATE_LINES")) {
    return [];
  }

  const multiplier = part.level === 1 ? 1.5 : 2.5;
  return PAYLINES.flatMap((line): readonly Effect[] => {
    const key = `fruit-salad:${line.lineId}`;
    if (lineWasNormallyAwarded(context, line.lineId) || !isLiteralFruitSalad(context.grid, line.cells) || !trigger(key)) {
      return [];
    }
    return [{ type: "ADD_PAYOUT", amount: multiplier * context.currentBet, source: "part" }];
  });
}

function shortestReel(context: ResolveContext, plannedAdds: readonly number[]): ReelIndex {
  let shortest: ReelIndex = 0;
  for (const reel of [1, 2] as const) {
    const length = context.state.reels[reel].length + plannedAdds[reel]!;
    const shortestLength = context.state.reels[shortest].length + plannedAdds[shortest]!;
    if (length < shortestLength) shortest = reel;
  }
  return shortest;
}

function leftoversEffects(part: PartInstance, context: ResolveContext, signal: ResolveSignal, runtime: FruitRuntime): readonly Effect[] {
  if (part.id !== "leftovers" || signal.type !== "FOOD_CONSUMED") return [];

  runtime.initialReturnedFoodCount ??= context.state.shiftFlags.returnedFoodCount;
  const returnedFoodCount = runtime.initialReturnedFoodCount + runtime.returnedFoodsSeen;
  if (returnedFoodCount >= part.level) return [];

  const reel = shortestReel(context, runtime.plannedFoodAdds);
  runtime.returnedFoodsSeen += 1;
  runtime.plannedFoodAdds[reel] += 1;
  return [
    { type: "ADD_TO_REEL", reel, symbol: "food", count: 1 },
    { type: "INCREMENT_SHIFT_FLAG", flag: "returnedFoodCount", amount: 1 }
  ];
}

function reactOneFruitPart(
  part: PartInstance,
  context: ResolveContext,
  signal: ResolveSignal,
  runtime: FruitRuntime,
  trigger: TriggerOnce
): readonly Effect[] {
  return [
    ...infectionEffects(part, context, signal, trigger),
    ...jamJarEffects(part, context, signal, runtime),
    ...fruitSaladEffects(part, context, signal, trigger),
    ...leftoversEffects(part, context, signal, runtime)
  ];
}

/** Returns fruit-route effects for the active fruit parts visible in this handler context. */
export function reactFruitParts(context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  const runtime = freshRuntime();
  const triggered = new Set(context.triggeredKeys);
  const trigger: TriggerOnce = (key) => {
    if (triggered.has(key)) return false;
    triggered.add(key);
    return true;
  };
  return context.state.partSlots.flatMap((part) =>
    part !== null && isFruitPart(part) ? reactOneFruitPart(part, context, signal, runtime, trigger) : []
  );
}

/** Binds one settlement registration to the exact equipped slot and its per-spin trigger set. */
export function createFruitPartHandler(
  slot: number,
  part: PartInstance,
  triggeredKeys: Set<string>
): (context: ResolveContext, signal: ResolveSignal) => readonly Effect[] {
  const runtime = freshRuntime();
  const trigger: TriggerOnce = (key) => {
    if (triggeredKeys.has(key)) return false;
    triggeredKeys.add(key);
    return true;
  };
  return (context, signal) => {
    const equipped = context.state.partSlots[slot];
    if (equipped?.id !== part.id || equipped.level !== part.level || !isFruitPart(equipped)) return [];
    return reactOneFruitPart(equipped, context, signal, runtime, trigger);
  };
}

export function isFruitPartId(partId: PartId): boolean {
  return FRUIT_PART_IDS.has(partId);
}
