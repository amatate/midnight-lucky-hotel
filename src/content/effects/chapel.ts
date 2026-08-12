import type { Effect, PartId, PartInstance, ResolveContext, ResolveSignal } from "@/core/types";

const CHAPEL_PART_IDS = new Set<PartId>(["omen-collector", "triple-blessing", "midnight-bell", "martyr-coin"]);

function repeatedPayout(amount: number, count: number): readonly Effect[] {
  return Array.from({ length: count }, (): Effect => ({ type: "ADD_PAYOUT", amount, source: "part" }));
}

function omenCollector(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (
    part.id !== "omen-collector" ||
    signal.type !== "LINE_AWARDED" ||
    signal.win.symbol !== "seven" ||
    context.state.omen <= 0 ||
    !context.chapelPart?.claimTrigger("omen-collector")
  ) {
    return [];
  }
  const omen = context.state.omen;
  return [
    {
      type: "ADD_PAYOUT",
      amount: omen * (part.level === 1 ? 0.5 : 1) * context.currentBet,
      source: "part"
    },
    { type: "CHANGE_OMEN", amount: -omen }
  ];
}

function tripleBlessing(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (
    part.id !== "triple-blessing" ||
    signal.type !== "LINE_AWARDED" ||
    signal.win.symbol !== "seven" ||
    !context.chapelPart?.claimTrigger("triple-blessing")
  ) {
    return [];
  }
  const linePayout = signal.win.multiplier * context.currentBet;
  return [
    ...repeatedPayout(linePayout, part.level),
    { type: "ADD_TO_REEL", reel: 0, symbol: "blank", count: part.level },
    { type: "ADD_TO_REEL", reel: 1, symbol: "blank", count: part.level },
    { type: "ADD_TO_REEL", reel: 2, symbol: "blank", count: part.level }
  ];
}

function midnightBell(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (
    part.id !== "midnight-bell" ||
    signal.type !== "LINE_AWARDED" ||
    signal.win.symbol !== "bell" ||
    !context.chapelPart?.claimTrigger("midnight-bell")
  ) {
    return [];
  }
  const transforms = signal.win.cells
    .filter(([reel, row]) => context.grid[reel][row] === "bell")
    .slice(0, part.level)
    .map(([reel, row]): Effect => ({ type: "TRANSFORM_CELL", reel, row, symbol: "wild" }));
  return transforms.length === 0 ? [] : [...transforms, { type: "REEVALUATE_LINES" }];
}

function martyrCoin(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (
    part.id !== "martyr-coin" ||
    signal.type !== "LINE_AWARDED" ||
    signal.win.symbol !== "seven" ||
    !context.state.shiftFlags.martyrEnabled ||
    !context.chapelPart?.claimTrigger("martyr-coin")
  ) {
    return [];
  }
  return repeatedPayout(signal.win.multiplier * context.currentBet, part.level);
}

function reactOnePart(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  return [
    ...omenCollector(part, context, signal),
    ...tripleBlessing(part, context, signal),
    ...midnightBell(part, context, signal),
    ...martyrCoin(part, context, signal)
  ];
}

/** Returns chapel effects for the exact settlement-owned chapel-part registration in context. */
export function reactChapelParts(context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  const registration = context.chapelPart;
  if (registration === undefined) return [];
  const equipped = context.state.partSlots[registration.slot];
  if (
    equipped?.id !== registration.part.id ||
    equipped.level !== registration.part.level ||
    !isChapelPartId(equipped.id)
  ) {
    return [];
  }
  return reactOnePart(equipped, context, signal);
}

export function isChapelPartId(partId: PartId): boolean {
  return CHAPEL_PART_IDS.has(partId);
}
