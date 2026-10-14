import { nextInt } from "@/core/random";
import { BETS, INITIAL_CREDITS, PAYTABLE, REELS, beginSpin, changeBet, classicMath, createClassic, settleSpin, type ClassicSpin, type ClassicState, type ClassicSymbol, type Stops } from "./engine";

export const MACHINE_IDS = ["original", "diamond", "wheel", "vault"] as const;
export type MachineId = typeof MACHINE_IDS[number];
export type FeatureMachine = Exclude<MachineId, "original">;
export type ReelSymbol = ClassicSymbol | "diamond" | "wheel";
export type ReelStrips = readonly (readonly ReelSymbol[])[];
export const WHEEL_PRIZES = [1, 2, 3, 2, 10, 2, 3, 1] as const;
export const POOL_SEED = 20_000; // Hundredths of a bet, not chips. 200.00x on reset.
export const POOL_STEP = 4;
export const money = (value: number): number => Math.round(value * 100) / 100;
export const isMachineId = (value: unknown): value is MachineId => MACHINE_IDS.some((id) => id === value);
export const MACHINE_INFO = {
  original: { number: "01", zh: "经典机台", en: "THE ORIGINAL", hint: ["原汁原味 · 中线计奖", "One center line. Pure mechanical play."] },
  diamond: { number: "02", zh: "双倍钻石", en: "DOUBLE DIAMOND", hint: ["钻石补齐三连 · 奖金翻倍", "Wild diamonds complete and multiply wins."] },
  wheel: { number: "03", zh: "午夜轮盘", en: "MIDNIGHT WHEEL", hint: ["第三轮中轮盘 · 额外转大奖", "A wheel on reel three unlocks a bonus spin."] },
  vault: { number: "04", zh: "金库 777", en: "VAULT 777", hint: ["双 7 领小奖 · 三 7 开金库", "Two 7s pay a mini. Three open the vault."] }
} as const;

const diamondReels: ReelStrips = REELS.map((strip) => strip.map((symbol, index) => index === strip.lastIndexOf("blank") ? "diamond" : symbol));
const wheelReels: ReelStrips = REELS.map((strip, reel) => strip.map((symbol, index) => reel === 2 && index === strip.lastIndexOf("blank") ? "wheel" : symbol));
export const machineReels = (id: MachineId): ReelStrips => id === "diamond" ? diamondReels : id === "wheel" ? wheelReels : REELS;
export function machineSymbolAt(id: MachineId, reel: number, stop: number): ReelSymbol {
  const strip = machineReels(id)[reel]!;
  return strip[((stop % strip.length) + strip.length) % strip.length]!;
}
export const machineSymbols = (id: MachineId, stops: Stops): readonly ReelSymbol[] => stops.map((stop, reel) => machineSymbolAt(id, reel, stop));

const diamondTable = [
  { symbol: "seven", count: 3, multiplier: 20 }, { symbol: "bell", count: 3, multiplier: 6 },
  { symbol: "bar", count: 3, multiplier: 3 }, { symbol: "cherry", count: 3, multiplier: 3 },
  { symbol: "lemon", count: 3, multiplier: 2 }, { symbol: "cherry", count: 2, multiplier: 2 }, { symbol: "cherry", count: 1, multiplier: 1 }
] as const;
const bonusTable = [
  { symbol: "seven", count: 3, multiplier: 100 }, { symbol: "bell", count: 3, multiplier: 15 },
  { symbol: "bar", count: 3, multiplier: 8 }, { symbol: "lemon", count: 3, multiplier: 5 },
  { symbol: "cherry", count: 3, multiplier: 4 }, { symbol: "cherry", count: 2, multiplier: 2 }, { symbol: "cherry", count: 1, multiplier: 1 }
] as const;
export const machinePaytable = (id: MachineId) => id === "original" ? PAYTABLE : id === "diamond" ? diamondTable : id === "vault" ? bonusTable.filter((row) => row.symbol !== "seven") : bonusTable;

export type FeatureKind = "none" | "multiply" | "diamond-jackpot" | "wheel" | "mini" | "jackpot";
export interface FeatureAward {
  readonly basePayout: number;
  readonly bonusPayout: number;
  readonly payout: number;
  readonly multiplier: number;
  readonly feature: FeatureKind;
  readonly wheelIndex: number | null;
  readonly poolBefore: number;
  readonly poolAfter: number;
}
export interface FeatureSpin extends ClassicSpin, FeatureAward {}
export interface FeatureState extends Omit<ClassicState, "history" | "pending"> {
  readonly machine: FeatureMachine;
  readonly pool: number;
  readonly jackpots: number;
  readonly poolPaid: number;
  readonly history: readonly FeatureSpin[];
  readonly pending: FeatureSpin | null;
}
export type MachineState = ClassicState | FeatureState;
export const isFeatureState = (state: MachineState): state is FeatureState => "machine" in state;
export const isFeatureSpin = (spin: ClassicSpin): spin is FeatureSpin => "feature" in spin;

function naturalMultiplier(id: FeatureMachine, line: readonly ReelSymbol[]): number {
  const cherries = line.filter((symbol) => symbol === "cherry").length;
  const row = cherries > 0 ? machinePaytable(id).find((entry) => entry.symbol === "cherry" && entry.count === cherries)
    : line.every((symbol) => symbol === line[0]) ? machinePaytable(id).find((entry) => entry.symbol === line[0] && entry.count === 3) : undefined;
  return row?.multiplier ?? 0;
}

/** Award description is the sole authority for both ledger and presentation. */
export function featureAward(id: FeatureMachine, line: readonly ReelSymbol[], bet: number, poolBefore = 0, wheelIndex: number | null = null): FeatureAward {
  let basePayout = bet * naturalMultiplier(id, line); let bonusPayout = 0; let multiplier = 1;
  let feature: FeatureKind = "none";
  const pool = id === "vault" ? poolBefore + POOL_STEP : 0;
  let poolAfter = pool;
  if (id === "diamond") {
    const diamonds = line.filter((symbol) => symbol === "diamond").length;
    if (diamonds === 3) { basePayout = 100 * bet; feature = "diamond-jackpot"; }
    else if (diamonds > 0) {
      const others = line.filter((symbol) => symbol !== "diamond");
      if (others.every((symbol) => symbol === others[0])) {
        const full = machinePaytable(id).find((row) => row.symbol === others[0] && row.count === 3)?.multiplier ?? 0;
        if (full * bet * 2 ** diamonds > basePayout) {
          multiplier = 2 ** diamonds; basePayout = full * bet; bonusPayout = basePayout * (multiplier - 1); feature = "multiply";
        }
      }
    }
  } else if (id === "wheel" && line[2] === "wheel") {
    if (wheelIndex === null || !Number.isInteger(wheelIndex) || wheelIndex < 0 || wheelIndex >= WHEEL_PRIZES.length) throw new Error("Invalid wheel sector.");
    bonusPayout = bet * WHEEL_PRIZES[wheelIndex]!; feature = "wheel";
  } else if (id === "vault") {
    const sevens = line.filter((symbol) => symbol === "seven").length;
    if (sevens === 3) { bonusPayout = money(bet * pool / 100); poolAfter = POOL_SEED; feature = "jackpot"; }
    else if (sevens === 2) { bonusPayout = 10 * bet; feature = "mini"; }
  }
  return { basePayout, bonusPayout, payout: money(basePayout + bonusPayout), multiplier, feature,
    wheelIndex: feature === "wheel" ? wheelIndex : null, poolBefore: id === "vault" ? poolBefore : 0, poolAfter };
}

export function createMachine(id: MachineId, seed: number): MachineState {
  const original = createClassic(seed);
  return id === "original" ? original : { ...original, machine: id, pool: id === "vault" ? POOL_SEED : 0, poolPaid: 0, jackpots: 0, history: [], pending: null };
}
export function changeMachineBet(state: MachineState, bet: number): MachineState {
  return changeBet(state, bet) as MachineState;
}
export function beginMachineSpin(state: MachineState, at: number): MachineState {
  if (!isFeatureState(state)) return beginSpin(state, at);
  if (state.pending || state.credits < state.bet || !Number.isSafeInteger(at) || at < 0) throw new Error("The machine is not ready.");
  let rng = { value: state.rng };
  const stops = machineReels(state.machine).map((strip) => { const next = nextInt(rng, strip.length); rng = next.rng; return next.value; }) as unknown as Stops;
  const line = machineSymbols(state.machine, stops); let wheelIndex: number | null = null;
  if (state.machine === "wheel" && line[2] === "wheel") { const next = nextInt(rng, WHEEL_PRIZES.length); rng = next.rng; wheelIndex = next.value; }
  const pending: FeatureSpin = { ordinal: state.spins + 1, bet: state.bet, stops, at, ...featureAward(state.machine, line, state.bet, state.pool, wheelIndex) };
  return { ...state, rng: rng.value, credits: money(state.credits - state.bet), pending, revision: state.revision + 1 };
}
export function settleMachineSpin(state: MachineState): MachineState {
  if (!isFeatureState(state)) return settleSpin(state);
  const spin = state.pending; if (!spin) return state;
  const jackpot = spin.feature === "jackpot";
  return { ...state, pending: null, credits: money(state.credits + spin.payout), stops: spin.stops,
    spins: spin.ordinal, wagered: state.wagered + spin.bet, paid: money(state.paid + spin.payout),
    pool: spin.poolAfter, poolPaid: state.poolPaid + (jackpot ? spin.poolBefore + POOL_STEP : 0), jackpots: state.jackpots + (jackpot ? 1 : 0),
    history: [spin, ...state.history].slice(0, 80), revision: state.revision + 1 };
}

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const validMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && money(value) === value;
const validStops = (value: unknown): value is Stops => Array.isArray(value) && value.length === 3 && value.every((stop) => integer(stop) && stop < 20);
function validFeatureSpin(value: unknown, id: FeatureMachine): value is FeatureSpin {
  if (!value || typeof value !== "object") return false;
  const spin = value as FeatureSpin;
  if (!integer(spin.ordinal) || spin.ordinal < 1 || !integer(spin.at) || !BETS.some((bet) => bet === spin.bet) || !validStops(spin.stops)
    || !integer(spin.poolBefore) || (id === "vault" ? spin.poolBefore < POOL_SEED || (spin.poolBefore - POOL_SEED) % POOL_STEP !== 0 : spin.poolBefore !== 0)) return false;
  try {
    const award = featureAward(id, machineSymbols(id, spin.stops), spin.bet, spin.poolBefore, spin.wheelIndex);
    return (Object.keys(award) as (keyof FeatureAward)[]).every((key) => award[key] === spin[key]);
  } catch { return false; }
}
export function isFeatureMachineState(value: unknown, id: FeatureMachine): value is FeatureState {
  if (!value || typeof value !== "object") return false;
  const state = value as FeatureState;
  if (state.version !== 1 || state.machine !== id || ![state.revision, state.seed, state.rng, state.spins, state.wagered, state.pool, state.poolPaid, state.jackpots].every(integer)
    || state.seed > 0xffff_ffff || state.rng > 0xffff_ffff || !validMoney(state.credits) || !validMoney(state.paid)
    || !BETS.some((bet) => bet === state.bet) || !validStops(state.stops) || !Array.isArray(state.history)
    || state.history.length !== Math.min(80, state.spins) || !state.history.every((spin, i) => validFeatureSpin(spin, id) && spin.ordinal === state.spins - i)
    || !(state.pending === null || validFeatureSpin(state.pending, id) && state.pending.ordinal === state.spins + 1 && state.pending.bet === state.bet && state.pending.poolBefore === state.pool)) return false;
  if (state.credits !== money(INITIAL_CREDITS - state.wagered + state.paid - (state.pending?.bet ?? 0))) return false;
  if (state.jackpots > state.spins || (id === "vault" ? state.pool !== POOL_SEED * (1 + state.jackpots) + state.spins * POOL_STEP - state.poolPaid || state.pool < POOL_SEED
    : state.pool !== 0 || state.poolPaid !== 0 || state.jackpots !== 0)) return false;
  const latest = state.history[0];
  if (latest && (latest.poolAfter !== state.pool || !state.stops.every((stop, i) => stop === latest.stops[i]))) return false;
  return state.history.every((spin, i) => !state.history[i + 1] || spin.poolBefore === state.history[i + 1]!.poolAfter);
}

export function machineMath(id: MachineId, pool = POOL_SEED): { rtp: number; hitRate: number; profitRate: number; featureRate: number; outcomes: number; longRunRtp: number } {
  if (id === "original") { const math = classicMath(); return { ...math, featureRate: 0, longRunRtp: math.rtp }; }
  let total = 0; let hits = 0; let profits = 0; let features = 0; let outcomes = 0;
  const reels = machineReels(id);
  for (const a of reels[0]!) for (const b of reels[1]!) for (const c of reels[2]!) {
    const sectors = id === "wheel" && c === "wheel" ? WHEEL_PRIZES.map((_, i) => i) : [null];
    for (const sector of sectors) {
      const award = featureAward(id, [a, b, c], 100, id === "vault" ? pool : 0, sector);
      const weight = 1 / sectors.length;
      total += award.payout / 100 * weight; hits += (award.payout > 0 ? 1 : 0) * weight;
      profits += (award.payout > 100 ? 1 : 0) * weight; features += (award.feature !== "none" ? 1 : 0) * weight;
    }
    outcomes++;
  }
  return { outcomes, rtp: total / outcomes, hitRate: hits / outcomes, profitRate: profits / outcomes, featureRate: features / outcomes,
    longRunRtp: id === "vault" ? .937 : total / outcomes };
}
