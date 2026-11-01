import type { GameEvent } from "@/core/events";
import { PAYLINES } from "@/core/paylines";
import type { AttributionSource, LineWin, PartId, SymbolId } from "@/core/types";

export type FeedbackTier = "none" | "return" | "win" | "chain" | "runaway";

/** Intensity is money-based; rule complexity never upgrades a loss into a win.
 * Free spins use the ordinary stake as a scale, not their zero paid wager. */
export function payoutTier(total: number, wager: number, referenceBet: number): FeedbackTier {
  if (total <= 0) return "none";
  if (total <= wager) return "return";
  const scale = Math.max(1, referenceBet, wager);
  return total >= 8 * scale ? "runaway" : total >= 3 * scale ? "chain" : "win";
}

interface PresentationLineBase {
  readonly sequence: number;
  readonly lineId: LineWin["lineId"];
  readonly amount: number;
  readonly cells: LineWin["cells"];
}

export type PresentationLine =
  | (PresentationLineBase & { readonly kind: "symbol"; readonly symbol: SymbolId; readonly source: Exclude<AttributionSource, "overload"> })
  | (PresentationLineBase & { readonly kind: "pattern"; readonly patternId: "fruit-salad"; readonly partId: "fruit-salad" });

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
  return events.flatMap<PresentationLine>((event) => {
    if (event.type !== "LINE_WIN" && event.type !== "PATTERN_LINE_WIN") return [];
    const payline = PAYLINES.find((candidate) => candidate.lineId === event.lineId);
    if (payline === undefined) return [];
    const common = {
      sequence: event.sequence,
      lineId: payline.lineId,
      amount: event.amount,
      cells: payline.cells
    } as const;
    return event.type === "LINE_WIN"
      ? [{ ...common, kind: "symbol", symbol: event.symbol, source: event.source }]
      : [{ ...common, kind: "pattern", patternId: event.patternId, partId: event.partId }];
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
    if (
      event.type === "LINE_WIN" || event.type === "PATTERN_LINE_WIN" ||
      event.type === "PAYOUT_ADDED" || event.type === "OVERLOAD"
    ) {
      fallbackTotal += event.amount;
    }
  }
  return completedTotal ?? fallbackTotal;
}

export function summarizePresentation(
  events: readonly GameEvent[],
  currentBet: number,
  wager = currentBet
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
  const tier = payoutTier(total, wager, currentBet);

  return { total, lines, partTriggers, effectCount, chainLength, freeSpinsGranted, tier };
}
