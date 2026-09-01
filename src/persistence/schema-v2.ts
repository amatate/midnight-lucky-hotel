import { MAX_RECEIPT_AWARDS, MAX_SPIN_HISTORY, isSpinReceipt } from "@/core/receipts";
import type { PendingSpin, ReceiptAward, RunState, SpinReceipt } from "@/core/types";
import {
  ATTRIBUTION,
  LINE_IDS,
  PARTS,
  SYMBOLS,
  hasShape,
  isBoolean,
  isBoundedMoney,
  isDenseArray,
  isEnum,
  isGameEventV2,
  isPlainRecord,
  isReelDraw,
  isSafeInteger,
  validateCommonSnapshot
} from "@/persistence/codec-shared";

const ROOT_KEYS_V2 = [
  "schemaVersion", "initialSeed", "rng", "phase", "bankroll", "checkoutTarget", "shift", "baseSpinsInShift",
  "shiftWager", "shiftPayout", "baseBet", "betMode", "interventionPoints", "maxInterventionPoints",
  "nextShiftFocusBonus", "interventionUsedThisSpin", "reels", "temporaryReelAdditions", "pendingPrayer",
  "pendingSpin", "freeSpinQueue", "service", "serviceCandidates", "tips", "agitation", "omen", "counters",
  "shiftFlags", "partSlots", "toolLevel", "buffs", "contract", "afterHoursLevel", "exitUnlocked",
  "currentCandidates", "acquiredUpgrades", "pendingEvents", "spinHistory", "nextSpinOrdinal", "attribution",
  "expenses", "shiftHistory", "commandHistory"
] as const;

function isPendingSpinV2(value: unknown): value is PendingSpin {
  if (!hasShape(value, ["draw", "isFree", "bankrollBefore", "wager"])
    || !isReelDraw(value.draw) || !isBoolean(value.isFree)
    || !isBoundedMoney(value.bankrollBefore) || !isBoundedMoney(value.wager)
    || value.bankrollBefore < value.wager) return false;
  return value.isFree ? value.wager === 0 : value.wager > 0;
}

function isFormula(value: unknown, allowLegacy: boolean): boolean {
  if (!isPlainRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "legacy-unavailable") return allowLegacy && hasShape(value, ["kind"]);
  return value.kind === "known"
    && hasShape(value, ["kind", "preMultiplierAmount", "appliedMultiplier"])
    && typeof value.preMultiplierAmount === "number" && Number.isFinite(value.preMultiplierAmount)
    && typeof value.appliedMultiplier === "number" && Number.isFinite(value.appliedMultiplier);
}

function isStrictAward(value: unknown): value is ReceiptAward {
  if (!isPlainRecord(value) || !isSafeInteger(value.sequence, 0) || !isBoundedMoney(value.amount)
    || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "line":
      return hasShape(value, ["sequence", "kind", "lineId", "symbol", "source", "formula", "amount"])
        && isEnum(value.lineId, LINE_IDS) && isEnum(value.symbol, SYMBOLS)
        && isEnum(value.source, ATTRIBUTION) && value.source !== "overload" && isFormula(value.formula, true);
    case "pattern-line":
      return hasShape(value, ["sequence", "kind", "patternId", "partId", "lineId", "formula", "amount"])
        && value.patternId === "fruit-salad" && value.partId === "fruit-salad"
        && isEnum(value.lineId, LINE_IDS) && isFormula(value.formula, true);
    case "part-bonus":
      return hasShape(value, ["sequence", "kind", "source", "partId", "formula", "amount"])
        && value.source === "part" && isEnum(value.partId, PARTS) && isFormula(value.formula, true);
    case "bonus":
      return hasShape(value, ["sequence", "kind", "source", "formula", "amount"])
        && isEnum(value.source, ATTRIBUTION) && value.source !== "part" && value.source !== "overload"
        && isFormula(value.formula, true);
    case "overload":
      return hasShape(value, ["sequence", "kind", "source", "formula", "amount"])
        && value.source === "overload" && isFormula(value.formula, true);
    case "opaque":
      return hasShape(value, ["sequence", "kind", "formula", "amount"])
        && isFormula(value.formula, true)
        && (value.formula as { readonly kind?: unknown }).kind === "legacy-unavailable";
    default:
      return false;
  }
}

function isStrictReceipt(value: unknown): value is SpinReceipt {
  if (!hasShape(value, [
    "ordinal", "shift", "afterHoursLevel", "isFree", "baseSpinIndex", "bankrollBefore", "wager", "finalGrid",
    "awards", "totalPayout", "bankrollAfter"
  ]) || !isDenseArray(value.awards, MAX_RECEIPT_AWARDS) || !value.awards.every(isStrictAward)) return false;
  return isSpinReceipt(value);
}

function isSpinHistory(value: unknown, nextSpinOrdinal: unknown): value is readonly SpinReceipt[] {
  if (!isDenseArray(value, MAX_SPIN_HISTORY) || !value.every(isStrictReceipt) || !isSafeInteger(nextSpinOrdinal, 1)) {
    return false;
  }
  const history = value as readonly SpinReceipt[];
  for (let index = 1; index < history.length; index += 1) {
    if (history[index]!.ordinal <= history[index - 1]!.ordinal) return false;
  }
  return history.length === 0 ? nextSpinOrdinal === 1 : nextSpinOrdinal > history.at(-1)!.ordinal;
}

export function decodeRunStateV2(value: unknown): RunState | null {
  if (!hasShape(value, ROOT_KEYS_V2) || value.schemaVersion !== 2) return null;
  if (!validateCommonSnapshot(value, isPendingSpinV2, isGameEventV2)
    || !isSpinHistory(value.spinHistory, value.nextSpinOrdinal)) return null;
  return value as unknown as RunState;
}
