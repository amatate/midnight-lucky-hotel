import type { DispatchResult, GameCommand } from "@/core/commands";
import type { GameEventDraft, GameEvent } from "@/core/events";
import { getIntroShiftLimit } from "@/core/progression";
import type { CounterId, PartId, PartInstance, RunState, SymbolId, WorkbenchAddress, WorkbenchState } from "@/core/types";

type WorkbenchCommand = Extract<GameCommand, { type: "MOVE_PART" | "SWAP_REEL_SYMBOLS" | "SET_BUILD_NAME" }>;
const EMPTY_RESERVE: WorkbenchState["reserve"] = [null, null];

export function getReserveParts(state: RunState): WorkbenchState["reserve"] {
  return state.workbench?.reserve ?? EMPTY_RESERVE;
}

export function canEditWorkbench(state: RunState): boolean {
  if (state.service === null || state.pendingSpin !== null || state.freeSpinQueue > 0) return false;
  return state.phase === "CHOOSING_UPGRADE" || state.phase === "SHIFT_COMPLETE" || state.phase === "AFTER_HOURS"
    || state.phase === "READY_TO_SPIN" && state.baseSpinsInShift === 0;
}

/** Editing at a break uses the NEXT block's allowance, not an extra allowance before it. */
export function getWorkbenchStamp(state: RunState): string {
  if (state.phase === "READY_TO_SPIN") return `${state.shift}:${state.afterHoursLevel}`;
  return state.afterHoursLevel === 0 && state.shift < getIntroShiftLimit(state)
    ? `${state.shift + 1}:0` : `${state.shift}:${state.afterHoursLevel + 1}`;
}

export function canEditReel(state: RunState): boolean {
  return canEditWorkbench(state) && state.workbench?.reelEditStamp !== getWorkbenchStamp(state);
}

export function isWorkbenchAddress(value: unknown): value is WorkbenchAddress {
  if (value === null || typeof value !== "object") return false;
  const address = value as WorkbenchAddress;
  return (address.area === "machine" || address.area === "reserve") && Number.isInteger(address.slot)
    && address.slot >= 0 && address.slot < (address.area === "machine" ? 5 : 2);
}

export function validBuildName(name: unknown): name is string {
  return typeof name === "string" && name.length > 0 && name.length <= 32 && name.trim() === name
    && !/[\u0000-\u001f\u007f]/u.test(name);
}

/** Charges belong to installed hardware; shelving it cannot bank a second independent copy. */
export function clearedPartCounters(state: RunState, removed: readonly PartId[]): { counters: RunState["counters"]; resetCounters: CounterId[] } {
  const counters = { ...state.counters };
  const resetCounters: CounterId[] = [];
  const keys: Partial<Record<PartId, CounterId>> = {
    "harvest-vat": "harvestCharge", "votive-candle": "votiveCharge",
    "blank-capacitor": "blankCharge", "jam-jar": "cherryWinsThisShift"
  };
  for (const id of removed) {
    const key = keys[id];
    if (key !== undefined && (counters[key] ?? 0) > 0) { counters[key] = 0; resetCounters.push(key); }
  }
  return { counters, resetCounters };
}

function reject(state: RunState, code: "INVALID_PHASE" | "INVALID_TARGET" | "RESOURCE_EXHAUSTED", message: string): DispatchResult {
  return { ok: false, state, error: { code, message } };
}

function accept(state: RunState, command: WorkbenchCommand, patch: Partial<RunState>, event: GameEventDraft): DispatchResult {
  const recorded = { ...event, sequence: state.pendingEvents.length + 1 } as GameEvent;
  return { ok: true, events: [recorded], state: { ...state, ...patch,
    commandHistory: [...state.commandHistory, command], pendingEvents: [...state.pendingEvents, recorded] } };
}

export function applyWorkbenchCommand(state: RunState, command: WorkbenchCommand): DispatchResult {
  if (!canEditWorkbench(state)) return reject(state, "INVALID_PHASE", "请在回合休息时，或下一回合第一转之前改装；免费转须先结算。");
  const workbench: WorkbenchState = state.workbench ?? { reserve: EMPTY_RESERVE, name: "" };
  if (command.type === "SET_BUILD_NAME") {
    if (typeof command.name !== "string" || command.name.length > 32) return reject(state, "INVALID_TARGET", "机台名称需要 1–32 个字符。");
    const name = command.name.trim();
    if (!validBuildName(name)) return reject(state, "INVALID_TARGET", "机台名称需要 1–32 个字符，不能包含控制字符。");
    return accept(state, command, { workbench: { ...workbench, name } }, { type: "BUILD_NAMED", name });
  }
  if (command.type === "SWAP_REEL_SYMBOLS") {
    if (!canEditReel(state)) return reject(state, "RESOURCE_EXHAUSTED", "本回合已经编排过转轮；下一回合可再次调整。");
    const { reelIndex, firstIndex, secondIndex } = command;
    if (![0, 1, 2].includes(reelIndex) || !Number.isInteger(firstIndex) || !Number.isInteger(secondIndex)
      || firstIndex < 0 || secondIndex < 0 || firstIndex === secondIndex) return reject(state, "INVALID_TARGET", "请选择同一转轮上的两个不同格子。");
    const strip = state.reels[reelIndex];
    const firstSymbol = strip[firstIndex]; const secondSymbol = strip[secondIndex];
    if (firstSymbol === undefined || secondSymbol === undefined || firstSymbol === secondSymbol) {
      return reject(state, "INVALID_TARGET", "两格必须存在且图案不同；未使用本回合编排次数。");
    }
    const reels: [SymbolId[], SymbolId[], SymbolId[]] = state.reels.map((reel) => [...reel]) as [SymbolId[], SymbolId[], SymbolId[]];
    reels[reelIndex][firstIndex] = secondSymbol; reels[reelIndex][secondIndex] = firstSymbol;
    return accept(state, command, { reels, workbench: { ...workbench, reelEditStamp: getWorkbenchStamp(state) } },
      { type: "REEL_SYMBOLS_SWAPPED", reelIndex, firstIndex, secondIndex, firstSymbol, secondSymbol });
  }
  const { from, to } = command;
  if (!isWorkbenchAddress(from) || !isWorkbenchAddress(to) || from.area === to.area && from.slot === to.slot) {
    return reject(state, "INVALID_TARGET", "请选择两个不同的有效槽位。");
  }
  const machine = [...state.partSlots]; const reserve = [...getReserveParts(state)];
  const source = from.area === "machine" ? machine : reserve;
  const destination = to.area === "machine" ? machine : reserve;
  const fromPart = source[from.slot] ?? null; const toPart = destination[to.slot] ?? null;
  if (fromPart === null && toPart === null) return reject(state, "INVALID_TARGET", "两个空槽无需交换。");
  source[from.slot] = toPart; destination[to.slot] = fromPart;
  const removed: PartId[] = [];
  if (from.area !== to.area) {
    const shelved = from.area === "machine" ? fromPart : toPart;
    if (shelved !== null) removed.push(shelved.id);
  }
  const { counters, resetCounters } = clearedPartCounters(state, removed);
  return accept(state, command, {
    partSlots: machine as unknown as RunState["partSlots"], counters,
    workbench: { ...workbench, reserve: reserve as [PartInstance | null, PartInstance | null] }
  }, { type: "PARTS_MOVED", from, to, resetCounters });
}
