import { normalizeDrawIdentity } from "@/core/reels";
import { dispatchCommand } from "@/core/run";
import { createLegacyRun as createRun } from "./legacy-run";
import type { GameCommand } from "@/core/commands";
import type { Grid, ReelDraw, ReelSet, RunState, UpgradeChoice, UpgradeId } from "@/core/types";

function accepted(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error.code} ${result.error.message}`);
  return result.state;
}

function selectService(seed: number, service: NonNullable<RunState["service"]>): RunState {
  const initial = createRun(seed);
  return accepted(
    { ...initial, serviceCandidates: [service, ...(["repair", "kitchen", "chapel", "security"] as const)
      .filter((candidate) => candidate !== service).slice(0, 2)] as unknown as RunState["serviceCandidates"] },
    { type: "SELECT_SERVICE", serviceId: service }
  );
}

function upgradeChoice(id: UpgradeId): UpgradeChoice {
  switch (id) {
    case "lemon-crate": return { id, action: "apply", target: { kind: "two-reels", reels: [0, 1] } };
    case "seven-purification": return { id, action: "apply", target: { kind: "symbol-on-reel", reel: 0, symbol: "cherry" } };
    case "artificial-crack": return { id, action: "apply", target: { kind: "reel", reel: 0 } };
    default: return { id, action: "apply" };
  }
}

function acquire(state: RunState, id: UpgradeId): RunState {
  const boundary: RunState = {
    ...state,
    phase: "CHOOSING_UPGRADE",
    pendingSpin: null,
    currentCandidates: { synergy: id, pivot: "calculator", wildcard: "carbon-copy" }
  };
  return accepted(boundary, { type: "CHOOSE_UPGRADE", choice: upgradeChoice(id) });
}

function fixtureDraw(strips: ReelSet, stops: readonly [number, number, number]): ReelDraw {
  const grid = strips.map((strip, reel) => [
    strip[stops[reel]!]!,
    strip[(stops[reel]! + 1) % strip.length]!,
    strip[(stops[reel]! + 2) % strip.length]!
  ]) as unknown as Grid;
  return normalizeDrawIdentity({ strips, stops, grid, rng: { value: 1 }, preInterventionPaying: true });
}

/** A complete fruit engine at the final normal-shift pull, suitable for persisted browser recovery. */
export function createFruitScenario(seed: number, mode: "e2e" | "chain" = "e2e"): RunState {
  let state = selectService(seed, "kitchen");
  for (const id of ["lemon-crate", "lemon-infection", "fruit-salad", "jam-jar"] as const) state = acquire(state, id);
  state = {
    ...state,
    bankroll: 220,
    shift: 5,
    baseSpinsInShift: 2,
    shiftWager: 20,
    shiftPayout: 28,
    exitUnlocked: true,
    toolLevel: 3,
    attribution: { base: 54, part: 42, intervention: 0, service: 0, agitation: 5, overload: 0 },
    expenses: { wagers: 140, kitchen: 40, chapel: 0, repair: 0 }
  };
  if (mode === "e2e") return state;

  const strips: ReelSet = [
    ["cherry", "cherry", "food", "blank", "lemon", "bell"],
    ["lemon", "cherry", "blank", "food", "seven", "wild"],
    ["bell", "cherry", "cherry", "blank", "lemon", "seven"]
  ];
  const draw = fixtureDraw(strips, [0, 0, 0]);
  return {
    ...state,
    phase: "AWAITING_INTERVENTION",
    reels: strips,
    buffs: [{ id: "food", spinsRemaining: 2, additivePayout: 0.25 }],
    pendingSpin: { draw, isFree: false, bankrollBefore: state.bankroll + 10, wager: 10 },
    pendingEvents: [],
    attribution: { base: 0, part: 0, intervention: 0, service: 0, agitation: 0, overload: 0 }
  };
}

export function createChapelScenario(seed: number): RunState {
  let state = selectService(seed, "chapel");
  state = acquire(state, "omen-collector");
  state = acquire(state, "triple-blessing");
  const strips: ReelSet = [
    ["seven", "blank", "cherry", "lemon", "bell", "wild"],
    ["wild", "cherry", "lemon", "blank", "bell", "seven"],
    ["seven", "lemon", "blank", "cherry", "bell", "wild"]
  ];
  const draw = fixtureDraw(strips, [0, 0, 0]);
  return {
    ...state,
    phase: "AWAITING_INTERVENTION",
    reels: strips,
    omen: 3,
    pendingPrayer: "seven",
    temporaryReelAdditions: [["seven", "seven"], ["seven", "seven"], ["seven", "seven"]],
    pendingSpin: { draw, isFree: false, bankrollBefore: state.bankroll + 10, wager: 10 },
    pendingEvents: [],
    attribution: { base: 0, part: 0, intervention: 0, service: 0, agitation: 0, overload: 0 }
  };
}

export function createViolentScenario(seed: number): RunState {
  let state = selectService(seed, "security");
  state = acquire(state, "artificial-crack");
  state = acquire(state, "blank-capacitor");
  state = acquire(state, "scrap-magnet");
  state = acquire(state, "warranty-fraud");
  state = acquire(state, "overload-motor");
  const strips: ReelSet = [
    ["cherry", "crack", "blank", "blank", "bell", "lemon"],
    ["crack", "blank", "cherry", "lemon", "bell", "seven"],
    ["crack", "seven", "bell", "cherry", "lemon", "wild"]
  ];
  const draw = fixtureDraw(strips, [0, 0, 0]);
  return {
    ...state,
    phase: "AWAITING_INTERVENTION",
    reels: strips,
    pendingSpin: { draw, isFree: false, bankrollBefore: state.bankroll + 10, wager: 10 },
    pendingEvents: [],
    interventionUsedThisSpin: false,
    shiftFlags: { ...state.shiftFlags, kickUsed: false },
    attribution: { base: 0, part: 0, intervention: 0, service: 0, agitation: 0, overload: 0 }
  };
}
