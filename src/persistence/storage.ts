import { UPGRADE_IDS } from "@/content/upgrades";
import type { GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { normalizeDrawIdentity } from "@/core/reels";
import type { PartId, ReelDraw, ReelSet, RunPhase, RunState, SymbolId, UpgradeChoice } from "@/core/types";

export const RUN_STORAGE_KEY = "midnight-lucky-hotel.run.v1";

export type LoadRunResult =
  | { readonly ok: true; readonly state: RunState }
  | { readonly ok: false; readonly reason: "MISSING" | "INVALID_SNAPSHOT" };

const MAX_SNAPSHOT_BYTES = 1_000_000;
const MAX_REEL_SYMBOLS = 10_000;
const MAX_EVENTS = 20_000;
const MAX_COMMANDS = 10_000;
const MAX_HISTORY = 1_000;
const MAX_BUFFS = 1_000;
const MAX_ACQUIRED = 1_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const ROOT_KEYS = [
  "schemaVersion", "initialSeed", "rng", "phase", "bankroll", "checkoutTarget", "shift", "baseSpinsInShift",
  "shiftWager", "shiftPayout", "baseBet", "betMode", "interventionPoints", "maxInterventionPoints",
  "nextShiftFocusBonus", "interventionUsedThisSpin", "reels", "temporaryReelAdditions", "pendingPrayer",
  "pendingSpin", "freeSpinQueue", "service", "serviceCandidates", "tips", "agitation", "omen", "counters",
  "shiftFlags", "partSlots", "toolLevel", "buffs", "contract", "afterHoursLevel", "exitUnlocked",
  "currentCandidates", "acquiredUpgrades", "pendingEvents", "attribution", "expenses", "shiftHistory",
  "commandHistory"
] as const;
const PHASES = new Set<RunPhase>([
  "CHOOSING_SERVICE", "READY_TO_SPIN", "SPINNING", "AWAITING_INTERVENTION", "RESOLVING_EFFECTS",
  "CHOOSING_UPGRADE", "SHIFT_COMPLETE", "RUN_WON", "RUN_LOST", "AFTER_HOURS"
]);
const SYMBOLS = new Set<SymbolId>(["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"]);
const BASE_SYMBOLS = new Set(["cherry", "lemon", "bell", "seven"]);
const PARTS = new Set<PartId>([
  "lemon-infection", "jam-jar", "fruit-salad", "leftovers", "omen-collector", "triple-blessing",
  "midnight-bell", "martyr-coin", "scrap-magnet", "loose-spring", "blank-capacitor", "warranty-fraud",
  "overload-motor", "safety-fuse"
]);
const UPGRADES = new Set<string>(UPGRADE_IDS);
const SERVICES = new Set(["repair", "kitchen", "chapel", "security"]);
const BET_MODES = new Set(["conservative", "normal", "aggressive"]);
const ATTRIBUTION = new Set(["base", "part", "intervention", "service", "agitation", "overload"]);
const CONTRACTS = new Set(["combination", "discipline", "rescue"]);
const LINE_IDS = new Set(["top", "middle", "bottom", "diagonal-down", "diagonal-up"]);

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) &&
    !Object.keys(value).some((key) => DANGEROUS_KEYS.has(key));
}

function hasShape(value: unknown, required: readonly string[], optional: readonly string[] = []): value is PlainRecord {
  if (!isPlainRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
}

function isDenseArray(value: unknown, maxLength: number, exactLength?: number): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > maxLength || (exactLength !== undefined && value.length !== exactLength)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isFiniteSafe(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

function isSafeInteger(value: unknown, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isEnum(value: unknown, values: ReadonlySet<string>): value is string {
  return typeof value === "string" && values.has(value);
}

function isRng(value: unknown): boolean {
  return hasShape(value, ["value"]) && isSafeInteger(value.value);
}

function isReelIndex(value: unknown): boolean {
  return value === 0 || value === 1 || value === 2;
}

function isReels(value: unknown, allowEmpty = false): value is ReelSet {
  return isDenseArray(value, 3, 3) && value.every((strip) =>
    isDenseArray(strip, MAX_REEL_SYMBOLS) && (allowEmpty || strip.length > 0) && strip.every((symbol) => SYMBOLS.has(symbol as SymbolId))
  );
}

function isGrid(value: unknown): boolean {
  return isDenseArray(value, 3, 3) && value.every((window) =>
    isDenseArray(window, 3, 3) && window.every((symbol) => SYMBOLS.has(symbol as SymbolId))
  );
}

function isStops(value: unknown): boolean {
  return isDenseArray(value, 3, 3) && value.every((stop) => isSafeInteger(stop));
}

function isEntryIds(value: unknown, strips: ReelSet): boolean {
  return isDenseArray(value, 3, 3) && value.every((ids, reel) =>
    isDenseArray(ids, MAX_REEL_SYMBOLS, strips[reel]!.length) &&
    ids.every((id) => isSafeInteger(id, 0)) && new Set(ids).size === ids.length
  );
}

function isVisibleSourceIds(value: unknown): boolean {
  return isDenseArray(value, 3, 3) && value.every((ids) =>
    isDenseArray(ids, 3, 3) && ids.every((id) => isSafeInteger(id, 0))
  );
}

function isReelDraw(value: unknown): value is ReelDraw {
  if (!hasShape(value, ["strips", "stops", "grid", "rng"], ["entryIds", "visibleSourceIds", "preInterventionPaying"])) {
    return false;
  }
  if (!isReels(value.strips) || !isStops(value.stops) || !isGrid(value.grid) || !isRng(value.rng)) return false;
  if (Object.hasOwn(value, "entryIds") && !isEntryIds(value.entryIds, value.strips)) return false;
  if (Object.hasOwn(value, "visibleSourceIds") && !isVisibleSourceIds(value.visibleSourceIds)) return false;
  return !Object.hasOwn(value, "preInterventionPaying") || isBoolean(value.preInterventionPaying);
}

function isPart(value: unknown): boolean {
  return hasShape(value, ["id", "level"]) && PARTS.has(value.id as PartId) && (value.level === 1 || value.level === 2);
}

function isPartSlots(value: unknown): boolean {
  return isDenseArray(value, 5, 5) && value.every((part) => part === null || isPart(part));
}

function isBuff(value: unknown): boolean {
  return hasShape(value, ["id", "spinsRemaining", "additivePayout"]) && value.id === "food" &&
    isSafeInteger(value.spinsRemaining, 0) && isFiniteSafe(value.additivePayout);
}

function isContract(value: unknown): boolean {
  if (value === null) return true;
  if (!hasShape(value, ["id", "target", "progress", "completed", "rewardClaimed", "startBankroll", "interventionsUsed"], ["targetSymbol"])) {
    return false;
  }
  if (!isEnum(value.id, CONTRACTS) || !isFiniteSafe(value.target) || !isFiniteSafe(value.progress) ||
      !isBoolean(value.completed) || !isBoolean(value.rewardClaimed) || !isFiniteSafe(value.startBankroll) ||
      !isSafeInteger(value.interventionsUsed, 0)) return false;
  if (value.id === "combination") return isEnum(value.targetSymbol, BASE_SYMBOLS);
  return !Object.hasOwn(value, "targetSymbol");
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
  return isSafeInteger(value.shift, 1) && isFiniteSafe(value.bankroll) && isReels(value.reels) &&
    isDenseArray(value.parts, 5) && value.parts.every(isPart) && isFiniteSafe(value.totalWager) &&
    isFiniteSafe(value.totalPayout) && (!Object.hasOwn(value, "afterHoursLevel") || isSafeInteger(value.afterHoursLevel, 0));
}

function isUpgradeTarget(value: unknown): boolean {
  if (!isPlainRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "reel":
      return hasShape(value, ["kind", "reel"]) && isReelIndex(value.reel);
    case "two-reels":
      return hasShape(value, ["kind", "reels"]) && isDenseArray(value.reels, 2, 2) &&
        value.reels.every(isReelIndex) && value.reels[0] !== value.reels[1];
    case "symbol-on-reel":
      return hasShape(value, ["kind", "reel", "symbol"]) && isReelIndex(value.reel) &&
        isEnum(value.symbol, SYMBOLS) && value.symbol !== "wild";
    default:
      return false;
  }
}

function isUpgradeChoice(value: unknown): value is UpgradeChoice {
  if (!isPlainRecord(value) || !isEnum(value.id, UPGRADES) || typeof value.action !== "string") return false;
  switch (value.action) {
    case "apply":
      return hasShape(value, ["id", "action"], ["target"]) &&
        (!Object.hasOwn(value, "target") || isUpgradeTarget(value.target));
    case "replace":
      return hasShape(value, ["id", "action", "replaceSlot"]) && isSafeInteger(value.replaceSlot, 0, 4);
    case "decline":
      return hasShape(value, ["id", "action"]);
    default:
      return false;
  }
}

function isGameCommand(value: unknown): value is GameCommand {
  if (!isPlainRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "SELECT_SERVICE": return hasShape(value, ["type", "serviceId"]) && isEnum(value.serviceId, SERVICES);
    case "SET_BET_MODE": return hasShape(value, ["type", "mode"]) && isEnum(value.mode, BET_MODES);
    case "BUY_FOOD": return hasShape(value, ["type", "reelIndex"]) && isReelIndex(value.reelIndex);
    case "PRAY": return hasShape(value, ["type", "symbol"]) && isEnum(value.symbol, BASE_SYMBOLS);
    case "RESPIN_REEL": return hasShape(value, ["type", "reelIndex"]) && isReelIndex(value.reelIndex);
    case "LOCK_AND_RESPIN_OTHERS": return hasShape(value, ["type", "lockedReelIndex"]) && isReelIndex(value.lockedReelIndex);
    case "KICK_REEL": return hasShape(value, ["type", "reelIndex"]) && isReelIndex(value.reelIndex);
    case "CHOOSE_UPGRADE": return hasShape(value, ["type", "choice"]) && isUpgradeChoice(value.choice);
    case "REMOVE_CRACKS": return hasShape(value, ["type", "reelIndex"]) && isReelIndex(value.reelIndex);
    case "ENABLE_MARTYR":
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

function eventBase(value: PlainRecord, keys: readonly string[]): boolean {
  return hasShape(value, ["sequence", "type", ...keys]) && isSafeInteger(value.sequence, 1);
}

function isGameEvent(value: unknown): value is GameEvent {
  if (!isPlainRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "BET_PLACED": return eventBase(value, ["amount"]) && isFiniteSafe(value.amount);
    case "REELS_DRAWN": return eventBase(value, ["draw"]) && isReelDraw(value.draw);
    case "INTERVENTION_USED": {
      if (!eventBase(value, ["kind", "target"]) || !isEnum(value.kind, new Set(["respin", "repair-lock", "kick", "prayer"]))) return false;
      return value.kind === "prayer" ? isEnum(value.target, BASE_SYMBOLS) : isReelIndex(value.target);
    }
    case "LINE_WIN": return eventBase(value, ["lineId", "symbol", "amount", "source"]) &&
      isEnum(value.lineId, LINE_IDS) && isEnum(value.symbol, SYMBOLS) && isFiniteSafe(value.amount) && isEnum(value.source, ATTRIBUTION);
    case "PART_TRIGGERED": return eventBase(value, ["partId", "level"]) && PARTS.has(value.partId as PartId) &&
      (value.level === 1 || value.level === 2);
    case "PART_DISABLED": return eventBase(value, ["partId", "slot"]) && PARTS.has(value.partId as PartId) &&
      isSafeInteger(value.slot, 0, 4);
    case "FOOD_CONSUMED": return eventBase(value, ["reel"]) && isReelIndex(value.reel);
    case "PAYOUT_ADDED": return eventBase(value, ["amount", "source"]) && isFiniteSafe(value.amount) && isEnum(value.source, ATTRIBUTION);
    case "SYMBOL_CHANGED": return eventBase(value, ["reel", "row", "from", "to"]) && isReelIndex(value.reel) &&
      isReelIndex(value.row) && isEnum(value.from, SYMBOLS) && isEnum(value.to, SYMBOLS);
    case "RESOURCE_CHANGED": return eventBase(value, ["resource", "delta"]) &&
      isEnum(value.resource, new Set(["tips", "focus", "omen", "agitation", "freeSpins"])) && isFiniteSafe(value.delta);
    case "SERVICE_USED": return eventBase(value, ["serviceId", "cost"]) && isEnum(value.serviceId, SERVICES) && isFiniteSafe(value.cost);
    case "CONTRACT_PROGRESS": return eventBase(value, ["contractId", "progress", "completed"]) &&
      isEnum(value.contractId, CONTRACTS) && isFiniteSafe(value.progress) && isBoolean(value.completed);
    case "SPIN_COMMITTED": return eventBase(value, ["interventionUsed", "preInterventionPaying", "finalPayout"]) &&
      isBoolean(value.interventionUsed) && isBoolean(value.preInterventionPaying) && isFiniteSafe(value.finalPayout);
    case "BLOCK_COMPLETED": return eventBase(value, ["bankroll"]) && isFiniteSafe(value.bankroll);
    case "OVERLOAD": return eventBase(value, ["amount"]) && isFiniteSafe(value.amount);
    case "PAYOUT_COMPLETE": return eventBase(value, ["total"]) && isFiniteSafe(value.total);
    case "SHIFT_CHANGED": return eventBase(value, ["shift"]) && isSafeInteger(value.shift, 1);
    case "RUN_ENDED": return eventBase(value, ["outcome"]) && isEnum(value.outcome, new Set(["won", "lost", "cashed-out"]));
    default:
      return false;
  }
}

function isEventHistory(value: unknown): value is readonly GameEvent[] {
  if (!isDenseArray(value, MAX_EVENTS) || !value.every(isGameEvent)) return false;
  for (let index = 1; index < value.length; index += 1) {
    if ((value[index] as GameEvent).sequence <= (value[index - 1] as GameEvent).sequence) return false;
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
      return hasService && !hasSpin;
    case "RUN_LOST":
      return hasService && !hasSpin && !hasCandidates;
    case "AFTER_HOURS": return hasService && !hasSpin;
    default: return false;
  }
}

function normalizeSnapshot(value: unknown): RunState | null {
  if (!hasShape(value, ROOT_KEYS) || value.schemaVersion !== 1 || !isEnum(value.phase, PHASES)) return null;
  if (!isSafeInteger(value.initialSeed) || !isRng(value.rng) || !isFiniteSafe(value.bankroll) || value.checkoutTarget !== 200 ||
      !isSafeInteger(value.shift, 1) || !isSafeInteger(value.baseSpinsInShift, 0, 3) || !isFiniteSafe(value.shiftWager) ||
      !isFiniteSafe(value.shiftPayout) || !isFiniteSafe(value.baseBet) || !isEnum(value.betMode, BET_MODES) ||
      !isSafeInteger(value.interventionPoints, 0) || !isSafeInteger(value.maxInterventionPoints, 0) ||
      !isSafeInteger(value.nextShiftFocusBonus, 0) || !isBoolean(value.interventionUsedThisSpin)) return null;
  if (!isReels(value.reels) || !isReels(value.temporaryReelAdditions, true) ||
      (value.pendingPrayer !== null && !isEnum(value.pendingPrayer, BASE_SYMBOLS))) return null;
  if (value.pendingSpin !== null && (!hasShape(value.pendingSpin, ["draw", "isFree"]) ||
      !isReelDraw(value.pendingSpin.draw) || !isBoolean(value.pendingSpin.isFree))) return null;
  if (!isSafeInteger(value.freeSpinQueue, 0) || (value.service !== null && !isEnum(value.service, SERVICES)) ||
      !isDenseArray(value.serviceCandidates, 3, 3) || !value.serviceCandidates.every((service) => isEnum(service, SERVICES)) ||
      new Set(value.serviceCandidates).size !== 3 || !isSafeInteger(value.tips, 0) || !isSafeInteger(value.agitation, 0) ||
      !isSafeInteger(value.omen) || !exactNumberRecord(value.counters, ["blankCharge", "cherryWinsThisShift"])) return null;
  const shiftFlags = value.shiftFlags;
  if (!hasShape(shiftFlags, ["foodBought", "prayerUsed", "kickUsed", "repairLockUsed", "martyrEnabled", "warrantyPaid", "returnedFoodCount"]) ||
      !["foodBought", "prayerUsed", "kickUsed", "repairLockUsed", "martyrEnabled", "warrantyPaid"].every((key) => isBoolean(shiftFlags[key])) ||
      !isSafeInteger(shiftFlags.returnedFoodCount, 0) || !isPartSlots(value.partSlots) ||
      !isSafeInteger(value.toolLevel, 0, 3)) return null;
  if (!isDenseArray(value.buffs, MAX_BUFFS) || !value.buffs.every(isBuff) || !isContract(value.contract) ||
      !isSafeInteger(value.afterHoursLevel, 0) || !isBoolean(value.exitUnlocked) ||
      (value.currentCandidates !== null && !isCandidates(value.currentCandidates))) return null;
  if (!isDenseArray(value.acquiredUpgrades, MAX_ACQUIRED) || !value.acquiredUpgrades.every((id) => isEnum(id, UPGRADES)) ||
      !isEventHistory(value.pendingEvents) || !exactNumberRecord(value.attribution, ["base", "part", "intervention", "service", "agitation", "overload"]) ||
      !exactNumberRecord(value.expenses, ["wagers", "kitchen", "chapel", "repair"]) ||
      !isDenseArray(value.shiftHistory, MAX_HISTORY) || !value.shiftHistory.every(isShiftSnapshot) ||
      !isDenseArray(value.commandHistory, MAX_COMMANDS) || !value.commandHistory.every(isGameCommand) || !phaseIsCoherent(value)) return null;

  const snapshot = value as unknown as RunState;
  const pendingSpin = snapshot.pendingSpin === null ? null : {
    ...snapshot.pendingSpin,
    draw: normalizeDrawIdentity(snapshot.pendingSpin.draw)
  };
  const pendingEvents = snapshot.pendingEvents.map((event) => event.type === "REELS_DRAWN"
    ? { ...event, draw: normalizeDrawIdentity(event.draw) }
    : event);
  return { ...snapshot, pendingSpin, pendingEvents };
}

export function saveRun(state: RunState): void {
  try {
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is optional; gameplay must remain available in restricted contexts.
  }
}

export function loadRun(): LoadRunResult {
  let serialized: string | null;
  try {
    serialized = localStorage.getItem(RUN_STORAGE_KEY);
  } catch {
    return { ok: false, reason: "INVALID_SNAPSHOT" };
  }
  if (serialized === null) return { ok: false, reason: "MISSING" };
  if (serialized.length > MAX_SNAPSHOT_BYTES) return { ok: false, reason: "INVALID_SNAPSHOT" };
  try {
    const state = normalizeSnapshot(JSON.parse(serialized));
    return state === null ? { ok: false, reason: "INVALID_SNAPSHOT" } : { ok: true, state };
  } catch {
    return { ok: false, reason: "INVALID_SNAPSHOT" };
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_STORAGE_KEY);
  } catch {
    // Persistence is optional; restart should still work.
  }
}
