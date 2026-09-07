// Small passive, paired route audit: real commands, four blocks, explicit censoring.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import type { RunState, ReelSet, PartInstance, SymbolId } from "../src/core/types.ts";
import type { GameCommand } from "../src/core/commands.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({ resolve(id, context, next) {
  if (!id.startsWith("@/")) return next(id, context);
  const p = resolve(root, "src", id.slice(2));
  return { url: pathToFileURL(existsSync(p) ? p : p + ".ts").href, shortCircuit: true };
} });
const { createRun, dispatchCommand } = await import("../src/core/run.ts");
const { BASE_REELS } = await import("../src/content/base-machine.ts");
function sources(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  .flatMap((e) => e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith(".ts") ? [readFileSync(join(dir, e.name), "utf8")] : []); }
const fingerprint = "rules-" + createHash("sha256").update([...sources(join(root, "src/core")), ...sources(join(root, "src/content"))].join("\n")).digest("hex").slice(0, 16);
const mixed = (strip: SymbolId[]): ReelSet => [[...strip], [...strip], [...strip]];
const seven = mixed(["seven", "cherry", "bell", "seven", "blank", "lemon", "seven", "wild", "bell", "lemon", "cherry", "lemon"]);
const damage = mixed(["crack", "crack", "crack", "blank", "bell", "cherry", "blank", "lemon", "seven", "blank", "bell", "wild"]);
const solid = (s: SymbolId) => mixed(Array<SymbolId>(12).fill(s));
const part = (id: PartInstance["id"], level: 1 | 2): PartInstance => ({ id, level });
const scenarios = [
  { id: "seven_martyr", reels: seven, parts: [part("martyr-coin", 2)] },
  { id: "seven_blessing_l1", reels: seven, parts: [part("martyr-coin", 2), part("triple-blessing", 1)] },
  { id: "seven_blessing_l2", reels: seven, parts: [part("martyr-coin", 2), part("triple-blessing", 2)] },
  { id: "seven_blessing_capacitor", reels: seven, parts: [part("martyr-coin", 2), part("triple-blessing", 2), part("blank-capacitor", 2)] },
  { id: "cherry_press_early", reels: BASE_REELS, parts: [part("cherry-press", 1)] },
  { id: "lemon_mature_l2", reels: solid("lemon"), parts: [part("lemon-infection", 2)] },
  { id: "salad_l2", reels: [solid("cherry")[0], solid("lemon")[0], solid("bell")[0]] as ReelSet, parts: [part("fruit-salad", 2), part("salad-dressing", 2)] },
  { id: "cherry_mature_l2", reels: solid("cherry"), parts: [part("cherry-press", 2), part("jam-jar", 2)] },
  { id: "fault_magnet", reels: damage, parts: [part("scrap-magnet", 1)] },
  { id: "blank_loop_probe", reels: solid("blank"), parts: [part("blank-capacitor", 2)] }
];
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(command.type + ": " + result.error.message);
  return result.state;
}
const round = (x: number) => Math.round(x * 1000) / 1000;
const report = scenarios.map((scenario) => {
  const blocks: { net: number; spins: number; completed: boolean; blanks: number }[][] = [[], [], [], []];
  for (let sample = 0; sample < 24; sample++) {
    const seed = (820127 + Math.imul(sample, 0x9e3779b9)) >>> 0;
    let state: RunState = { ...createRun(seed), phase: "READY_TO_SPIN", service: "repair", bankroll: 10000,
      reels: scenario.reels, partSlots: Array.from({ length: 5 }, (_, i) => scenario.parts[i] ?? null) as unknown as RunState["partSlots"] };
    for (let block = 0; block < 4; block++) {
      const start = state.bankroll;
      if (scenario.parts.some((p) => p.id === "martyr-coin")) state = send(state, { type: "ENABLE_MARTYR" });
      let spins = 0;
      while (state.phase === "READY_TO_SPIN" && spins < 24) {
        for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
        spins++;
      }
      const completed = state.phase === "CHOOSING_UPGRADE";
      blocks[block]!.push({ net: (state.bankroll - start) / 10, spins, completed, blanks: state.reels.flat().filter((s) => s === "blank").length });
      if (!completed) break;
      if (block < 3) state = send(state, { type: "DECLINE_UPGRADE" });
    }
  }
  return { id: scenario.id, blocks: blocks.map((samples) => ({ observed: samples.length,
    completed: samples.filter((s) => s.completed).length, censored: samples.filter((s) => !s.completed).length,
    meanObservedNetB: samples.length ? round(samples.reduce((n, s) => n + s.net, 0) / samples.length) : null,
    meanObservedSpins: samples.length ? round(samples.reduce((n, s) => n + s.spins, 0) / samples.length) : null,
    meanPermanentBlanks: samples.length ? round(samples.reduce((n, s) => n + s.blanks, 0) / samples.length) : null })) };
});
console.log(JSON.stringify({ fingerprint, samplesPerScenario: 24, maxSpinsPerBlock: 24,
  method: "Four real-command blocks; no upgrades, meals, prayer or interventions; offering included. Net in B=10. Censored means are window observations, not completed-block estimates or player win rates.", scenarios: report }, null, 2));
