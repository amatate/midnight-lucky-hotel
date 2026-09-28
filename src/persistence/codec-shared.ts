import { UPGRADE_IDS } from "@/content/upgrades";
import { getPaidSpinLimit, MAX_ROOM_TIER } from "@/content/hotel";
import { MAX_MONEY, safePayout } from "@/core/money";
import type { GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import type {
  PartId,
  HotelProgress,
  PaidSpinLimit,
  ReelDraw,
  ReelSet,
  RunPhase,
  RoomObjective,
  SymbolId,
  UpgradeChoice
} from "@/core/types";

export const MAX_SNAPSHOT_BYTES = 1_000_000;
export const MAX_EVENTS = 20_000;
export const MAX_COMMANDS = 10_000;
export const MAX_SHIFT_HISTORY = 1_000;
export const MAX_BUFFS = 1_000;
export const MAX_ACQUIRED = 1_000;

const MAX_REEL_SYMBOLS = 10_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
export const PHASES = new Set<RunPhase>([
  "CHOOSING_SERVICE", "READY_TO_SPIN", "SPINNING", "AWAITING_INTERVENTION", "RESOLVING_EFFECTS",
  "CHOOSING_UPGRADE", "SHIFT_COMPLETE", "RUN_WON", "RUN_LOST", "AFTER_HOURS"
]);
export const SYMBOLS = new Set<SymbolId>(["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"]);
const BASE_SYMBOLS = new Set(["cherry", "lemon", "bell", "seven"]);
export const PARTS = new Set<PartId>([
  "harvest-vat", "votive-candle", "shock-absorber",
  "cherry-press", "salad-dressing",
  "lemon-infection", "jam-jar", "fruit-salad", "leftovers", "omen-collector", "triple-blessing",
  "midnight-bell", "martyr-coin", "scrap-magnet", "loose-spring", "blank-capacitor", "warranty-fraud",
  "overload-motor", "safety-fuse"
]);
const UPGRADES = new Set<string>(UPGRADE_IDS);
const SERVICES = new Set(["repair", "kitchen", "chapel", "security"]);
const BET_MODES = new Set(["conservative", "normal", "aggressive"]);
export const ATTRIBUTION = new Set(["base", "part", "intervention", "service", "agitation", "overload"]);
const CONTRACTS = new Set(["combination", "discipline", "rescue"]);
export const LINE_IDS = new Set(["top", "middle", "bottom", "diagonal-down", "diagonal-up"]);

export type PlainRecord = Record<string, unknown>;
export type EventValidator = (value: unknown) => boolean;
export type PendingSpinValidator = (value: unknown) => boolean;

export function isPlainRecord(value: unknown): value is PlainRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && !Object.keys(value).some((key) => DANGEROUS_KEYS.has(key));
}

export function hasShape(value: unknown, required: readonly string[], optional: readonly string[] = []): value is PlainRecord {
  if (!isPlainRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
}

export function isDenseArray(value: unknown, maxLength: number, exactLength?: number): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > maxLength || (exactLength !== undefined && value.length !== exactLength)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

export function isFiniteSafe(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

export function isBoundedMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_MONEY;
}

export function isSafeInteger(value: unknown, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isEnum(value: unknown, values: ReadonlySet<string>): value is string {
  return typeof value === "string" && values.has(value);
}

function isRng(value: unknown): boolean {
  return hasShape(value, ["value"]) && isSafeInteger(value.value);
}

function isReelIndex(value: unknown): boolean {
  return value === 0 || value === 1 || value === 2;
}

export function isReels(value: unknown, allowEmpty = false): value is ReelSet {
  return isDenseArray(value, 3, 3) && value.every((strip) =>
    isDenseArray(strip, MAX_REEL_SYMBOLS)
    && (allowEmpty || strip.length > 0)
    && strip.every((symbol) => SYMBOLS.has(symbol as SymbolId))
  );
}

export function isGrid(value: unknown): boolean {
  return isDenseArray(value, 3, 3) && value.every((window) =>
    isDenseArray(window, 3, 3) && window.every((symbol) => SYMBOLS.has(symbol as SymbolId))
  );
}

function isStops(value: unknown, strips: ReelSet): boolean {
  return isDenseArray(value, 3, 3)
    && value.every((stop, reel) => isSafeInteger(stop, 0, strips[reel]!.length - 1));
}

function isEntryIds(value: unknown, strips: ReelSet): boolean {
  return isDenseArray(value, 3, 3) && value.every((ids, reel) =>
    isDenseArray(ids, MAX_REEL_SYMBOLS, strips[reel]!.length)
    && ids.every((id) => isSafeInteger(id, 0))
    && new Set(ids).size === ids.length
  );
}

function isVisibleSourceIds(value: unknown): boolean {
  return isDenseArray(value, 3, 3)
    && value.every((ids) => isDenseArray(ids, 3, 3) && ids.every((id) => isSafeInteger(id, 0)));
}

export function isReelDraw(value: unknown): value is ReelDraw {
  if (!hasShape(value, ["strips", "stops", "grid", "rng", "entryIds", "visibleSourceIds"], ["preInterventionPaying"])) {
    return false;
  }
  if (!isReels(value.strips) || !isStops(value.stops, value.strips) || !isGrid(value.grid) || !isRng(value.rng)
    || !isEntryIds(value.entryIds, value.strips) || !isVisibleSourceIds(value.visibleSourceIds)
    || (Object.hasOwn(value, "preInterventionPaying") && !isBoolean(value.preInterventionPaying))) return false;
  const draw = value as unknown as ReelDraw & {
    readonly entryIds: NonNullable<ReelDraw["entryIds"]>;
    readonly visibleSourceIds: NonNullable<ReelDraw["visibleSourceIds"]>;
  };
  for (const reel of [0, 1, 2] as const) {
    const strip = draw.strips[reel];
    for (const row of [0, 1, 2] as const) {
      const sourceIndex = draw.entryIds[reel].indexOf(draw.visibleSourceIds[reel][row]);
      if (sourceIndex < 0 || draw.grid[reel][row] !== strip[sourceIndex]) return false;
    }
  }
  return true;
}

function isPart(value: unknown): boolean {
  return hasShape(value, ["id", "level"])
    && PARTS.has(value.id as PartId)
    && (value.level === 1 || value.level === 2);
}

function isPartSlots(value: unknown): boolean {
  return isDenseArray(value, 5, 5) && value.every((part) => part === null || isPart(part));
}

function isBuff(value: unknown): boolean {
  return hasShape(value, ["id", "spinsRemaining", "additivePayout"])
    && value.id === "food"
    && isSafeInteger(value.spinsRemaining, 0)
    && isFiniteSafe(value.additivePayout);
}

function isContract(value: unknown): boolean {
  if (value === null) return true;
  if (!hasShape(value, ["id", "target", "progress", "completed", "rewardClaimed", "startBankroll", "interventionsUsed"], ["targetSymbol"])) {
    return false;
  }
  if (!isEnum(value.id, CONTRACTS) || !isFiniteSafe(value.target) || !isFiniteSafe(value.progress)
    || !isBoolean(value.completed) || !isBoolean(value.rewardClaimed) || !isFiniteSafe(value.startBankroll)
    || !isSafeInteger(value.interventionsUsed, 0)) return false;
  return value.id === "combination" ? isEnum(value.targetSymbol, BASE_SYMBOLS) : !Object.hasOwn(value, "targetSymbol");
}

function isCandidates(value: unknown): boolean {
  if (!hasShape(value, ["synergy", "pivot", "wildcard"])) return false;
  const ids = [value.synergy, value.pivot, value.wildcard];
  return ids.every((id) => isEnum(id, UPGRADES)) && new Set(ids).size === 3;
}

function isShiftSnapshot(value: unknown): boolean {
  if (!hasShape(value, ["shift", "bankroll", "reels", "parts", "totalWager", "totalPayout"], ["afterHoursLevel"])) {
    return false;
  }
  return isSafeInteger(value.shift, 1) && isFiniteSafe(value.bankroll) && isReels(value.reels)
    && isDenseArray(value.parts, 5) && value.parts.every(isPart) && isFiniteSafe(value.totalWager)
    && isFiniteSafe(value.totalPayout)
    && (!Object.hasOwn(value, "afterHoursLevel") || isSafeInteger(value.afterHoursLevel, 0));
}

function isUpgradeTarget(value: unknown): boolean {
  if (!isPlainRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "reel":
      return hasShape(value, ["kind", "reel"]) && isReelIndex(value.reel);
    case "two-reels":
      return hasShape(value, ["kind", "reels"]) && isDenseArray(value.reels, 2, 2)
        && value.reels.every(isReelIndex) && value.reels[0] !== value.reels[1];
    case "symbol-on-reel":
      return hasShape(value, ["kind", "reel", "symbol"]) && isReelIndex(value.reel)
        && isEnum(value.symbol, SYMBOLS) && value.symbol !== "wild";
    default:
      return false;
  }
}

function isUpgradeChoice(value: unknown): value is UpgradeChoice {
  if (!isPlainRecord(value) || !isEnum(value.id, UPGRADES) || typeof value.action !== "string") return false;
  switch (value.action) {
    case "apply":
      return hasShape(value, ["id", "action"], ["target"])
        && (!Object.hasOwn(value, "target") || isUpgradeTarget(value.target));
    case "replace":
      return hasShape(value, ["id", "action", "replaceSlot"]) && isSafeInteger(value.replaceSlot, 0, 4);
    case "decline":
      return hasShape(value, ["id", "action"]);
    default:
      return false;
  }
}

export function isGameCommand(value: unknown): value is GameCommand {
  if (!isPlainRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "SELECT_SERVICE": return hasShape(value, ["type", "serviceId"]) && isEnum(value.serviceId, SERVICES);
    case "SET_BET_MODE": return hasShape(value, ["type", "mode"]) && isEnum(value.mode, BET_MODES);
    case "BUY_FOOD": return hasShape(value, ["type", "reelIndex"]) && isReelIndex(value.reelIndex);
    case "UPGRADE_PART": return hasShape(value, ["type", "slot"]) && isSafeInteger(value.slot, 0, 4);
    case "PRAY": return hasShape(value, ["type", "symbol"]) && isEnum(value.symbol, BASE_SYMBOLS);
    case "RESPIN_REEL": return hasShape(value, ["type", "reelIndex"]) && isReelIndex(value.reelIndex);
    case "LOCK_AND_RESPIN_OTHERS": return hasShape(value, ["type", "lockedReelIndex"]) && isReelIndex(value.lockedReelIndex);
    case "KICK_REEL": return hasShape(value, ["type", "reelIndex"]) && isReelIndex(value.reelIndex);
    case "CHOOSE_UPGRADE": return hasShape(value, ["type", "choice"]) && isUpgradeChoice(value.choice);
    case "REMOVE_CRACKS": return hasShape(value, ["type", "reelIndex"]) && isReelIndex(value.reelIndex);
    case "ENABLE_MARTYR":
    case "LIGHT_CANDLE":
    case "ENTER_ROOM":
    case "NEXT_ROOM_ROUND":
    case "OPEN_WORKSHOP":
    case "SPIN":
    case "REELS_STOPPED":
    case "ACCEPT_OUTCOME":
    case "PRESENTATION_COMPLETE":
    case "DECLINE_UPGRADE":
    case "REROLL_CANDIDATES":
    case "CASH_OUT":
    case "CONTINUE":
      return hasShape(value, ["type"]);
    default:
      return false;
  }
}

function eventBase(value: PlainRecord, keys: readonly string[], optional: readonly string[] = []): boolean {
  return hasShape(value, ["sequence", "type", ...keys], optional) && isSafeInteger(value.sequence, 1);
}

export function isPaidSpinLimit(value: unknown): value is PaidSpinLimit {
  return value === 3 || value === 4 || value === 5;
}

export function isRoomObjective(value: unknown): value is RoomObjective {
  if (!isPlainRecord(value)) return false;
  return value.kind === "scoring-spins"
    ? hasShape(value, ["kind", "count"]) && isSafeInteger(value.count, 1)
    : hasShape(value, ["kind"]) && (value.kind === "total-payout" || value.kind === "best-spin");
}

function hasRoomRuleFields(value: PlainRecord): boolean {
  return (!Object.hasOwn(value, "paidSpins") || isPaidSpinLimit(value.paidSpins))
    && (!Object.hasOwn(value, "rounds") || value.tier === 1 && value.rounds === 3)
    && (!Object.hasOwn(value, "objective") || isRoomObjective(value.objective))
    && (!Object.hasOwn(value, "progress") || isBoundedMoney(value.progress)
      && (!isPlainRecord(value.objective) || value.objective.kind !== "scoring-spins" || isSafeInteger(value.progress, 0)));
}

/** Only a validated room may widen the ordinary three-pull block. V1 has no hotel. */
function snapshotPaidSpinLimit(value: PlainRecord): PaidSpinLimit {
  if (!isPlainRecord(value.hotel) || !isPlainRecord(value.hotel.challenge)) return 3;
  const challenge = value.hotel.challenge;
  if (!isSafeInteger(challenge.tier, 1, MAX_ROOM_TIER)
    || Object.hasOwn(challenge, "paidSpins") && !isPaidSpinLimit(challenge.paidSpins)) return 3;
  return getPaidSpinLimit({ hotel: value.hotel as unknown as HotelProgress });
}

function hasLegacyFormulaFields(value: PlainRecord): boolean {
  return isFiniteSafe(value.preMultiplierAmount) && isFiniteSafe(value.appliedMultiplier) && isFiniteSafe(value.amount);
}

function hasV2FormulaFields(value: PlainRecord): boolean {
  return isFiniteSafe(value.preMultiplierAmount)
    && isFiniteSafe(value.appliedMultiplier)
    && value.preMultiplierAmount > 0
    && value.appliedMultiplier > 0
    && isBoundedMoney(value.amount)
    && safePayout(value.preMultiplierAmount * value.appliedMultiplier) === value.amount;
}

function commonEvent(value: PlainRecord, money: (candidate: unknown) => candidate is number): boolean | null {
  switch (value.type) {
    case "ROOM_ROUND_STARTED": return eventBase(value, ["round"]) && isSafeInteger(value.round, 2, 3);
    case "ROOM_ROUND_COMPLETED": return eventBase(value, ["round", "payout", "totalPayout", "reward"])
      && isSafeInteger(value.round, 1, 3) && money(value.payout) && money(value.totalPayout)
      && Number(value.totalPayout) >= Number(value.payout) && isBoolean(value.reward);
    case "WORKSHOP_PURCHASED": return eventBase(value, ["cost"]) && money(value.cost) && Number(value.cost) > 0;
    case "MEAL_SERVED": return eventBase(value, ["spins", "additivePayout"])
      && value.spins === 3 && value.additivePayout === 0.5;
    case "PART_UPGRADED": return eventBase(value, ["partId", "cost"])
      && isEnum(value.partId, PARTS) && value.cost === 3;
    case "ROOM_ENTERED": return eventBase(value, ["tier", "bet", "target", "focus"], ["paidSpins", "objective", "rounds"])
      && isSafeInteger(value.tier, 1, MAX_ROOM_TIER) && money(value.bet) && money(value.target)
      && isSafeInteger(value.focus, 0, 3) && hasRoomRuleFields(value);
    case "ROOM_COMPLETED": return eventBase(value, ["tier", "payout", "target", "cleared"], ["paidSpins", "objective", "progress", "rounds"])
      && isSafeInteger(value.tier, 1, MAX_ROOM_TIER) && money(value.payout) && money(value.target)
      && isBoolean(value.cleared) && hasRoomRuleFields(value);
    case "BET_PLACED": return eventBase(value, ["amount"]) && money(value.amount);
    case "REELS_DRAWN": return eventBase(value, ["draw"]) && isReelDraw(value.draw);
    case "INTERVENTION_USED": {
      if (!eventBase(value, ["kind", "target"]) || !isEnum(value.kind, new Set(["respin", "repair-lock", "kick", "prayer"]))) return false;
      return value.kind === "prayer" ? isEnum(value.target, BASE_SYMBOLS) : isReelIndex(value.target);
    }
    case "PART_TRIGGERED": return eventBase(value, ["partId", "level"]) && PARTS.has(value.partId as PartId)
      && (value.level === 1 || value.level === 2);
    case "PART_DISABLED": return eventBase(value, ["partId", "slot"]) && PARTS.has(value.partId as PartId)
      && isSafeInteger(value.slot, 0, 4);
    case "FOOD_CONSUMED": return eventBase(value, ["reel"]) && isReelIndex(value.reel);
    case "SYMBOL_CHANGED": return eventBase(value, ["reel", "row", "from", "to"])
      && isReelIndex(value.reel) && isReelIndex(value.row)
      && isEnum(value.from, SYMBOLS) && isEnum(value.to, SYMBOLS);
    case "RESOURCE_CHANGED": return eventBase(value, ["resource", "delta"])
      && isEnum(value.resource, new Set(["tips", "focus", "omen", "agitation", "freeSpins"]))
      && isFiniteSafe(value.delta);
    case "SERVICE_USED": return eventBase(value, ["serviceId", "cost"])
      && isEnum(value.serviceId, SERVICES) && isFiniteSafe(value.cost);
    case "CONTRACT_PROGRESS": return eventBase(value, ["contractId", "progress", "completed"])
      && isEnum(value.contractId, CONTRACTS) && isFiniteSafe(value.progress) && isBoolean(value.completed);
    case "SPIN_COMMITTED": return eventBase(value, ["interventionUsed", "preInterventionPaying", "finalPayout"])
      && isBoolean(value.interventionUsed) && isBoolean(value.preInterventionPaying) && isFiniteSafe(value.finalPayout);
    case "BLOCK_COMPLETED": return eventBase(value, ["bankroll"]) && isFiniteSafe(value.bankroll);
    case "PAYOUT_COMPLETE": return eventBase(value, ["total"]) && money(value.total);
    case "SHIFT_CHANGED": return eventBase(value, ["shift"]) && isSafeInteger(value.shift, 1);
    case "RUN_ENDED": return eventBase(value, ["outcome"])
      && isEnum(value.outcome, new Set(["won", "lost", "cashed-out"]));
    default: return null;
  }
}

export function isGameEventV1(value: unknown): boolean {
  if (!isPlainRecord(value) || typeof value.type !== "string") return false;
  const common = commonEvent(value, isFiniteSafe);
  if (common !== null) return common;
  switch (value.type) {
    case "LINE_WIN":
      return (eventBase(value, ["lineId", "symbol", "amount", "source"])
        && isEnum(value.lineId, LINE_IDS) && isEnum(value.symbol, SYMBOLS)
        && isFiniteSafe(value.amount) && isEnum(value.source, ATTRIBUTION) && value.source !== "overload")
        || (eventBase(value, ["lineId", "symbol", "preMultiplierAmount", "appliedMultiplier", "amount", "source"])
          && isEnum(value.lineId, LINE_IDS) && isEnum(value.symbol, SYMBOLS)
          && hasLegacyFormulaFields(value) && isEnum(value.source, ATTRIBUTION) && value.source !== "overload");
    case "PAYOUT_ADDED":
      return (eventBase(value, ["amount", "source"]) && isFiniteSafe(value.amount) && isEnum(value.source, ATTRIBUTION))
        || (eventBase(value, ["preMultiplierAmount", "appliedMultiplier", "amount", "source", "partId"])
          && hasLegacyFormulaFields(value) && value.source === "part" && PARTS.has(value.partId as PartId))
        || (eventBase(value, ["preMultiplierAmount", "appliedMultiplier", "amount", "source"])
          && hasLegacyFormulaFields(value) && isEnum(value.source, ATTRIBUTION)
          && value.source !== "part" && value.source !== "overload");
    case "PATTERN_LINE_WIN":
      return eventBase(value, ["patternId", "partId", "lineId", "preMultiplierAmount", "appliedMultiplier", "amount"])
        && value.patternId === "fruit-salad" && value.partId === "fruit-salad"
        && isEnum(value.lineId, LINE_IDS) && hasLegacyFormulaFields(value);
    case "OVERLOAD":
      return (eventBase(value, ["amount"]) && isFiniteSafe(value.amount))
        || (eventBase(value, ["preMultiplierAmount", "appliedMultiplier", "amount"]) && hasLegacyFormulaFields(value));
    default:
      return false;
  }
}

export function isGameEventV2(value: unknown): value is GameEvent {
  if (!isPlainRecord(value) || typeof value.type !== "string") return false;
  const common = commonEvent(value, isBoundedMoney);
  if (common !== null) return common;
  switch (value.type) {
    case "LINE_WIN":
      return eventBase(value, ["lineId", "symbol", "preMultiplierAmount", "appliedMultiplier", "amount", "source"])
        && isEnum(value.lineId, LINE_IDS) && isEnum(value.symbol, SYMBOLS)
        && hasV2FormulaFields(value) && isEnum(value.source, ATTRIBUTION) && value.source !== "overload";
    case "PAYOUT_ADDED":
      return (eventBase(value, ["preMultiplierAmount", "appliedMultiplier", "amount", "source", "partId"])
        && hasV2FormulaFields(value) && value.source === "part" && PARTS.has(value.partId as PartId))
        || (eventBase(value, ["preMultiplierAmount", "appliedMultiplier", "amount", "source"])
          && hasV2FormulaFields(value) && isEnum(value.source, ATTRIBUTION)
          && value.source !== "part" && value.source !== "overload");
    case "PATTERN_LINE_WIN":
      return eventBase(value, ["patternId", "partId", "lineId", "preMultiplierAmount", "appliedMultiplier", "amount"])
        && value.patternId === "fruit-salad" && value.partId === "fruit-salad"
        && isEnum(value.lineId, LINE_IDS) && hasV2FormulaFields(value);
    case "OVERLOAD":
      return eventBase(value, ["preMultiplierAmount", "appliedMultiplier", "amount"]) && hasV2FormulaFields(value);
    default:
      return false;
  }
}

function isEventHistory(value: unknown, validator: EventValidator): boolean {
  if (!isDenseArray(value, MAX_EVENTS) || !value.every(validator)) return false;
  for (let index = 1; index < value.length; index += 1) {
    const current = value[index] as { readonly sequence: number };
    const previous = value[index - 1] as { readonly sequence: number };
    if (current.sequence <= previous.sequence) return false;
  }
  return true;
}

function exactNumberRecord(value: unknown, keys: readonly string[]): boolean {
  return hasShape(value, keys) && keys.every((key) => isFiniteSafe(value[key]));
}

function phaseIsCoherent(value: PlainRecord): boolean {
  const hasSpin = value.pendingSpin !== null;
  const hasCandidates = value.currentCandidates !== null;
  const hasService = value.service !== null;
  switch (value.phase) {
    case "CHOOSING_SERVICE": return !hasService && !hasSpin && !hasCandidates;
    case "READY_TO_SPIN": return hasService && !hasSpin && !hasCandidates;
    case "SPINNING":
    case "AWAITING_INTERVENTION":
    case "RESOLVING_EFFECTS":
      return hasService && hasSpin && !hasCandidates;
    case "CHOOSING_UPGRADE": return hasService && !hasSpin && hasCandidates;
    case "SHIFT_COMPLETE":
    case "RUN_WON":
    case "RUN_LOST":
      return hasService && !hasSpin && !hasCandidates;
    case "AFTER_HOURS":
      return hasService && !hasSpin && value.shift === 5 && isSafeInteger(value.afterHoursLevel, 1)
        && value.baseSpinsInShift === snapshotPaidSpinLimit(value) && value.freeSpinQueue === 0 && value.exitUnlocked === true;
    default: return false;
  }
}

export function validateCommonSnapshot(
  value: PlainRecord,
  pendingSpinValidator: PendingSpinValidator,
  eventValidator: EventValidator
): boolean {
  if (!isEnum(value.phase, PHASES) || !isSafeInteger(value.initialSeed) || !isRng(value.rng)
    || !isFiniteSafe(value.bankroll) || value.checkoutTarget !== 200
    || !isSafeInteger(value.shift, 1) || !isSafeInteger(value.baseSpinsInShift, 0, snapshotPaidSpinLimit(value))
    || !isFiniteSafe(value.shiftWager) || !isFiniteSafe(value.shiftPayout) || !isFiniteSafe(value.baseBet)
    || !isEnum(value.betMode, BET_MODES) || !isSafeInteger(value.interventionPoints, 0)
    || !isSafeInteger(value.maxInterventionPoints, 0) || !isSafeInteger(value.nextShiftFocusBonus, 0)
    || !isBoolean(value.interventionUsedThisSpin)) return false;
  if (!isReels(value.reels) || !isReels(value.temporaryReelAdditions, true)
    || (value.pendingPrayer !== null && !isEnum(value.pendingPrayer, BASE_SYMBOLS))) return false;
  if (value.pendingSpin !== null && !pendingSpinValidator(value.pendingSpin)) return false;
  if (!isSafeInteger(value.freeSpinQueue, 0) || (value.service !== null && !isEnum(value.service, SERVICES))
    || !isDenseArray(value.serviceCandidates, 3, 3)
    || !value.serviceCandidates.every((service) => isEnum(service, SERVICES))
    || new Set(value.serviceCandidates).size !== 3 || !isSafeInteger(value.tips, 0)
    || !isSafeInteger(value.agitation, 0) || !isSafeInteger(value.omen)
    || !hasShape(value.counters, ["blankCharge", "cherryWinsThisShift"], ["harvestCharge", "votiveCharge"])
    || !isSafeInteger(value.counters.blankCharge, 0) || !isSafeInteger(value.counters.cherryWinsThisShift, 0)
    || (Object.hasOwn(value.counters, "harvestCharge") && !isSafeInteger(value.counters.harvestCharge, 0, 2))
    || (Object.hasOwn(value.counters, "votiveCharge") && !isSafeInteger(value.counters.votiveCharge, 0, 3))) return false;
  const shiftFlags = value.shiftFlags;
  if (!hasShape(shiftFlags, ["foodBought", "prayerUsed", "kickUsed", "repairLockUsed", "martyrEnabled", "warrantyPaid", "returnedFoodCount"])
    || !["foodBought", "prayerUsed", "kickUsed", "repairLockUsed", "martyrEnabled", "warrantyPaid"]
      .every((key) => isBoolean(shiftFlags[key]))
    || !isSafeInteger(shiftFlags.returnedFoodCount, 0) || !isPartSlots(value.partSlots)
    || !isSafeInteger(value.toolLevel, 0, 3)) return false;
  return isDenseArray(value.buffs, MAX_BUFFS) && value.buffs.every(isBuff) && isContract(value.contract)
    && isSafeInteger(value.afterHoursLevel, 0) && isBoolean(value.exitUnlocked)
    && (value.currentCandidates === null || isCandidates(value.currentCandidates))
    && isDenseArray(value.acquiredUpgrades, MAX_ACQUIRED)
    && value.acquiredUpgrades.every((id) => isEnum(id, UPGRADES))
    && isEventHistory(value.pendingEvents, eventValidator)
    && exactNumberRecord(value.attribution, ["base", "part", "intervention", "service", "agitation", "overload"])
    && hasShape(value.expenses, ["wagers", "kitchen", "chapel", "repair"], ["workshop"])
    && Object.values(value.expenses).every(isBoundedMoney)
    && isDenseArray(value.shiftHistory, MAX_SHIFT_HISTORY) && value.shiftHistory.every(isShiftSnapshot)
    && isDenseArray(value.commandHistory, MAX_COMMANDS) && value.commandHistory.every(isGameCommand)
    && phaseIsCoherent(value);
}
