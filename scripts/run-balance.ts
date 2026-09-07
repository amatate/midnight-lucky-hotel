import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  AttributionSource,
  BaseSymbolId,
  BetMode,
  Grid,
  ReelIndex,
  RunState,
  SymbolId,
  UpgradeChoice,
  UpgradeId
} from "../src/core/types.ts";
import type { GameCommand } from "../src/core/commands.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolve(ROOT, "src", specifier.slice(2));
      return { url: pathToFileURL(existsSync(base) ? base : `${base}.ts`).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

const { BASE_PAYTABLE, BASE_REELS } = await import("../src/content/base-machine.ts");
const { UPGRADES } = await import("../src/content/upgrades.ts");
const { previewKick } = await import("../src/content/services/security.ts");
const { evaluateBaseWins, PAYLINES } = await import("../src/core/paylines.ts");
const { getCurrentBet } = await import("../src/core/progression.ts");
const { drawReels } = await import("../src/core/reels.ts");
const { createRun, dispatchCommand } = await import("../src/core/run.ts");
const { resolveBaseMachineSpin } = await import("../src/core/base-settlement.ts");
const { mean, sampleVariance } = await import("../src/sim/statistics.ts");

type Route = "fruit" | "chapel" | "violent";
type AttributionTotals = Readonly<Record<AttributionSource, number>>;

interface BaseBalanceReport {
  readonly sampleCount: number;
  readonly seed: number;
  readonly rtp: number;
  readonly payoutMean: number;
  readonly payoutStandardDeviation: number;
  readonly rawPaylineDiagnosticRtp: number;
  readonly agitationRtp: number;
}

interface RouteBalanceReport {
  readonly route: Route;
  readonly sampleCount: number;
  readonly seed: number;
  readonly winRate: number;
  readonly medianBreakEvenShift: number | null;
  readonly ruinRate: number;
  readonly attributionTotals: AttributionTotals;
  readonly firstBreakEvenShiftDistribution: Readonly<Record<"1" | "2" | "3" | "4" | "5" | "unreachable", number>>;
}

interface BalanceReport {
  readonly generatedAt: string;
  readonly base: BaseBalanceReport;
  readonly fruit: RouteBalanceReport;
  readonly chapel: RouteBalanceReport;
  readonly violent: RouteBalanceReport;
}

const ROUTE_CONFIG = {
  fruit: {
    service: "kitchen",
    upgrades: ["lemon-crate", "lemon-infection", "fruit-salad", "jam-jar"]
  },
  chapel: {
    service: "chapel",
    upgrades: ["seven-purification", "omen-collector", "triple-blessing", "martyr-coin"]
  },
  violent: {
    service: "security",
    upgrades: ["artificial-crack", "scrap-magnet", "blank-capacitor", "overload-motor"]
  }
} as const;

const ATTRIBUTION_SOURCES = ["base", "part", "intervention", "service", "agitation", "overload"] as const;
const DEFAULT_BASE_SAMPLE_COUNT = 100_000;
const DEFAULT_ROUTE_SAMPLE_COUNT = 10_000;
const DEBUG = process.env.BALANCE_DEBUG === "1";
const DEBUG_SAMPLE = Number.parseInt(process.env.BALANCE_DEBUG_SAMPLE ?? "", 10);
const SAFE_GUARD_LIMIT = parseSampleCount(process.env.BALANCE_SAFE_GUARD_LIMIT, 12_000);

function parseSampleCount(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const BASE_SAMPLE_COUNT = parseSampleCount(process.env.BALANCE_BASE_SAMPLE_COUNT, DEFAULT_BASE_SAMPLE_COUNT);
const ROUTE_SAMPLE_COUNT = parseSampleCount(process.env.BALANCE_ROUTE_SAMPLE_COUNT, DEFAULT_ROUTE_SAMPLE_COUNT);

function dispatch(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error.code} ${result.error.message}`);
  return result.state;
}

function routeSeed(seed: number, sampleIndex: number): number {
  return (seed + Math.imul(sampleIndex, 0x9e37_79b9)) >>> 0;
}

function createPolicyRun(route: Route, seed: number): RunState {
  const service = ROUTE_CONFIG[route].service;
  let candidateSeed = seed >>> 0;
  for (;;) {
    const state = createRun(candidateSeed);
    if (state.serviceCandidates.includes(service)) return dispatch(state, { type: "SELECT_SERVICE", serviceId: service });
    candidateSeed = (candidateSeed + 1) >>> 0;
  }
}

function isPaying(grid: Grid): boolean {
  return evaluateBaseWins(grid, BASE_PAYTABLE).length > 0;
}

function opportunityCount(grid: Grid, reel: ReelIndex): number {
  let count = 0;
  for (const line of PAYLINES) {
    const others = line.cells.filter(([candidate]) => candidate !== reel)
      .map(([candidate, row]) => grid[candidate][row]);
    const [left, right] = others;
    const pay = (symbol: SymbolId | undefined) => symbol === "cherry" || symbol === "lemon" ||
      symbol === "bell" || symbol === "seven" || symbol === "wild";
    if (pay(left) && pay(right) && (left === right || left === "wild" || right === "wild")) count += 1;
  }
  return count;
}

function bestRespinReel(grid: Grid): ReelIndex {
  let selected: ReelIndex = 0;
  for (const reel of [1, 2] as const) if (opportunityCount(grid, reel) > opportunityCount(grid, selected)) selected = reel;
  return selected;
}

function bestKickReel(state: RunState): ReelIndex {
  let selected: ReelIndex = 0;
  let highest = -1;
  for (const reel of [0, 1, 2] as const) {
    const preview = previewKick(state, reel);
    const grid = state.pendingSpin!.draw.grid.map((window, index) => index === reel ? preview : window) as unknown as Grid;
    const score = evaluateBaseWins(grid, BASE_PAYTABLE).length;
    if (score > highest) {
      selected = reel;
      highest = score;
    }
  }
  return selected;
}

function targetForUpgrade(state: RunState, id: UpgradeId, route: Route): UpgradeChoice {
  if (UPGRADES[id].kind === "part" && state.partSlots.every((part) => part !== null) &&
      !state.partSlots.some((part) => part?.id === id)) return { id, action: "replace", replaceSlot: 4 };
  if (id === "lemon-crate") {
    const reels = ([0, 1, 2] as const).map((reel) => ({ reel, length: state.reels[reel].length }))
      .sort((left, right) => left.length - right.length || left.reel - right.reel);
    return { id, action: "apply", target: { kind: "two-reels", reels: [reels[0]!.reel, reels[1]!.reel] } };
  }
  if (id === "tithe-box" || id === "artificial-crack") {
    const reel = ([0, 1, 2] as const).reduce((best, candidate) =>
      state.reels[candidate].length < state.reels[best].length ? candidate : best, 0 as ReelIndex);
    return { id, action: "apply", target: { kind: "reel", reel } };
  }
  if (id === "seven-purification") {
    for (const reel of [0, 1, 2] as const) for (const symbol of ["cherry", "lemon"] as const) {
      if (state.reels[reel].includes(symbol)) return { id, action: "apply", target: { kind: "symbol-on-reel", reel, symbol } };
    }
  }
  if (id === "cherry-pitter" || id === "pruning-shears" || id === "carbon-copy") {
    const preferred: BaseSymbolId = route === "chapel" ? "seven" : route === "fruit" ? "cherry" : "bell";
    for (const reel of [0, 1, 2] as const) {
      const symbols = state.reels[reel];
      const symbol = id === "cherry-pitter"
        ? symbols.find((item) => item !== "cherry" && item !== "wild")
        : id === "pruning-shears"
          ? symbols.find((item) => item !== "wild")
          : symbols.includes(preferred) ? preferred : symbols.find((item): item is BaseSymbolId =>
              item === "cherry" || item === "lemon" || item === "bell" || item === "seven");
      if (symbol !== undefined) return { id, action: "apply", target: { kind: "symbol-on-reel", reel, symbol } };
    }
  }
  return { id, action: "apply" };
}

function offeredIds(state: RunState): readonly UpgradeId[] {
  if (state.currentCandidates === null) return [];
  return [state.currentCandidates.synergy, state.currentCandidates.pivot, state.currentCandidates.wildcard];
}

function routeOfferedIds(state: RunState, route: Route): UpgradeId[] {
  return [...offeredIds(state)].filter((id) => UPGRADES[id].route === route);
}

function firstRouteMissing(state: RunState, route: Route): UpgradeId | undefined {
  return ROUTE_CONFIG[route].upgrades.find((id) => !state.acquiredUpgrades.includes(id));
}

function chooseUpgrade(state: RunState, route: Route): RunState {
  const desired = firstRouteMissing(state, route);
  let offered = offeredIds(state);
  let routeOffered = routeOfferedIds(state, route);
  if (routeOffered.length === 0 && state.tips > 0) {
    state = dispatch(state, { type: "REROLL_CANDIDATES" });
    offered = offeredIds(state);
    routeOffered = routeOfferedIds(state, route);
  }
  let selected: UpgradeId | undefined = undefined;
  if (routeOffered.length > 0) {
    const missing = desired !== undefined && routeOffered.includes(desired) ? desired : undefined;
    selected = missing ?? routeOffered.find((id) => !state.acquiredUpgrades.includes(id));
    if (selected === undefined) {
      const desiredTags = new Set<string>(ROUTE_CONFIG[route].upgrades.flatMap((id) => [...UPGRADES[id].tags]));
      selected = [...routeOffered].sort((left, right) => {
      const score = (id: UpgradeId) => UPGRADES[id].tags.filter((tag) => desiredTags.has(tag)).length +
        (UPGRADES[id].route === route ? 10 : 0);
        return score(right) - score(left) || offered.indexOf(left) - offered.indexOf(right);
      })[0];
    }
  }
  return selected === undefined
    ? dispatch(state, { type: "DECLINE_UPGRADE" })
    : dispatch(state, { type: "CHOOSE_UPGRADE", choice: targetForUpgrade(state, selected, route) });
}

function settleBlockIfNeeded(
  state: RunState,
  route: Route,
  afterHoursRounds: number
): { state: RunState; afterHoursRounds: number } {
  let updatedRounds = afterHoursRounds;
  let next = state;
  if (state.phase === "SHIFT_COMPLETE") {
    if (state.currentCandidates !== null) next = chooseUpgrade(state, route);
    else if (updatedRounds < 1) {
      next = dispatch(state, { type: "CONTINUE" });
      updatedRounds += 1;
    } else next = dispatch(state, { type: "CASH_OUT" });
  }
  if (state.phase === "AFTER_HOURS") {
    if (state.currentCandidates !== null) next = chooseUpgrade(state, route);
    else if (updatedRounds < 1) {
      next = dispatch(state, { type: "CONTINUE" });
      updatedRounds += 1;
    } else next = dispatch(state, { type: "CASH_OUT" });
  }
  return { state: next, afterHoursRounds: updatedRounds };
}

export function runBaseRtp(sampleCount: number, seed: number): BaseBalanceReport {
  let rng = { value: seed };
  let bankroll = 1_000_000_000;
  let shiftPayout = 0;
  let agitation = 0;
  let rawPaylinePayout = 0;
  let agitationPayout = 0;
  const payouts: number[] = [];
  for (let spin = 0; spin < sampleCount; spin += 1) {
    const draw = drawReels(BASE_REELS, rng);
    rng = draw.rng;
    const raw = resolveBaseWinlines(draw.grid, 10);
    const settlement = resolveBaseMachineSpin({ grid: draw.grid, currentBet: 10, bankroll: bankroll - 10, shiftPayout, agitation });
    const payout = settlement.shiftPayout - shiftPayout;
    payouts.push(payout);
    rawPaylinePayout += raw;
    agitationPayout += payout - raw;
    bankroll = settlement.bankroll;
    shiftPayout = settlement.shiftPayout;
    agitation = settlement.agitation;
  }
  return {
    sampleCount,
    seed,
    rtp: shiftPayout / (sampleCount * 10),
    payoutMean: mean(payouts),
    payoutStandardDeviation: Math.sqrt(sampleVariance(payouts)),
    rawPaylineDiagnosticRtp: rawPaylinePayout / (sampleCount * 10),
    agitationRtp: agitationPayout / (sampleCount * 10)
  };
}

function resolveBaseWinlines(grid: Grid, bet: number): number {
  return evaluateBaseWins(grid, BASE_PAYTABLE).reduce((sum, win) => sum + win.multiplier * bet, 0);
}

export function runPolicy(route: Route, sampleCount: number, seed: number): RouteBalanceReport {
  let wins = 0;
  let ruins = 0;
  const crossings: number[] = [];
  const distribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, unreachable: 0 };
  const attribution = Object.fromEntries(ATTRIBUTION_SOURCES.map((source) => [source, 0])) as Record<AttributionSource, number>;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const sampleSeed = routeSeed(seed, sample);
    let state = createPolicyRun(route, sampleSeed);
    let policyRuin = false;
    let firstCross: number | null = null;
    const startBankroll = state.bankroll;
    let afterHoursRounds = 0;
    let safeGuard = 0;

    while (state.phase !== "RUN_LOST" && state.phase !== "RUN_WON" && state.shift <= 5) {
      safeGuard += 1;
      if (safeGuard > SAFE_GUARD_LIMIT) {
        if (DEBUG || sample === DEBUG_SAMPLE) {
          console.log(`balance policy fallback: route=${route} sample=${sample} seed=${state.initialSeed} phase=${state.phase}` +
            ` shift=${state.shift} baseSpins=${state.baseSpinsInShift} free=${state.freeSpinQueue}` +
            ` afterHours=${state.afterHoursLevel} rounds=${afterHoursRounds}`);
        }
        policyRuin = true;
        break;
      }
      const shouldTrace = DEBUG || sample === DEBUG_SAMPLE;
      if (shouldTrace) {
        console.log(
          `route=${route} sample=${sample} step=${safeGuard} phase=${state.phase}` +
          ` seed=${state.initialSeed} shift=${state.shift} baseSpins=${state.baseSpinsInShift}` +
          ` free=${state.freeSpinQueue} afterHours=${state.afterHoursLevel}`
        );
      }
      if (DEBUG) {
        console.log(`route=${route} sample=${sample} seed=${state.initialSeed} phase=${state.phase}` +
          ` shift=${state.shift} shiftSpins=${state.baseSpinsInShift} free=${state.freeSpinQueue}` +
          ` afterHours=${state.afterHoursLevel} exitUnlocked=${state.exitUnlocked}`);
      }
      if (state.phase === "READY_TO_SPIN") {
        const mode: BetMode = route === "fruit" && state.shift <= 3 ? "conservative" : "normal";
        if (state.betMode !== mode) state = dispatch(state, { type: "SET_BET_MODE", mode });
        if (state.baseSpinsInShift === 0 && route === "fruit" && state.bankroll >= 20 && !state.shiftFlags.foodBought) {
          const reel = ([0, 1, 2] as const).reduce((best, candidate) =>
            state.reels[candidate].length < state.reels[best].length ? candidate : best, 0 as ReelIndex);
          state = dispatch(state, { type: "BUY_FOOD", reelIndex: reel });
        }
        if (state.baseSpinsInShift === 0 && route === "chapel" && !state.shiftFlags.prayerUsed && state.interventionPoints > 0) {
          state = dispatch(state, { type: "PRAY", symbol: "seven" });
        }
        if (state.freeSpinQueue === 0 && state.bankroll < getCurrentBet(state)) {
          policyRuin = true;
          break;
        }
        state = playSpin(state, route);
      } else if (state.phase === "CHOOSING_UPGRADE") {
        state = chooseUpgrade(state, route);
      } else if (state.phase === "SHIFT_COMPLETE" || state.phase === "AFTER_HOURS") {
        const step = settleBlockIfNeeded(state, route, afterHoursRounds);
        afterHoursRounds = step.afterHoursRounds;
        state = step.state;
      } else {
        throw new Error(`policy ${route} reached unsupported phase ${state.phase}`);
      }
      if (firstCross === null && state.bankroll >= startBankroll) firstCross = state.shift;
    }
    if (state.phase === "RUN_WON") wins += 1;
    if (policyRuin || (state.phase === "RUN_LOST" && (state.shift < 5 || state.baseSpinsInShift < 3))) ruins += 1;
    if (firstCross === null) distribution.unreachable += 1;
    else {
      distribution[String(firstCross) as "1" | "2" | "3" | "4" | "5"] += 1;
      crossings.push(firstCross);
    }
    for (const source of ATTRIBUTION_SOURCES) attribution[source] += state.attribution[source];
  }
  crossings.sort((left, right) => left - right);
  const middle = crossings.length === 0 ? null : crossings[Math.floor((crossings.length - 1) / 2)]!;
  return {
    route,
    sampleCount,
    seed,
    winRate: wins / sampleCount,
    medianBreakEvenShift: middle,
    ruinRate: ruins / sampleCount,
    attributionTotals: attribution,
    firstBreakEvenShiftDistribution: distribution
  };
}

function playSpin(state: RunState, route: Route): RunState {
  state = dispatch(state, { type: "SPIN" });
  state = dispatch(state, { type: "REELS_STOPPED" });
  const grid = state.pendingSpin!.draw.grid;
  if (route === "violent" && !state.shiftFlags.kickUsed) {
    state = dispatch(state, { type: "KICK_REEL", reelIndex: bestKickReel(state) });
    state = dispatch(state, { type: "REELS_STOPPED" });
  } else if (!isPaying(grid) && !state.interventionUsedThisSpin && state.interventionPoints > 0) {
    state = dispatch(state, { type: "RESPIN_REEL", reelIndex: bestRespinReel(grid) });
    state = dispatch(state, { type: "REELS_STOPPED" });
  }
  state = dispatch(state, { type: "ACCEPT_OUTCOME" });
  return dispatch(state, { type: "PRESENTATION_COMPLETE" });
}

export function renderMarkdown(report: BalanceReport, wallTimeMs: number): string {
  const routeRows = (["fruit", "chapel", "violent"] as const).map((route) => {
    const value = report[route];
    return `| ${route} | ${(value.winRate * 100).toFixed(2)}% | ${value.medianBreakEvenShift ?? "不可达"} | ${(value.ruinRate * 100).toFixed(2)}% | ${JSON.stringify(value.firstBreakEvenShiftDistribution)} |`;
  }).join("\n");
  return `# 功能原型验证与平衡基线\n\n` +
    `生成时间：${report.generatedAt}\n\n` +
    `本次实际执行 100,000 次基础结算和每路线 10,000 局完整 controller policy；wall time ${wallTimeMs} ms。` +
    `基础 RTP 是玩家可见结算（含公开躁动），raw payline 仅为诊断。\n\n` +
    `## 基础机\n\n` +
    `- 玩家结算 RTP：${report.base.rtp}\n` +
    `- Raw payline diagnostic RTP：${report.base.rawPaylineDiagnosticRtp}\n` +
    `- Agitation RTP contribution：${report.base.agitationRtp}\n` +
    `- 单转赔付均值 / 样本标准差：${report.base.payoutMean} / ${report.base.payoutStandardDeviation}\n\n` +
    `## 路线结果\n\n| 路线 | 胜率 | 首次跨 100% 中位班次 | 破产率 | 首次跨线分布 |\n|---|---:|---:|---:|---|\n${routeRows}\n\n` +
    `“通关”不单独构成健康结论；第三/第四班跨线、可归因性和真人理解度仍是产品 Go/No-Go。\n\n` +
    `## 工程与真人验收边界\n\n` +
    "工程完成需由 `npm run balance`、`npm run test:coverage`、`npm run e2e`、`npm run verify` 的最新成功输出共同证明。" +
    `桌面生产预览可检查竖屏布局、44px 目标、无横向溢出、手势/按钮、恢复、减弱动态、可选震动失败、加速和直接结算。` +
    `物理手机触控手感、真实后台切换、设备震动与真人试玩 scorecard 保持待验，不在本文件中虚报。\n\n` +
    `## 可机读一致性副本\n\n` +
    "```json\n" +
    `${JSON.stringify(report, null, 2)}\n` +
    "```\n";
}

function assertArtifacts(report: BalanceReport): void {
  const json = JSON.parse(readFileSync(resolve(ROOT, "artifacts/balance-baseline.json"), "utf8")) as BalanceReport;
  const markdown = readFileSync(resolve(ROOT, "docs/validation/functional-prototype.md"), "utf8");
  const embedded = markdown.match(/```json\n([\s\S]+?)\n```/)?.[1];
  if (embedded === undefined || JSON.stringify(json) !== JSON.stringify(report) ||
      JSON.stringify(JSON.parse(embedded)) !== JSON.stringify(report)) throw new Error("balance artifact readback mismatch");
  if (report.base.sampleCount >= 10_000 && (report.base.rtp < 0.75 || report.base.rtp > 0.85)) {
    throw new Error(`base RTP ${report.base.rtp} is outside 0.75–0.85`);
  }
  for (const route of [report.fruit, report.chapel, report.violent]) {
    if (route.sampleCount <= 0 || Object.values(route.attributionTotals).every((value) => value === 0)) {
      throw new Error(`${route.route} report is empty`);
    }
  }
}

const startedAt = performance.now();
const report: BalanceReport = {
  generatedAt: new Date().toISOString(),
  base: runBaseRtp(BASE_SAMPLE_COUNT, 820_126),
  fruit: runPolicy("fruit", ROUTE_SAMPLE_COUNT, 820_127),
  chapel: runPolicy("chapel", ROUTE_SAMPLE_COUNT, 820_128),
  violent: runPolicy("violent", ROUTE_SAMPLE_COUNT, 820_129)
};
const wallTimeMs = Math.round(performance.now() - startedAt);
mkdirSync(resolve(ROOT, "artifacts"), { recursive: true });
mkdirSync(resolve(ROOT, "docs/validation"), { recursive: true });
writeFileSync(resolve(ROOT, "artifacts/balance-baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(resolve(ROOT, "docs/validation/functional-prototype.md"), renderMarkdown(report, wallTimeMs));
assertArtifacts(report);
console.log(JSON.stringify({ wallTimeMs, baseRtp: report.base.rtp, routes: {
  fruit: report.fruit.winRate,
  chapel: report.chapel.winRate,
  violent: report.violent.winRate
}}, null, 2));
