import { normalizeDrawIdentity } from "@/core/reels";
import type { PartId, ReelSet, RunPhase, RunState, SymbolId } from "@/core/types";
import { UPGRADE_IDS } from "@/content/upgrades";

export const RUN_STORAGE_KEY = "midnight-lucky-hotel.run.v1";

export type LoadRunResult =
  | { readonly ok: true; readonly state: RunState }
  | { readonly ok: false; readonly reason: "MISSING" | "INVALID_SNAPSHOT" };

const PHASES = new Set<RunPhase>([
  "CHOOSING_SERVICE", "READY_TO_SPIN", "SPINNING", "AWAITING_INTERVENTION", "RESOLVING_EFFECTS",
  "CHOOSING_UPGRADE", "SHIFT_COMPLETE", "RUN_WON", "RUN_LOST", "AFTER_HOURS"
]);
const SYMBOLS = new Set<SymbolId>(["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"]);
const PARTS = new Set<PartId>([
  "lemon-infection", "jam-jar", "fruit-salad", "leftovers", "omen-collector", "triple-blessing",
  "midnight-bell", "martyr-coin", "scrap-magnet", "loose-spring", "blank-capacitor", "warranty-fraud",
  "overload-motor", "safety-fuse"
]);
const SERVICES = new Set(["repair", "kitchen", "chapel", "security"]);
const BET_MODES = new Set(["conservative", "normal", "aggressive"]);
const BASE_SYMBOLS = new Set(["cherry", "lemon", "bell", "seven"]);
const UPGRADES = new Set<string>(UPGRADE_IDS);
const EVENT_TYPES = new Set([
  "BET_PLACED", "REELS_DRAWN", "INTERVENTION_USED", "LINE_WIN", "PART_TRIGGERED", "PART_DISABLED",
  "FOOD_CONSUMED", "PAYOUT_ADDED", "SYMBOL_CHANGED", "RESOURCE_CHANGED", "SERVICE_USED",
  "CONTRACT_PROGRESS", "SPIN_COMMITTED", "BLOCK_COMPLETED", "OVERLOAD", "PAYOUT_COMPLETE",
  "SHIFT_CHANGED", "RUN_ENDED"
]);
const COMMAND_TYPES = new Set([
  "SELECT_SERVICE", "SET_BET_MODE", "BUY_FOOD", "PRAY", "ENABLE_MARTYR", "SPIN", "REELS_STOPPED",
  "RESPIN_REEL", "LOCK_AND_RESPIN_OTHERS", "KICK_REEL", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE",
  "CHOOSE_UPGRADE", "DECLINE_UPGRADE", "REMOVE_CRACKS", "REROLL_CANDIDATES", "CASH_OUT", "CONTINUE"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeMoney(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isReels(value: unknown, allowEmpty = false): value is ReelSet {
  return Array.isArray(value) && value.length === 3 && value.every((strip) =>
    Array.isArray(strip) && (allowEmpty || strip.length > 0) && strip.every((symbol) => SYMBOLS.has(symbol))
  );
}

function hasFiniteNumbersOnly(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasFiniteNumbersOnly);
  if (isRecord(value)) return Object.values(value).every(hasFiniteNumbersOnly);
  return true;
}

function isValidPartSlots(value: unknown): boolean {
  return Array.isArray(value) && value.length === 5 && value.every((part) =>
    part === null || (isRecord(part) && PARTS.has(part.id as PartId) && (part.level === 1 || part.level === 2))
  );
}

function recordHasNumbers(value: unknown, keys: readonly string[], money = false): boolean {
  return isRecord(value) && keys.every((key) => (money ? isSafeMoney(value[key]) : isFiniteNumber(value[key])));
}

function isValidEvents(value: unknown): boolean {
  return Array.isArray(value) && value.every((event) =>
    isRecord(event) && isSafeInteger(event.sequence) && (event.sequence as number) >= 1 &&
    typeof event.type === "string" && EVENT_TYPES.has(event.type) && hasFiniteNumbersOnly(event)
  );
}

function isValidCommands(value: unknown): boolean {
  return Array.isArray(value) && value.every((command) =>
    isRecord(command) && typeof command.type === "string" && COMMAND_TYPES.has(command.type) && hasFiniteNumbersOnly(command)
  );
}

function normalizeSnapshot(value: unknown): RunState | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !PHASES.has(value.phase as RunPhase)) return null;
  if (!hasFiniteNumbersOnly(value)) return null;
  if (!isRecord(value.rng) || !isSafeInteger(value.rng.value)) return null;
  if (!isSafeInteger(value.initialSeed) || !isSafeMoney(value.bankroll) || !isSafeMoney(value.baseBet) ||
      !isSafeMoney(value.shiftWager) || !isSafeMoney(value.shiftPayout) || value.checkoutTarget !== 200) return null;
  if (!["shift", "baseSpinsInShift", "interventionPoints", "maxInterventionPoints", "nextShiftFocusBonus",
    "freeSpinQueue", "tips", "agitation", "omen", "afterHoursLevel"].every((key) => isSafeInteger(value[key]))) return null;
  if (!BET_MODES.has(value.betMode as string) || (value.service !== null && !SERVICES.has(value.service as string)) ||
      (value.pendingPrayer !== null && !BASE_SYMBOLS.has(value.pendingPrayer as string))) return null;
  if (typeof value.interventionUsedThisSpin !== "boolean" || typeof value.exitUnlocked !== "boolean" ||
      ![0, 1, 2, 3].includes(value.toolLevel as number)) return null;
  if (!isReels(value.reels) || !isReels(value.temporaryReelAdditions, true) || !isValidPartSlots(value.partSlots)) return null;
  if (!isValidEvents(value.pendingEvents) || !isValidCommands(value.commandHistory)) return null;
  if (!Array.isArray(value.serviceCandidates) || value.serviceCandidates.length !== 3 ||
      !value.serviceCandidates.every((service) => SERVICES.has(service as string)) ||
      !Array.isArray(value.buffs) || !value.buffs.every(isRecord) ||
      !Array.isArray(value.acquiredUpgrades) || !value.acquiredUpgrades.every((id) => UPGRADES.has(id as string)) ||
      !Array.isArray(value.shiftHistory) || !value.shiftHistory.every(isRecord)) return null;
  if (!recordHasNumbers(value.counters, ["blankCharge", "cherryWinsThisShift"]) ||
      !recordHasNumbers(value.attribution, ["base", "part", "intervention", "service", "agitation", "overload"], true) ||
      !recordHasNumbers(value.expenses, ["wagers", "kitchen", "chapel", "repair"], true)) return null;
  const shiftFlags = value.shiftFlags;
  if (!isRecord(shiftFlags) || !["foodBought", "prayerUsed", "kickUsed", "repairLockUsed", "martyrEnabled", "warrantyPaid"]
    .every((key) => typeof shiftFlags[key] === "boolean") || !isSafeInteger(shiftFlags.returnedFoodCount)) return null;
  const currentCandidates = value.currentCandidates;
  if (currentCandidates !== null && (!isRecord(currentCandidates) ||
      !["synergy", "pivot", "wildcard"].every((key) => UPGRADES.has(currentCandidates[key] as string)))) return null;

  const requiresPendingSpin = value.phase === "SPINNING" || value.phase === "AWAITING_INTERVENTION" ||
    value.phase === "RESOLVING_EFFECTS";
  if (requiresPendingSpin && value.pendingSpin === null) return null;

  const snapshot = value as unknown as RunState;
  if (snapshot.pendingSpin === null) return snapshot;
  if (!isRecord(snapshot.pendingSpin) || typeof snapshot.pendingSpin.isFree !== "boolean" ||
      !isRecord(snapshot.pendingSpin.draw) || !isRecord(snapshot.pendingSpin.draw.rng) ||
      !isSafeInteger(snapshot.pendingSpin.draw.rng.value) || !isReels(snapshot.pendingSpin.draw.strips)) return null;

  return {
    ...snapshot,
    pendingSpin: { ...snapshot.pendingSpin, draw: normalizeDrawIdentity(snapshot.pendingSpin.draw) }
  };
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
