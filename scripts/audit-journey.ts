// Small deterministic acquisition audit, not optimal play or a player win-rate estimate.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import type { GameCommand } from "../src/core/commands.ts";
import type { RunState, ServiceId, UpgradeId, ReelIndex, SymbolId } from "../src/core/types.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({ resolve(id, context, next) {
  if (!id.startsWith("@/")) return next(id, context);
  const path = resolve(root, "src", id.slice(2));
  return { url: pathToFileURL(existsSync(path) ? path : path + ".ts").href, shortCircuit: true };
} });
const { createRun, dispatchCommand } = await import("../src/core/run.ts");
const { getCurrentBet, getMealCost } = await import("../src/core/progression.ts");
const { getRoomProgress, isRoomIntermission } = await import("../src/content/hotel.ts");
const { buildUpgradeChoice, upgradeSymbolTargets } = await import("../src/app/upgrade-choice.ts");
const { evaluateBaseWins } = await import("../src/core/paylines.ts");
const { BASE_PAYTABLE } = await import("../src/content/base-machine.ts");
const samples = Math.max(1, Math.min(64, Number(process.argv[2] ?? 24)));
const seedOffset = Number(process.argv[3] ?? 0);
const priorities: Record<ServiceId, readonly UpgradeId[]> = {
  kitchen: ["harvest-vat", "lemon-infection", "lemon-crate", "cherry-pitter", "jam-jar", "cherry-press", "fruit-salad", "leftovers"],
  chapel: ["seven-purification", "triple-blessing", "votive-candle", "tithe-box", "omen-collector", "midnight-bell", "martyr-coin"],
  security: ["shock-absorber", "blank-capacitor", "overload-motor", "artificial-crack", "scrap-magnet", "loose-spring", "warranty-fraud"],
  repair: ["cherry-pitter", "cherry-press", "jam-jar", "harvest-vat", "carbon-copy", "pruning-shears", "safety-fuse"]
};
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error.message}`);
  return result.state;
}
const visibleValue = (state: RunState) => evaluateBaseWins(state.pendingSpin!.draw.grid, BASE_PAYTABLE).reduce((sum, win) => sum + win.multiplier, 0);
function upgrade(state: RunState, service: ServiceId): RunState {
  const ids = Object.values(state.currentCandidates!);
  const preferredSymbol: SymbolId = service === "chapel" ? "seven" : service === "kitchen" && state.partSlots.some((p) => p?.id === "lemon-infection") ? "lemon" : "cherry";
  const score = (id: UpgradeId) => {
    const index = priorities[service].indexOf(id);
    let value = index < 0 ? 0 : 30 - index;
    if (state.partSlots.some((p) => p?.id === "lemon-infection") && ["cherry-pitter", "jam-jar", "cherry-press", "fruit-salad", "salad-dressing"].includes(id)) value -= 40;
    if (id === "carbon-copy") value = 25;
    return value;
  };
  for (const id of ids.toSorted((a, b) => score(b) - score(a))) {
    const rankedReels = ([0, 1, 2] as const).toSorted((a, b) => state.reels[a].filter((s) => s === preferredSymbol).length / state.reels[a].length - state.reels[b].filter((s) => s === preferredSymbol).length / state.reels[b].length);
    const targets = upgradeSymbolTargets(state, id).toSorted((a, b) => {
      const rank = (t: typeof a) => (t.reel === rankedReels[0] ? 10 : 0) + (id === "carbon-copy" ? t.symbol === preferredSymbol ? 20 : 0 : t.symbol === "blank" ? 20 : t.symbol === preferredSymbol ? -20 : 0);
      return rank(b) - rank(a);
    });
    const choice = buildUpgradeChoice(state, id, { reel: rankedReels[0]!, secondReel: rankedReels[1]!, symbolTarget: targets[0], replaceSlot: 4 });
    if (choice !== null && dispatchCommand(state, { type: "CHOOSE_UPGRADE", choice }).ok) return send(state, { type: "CHOOSE_UPGRADE", choice });
  }
  return send(state, { type: "DECLINE_UPGRADE" });
}
const rows = (["kitchen", "chapel", "security", "repair"] as const).map((service) => {
  const runs = Array.from({ length: samples }, (_, sample) => {
    let seed = (820127 + seedOffset + Math.imul(sample, 0x9e3779b9)) >>> 0;
    let state = createRun(seed);
    // Select a nearby seed where this service is actually offered, identically in both rule versions.
    while (!state.serviceCandidates.includes(service)) state = createRun(seed = (seed + 1) >>> 0);
    state = send(state, { type: "SELECT_SERVICE", serviceId: service });
    let opening = false; let firstTrigger: number | null = null; let dry = 0; let maxDry = 0; let spins = 0;
    const rooms: { tier: number; payout: number; target: number; cleared: boolean }[] = [];
    for (let step = 0; step < 500; step++) {
      if (state.phase === "RUN_LOST" || state.phase === "RUN_WON") break;
      if (state.currentCandidates) { state = upgrade(state, service); continue; }
      if (isRoomIntermission(state)) { state = send(state, { type: "NEXT_ROOM_ROUND" }); continue; }
      if (state.phase === "SHIFT_COMPLETE" || state.phase === "AFTER_HOURS") {
        if (state.phase === "SHIFT_COMPLETE") opening = true;
        else {
          const progress = getRoomProgress(state)!;
          rooms.push({ tier: state.hotel!.challenge!.tier, payout: progress.value, target: progress.target, cleared: progress.cleared });
          if (!progress.cleared || state.hotel!.cleared >= 3) break;
        }
        const entry = dispatchCommand(state, { type: "ENTER_ROOM" });
        if (!entry.ok) break;
        state = entry.state; continue;
      }
      if (state.phase !== "READY_TO_SPIN") throw new Error(`Unexpected ${state.phase}`);
      if (state.bankroll < getCurrentBet(state) && !state.freeSpinQueue) {
        const conservative = dispatchCommand(state, { type: "SET_BET_MODE", mode: "conservative" });
        if (!conservative.ok || conservative.state.bankroll < getCurrentBet(conservative.state)) break;
        state = conservative.state;
      }
      if (service === "kitchen" && !state.shiftFlags.foodBought && state.bankroll >= getMealCost(state) + getCurrentBet(state)) state = send(state, { type: "BUY_FOOD", reelIndex: 0 });
      if (service === "chapel") {
        const candle = dispatchCommand(state, { type: "LIGHT_CANDLE" });
        if (state.omen >= 2 && candle.ok) state = candle.state;
        if (!state.shiftFlags.prayerUsed && state.interventionPoints > 0) state = send(state, { type: "PRAY", symbol: "seven" });
      }
      state = send(send(state, { type: "SPIN" }), { type: "REELS_STOPPED" });
      if (!state.interventionUsedThisSpin) {
        let kicked = false;
        if (service === "security" && !state.shiftFlags.kickUsed) {
          let best = visibleValue(state); let selected: ReelIndex | null = null;
          for (const reelIndex of [0, 1, 2] as const) {
            const result = dispatchCommand(state, { type: "KICK_REEL", reelIndex });
            if (result.ok && visibleValue(result.state) > best) { best = visibleValue(result.state); selected = reelIndex; }
          }
          if (selected !== null) { state = send(send(state, { type: "KICK_REEL", reelIndex: selected }), { type: "REELS_STOPPED" }); kicked = true; }
        }
        if (!kicked && visibleValue(state) === 0 && state.interventionPoints > 0) {
          state = send(send(state, { type: "RESPIN_REEL", reelIndex: 2 }), { type: "REELS_STOPPED" });
        }
      }
      state = send(state, { type: "ACCEPT_OUTCOME" });
      spins++;
      if (firstTrigger === null && state.pendingEvents.some((event) => event.type === "PART_TRIGGERED")) firstTrigger = spins;
      dry = state.spinHistory.at(-1)!.totalPayout === 0 ? dry + 1 : 0; maxDry = Math.max(maxDry, dry);
      state = send(state, { type: "PRESENTATION_COMPLETE" });
      if (step === 499) throw new Error("Audit exceeded its bounded command budget");
    }
    return { seed, opening, rooms, firstTrigger, maxDry, spins, acquired: state.acquiredUpgrades.length };
  });
  const triggers = runs.flatMap((run) => run.firstTrigger === null ? [] : [run.firstTrigger]).toSorted((a, b) => a - b);
  return { service, samples, openingClears: runs.filter((run) => run.opening).length,
    firstPartTriggerMedian: triggers[Math.floor(triggers.length / 2)] ?? null, neverTriggered: samples - triggers.length,
    maxDrySpins: Math.max(...runs.map((run) => run.maxDry)),
    rooms: [1, 2, 3].map((tier) => { const attempts = runs.flatMap((run) => run.rooms.filter((room) => room.tier === tier));
      return { tier, completedAttempts: attempts.length, cleared: attempts.filter((room) => room.cleared).length,
        medianGoalRatio: attempts.length ? +attempts.map((room) => room.payout / room.target).toSorted((a, b) => a - b)[Math.floor(attempts.length / 2)]!.toFixed(2) : null }; }),
    seeds: runs.map((run) => run.seed) };
});
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith(".ts") ? [readFileSync(join(dir, e.name), "utf8")] : []);
console.log(JSON.stringify({ rules: "rules-" + createHash("sha256").update([...sources(join(root, "src/core")), ...sources(join(root, "src/content"))].join("\n")).digest("hex").slice(0, 16), samples, seedOffset,
  method: "Natural opening and actual offers. Fixed disclosed heuristic, normal bets unless unaffordable, first-three-room attempts only; no retries, free farming, tip refinement or workshop. Uses visible kick previews, never peeks at random respin outcomes. Rooms are conditional on earlier success, not comparable independent pass rates. First trigger counts any part, including charge-only effects. Not optimal or human play.", rows }, null, 2));
