import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { GameCommand } from "../src/core/commands.ts";
import type { PartInstance, ReelSet, RunState, SymbolId } from "../src/core/types.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({ resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
  const path = resolve(root, "src", specifier.slice(2));
  return { url: pathToFileURL(existsSync(path) ? path : path + ".ts").href, shortCircuit: true };
} });
const { createRun, dispatchCommand } = await import("../src/core/run.ts");
const { BASE_REELS, BASE_PAYTABLE } = await import("../src/content/base-machine.ts");
const { HOTEL_ROOMS } = await import("../src/content/hotel.ts");
const { evaluateBaseWins } = await import("../src/core/paylines.ts");

interface Scenario { id: string; reels: ReelSet; parts: readonly PartInstance[]; meal?: boolean; chapel?: boolean; bet?: number }
const repeat = (symbol: SymbolId): ReelSet => [Array(12).fill(symbol), Array(12).fill(symbol), Array(12).fill(symbol)];
const mixed = (symbols: SymbolId[]): ReelSet => [[...symbols], [...symbols], [...symbols]];
const cherry = mixed(["cherry", "lemon", "cherry", "bell", "cherry", "wild", "cherry", "blank", "cherry", "lemon", "cherry", "lemon"]);
const lemon = mixed(["lemon", "cherry", "lemon", "bell", "lemon", "wild", "lemon", "blank", "lemon", "cherry", "lemon", "cherry"]);
const chapel = mixed(["seven", "bell", "seven", "blank", "seven", "wild", "seven", "blank", "seven", "bell", "seven", "cherry"]);
const damage = mixed(["crack", "crack", "crack", "blank", "bell", "cherry", "blank", "lemon", "seven", "blank", "bell", "wild"]);
const scenarios: Scenario[] = [
  { id: "base", reels: BASE_REELS, parts: [] },
  { id: "base_meal", reels: BASE_REELS, parts: [], meal: true },
  { id: "base_meal_high_stake", reels: BASE_REELS, parts: [], meal: true, bet: 100 },
  { id: "lemon_growing", reels: lemon, parts: [{ id: "lemon-infection", level: 1 }], meal: true },
  { id: "lemon_full", reels: repeat("lemon"), parts: [{ id: "lemon-infection", level: 2 }] },
  { id: "lemon_full_meal", reels: repeat("lemon"), parts: [{ id: "lemon-infection", level: 2 }], meal: true },
  { id: "cherry_growing_l1", reels: cherry, parts: [{ id: "jam-jar", level: 1 }, { id: "cherry-press", level: 1 }], meal: true },
  { id: "cherry_growing_l2", reels: cherry, parts: [{ id: "jam-jar", level: 2 }, { id: "cherry-press", level: 2 }], meal: true },
  { id: "cherry_full_l2", reels: repeat("cherry"), parts: [{ id: "jam-jar", level: 2 }, { id: "cherry-press", level: 2 }], meal: true },
  { id: "salad_full_l2", reels: [repeat("cherry")[0], repeat("lemon")[0], repeat("bell")[0]], parts: [{ id: "fruit-salad", level: 2 }, { id: "salad-dressing", level: 2 }], meal: true },
  { id: "chapel_growing", reels: chapel, parts: [{ id: "triple-blessing", level: 1 }, { id: "omen-collector", level: 1 }, { id: "martyr-coin", level: 1 }], chapel: true },
  { id: "chapel_full_l2", reels: repeat("seven"), parts: [{ id: "triple-blessing", level: 2 }, { id: "omen-collector", level: 2 }, { id: "martyr-coin", level: 2 }], chapel: true },
  { id: "fault_startup", reels: damage, parts: [{ id: "scrap-magnet", level: 1 }] },
  { id: "fault_ready", reels: damage, parts: [{ id: "scrap-magnet", level: 1 }, { id: "warranty-fraud", level: 1 }, { id: "blank-capacitor", level: 1 }, { id: "overload-motor", level: 1 }, { id: "loose-spring", level: 1 }] }
];
const count = 64;
const limit = 12;
const round = (n: number) => Math.round(n * 10000) / 10000;
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(command.type + ": " + result.error.message);
  return result.state;
}
function block(scenario: Scenario, sample: number) {
  const bet = scenario.bet ?? 10;
  const seed = (820127 + Math.imul(sample, 0x9e3779b9)) >>> 0;
  let state: RunState = { ...createRun(seed), phase: "READY_TO_SPIN", service: scenario.chapel ? "chapel" : "kitchen",
    bankroll: bet * 100, baseBet: bet, reels: scenario.reels, omen: scenario.chapel ? 2 : 0,
    partSlots: Array.from({ length: 5 }, (_, i) => scenario.parts[i] ?? null) as unknown as RunState["partSlots"] };
  const initialBankroll = state.bankroll;
  if (scenario.meal) state = send(state, { type: "BUY_FOOD", reelIndex: 0 });
  if (scenario.chapel) {
    state = send(state, { type: "ENABLE_MARTYR" });
    state = send(state, { type: "PRAY", symbol: "seven" });
  }
  let spins = 0; let empty = 0;
  while (state.phase === "READY_TO_SPIN" && spins < limit) {
    for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
    spins++; if (state.spinHistory.at(-1)!.totalPayout === 0) empty++;
  }
  return { payout: state.shiftPayout / bet, net: (state.bankroll - initialBankroll) / bet,
    part: state.attribution.part / bet, spins, empty, completed: state.phase !== "READY_TO_SPIN" };
}

// Exact enumeration preserves within-reel adjacency; there are only 12^3 stop triples.
let baseTotal = 0; let hit = 0; let profitable = 0;
for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) for (let c = 0; c < 12; c++) {
  const grid = BASE_REELS.map((strip, reel) => {
    const stop = [a, b, c][reel]!;
    return [strip[stop]!, strip[(stop + 1) % 12]!, strip[(stop + 2) % 12]!];
  }) as unknown as Parameters<typeof evaluateBaseWins>[0];
  const amount = evaluateBaseWins(grid, BASE_PAYTABLE).reduce((sum, win) => sum + win.multiplier, 0);
  baseTotal += amount; if (amount > 0) hit++; if (amount > 1) profitable++;
}
const report = scenarios.map((scenario) => {
  const samples = Array.from({ length: count }, (_, i) => block(scenario, i));
  const complete = samples.filter((sample) => sample.completed);
  const ordered = complete.map((sample) => sample.payout).sort((a, b) => a - b);
  const mean = (key: "payout" | "net" | "part") => complete.length ? round(complete.reduce((sum, sample) => sum + sample[key], 0) / complete.length) : null;
  return { id: scenario.id, samples: count, completed: complete.length, truncated: samples.length - complete.length,
    censoredSamples: samples.flatMap((sample, index) => sample.completed ? [] : [{ index, payoutSoFarB: round(sample.payout), spins: sample.spins }]),
    meanObservedSpins: round(samples.reduce((sum, sample) => sum + sample.spins, 0) / samples.length),
    meanPayoutB: mean("payout"), meanNetB: mean("net"), meanPartB: mean("part"),
    p50PayoutB: ordered.length ? round(ordered[Math.floor((ordered.length - 1) * 0.5)]!) : null,
    p90PayoutB: ordered.length ? round(ordered[Math.floor((ordered.length - 1) * 0.9)]!) : null,
    emptySpinRate: round(samples.reduce((n, s) => n + s.empty, 0) / samples.reduce((n, s) => n + s.spins, 0)),
    noInterventionRoomPassRate: ([1, 2, 3] as const).map((tier) => complete.length ? round(complete.filter((sample) => sample.payout >= HOTEL_ROOMS[tier].target / HOTEL_ROOMS[tier].bet).length / complete.length) : null) };
});
console.log(JSON.stringify({ model: "synthetic-three-paid-spin-blocks-v1", seed: 820127, samplesPerScenario: count, maxSpinsPerSample: limit,
  units: "B = fixed wager, net includes meal/offering fees; no respin policy; room rates are threshold comparisons, not player win rates",
  caveat: "Payout/net quantiles and room rates exclude censored samples; never compare truncated-scenario means as unbiased outcomes.",
  roomThresholdsB: ([1, 2, 3] as const).map((tier) => HOTEL_ROOMS[tier].target / HOTEL_ROOMS[tier].bet),
  baseExact: { stops: 1728, rawRtp: round(baseTotal / 1728), hitRate: round(hit / 1728), profitableRate: round(profitable / 1728) }, scenarios: report }, null, 2));
