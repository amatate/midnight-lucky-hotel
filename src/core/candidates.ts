import { UPGRADES, UPGRADE_IDS } from "@/content/upgrades";
import { nextInt } from "@/core/random";
import type {
  CandidateResult,
  CandidateRole,
  PartId,
  RunState,
  UpgradeId,
  UpgradeRoute
} from "@/core/types";

type ConstructRoute = Exclude<UpgradeRoute, "information">;

const CONSTRUCT_ROUTES = ["fruit", "chapel", "violent", "neutral"] as const satisfies readonly ConstructRoute[];
const SERVICE_ROUTE = {
  kitchen: "fruit",
  chapel: "chapel",
  security: "violent",
  repair: "neutral"
} as const satisfies Readonly<Record<NonNullable<RunState["service"]>, ConstructRoute>>;

function emptyRouteCounts(): Record<ConstructRoute, number> {
  return { fruit: 0, chapel: 0, violent: 0, neutral: 0 };
}

/** Counts only acquisitions that permanently changed a reel; repeated modifications count repeatedly. */
export function countPermanentReelModifications(state: RunState): Readonly<Record<ConstructRoute, number>> {
  const counts = emptyRouteCounts();
  for (const id of state.acquiredUpgrades) {
    const definition = UPGRADES[id];
    if (definition.kind === "reel-mod") {
      counts[definition.route] += 1;
    }
  }
  return counts;
}

export function getDominantRoute(state: RunState): ConstructRoute {
  const scores = { ...countPermanentReelModifications(state) };
  for (const part of state.partSlots) {
    if (part === null) continue;
    const route = UPGRADES[part.id].route;
    scores[route] += 1;
  }

  const highest = Math.max(...CONSTRUCT_ROUTES.map((route) => scores[route]));
  const tied = CONSTRUCT_ROUTES.filter((route) => scores[route] === highest);
  const serviceRoute = state.service === null ? "neutral" : SERVICE_ROUTE[state.service];
  return tied.includes(serviceRoute) ? serviceRoute : tied[0]!;
}

function isLevelTwoPart(state: RunState, id: UpgradeId): boolean {
  return state.partSlots.some((part) => part?.id === (id as PartId) && part.level === 2);
}

function eligibleIds(state: RunState): readonly UpgradeId[] {
  return UPGRADE_IDS.filter((id) => {
    const definition = UPGRADES[id];
    return definition.requires(state) && !(definition.kind === "part" && isLevelTwoPart(state, id));
  });
}

function acquiredTags(state: RunState): ReadonlySet<string> {
  return new Set(state.acquiredUpgrades.flatMap((id) => [...UPGRADES[id].tags]));
}

function carriesRole(id: UpgradeId, role: CandidateRole): boolean {
  return (UPGRADES[id].candidateRoles as readonly CandidateRole[]).includes(role);
}

function preferredRolePool(
  eligible: readonly UpgradeId[],
  role: CandidateRole,
  preferred: (id: UpgradeId) => boolean
): { readonly preferred: readonly UpgradeId[]; readonly fallback: readonly UpgradeId[] } {
  const available = eligible.filter((id) => carriesRole(id, role));
  const preferredPool = available.filter(preferred);
  return {
    preferred: preferredPool,
    fallback: available.filter((id) => !preferredPool.includes(id))
  };
}

function rotate<T>(values: readonly T[], offset: number): readonly T[] {
  if (values.length < 2) return [...values];
  const start = offset % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

function seededRoleOrder(
  state: RunState,
  eligible: readonly UpgradeId[],
  role: CandidateRole,
  preferred: (id: UpgradeId) => boolean
): { readonly ids: readonly UpgradeId[]; readonly rng: RunState["rng"] } {
  const pool = preferredRolePool(eligible, role, preferred);
  const randomPool = pool.preferred.length > 0 ? pool.preferred : pool.fallback;
  if (randomPool.length === 0) throw new Error(`no legal ${role} upgrade is available`);
  const selected = nextInt(state.rng, randomPool.length);
  const preferredOrder = pool.preferred.length > 0 ? rotate(pool.preferred, selected.value) : [];
  const fallbackOrder = rotate(pool.fallback, selected.value);
  return { ids: [...preferredOrder, ...fallbackOrder], rng: selected.rng };
}

/** Finds a unique role assignment, backtracking over seeded preference orders when necessary. */
export function assignCandidateRoles(state: RunState, eligible: readonly UpgradeId[]): CandidateResult {
  const dominantRoute = getDominantRoute(state);
  const tags = acquiredTags(state);
  const synergy = seededRoleOrder(
    state,
    eligible,
    "synergy",
    (id) => UPGRADES[id].route === dominantRoute || UPGRADES[id].tags.some((tag) => tags.has(tag))
  );
  const pivotState = { ...state, rng: synergy.rng };
  const pivot = seededRoleOrder(
    pivotState,
    eligible,
    "pivot",
    (id) => UPGRADES[id].route !== dominantRoute
  );
  const wildcardState = { ...state, rng: pivot.rng };
  const wildcard = seededRoleOrder(wildcardState, eligible, "wildcard", () => true);

  for (const synergyId of synergy.ids) {
    for (const pivotId of pivot.ids) {
      if (pivotId === synergyId) continue;
      const wildcardId = wildcard.ids.find((id) => id !== synergyId && id !== pivotId);
      if (wildcardId !== undefined) {
        return {
          candidates: { synergy: synergyId, pivot: pivotId, wildcard: wildcardId },
          rng: wildcard.rng
        };
      }
    }
  }

  throw new Error("no legal unique synergy/pivot/wildcard upgrade assignment exists");
}

/** Generates role-ordered construction choices without mutating the run. */
export function generateCandidates(state: RunState): CandidateResult {
  return assignCandidateRoles(state, eligibleIds(state));
}
