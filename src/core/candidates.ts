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

function rolePool(
  eligible: readonly UpgradeId[],
  excluded: ReadonlySet<UpgradeId>,
  role: CandidateRole,
  preferred: (id: UpgradeId) => boolean
): readonly UpgradeId[] {
  const available = eligible.filter((id) => !excluded.has(id) && carriesRole(id, role));
  const preferredPool = available.filter(preferred);
  return preferredPool.length > 0 ? preferredPool : available;
}

function chooseFromRole(
  state: RunState,
  eligible: readonly UpgradeId[],
  excluded: ReadonlySet<UpgradeId>,
  role: CandidateRole,
  preferred: (id: UpgradeId) => boolean
): { readonly id: UpgradeId; readonly rng: RunState["rng"] } {
  const pool = rolePool(eligible, excluded, role, preferred);
  if (pool.length === 0) throw new Error(`no legal ${role} upgrade is available`);
  const selected = nextInt(state.rng, pool.length);
  return { id: pool[selected.value]!, rng: selected.rng };
}

/** Generates role-ordered construction choices without mutating the run. */
export function generateCandidates(state: RunState): CandidateResult {
  const dominantRoute = getDominantRoute(state);
  const legal = eligibleIds(state);
  const tags = acquiredTags(state);
  const chosen = new Set<UpgradeId>();

  const synergy = chooseFromRole(
    state,
    legal,
    chosen,
    "synergy",
    (id) => UPGRADES[id].route === dominantRoute || UPGRADES[id].tags.some((tag) => tags.has(tag))
  );
  chosen.add(synergy.id);

  const pivotState = { ...state, rng: synergy.rng };
  const pivot = chooseFromRole(
    pivotState,
    legal,
    chosen,
    "pivot",
    (id) => UPGRADES[id].route !== dominantRoute
  );
  chosen.add(pivot.id);

  const wildcardState = { ...state, rng: pivot.rng };
  const wildcard = chooseFromRole(wildcardState, legal, chosen, "wildcard", () => true);

  return {
    candidates: { synergy: synergy.id, pivot: pivot.id, wildcard: wildcard.id },
    rng: wildcard.rng
  };
}
