// Bounded, paired synthetic checkpoints. These are not whole-run player win rates.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import type { GameCommand } from "../src/core/commands.ts";
import type { PartInstance, ReelSet, RoomTier, RunState, SymbolId } from "../src/core/types.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({ resolve(id, context, next) {
  if (!id.startsWith("@/")) return next(id, context);
  const path = resolve(root, "src", id.slice(2));
  return { url: pathToFileURL(existsSync(path) ? path : path + ".ts").href, shortCircuit: true };
} });
const { createRun, dispatchCommand } = await import("../src/core/run.ts");
const { HOTEL_ROOMS, HOTEL_ROOM_TIERS, isRoomIntermission } = await import("../src/content/hotel.ts");
const { BASE_REELS, BASE_PAYTABLE } = await import("../src/content/base-machine.ts");
const { evaluateBaseWins } = await import("../src/core/paylines.ts");
const variant = process.argv.includes("--new-parts");
const samples = 12;
const mixed = (strip: SymbolId[]): ReelSet => [[...strip], [...strip], [...strip]];
const solid = (symbol: SymbolId): ReelSet => mixed(Array<SymbolId>(12).fill(symbol));
const part = (id: PartInstance["id"], level: 1 | 2): PartInstance => ({ id, level });
const builds = [
  { id: "fruit-start", service: "kitchen", reels: BASE_REELS, parts: [part("lemon-infection", 1)], extra: "harvest-vat", level: 1 },
  { id: "fruit-growing", service: "kitchen", reels: mixed(["lemon", "cherry", "lemon", "bell", "lemon", "wild", "lemon", "blank", "lemon", "cherry", "lemon", "cherry"]), parts: [part("lemon-infection", 2)], extra: "harvest-vat", level: 2 },
  { id: "fruit-mature", service: "kitchen", reels: solid("lemon"), parts: [part("lemon-infection", 2)], extra: "harvest-vat", level: 2 },
  { id: "chapel-growing", service: "chapel", reels: mixed(["seven", "bell", "seven", "blank", "seven", "wild", "seven", "blank", "seven", "bell", "seven", "cherry"]), parts: [part("triple-blessing", 1), part("omen-collector", 1), part("martyr-coin", 1)], extra: "votive-candle", level: 1 },
  { id: "chapel-mature", service: "chapel", reels: solid("seven"), parts: [part("triple-blessing", 2), part("omen-collector", 2), part("martyr-coin", 2)], extra: "votive-candle", level: 2 },
  { id: "fault-growing", service: "security", reels: mixed(["crack", "crack", "crack", "blank", "bell", "cherry", "blank", "lemon", "seven", "blank", "bell", "wild"]), parts: [part("scrap-magnet", 1), part("warranty-fraud", 1), part("blank-capacitor", 1), part("overload-motor", 1)], extra: "shock-absorber", level: 1 },
  { id: "fault-mature", service: "security", reels: mixed(["crack", "crack", "crack", "blank", "bell", "cherry", "blank", "lemon", "seven", "blank", "bell", "wild"]), parts: [part("scrap-magnet", 2), part("warranty-fraud", 2), part("blank-capacitor", 2), part("overload-motor", 2)], extra: "shock-absorber", level: 2 }
] as const;
const send = (state: RunState, command: GameCommand): RunState => {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(command.type + ": " + result.error.message);
  return result.state;
};
const baseValue = (state: RunState) => evaluateBaseWins(state.pendingSpin!.draw.grid, BASE_PAYTABLE).reduce((n, win) => n + win.multiplier, 0);
const rows = builds.map((build) => {
  const rooms = HOTEL_ROOM_TIERS.map((tier) => {
    const room = HOTEL_ROOMS[tier];
    const observations = Array.from({ length: samples }, (_, sample) => {
      const parts = [...build.parts, ...(variant ? [part(build.extra as PartInstance["id"], build.level)] : [])];
      let state: RunState = { ...createRun((820127 + Math.imul(sample, 0x9e3779b9)) >>> 0),
        phase: "SHIFT_COMPLETE", shift: 3, baseSpinsInShift: 3, exitUnlocked: true,
        bankroll: room.bet * 20, service: build.service, tips: 3, omen: build.service === "chapel" ? 3 : 0,
        reels: build.reels, partSlots: Array.from({ length: 5 }, (_, i) => parts[i] ?? null) as unknown as RunState["partSlots"],
        hotel: { cleared: (tier - 1) as 0 | RoomTier, challenge: null } };
      const opening = state.bankroll;
      state = send(state, { type: "ENTER_ROOM" });
      if (build.service === "chapel") {
        state = send(state, { type: "ENABLE_MARTYR" });
        if (variant) state = send(state, { type: "LIGHT_CANDLE" } as GameCommand);
        state = send(state, { type: "PRAY", symbol: "seven" });
      }
      let spins = 0;
      while ((state.phase === "READY_TO_SPIN" || isRoomIntermission(state)) && spins < 40) {
        if (isRoomIntermission(state)) {
          // Keep the preset build fixed; do not mistake a rest stop for a completed room.
          state = send(state, { type: state.currentCandidates ? "DECLINE_UPGRADE" : "NEXT_ROOM_ROUND" });
          continue;
        }
        const mealAt = variant && tier >= 4 ? room.paidSpins - 3 : 0;
        if (build.service === "kitchen" && !state.shiftFlags.foodBought && state.baseSpinsInShift >= mealAt)
          state = send(state, { type: "BUY_FOOD", reelIndex: 0 });
        state = send(send(state, { type: "SPIN" }), { type: "REELS_STOPPED" });
        if (build.service === "security" && !state.shiftFlags.kickUsed) {
          // Uses only the actual deterministic kick preview available to the player.
          let best = baseValue(state); let chosen = state;
          for (const reelIndex of [0, 1, 2] as const) {
            const result = dispatchCommand(state, { type: "KICK_REEL", reelIndex });
            if (result.ok && baseValue(result.state) > best) { best = baseValue(result.state); chosen = result.state; }
          }
          if (chosen !== state) state = send(chosen, { type: "REELS_STOPPED" });
        }
        state = send(send(state, { type: "ACCEPT_OUTCOME" }), { type: "PRESENTATION_COMPLETE" });
        spins++;
      }
      return { complete: state.phase === "AFTER_HOURS" && !isRoomIntermission(state), passed: state.hotel?.challenge?.status === "cleared",
        netB: (state.bankroll - opening) / room.bet, spins, tipsSpent: 3 - state.tips };
    });
    return { tier, passed: observations.filter((s) => s.passed).length, completed: observations.filter((s) => s.complete).length,
      meanNetB: +(observations.reduce((n, s) => n + s.netB, 0) / samples).toFixed(2) };
  });
  return { id: build.id, rooms };
});
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  .flatMap((e) => e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith(".ts") ? [readFileSync(join(dir, e.name), "utf8")] : []);
console.log(JSON.stringify({ fingerprint: "rules-" + createHash("sha256").update([...sources(join(root, "src/core")), ...sources(join(root, "src/content"))].join("\n")).digest("hex").slice(0, 16),
  variant, samples, method: "Synthetic equipped checkpoints, all six actual room goals, real commands; no upgrades or retries. 20B starting wallet, chapel 3 omen, 3 tips. Meal/offering deducted; new candle costs a tip. New variant includes later meal timing. No inferred whole-run win rate or equal acquisition cost.", rows }, null, 2));
