import { UPGRADES } from "@/content/upgrades";
import { dispatchCommand } from "@/core/run";
import type { ReelIndex, RunState, SymbolId, UpgradeChoice } from "@/core/types";

export interface PreviewCell { readonly symbol: SymbolId; readonly change: "unchanged" | "removed" | "added" }
export interface ReelChange { readonly reel: ReelIndex; readonly before: readonly PreviewCell[]; readonly after: readonly PreviewCell[] }

/** Run the real reducer on immutable state, but never commit its result or RNG. */
export function previewReelChanges(state: RunState, choice: UpgradeChoice): readonly ReelChange[] {
  if (UPGRADES[choice.id].kind !== "reel-mod" || choice.action !== "apply") return [];
  const result = dispatchCommand(state, { type: "CHOOSE_UPGRADE", choice });
  if (!result.ok) return [];
  return ([0, 1, 2] as const).flatMap((reel): ReelChange[] => {
    const before = state.reels[reel];
    const after = result.state.reels[reel];
    if (before.length === after.length && before.every((symbol, index) => symbol === after[index])) return [];
    // Current strip edits remove the first selected symbol and/or append new cells.
    // Do not align repeated symbols heuristically: the selected physical cell matters.
    const removes = ["cherry-pitter", "seven-purification", "pruning-shears"].includes(choice.id);
    const target = choice.target;
    const removedIndex = removes && target?.kind === "symbol-on-reel" && target.reel === reel
      ? before.indexOf(target.symbol) : -1;
    const retained = before.length - (removedIndex < 0 ? 0 : 1);
    return [{ reel,
      before: before.map((symbol, index) => ({ symbol, change: index === removedIndex ? "removed" : "unchanged" })),
      after: after.map((symbol, index) => ({ symbol, change: index >= retained ? "added" : "unchanged" }))
    }];
  });
}
