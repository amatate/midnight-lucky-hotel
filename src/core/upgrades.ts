import { copyBaseSymbol, isBaseSymbol, pruneOneSymbol } from "@/content/effects/neutral";
import { UPGRADES } from "@/content/upgrades";
import type { DispatchResult, GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { roundMoney } from "@/core/progression";
import type {
  PartId,
  ReelIndex,
  ReelSet,
  RunState,
  ShiftFlags,
  SymbolId,
  UpgradeChoice,
  UpgradeId,
  UpgradeTarget
} from "@/core/types";

const EMPTY_SHIFT_FLAGS: ShiftFlags = {
  foodBought: false,
  prayerUsed: false,
  kickUsed: false,
  repairLockUsed: false,
  martyrEnabled: false,
  warrantyPaid: false,
  returnedFoodCount: 0
};

function rejected(
  state: RunState,
  code: "INVALID_PHASE" | "INVALID_TARGET" | "RESOURCE_EXHAUSTED",
  message: string
): DispatchResult {
  return { ok: false, state, error: { code, message } };
}

function isReelIndex(value: unknown): value is ReelIndex {
  return value === 0 || value === 1 || value === 2;
}

function cloneReels(reels: ReelSet): [SymbolId[], SymbolId[], SymbolId[]] {
  return [[...reels[0]], [...reels[1]], [...reels[2]]];
}

function appendToReel(reels: ReelSet, reel: ReelIndex, symbol: SymbolId, count = 1): ReelSet {
  const next = cloneReels(reels);
  for (let index = 0; index < count; index += 1) next[reel].push(symbol);
  return next;
}

function replaceFirstSymbol(reels: ReelSet, reel: ReelIndex, from: SymbolId, to: SymbolId): ReelSet | null {
  const index = reels[reel].indexOf(from);
  if (index < 0) return null;
  const next = cloneReels(reels);
  next[reel].splice(index, 1);
  next[reel].push(to);
  return next;
}

function reelTarget(target: UpgradeTarget | undefined): target is Extract<UpgradeTarget, { kind: "reel" }> {
  return target?.kind === "reel" && isReelIndex(target.reel);
}

function symbolTarget(
  target: UpgradeTarget | undefined
): target is Extract<UpgradeTarget, { kind: "symbol-on-reel" }> {
  return (
    target?.kind === "symbol-on-reel" &&
    isReelIndex(target.reel) &&
    (target as { readonly symbol: SymbolId }).symbol !== "wild"
  );
}

function acquireReelModification(state: RunState, id: UpgradeId, target: UpgradeTarget | undefined): DispatchResult | RunState {
  switch (id) {
    case "lemon-crate": {
      if (
        target?.kind !== "two-reels" ||
        !isReelIndex(target.reels[0]) ||
        !isReelIndex(target.reels[1]) ||
        target.reels[0] === target.reels[1]
      ) {
        return rejected(state, "INVALID_TARGET", "lemon-crate requires two distinct reels");
      }
      let reels = appendToReel(state.reels, target.reels[0], "lemon", 2);
      reels = appendToReel(reels, target.reels[1], "lemon", 2);
      return { ...state, reels };
    }
    case "cherry-pitter": {
      if (!symbolTarget(target) || target.symbol === "cherry") {
        return rejected(state, "INVALID_TARGET", "cherry-pitter requires a non-cherry, non-wild symbol");
      }
      const reels = replaceFirstSymbol(state.reels, target.reel, target.symbol, "cherry");
      return reels === null
        ? rejected(state, "INVALID_TARGET", "selected symbol is not present on the reel")
        : { ...state, reels };
    }
    case "seven-purification": {
      if (!symbolTarget(target) || (target.symbol !== "cherry" && target.symbol !== "lemon")) {
        return rejected(state, "INVALID_TARGET", "seven-purification requires a cherry or lemon");
      }
      const reels = replaceFirstSymbol(state.reels, target.reel, target.symbol, "seven");
      return reels === null
        ? rejected(state, "INVALID_TARGET", "selected symbol is not present on the reel")
        : { ...state, reels };
    }
    case "tithe-box":
      if (!reelTarget(target)) return rejected(state, "INVALID_TARGET", "tithe-box requires one reel");
      return {
        ...state,
        reels: appendToReel(state.reels, target.reel, "seven"),
        bankroll: roundMoney(state.bankroll - 10),
        omen: state.omen + 1
      };
    case "artificial-crack":
      if (!reelTarget(target)) return rejected(state, "INVALID_TARGET", "artificial-crack requires one reel");
      return {
        ...state,
        reels: appendToReel(state.reels, target.reel, "crack"),
        nextShiftFocusBonus: state.nextShiftFocusBonus + 1
      };
    case "pruning-shears": {
      if (!symbolTarget(target)) {
        return rejected(state, "INVALID_TARGET", "pruning-shears requires a non-wild symbol on one reel");
      }
      if (state.reels[target.reel].length <= 6) {
        return rejected(state, "INVALID_TARGET", "pruning-shears cannot reduce a reel below six symbols");
      }
      const reels = pruneOneSymbol(state.reels, target.reel, target.symbol);
      return reels === null
        ? rejected(state, "INVALID_TARGET", "selected symbol is not present on the reel")
        : { ...state, reels };
    }
    case "carbon-copy":
      if (!symbolTarget(target) || !isBaseSymbol(target.symbol)) {
        return rejected(state, "INVALID_TARGET", "carbon-copy only copies base symbols");
      }
      return { ...state, reels: copyBaseSymbol(state.reels, target.reel, target.symbol) };
    default:
      return rejected(state, "INVALID_TARGET", "upgrade is not a reel modification");
  }
}

function acquirePart(state: RunState, id: PartId): DispatchResult | RunState {
  const existingSlot = state.partSlots.findIndex((part) => part?.id === id);
  if (existingSlot >= 0) {
    const existing = state.partSlots[existingSlot]!;
    if (existing.level === 2) return rejected(state, "RESOURCE_EXHAUSTED", "part is already level two");
    const partSlots = state.partSlots.map((part, slot) =>
      slot === existingSlot ? { id, level: 2 as const } : part
    ) as unknown as RunState["partSlots"];
    return { ...state, partSlots };
  }

  const emptySlot = state.partSlots.findIndex((part) => part === null);
  if (emptySlot < 0) return rejected(state, "RESOURCE_EXHAUSTED", "part inventory is full");
  const partSlots = state.partSlots.map((part, slot) =>
    slot === emptySlot ? { id, level: 1 as const } : part
  ) as unknown as RunState["partSlots"];
  return { ...state, partSlots };
}

function replacePart(state: RunState, id: PartId, replaceSlot: number): DispatchResult | RunState {
  if (!Number.isInteger(replaceSlot) || replaceSlot < 0 || replaceSlot >= state.partSlots.length) {
    return rejected(state, "INVALID_TARGET", "replace slot must be between zero and four");
  }
  if (state.partSlots.some((part) => part === null)) {
    return rejected(state, "INVALID_TARGET", "replacement requires a full part inventory");
  }
  if (state.partSlots.some((part) => part?.id === id)) {
    return rejected(state, "INVALID_TARGET", "duplicate part must be upgraded in place");
  }
  const partSlots = state.partSlots.map((part, slot) =>
    slot === replaceSlot ? { id, level: 1 as const } : part
  ) as unknown as RunState["partSlots"];
  return { ...state, partSlots };
}

function acquireTool(state: RunState, id: UpgradeId): DispatchResult | RunState {
  const level = id === "calculator" ? 1 : id === "ledger" ? 2 : id === "statistics-terminal" ? 3 : null;
  return level === null
    ? rejected(state, "INVALID_TARGET", "upgrade is not an information tool")
    : { ...state, toolLevel: level };
}

function advanceShift(original: RunState, acquired: RunState, choice: UpgradeChoice, didAcquire: boolean): DispatchResult {
  const command = { type: "CHOOSE_UPGRADE", choice } as const satisfies GameCommand;
  const event = {
    sequence: original.pendingEvents.length + 1,
    type: "SHIFT_CHANGED",
    shift: original.shift + 1
  } as const satisfies GameEvent;
  const baseMaximum = acquired.service === "repair" ? 3 : 2;
  const nextMaximum = baseMaximum + acquired.nextShiftFocusBonus;
  const snapshot = {
    shift: original.shift,
    bankroll: original.bankroll,
    reels: cloneReels(original.reels),
    parts: original.partSlots.filter((part) => part !== null),
    totalWager: original.shiftWager,
    totalPayout: original.shiftPayout
  } as const;

  return {
    ok: true,
    events: [event],
    state: {
      ...acquired,
      phase: "READY_TO_SPIN",
      shift: original.shift + 1,
      baseSpinsInShift: 0,
      shiftWager: 0,
      shiftPayout: 0,
      interventionPoints: nextMaximum,
      maxInterventionPoints: nextMaximum,
      nextShiftFocusBonus: 0,
      interventionUsedThisSpin: false,
      temporaryReelAdditions: [[], [], []],
      pendingSpin: null,
      currentCandidates: null,
      counters: { ...acquired.counters, cherryWinsThisShift: 0 },
      shiftFlags: { ...EMPTY_SHIFT_FLAGS },
      acquiredUpgrades: didAcquire ? [...acquired.acquiredUpgrades, choice.id] : acquired.acquiredUpgrades,
      shiftHistory: [...acquired.shiftHistory, snapshot],
      pendingEvents: [...original.pendingEvents, event],
      commandHistory: [...original.commandHistory, command]
    }
  };
}

/** Applies one offered upgrade choice and starts the next shift atomically. */
export function applyUpgrade(state: RunState, choice: UpgradeChoice): DispatchResult {
  if (state.phase !== "CHOOSING_UPGRADE") {
    return rejected(state, "INVALID_PHASE", `CHOOSE_UPGRADE is invalid during ${state.phase}`);
  }
  if (state.currentCandidates === null || !Object.values(state.currentCandidates).includes(choice.id)) {
    return rejected(state, "INVALID_TARGET", "upgrade is not a current candidate");
  }

  if (choice.action === "decline") {
    return advanceShift(state, { ...state, tips: state.tips + 1 }, choice, false);
  }

  const definition = UPGRADES[choice.id];
  if (!definition.requires(state)) {
    return rejected(state, "INVALID_TARGET", "upgrade prerequisites are not met");
  }

  let acquired: DispatchResult | RunState;
  if (choice.action === "replace") {
    if (definition.kind !== "part") {
      return rejected(state, "INVALID_TARGET", "only parts can replace an inventory slot");
    }
    acquired = replacePart(state, choice.id as PartId, choice.replaceSlot);
  } else if (definition.kind === "reel-mod") {
    acquired = acquireReelModification(state, choice.id, choice.target);
  } else {
    if (choice.target !== undefined) {
      return rejected(state, "INVALID_TARGET", "this upgrade does not accept a reel target");
    }
    acquired = definition.kind === "part" ? acquirePart(state, choice.id as PartId) : acquireTool(state, choice.id);
  }

  if ("ok" in acquired) return acquired;
  return advanceShift(state, acquired, choice, true);
}
