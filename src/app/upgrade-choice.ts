import { UPGRADES } from "@/content/upgrades";
import type { ReelIndex, RunState, SymbolId, UpgradeChoice, UpgradeId } from "@/core/types";

const BASE_SYMBOLS = new Set<SymbolId>(["cherry", "lemon", "bell", "seven"]);

export interface UpgradeSymbolTarget {
  readonly reel: ReelIndex;
  readonly symbol: Exclude<SymbolId, "wild">;
}

export interface UpgradeTargetSelection {
  readonly reel: ReelIndex;
  readonly secondReel: ReelIndex;
  readonly symbolTarget: UpgradeSymbolTarget | undefined;
  readonly replaceSlot: number;
}

export function upgradeSymbolTargets(state: RunState, id: UpgradeId): readonly UpgradeSymbolTarget[] {
  const targets: UpgradeSymbolTarget[] = [];
  state.reels.forEach((strip, reelNumber) => {
    const reel = reelNumber as ReelIndex;
    if (id === "pruning-shears" && strip.length <= 6) return;
    [...new Set(strip)].forEach((symbol) => {
      if (symbol === "wild") return;
      const allowed = id === "cherry-pitter"
        ? symbol !== "cherry"
        : id === "seven-purification"
          ? symbol === "cherry" || symbol === "lemon"
          : id === "carbon-copy"
            ? BASE_SYMBOLS.has(symbol)
            : id === "pruning-shears";
      if (allowed) targets.push({ reel, symbol });
    });
  });
  return targets;
}

export function needsUpgradeSymbolTarget(id: UpgradeId): boolean {
  return id === "cherry-pitter" || id === "seven-purification" || id === "pruning-shears" || id === "carbon-copy";
}

export function needsUpgradeReelTarget(id: UpgradeId): boolean {
  return id === "tithe-box" || id === "artificial-crack";
}

function isCurrentLegalOffer(state: RunState, id: UpgradeId): boolean {
  if (state.currentCandidates === null || !Object.values(state.currentCandidates).includes(id)) return false;
  if (!UPGRADES[id].requires(state)) return false;
  return !(UPGRADES[id].kind === "part" && state.partSlots.some((part) => part?.id === id && part.level === 2));
}

export function buildUpgradeChoice(
  state: RunState,
  id: UpgradeId,
  selection: UpgradeTargetSelection
): UpgradeChoice | null {
  if (!isCurrentLegalOffer(state, id)) return null;
  const definition = UPGRADES[id];
  if (definition.kind === "part") {
    const alreadyOwned = state.partSlots.some((part) => part?.id === id);
    const inventoryFull = state.partSlots.every((part) => part !== null);
    return inventoryFull && !alreadyOwned
      ? { id, action: "replace", replaceSlot: selection.replaceSlot }
      : { id, action: "apply" };
  }
  if (id === "lemon-crate") {
    return selection.reel === selection.secondReel
      ? null
      : { id, action: "apply", target: { kind: "two-reels", reels: [selection.reel, selection.secondReel] } };
  }
  if (needsUpgradeSymbolTarget(id)) {
    return selection.symbolTarget === undefined
      ? null
      : {
          id,
          action: "apply",
          target: {
            kind: "symbol-on-reel",
            reel: selection.symbolTarget.reel,
            symbol: selection.symbolTarget.symbol
          }
        };
  }
  if (needsUpgradeReelTarget(id)) {
    return { id, action: "apply", target: { kind: "reel", reel: selection.reel } };
  }
  return { id, action: "apply" };
}

/** Returns the first valid, visibly presentable target choice for a current legal offer. */
export function buildDefaultUpgradeChoice(state: RunState, id: UpgradeId): UpgradeChoice | null {
  return buildUpgradeChoice(state, id, {
    reel: 0,
    secondReel: 1,
    symbolTarget: upgradeSymbolTargets(state, id)[0],
    replaceSlot: 0
  });
}
