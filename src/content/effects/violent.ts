import { readAuthorizedViolentPart } from "@/core/settlement";
import type {
  Effect,
  LineWin,
  PartId,
  PartInstance,
  ResolveContext,
  ResolveSignal
} from "@/core/types";

const VIOLENT_PART_IDS = new Set<PartId>([
  "scrap-magnet",
  "loose-spring",
  "blank-capacitor",
  "warranty-fraud",
  "overload-motor"
]);

const PAYLINES = [
  { lineId: "top", cells: [[0, 0], [1, 0], [2, 0]] },
  { lineId: "middle", cells: [[0, 1], [1, 1], [2, 1]] },
  { lineId: "bottom", cells: [[0, 2], [1, 2], [2, 2]] },
  { lineId: "diagonal-down", cells: [[0, 0], [1, 1], [2, 2]] },
  { lineId: "diagonal-up", cells: [[0, 2], [1, 1], [2, 0]] }
] as const satisfies readonly Pick<LineWin, "lineId" | "cells">[];

function scrapMagnet(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (
    part.id !== "scrap-magnet" ||
    (signal.type !== "GRID_ACCEPTED" &&
      !(signal.type === "EFFECT_APPLIED" && signal.effect.type === "REEVALUATE_LINES"))
  ) {
    return [];
  }
  const authorized = readAuthorizedViolentPart(context);
  if (authorized === undefined) return [];

  const cells = [] as Array<ReturnType<typeof authorized.physicalCell>>;
  let qualifyingLines = 0;
  for (const line of PAYLINES) {
    if (!line.cells.every(([reel, row]) => context.grid[reel][row] === "crack")) continue;
    if (!authorized.claimTrigger(`scrap-magnet:${line.lineId}`)) continue;
    qualifyingLines += 1;
    for (const [reel, row] of line.cells) cells.push(authorized.physicalCell(reel, row));
  }
  if (qualifyingLines === 0) return [];

  const amount = (part.level === 1 ? 2 : 4) * context.currentBet;
  const payouts = Array.from(
    { length: qualifyingLines },
    (): Effect => ({ type: "ADD_PAYOUT", amount, source: "part" })
  );
  return [...payouts, { type: "REMOVE_PHYSICAL_CELLS", cells }];
}

function blankCapacitor(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (part.id !== "blank-capacitor" || signal.type !== "GRID_ACCEPTED") return [];
  const authorized = readAuthorizedViolentPart(context);
  if (authorized === undefined || !authorized.claimTrigger("blank-capacitor")) return [];

  const visible = authorized.visiblePhysicalCount("blank");
  if (visible === 0) return [];
  const threshold = part.level === 1 ? 3 : 2;
  const total = Math.max(0, context.state.counters.blankCharge) + visible;
  const granted = Math.floor(total / threshold);
  const remainder = total % threshold;
  const counterDelta = remainder - context.state.counters.blankCharge;
  const effects: Effect[] = [];
  if (counterDelta !== 0) effects.push({ type: "INCREMENT_COUNTER", counter: "blankCharge", amount: counterDelta });
  if (granted > 0) effects.push({ type: "GRANT_FREE_SPIN", count: granted });
  return effects;
}

function warrantyFraud(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (
    part.id !== "warranty-fraud" ||
    signal.type !== "PART_DISABLED" ||
    context.state.shiftFlags.warrantyPaid
  ) {
    return [];
  }
  const authorized = readAuthorizedViolentPart(context);
  if (authorized === undefined || !authorized.claimTrigger("warranty-fraud")) return [];
  return [
    {
      type: "ADD_PAYOUT",
      amount: (part.level === 1 ? 3 : 6) * context.currentBet,
      source: "part"
    },
    { type: "SET_SHIFT_FLAG", flag: "warrantyPaid" }
  ];
}

function overloadMotor(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  if (part.id !== "overload-motor" || signal.type !== "EFFECT_APPLIED") return [];
  const authorized = readAuthorizedViolentPart(context);
  const ordinal = authorized?.claimMotorOrdinal() ?? null;
  if (ordinal === null || ordinal < 2) return [];

  const effects: Effect[] = [{
    type: "ADD_PAYOUT",
    amount: (part.level === 1 ? 0.25 : 0.5) * context.currentBet,
    source: "part"
  }];
  if (ordinal === 6 && authorized!.claimTrigger("overload-motor-cracks")) {
    for (const reel of [0, 1, 2] as const) {
      effects.push({ type: "ADD_TO_REEL", reel, symbol: "crack", count: 1 });
    }
  }
  return effects;
}

function reactOnePart(part: PartInstance, context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  return [
    ...scrapMagnet(part, context, signal),
    ...blankCapacitor(part, context, signal),
    ...warrantyFraud(part, context, signal),
    ...overloadMotor(part, context, signal)
  ];
}

/** Returns violent-route effects for the exact settlement-owned part registration in context. */
export function reactViolentParts(context: ResolveContext, signal: ResolveSignal): readonly Effect[] {
  const registration = readAuthorizedViolentPart(context);
  if (registration === undefined) return [];
  const equipped = context.state.partSlots[registration.slot];
  if (
    equipped?.id !== registration.part.id ||
    equipped.level !== registration.part.level ||
    !isViolentPartId(equipped.id)
  ) {
    return [];
  }
  return reactOnePart(equipped, context, signal);
}

export function isViolentPartId(partId: PartId): boolean {
  return VIOLENT_PART_IDS.has(partId);
}
