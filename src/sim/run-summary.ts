import { UPGRADES, UPGRADE_IDS } from "@/content/upgrades";
import { getDominantRoute } from "@/core/candidates";
import { safeMoney } from "@/core/money";
import type { AttributionSource, RunState, UpgradeId } from "@/core/types";
import type { MachineEstimate, RunSummaryData } from "@/sim/types";

const ATTRIBUTION_SOURCES = [
  "base",
  "part",
  "intervention",
  "service",
  "agitation",
  "overload"
] as const satisfies readonly AttributionSource[];
function buildSuggestion(state: RunState): UpgradeId | null {
  const dominantRoute = getDominantRoute(state);
  const equippedIds = new Set(state.partSlots.flatMap((part) => part === null ? [] : [part.id]));
  const ownedIds = new Set<UpgradeId>([...state.acquiredUpgrades, ...equippedIds]);
  const activeIds = new Set<UpgradeId>([...state.acquiredUpgrades, ...equippedIds]);
  const activeTags = new Set([...activeIds].flatMap((id) => [...UPGRADES[id].tags]));

  let selected: UpgradeId | null = null;
  let selectedOverlap = -1;
  for (const id of UPGRADE_IDS) {
    const definition = UPGRADES[id];
    if (definition.route !== dominantRoute || ownedIds.has(id) || !definition.requires(state)) continue;
    if (definition.kind === "part" && state.partSlots.some((part) => part?.id === id && part.level === 2)) continue;
    const overlap = definition.tags.filter((tag) => activeTags.has(tag)).length;
    if (overlap > selectedOverlap) {
      selected = id;
      selectedOverlap = overlap;
    }
  }
  return selected;
}

export function buildRunSummary(
  state: RunState,
  trajectory: readonly MachineEstimate[]
): RunSummaryData {
  const totalPayout = ATTRIBUTION_SOURCES.reduce(
    (total, source) => safeMoney(total + state.attribution[source]),
    0
  );
  const largestIncomeSource = ATTRIBUTION_SOURCES.reduce(
    (largest, source) => state.attribution[source] > state.attribution[largest] ? source : largest,
    ATTRIBUTION_SOURCES[0]
  );
  const largestIncome = state.attribution[largestIncomeSource] > 0
    ? { source: largestIncomeSource, amount: state.attribution[largestIncomeSource] }
    : null;
  const currentRtp = state.toolLevel >= 2
    ? [...trajectory].toReversed().map((estimate) => estimate.rtpMean).find((value): value is number => value !== null) ?? null
    : null;
  return {
    totalWager: state.expenses.wagers,
    totalPayout,
    bankrollDelta: safeMoney(state.bankroll - 100),
    largestIncome,
    buildSuggestion: buildSuggestion(state),
    currentRtp
  };
}
