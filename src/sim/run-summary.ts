import { UPGRADES, UPGRADE_IDS } from "@/content/upgrades";
import { getDominantRoute } from "@/core/candidates";
import type { AttributionSource, ExpenseSource, RunState, UpgradeId } from "@/core/types";
import type { MachineEstimate, RunSummaryData } from "@/sim/types";

const ATTRIBUTION_SOURCES = [
  "base",
  "part",
  "intervention",
  "service",
  "agitation",
  "overload"
] as const satisfies readonly AttributionSource[];
const EXPENSE_SOURCES = ["wagers", "kitchen", "chapel", "repair"] as const satisfies readonly ExpenseSource[];

const INCOME_LABELS = {
  base: "基础赔付",
  part: "机器部件",
  intervention: "干预",
  service: "服务",
  agitation: "躁动加成",
  overload: "过载"
} as const satisfies Readonly<Record<AttributionSource, string>>;
const EXPENSE_LABELS = {
  wagers: "下注",
  kitchen: "厨房",
  chapel: "教堂",
  repair: "维修"
} as const satisfies Readonly<Record<ExpenseSource, string>>;

function largestSource<T extends string>(sources: readonly T[], values: Readonly<Record<T, number>>): T {
  return sources.reduce((largest, source) => values[source] > values[largest] ? source : largest, sources[0]!);
}

function incompleteSynergy(state: RunState): UpgradeId | null {
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

function hasHighPositiveRisk(trajectory: readonly MachineEstimate[]): boolean {
  const latest = [...trajectory].reverse().find(
    (estimate) => estimate.rtpMean !== null && estimate.ruinProbability !== null
  );
  return latest !== undefined && latest.rtpMean! > 1 && latest.ruinProbability! > 0.25;
}

export function buildRunSummary(
  state: RunState,
  trajectory: readonly MachineEstimate[]
): RunSummaryData {
  const largestIncomeSource = largestSource(ATTRIBUTION_SOURCES, state.attribution);
  const largestExpenseSource = largestSource(EXPENSE_SOURCES, state.expenses);
  return {
    rtpTrajectory: [...trajectory],
    largestIncomeSource,
    largestExpenseSource,
    incompleteSynergy: incompleteSynergy(state),
    explanation: hasHighPositiveRisk(trajectory)
      ? "机器具有正期望，但当前本金下仍有较高破产风险。"
      : `主要收入来自${INCOME_LABELS[largestIncomeSource]}，主要支出是${EXPENSE_LABELS[largestExpenseSource]}。`
  };
}
