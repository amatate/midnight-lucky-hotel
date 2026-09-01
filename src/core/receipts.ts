import type { GameEvent } from "@/core/events";
import { MAX_MONEY, safeMoney, safePayout } from "@/core/money";
import type {
  AttributionSource,
  Grid,
  LineWin,
  Money,
  PartId,
  ReceiptAward,
  ReceiptFormula,
  SpinReceipt,
  SymbolId
} from "@/core/types";

export const MAX_SPIN_HISTORY = 100;
export const MAX_RECEIPT_AWARDS = 128;

type SpinReceiptBuildFailureReason =
  | "MISSING_PAYOUT_COMPLETE"
  | "DUPLICATE_PAYOUT_COMPLETE"
  | "INVALID_EVENT_SEQUENCE"
  | "PAYOUT_MISMATCH"
  | "BALANCE_MISMATCH"
  | "TOO_MANY_AWARDS";

export type SpinReceiptBuildResult =
  | { readonly ok: true; readonly receipt: SpinReceipt }
  | { readonly ok: false; readonly reason: SpinReceiptBuildFailureReason };

export interface SpinReceiptBuildInput {
  readonly ordinal: number;
  readonly shift: number;
  readonly afterHoursLevel: number;
  readonly isFree: boolean;
  readonly baseSpinIndex: 1 | 2 | 3 | null;
  readonly bankrollBefore: Money;
  readonly wager: Money;
  readonly finalGrid: Grid;
  readonly bankrollAfter: Money;
  readonly settlementEvents: readonly GameEvent[];
}

export class SpinReceiptInvariantError extends Error {
  readonly reason: SpinReceiptBuildFailureReason;

  constructor(reason: SpinReceiptBuildFailureReason) {
    super(`spin receipt invariant failed: ${reason}`);
    this.name = "SpinReceiptInvariantError";
    this.reason = reason;
  }
}

const SYMBOL_IDS = new Set<SymbolId>(["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"]);
const LINE_IDS = new Set<LineWin["lineId"]>(["top", "middle", "bottom", "diagonal-down", "diagonal-up"]);
const PART_IDS = new Set<PartId>([
  "lemon-infection", "jam-jar", "fruit-salad", "leftovers", "omen-collector", "triple-blessing", "midnight-bell",
  "martyr-coin", "scrap-magnet", "loose-spring", "blank-capacitor", "warranty-fraud", "overload-motor", "safety-fuse"
]);
const ATTRIBUTION_SOURCES = new Set<AttributionSource>(["base", "part", "intervention", "service", "agitation", "overload"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonnegativeMoney(value: unknown): value is Money {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_MONEY && safeMoney(value) === value;
}

function isPositiveFiniteBounded(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_MONEY;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isEventSequence(events: readonly GameEvent[]): boolean {
  return events.every((event, index) => Number.isSafeInteger(event.sequence)
    && event.sequence >= 0
    && (index === 0 || event.sequence > events[index - 1]!.sequence));
}

function isGrid(value: unknown): value is Grid {
  return Array.isArray(value)
    && value.length === 3
    && value.every((reel) => Array.isArray(reel) && reel.length === 3 && reel.every((symbol) => typeof symbol === "string" && SYMBOL_IDS.has(symbol as SymbolId)));
}

function isReceiptMetadata(input: SpinReceiptBuildInput, totalPayout: Money): boolean {
  if (!Number.isSafeInteger(input.ordinal) || input.ordinal < 1
    || !Number.isSafeInteger(input.shift) || input.shift < 1
    || !Number.isSafeInteger(input.afterHoursLevel) || input.afterHoursLevel < 0
    || typeof input.isFree !== "boolean"
    || !isNonnegativeMoney(input.bankrollBefore)
    || !isNonnegativeMoney(input.wager)
    || !isNonnegativeMoney(input.bankrollAfter)
    || !isGrid(input.finalGrid)) return false;
  if (input.isFree ? input.baseSpinIndex !== null || input.wager !== 0 : ![1, 2, 3].includes(input.baseSpinIndex ?? 0) || input.wager <= 0) return false;
  if (input.bankrollBefore < input.wager) return false;
  return input.bankrollAfter === safeMoney(input.bankrollBefore - input.wager + totalPayout);
}

function formulaFromEvent(event: { readonly preMultiplierAmount: number; readonly appliedMultiplier: number; readonly amount: number }): ReceiptFormula | null {
  if (!isPositiveFiniteBounded(event.preMultiplierAmount) || !isPositiveFiniteBounded(event.appliedMultiplier) || !isNonnegativeMoney(event.amount)) {
    return null;
  }
  return safePayout(event.preMultiplierAmount * event.appliedMultiplier) === event.amount
    ? { kind: "known", preMultiplierAmount: event.preMultiplierAmount, appliedMultiplier: event.appliedMultiplier }
    : null;
}

function awardFromEvent(event: GameEvent): ReceiptAward | null | "invalid" {
  switch (event.type) {
    case "LINE_WIN": {
      const formula = formulaFromEvent(event);
      if (formula === null || !LINE_IDS.has(event.lineId) || !SYMBOL_IDS.has(event.symbol) || !ATTRIBUTION_SOURCES.has(event.source)) return "invalid";
      return { sequence: event.sequence, kind: "line", lineId: event.lineId, symbol: event.symbol, source: event.source, formula, amount: event.amount };
    }
    case "PATTERN_LINE_WIN": {
      const formula = formulaFromEvent(event);
      if (formula === null || event.patternId !== "fruit-salad" || event.partId !== "fruit-salad" || !LINE_IDS.has(event.lineId)) return "invalid";
      return { sequence: event.sequence, kind: "pattern-line", patternId: event.patternId, partId: event.partId, lineId: event.lineId, formula, amount: event.amount };
    }
    case "PAYOUT_ADDED": {
      const formula = formulaFromEvent(event);
      if (formula === null || !ATTRIBUTION_SOURCES.has(event.source)) return "invalid";
      if (event.source === "part") {
        if (!("partId" in event) || !PART_IDS.has(event.partId)) return "invalid";
        return { sequence: event.sequence, kind: "part-bonus", source: "part", partId: event.partId, formula, amount: event.amount };
      }
      return { sequence: event.sequence, kind: "bonus", source: event.source, formula, amount: event.amount };
    }
    case "OVERLOAD": {
      const formula = formulaFromEvent(event);
      return formula === null ? "invalid" : { sequence: event.sequence, kind: "overload", source: "overload", formula, amount: event.amount };
    }
    default:
      return null;
  }
}

function authoritativeCompletion(events: readonly GameEvent[]): { readonly total: Money; readonly sequence: number } | SpinReceiptBuildFailureReason {
  const completions = events.filter((event) => event.type === "PAYOUT_COMPLETE");
  if (completions.length === 0) return "MISSING_PAYOUT_COMPLETE";
  if (completions.length !== 1) return "DUPLICATE_PAYOUT_COMPLETE";
  const completion = completions[0]!;
  if (!isEventSequence(events) || events.at(-1) !== completion) return "INVALID_EVENT_SEQUENCE";
  return isNonnegativeMoney(completion.total) ? { total: completion.total, sequence: completion.sequence } : "PAYOUT_MISMATCH";
}

export function buildSpinReceipt(input: SpinReceiptBuildInput): SpinReceiptBuildResult {
  const completion = authoritativeCompletion(input.settlementEvents);
  if (typeof completion === "string") return { ok: false, reason: completion };

  const awards: ReceiptAward[] = [];
  for (const event of input.settlementEvents) {
    const award = awardFromEvent(event);
    if (award === "invalid") return { ok: false, reason: "INVALID_EVENT_SEQUENCE" };
    if (award !== null) awards.push(award);
  }
  if (awards.length > MAX_RECEIPT_AWARDS) return { ok: false, reason: "TOO_MANY_AWARDS" };

  const totalPayout = awards.reduce<Money>((sum, award) => safeMoney(sum + award.amount), 0);
  if (totalPayout !== completion.total) return { ok: false, reason: "PAYOUT_MISMATCH" };
  if (!isReceiptMetadata(input, totalPayout)) return { ok: false, reason: "BALANCE_MISMATCH" };

  return {
    ok: true,
    receipt: {
      ordinal: input.ordinal,
      shift: input.shift,
      afterHoursLevel: input.afterHoursLevel,
      isFree: input.isFree,
      baseSpinIndex: input.baseSpinIndex,
      bankrollBefore: input.bankrollBefore,
      wager: input.wager,
      finalGrid: input.finalGrid,
      awards,
      totalPayout,
      bankrollAfter: input.bankrollAfter
    }
  };
}

export function buildOpaqueSpinReceipt(input: SpinReceiptBuildInput, authoritativeTotal: Money): SpinReceipt {
  if (!isNonnegativeMoney(authoritativeTotal) || !isReceiptMetadata(input, authoritativeTotal)) {
    throw new SpinReceiptInvariantError("BALANCE_MISMATCH");
  }
  const completion = authoritativeCompletion(input.settlementEvents);
  if (typeof completion === "string" || completion.total !== authoritativeTotal) {
    throw new SpinReceiptInvariantError(typeof completion === "string" ? completion : "PAYOUT_MISMATCH");
  }
  const awards: readonly ReceiptAward[] = authoritativeTotal === 0
    ? []
    : [{ sequence: completion.sequence, kind: "opaque", formula: { kind: "legacy-unavailable" }, amount: authoritativeTotal }];
  return {
    ordinal: input.ordinal,
    shift: input.shift,
    afterHoursLevel: input.afterHoursLevel,
    isFree: input.isFree,
    baseSpinIndex: input.baseSpinIndex,
    bankrollBefore: input.bankrollBefore,
    wager: input.wager,
    finalGrid: input.finalGrid,
    awards,
    totalPayout: authoritativeTotal,
    bankrollAfter: input.bankrollAfter
  };
}

export function finalizeSpinReceipt(input: SpinReceiptBuildInput, mode: "strict" | "production-fallback"): SpinReceipt {
  const built = buildSpinReceipt(input);
  if (built.ok) return built.receipt;
  if (mode === "strict") throw new SpinReceiptInvariantError(built.reason);

  const completion = authoritativeCompletion(input.settlementEvents);
  if (typeof completion === "string" || !isReceiptMetadata(input, completion.total)) {
    throw new SpinReceiptInvariantError(typeof completion === "string" ? completion : "BALANCE_MISMATCH");
  }
  return buildOpaqueSpinReceipt(input, completion.total);
}

function isKnownFormula(value: unknown, amount: Money): value is Extract<ReceiptFormula, { readonly kind: "known" }> {
  return isRecord(value)
    && value.kind === "known"
    && isPositiveFiniteBounded(value.preMultiplierAmount)
    && isPositiveFiniteBounded(value.appliedMultiplier)
    && safePayout(value.preMultiplierAmount * value.appliedMultiplier) === amount;
}

function isReceiptAward(value: unknown): value is ReceiptAward {
  if (!isRecord(value) || !isNonnegativeSafeInteger(value.sequence) || !isNonnegativeMoney(value.amount) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "line":
      return LINE_IDS.has(value.lineId as LineWin["lineId"])
        && SYMBOL_IDS.has(value.symbol as SymbolId)
        && typeof value.source === "string" && value.source !== "overload" && ATTRIBUTION_SOURCES.has(value.source as AttributionSource)
        && isKnownFormula(value.formula, value.amount);
    case "pattern-line":
      return value.patternId === "fruit-salad" && value.partId === "fruit-salad"
        && LINE_IDS.has(value.lineId as LineWin["lineId"])
        && isKnownFormula(value.formula, value.amount);
    case "part-bonus":
      return value.source === "part" && PART_IDS.has(value.partId as PartId) && isKnownFormula(value.formula, value.amount);
    case "bonus":
      return typeof value.source === "string" && value.source !== "part" && value.source !== "overload"
        && ATTRIBUTION_SOURCES.has(value.source as AttributionSource) && isKnownFormula(value.formula, value.amount);
    case "overload":
      return value.source === "overload" && isKnownFormula(value.formula, value.amount);
    case "opaque":
      return isRecord(value.formula) && value.formula.kind === "legacy-unavailable";
    default:
      return false;
  }
}

export function isSpinReceipt(value: unknown): value is SpinReceipt {
  if (!isRecord(value)
    || !isNonnegativeSafeInteger(value.ordinal) || value.ordinal < 1
    || !isNonnegativeSafeInteger(value.shift) || value.shift < 1
    || !isNonnegativeSafeInteger(value.afterHoursLevel)
    || typeof value.isFree !== "boolean"
    || !isNonnegativeMoney(value.bankrollBefore)
    || !isNonnegativeMoney(value.wager)
    || !isNonnegativeMoney(value.totalPayout)
    || !isNonnegativeMoney(value.bankrollAfter)
    || !isGrid(value.finalGrid)
    || !Array.isArray(value.awards)
    || value.awards.length > MAX_RECEIPT_AWARDS
    || !value.awards.every(isReceiptAward)) return false;
  if (value.isFree ? value.baseSpinIndex !== null || value.wager !== 0 : ![1, 2, 3].includes(value.baseSpinIndex as number) || value.wager <= 0) return false;
  if (value.bankrollBefore < value.wager || value.bankrollAfter !== safeMoney(value.bankrollBefore - value.wager + value.totalPayout)) return false;
  const awards = value.awards as readonly ReceiptAward[];
  if (!awards.every((award, index) => index === 0 || award.sequence > awards[index - 1]!.sequence)) return false;
  const opaque = awards.filter((award) => award.kind === "opaque");
  if (opaque.length > 0 && (awards.length !== 1 || value.totalPayout <= 0)) return false;
  return awards.reduce<Money>((sum, award) => safeMoney(sum + award.amount), 0) === value.totalPayout;
}

export function appendSpinReceipt(history: readonly SpinReceipt[], receipt: SpinReceipt): readonly SpinReceipt[] {
  if (!history.every(isSpinReceipt) || !isSpinReceipt(receipt)
    || !history.every((entry, index) => index === 0 || entry.ordinal > history[index - 1]!.ordinal)
    || (history.length > 0 && receipt.ordinal <= history.at(-1)!.ordinal)) {
    throw new SpinReceiptInvariantError("INVALID_EVENT_SEQUENCE");
  }
  return [...history.slice(-(MAX_SPIN_HISTORY - 1)), receipt];
}
