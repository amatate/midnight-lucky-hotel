import type { GameEvent } from "@/core/events";
import { PAYLINES } from "@/core/paylines";
import type { LineWin, PartId, SymbolId } from "@/core/types";

export type FeedbackTier = "none" | "win" | "chain" | "runaway";

export interface PresentationLine {
  readonly sequence: number;
  readonly lineId: LineWin["lineId"];
  readonly symbol: SymbolId;
  readonly amount: number;
  readonly cells: LineWin["cells"];
}

export interface PresentationPartTrigger {
  readonly sequence: number;
  readonly partId: PartId;
  readonly level: 1 | 2;
}

export interface PresentationSummary {
  readonly total: number;
  readonly lines: readonly PresentationLine[];
  readonly partTriggers: readonly PresentationPartTrigger[];
  readonly effectCount: number;
  readonly chainLength: number;
  readonly freeSpinsGranted: number;
  readonly tier: FeedbackTier;
}

const VISIBLE_EFFECT_TYPES = new Set<GameEvent["type"]>([
  "PART_TRIGGERED",
  "PART_DISABLED",
  "PAYOUT_ADDED",
  "SYMBOL_CHANGED",
  "RESOURCE_CHANGED",
  "FOOD_CONSUMED",
  "OVERLOAD"
]);

function presentationLines(events: readonly GameEvent[]): PresentationLine[] {
  return events.flatMap((event) => {
    if (event.type !== "LINE_WIN") return [];
    const payline = PAYLINES.find((candidate) => candidate.lineId === event.lineId);
    if (payline === undefined) return [];
    return [{
      sequence: event.sequence,
      lineId: payline.lineId,
      symbol: event.symbol,
      amount: event.amount,
      cells: payline.cells
    }];
  });
}

function presentationPartTriggers(events: readonly GameEvent[]): PresentationPartTrigger[] {
  return events.flatMap((event) => event.type === "PART_TRIGGERED"
    ? [{ sequence: event.sequence, partId: event.partId, level: event.level }]
    : []);
}

function presentationTotal(events: readonly GameEvent[]): number {
  let completedTotal: number | undefined;
  let fallbackTotal = 0;
  for (const event of events) {
    if (event.type === "PAYOUT_COMPLETE") completedTotal = event.total;
    if (event.type === "LINE_WIN" || event.type === "PAYOUT_ADDED" || event.type === "OVERLOAD") {
      fallbackTotal += event.amount;
    }
  }
  return completedTotal ?? fallbackTotal;
}

export function summarizePresentation(
  events: readonly GameEvent[],
  currentBet: number
): PresentationSummary {
  const total = presentationTotal(events);
  const lines = presentationLines(events);
  const partTriggers = presentationPartTriggers(events);
  const effectCount = events.filter((event) => VISIBLE_EFFECT_TYPES.has(event.type)).length;
  const chainLength = lines.length + partTriggers.length;
  const freeSpinsGranted = events.reduce(
    (totalGranted, event) => event.type === "RESOURCE_CHANGED" && event.resource === "freeSpins" && event.delta > 0
      ? totalGranted + event.delta
      : totalGranted,
    0
  );
  const overloaded = events.some((event) => event.type === "OVERLOAD");

  let tier: FeedbackTier;
  if (overloaded) {
    tier = "runaway";
  } else if (total <= 0) {
    tier = "none";
  } else if (effectCount >= 6 || total >= 8 * currentBet) {
    tier = "runaway";
  } else if (
    lines.length >= 2 ||
    partTriggers.length >= 2 ||
    freeSpinsGranted > 0 ||
    total >= 3 * currentBet
  ) {
    tier = "chain";
  } else {
    tier = "win";
  }

  return { total, lines, partTriggers, effectCount, chainLength, freeSpinsGranted, tier };
}
