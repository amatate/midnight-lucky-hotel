import { UPGRADES, UPGRADE_IDS } from "@/content/upgrades";
import { getDominantRoute } from "@/core/candidates";
import { safeMoney } from "@/core/money";
import { roundMoney } from "@/core/progression";
import type { AttributionSource, PartId, RunState, UpgradeId } from "@/core/types";
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
    // Report suggestions should not advertise a branch-destroying pivot as synergy.
    if (id === "lemon-infection" && ["fruit-salad", "jam-jar", "cherry-press"].some((part) => equippedIds.has(part as PartId))) continue;
    if (equippedIds.has("lemon-infection") && ["fruit-salad", "salad-dressing", "jam-jar", "cherry-press"].includes(id)) continue;
    if (id === "safety-fuse" && state.hotel?.challenge?.status === "failed" && state.bankroll >= 150) continue;
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
  const last = state.shiftHistory.at(-1);
  const hasClosingSnapshot = last?.shift === state.shift && (last.afterHoursLevel ?? 0) === state.afterHoursLevel;
  const end = hasClosingSnapshot ? last.bankroll : state.bankroll;
  const start = state.blockStartBankroll;
  // An old checkpoint without a closing snapshot cannot separate later purchases reliably.
  const block = start === undefined || (!hasClosingSnapshot && state.workshop?.status === "finished") ? null : {
    start, end, payout: state.shiftPayout, wager: state.shiftWager,
    otherCosts: roundMoney(start + state.shiftPayout - state.shiftWager - end),
    net: roundMoney(end - start), afterBlockCosts: roundMoney(end - state.bankroll)
  };
  const parts = new Map<PartId, { id: PartId; amount: number; payingSpins: number }>();
  for (const receipt of state.spinHistory) {
    const paid = new Set<PartId>();
    for (const award of receipt.awards) {
      if (award.kind !== "part-bonus" && award.kind !== "pattern-line") continue;
      const item = parts.get(award.partId) ?? { id: award.partId, amount: 0, payingSpins: 0 };
      item.amount = roundMoney(item.amount + award.amount);
      if (!paid.has(award.partId)) item.payingSpins++;
      paid.add(award.partId); parts.set(award.partId, item);
    }
  }
  return {
    totalWager: state.expenses.wagers,
    totalPayout,
    bankrollDelta: safeMoney(state.bankroll - 100),
    serviceExpenses: roundMoney(state.expenses.kitchen + state.expenses.chapel + state.expenses.repair),
    workshopExpenses: state.expenses.workshop ?? 0,
    block,
    partContributions: [...parts.values()].sort((a, b) => b.amount - a.amount),
    largestIncome,
    buildSuggestion: buildSuggestion(state),
    currentRtp
  };
}
