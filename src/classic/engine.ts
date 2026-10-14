import { nextInt } from "@/core/random";

/** Classic has its own rules and save version: never part of the hotel rules fingerprint. */
export const CLASSIC_VERSION = 1;
export const INITIAL_CREDITS = 1_000;
export const BETS = [5, 10, 25, 50] as const;
export type ClassicSymbol = "cherry" | "lemon" | "bar" | "bell" | "seven" | "blank";
export type Stops = readonly [number, number, number];
export const REELS: readonly (readonly ClassicSymbol[])[] = [
  ["cherry", "lemon", "bar", "blank", "cherry", "bell", "lemon", "bar", "cherry", "seven", "lemon", "blank", "bar", "bell", "cherry", "lemon", "bar", "blank", "bell", "lemon"],
  ["bell", "cherry", "lemon", "bar", "blank", "lemon", "cherry", "bar", "bell", "lemon", "seven", "cherry", "blank", "lemon", "bar", "bell", "lemon", "cherry", "bar", "blank"],
  ["lemon", "bar", "cherry", "bell", "lemon", "blank", "bar", "cherry", "lemon", "bell", "blank", "seven", "cherry", "bar", "lemon", "blank", "bell", "bar", "cherry", "lemon"]
];
export const PAYTABLE = [
  { symbol: "seven", count: 3, multiplier: 150 },
  { symbol: "bell", count: 3, multiplier: 25 },
  { symbol: "bar", count: 3, multiplier: 12 },
  { symbol: "lemon", count: 3, multiplier: 8 },
  { symbol: "cherry", count: 3, multiplier: 5 },
  { symbol: "cherry", count: 2, multiplier: 2 },
  { symbol: "cherry", count: 1, multiplier: 1 }
] as const;

export function symbolAt(reel: number, stop: number): ClassicSymbol {
  const strip = REELS[reel]!;
  return strip[((stop % strip.length) + strip.length) % strip.length]!;
}
export function centerSymbols(stops: Stops): readonly ClassicSymbol[] {
  return stops.map((stop, reel) => symbolAt(reel, stop));
}
export function multiplierFor(symbols: readonly ClassicSymbol[]): number {
  if (symbols.length !== 3) throw new Error("Three center symbols are required.");
  const cherries = symbols.filter((symbol) => symbol === "cherry").length;
  if (cherries > 0) return cherries === 3 ? 5 : cherries;
  if (!symbols.every((symbol) => symbol === symbols[0])) return 0;
  return PAYTABLE.find((row) => row.symbol === symbols[0])?.multiplier ?? 0;
}

export interface ClassicSpin {
  readonly ordinal: number;
  readonly bet: number;
  readonly stops: Stops;
  readonly payout: number;
  readonly at: number;
}
export interface ClassicState {
  readonly version: typeof CLASSIC_VERSION;
  readonly revision: number;
  readonly seed: number;
  readonly rng: number;
  readonly credits: number;
  readonly bet: number;
  readonly stops: Stops;
  readonly spins: number;
  readonly wagered: number;
  readonly paid: number;
  readonly history: readonly ClassicSpin[];
  readonly pending: ClassicSpin | null;
}
export function createClassic(seed: number): ClassicState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error("Invalid classic seed.");
  return { version: CLASSIC_VERSION, revision: 0, seed, rng: seed, credits: INITIAL_CREDITS,
    bet: 10, stops: [0, 0, 0], spins: 0, wagered: 0, paid: 0, history: [], pending: null };
}
export function changeBet(state: ClassicState, bet: number): ClassicState {
  if (state.pending !== null || !BETS.some((value) => value === bet)) throw new Error("Invalid bet change.");
  return { ...state, bet, revision: state.revision + 1 };
}
/** Reserve the wager AND outcome atomically, before any presentation begins. */
export function beginSpin(state: ClassicState, at: number): ClassicState {
  if (state.pending !== null || state.credits < state.bet) throw new Error("The machine is not ready.");
  let rng = { value: state.rng };
  const stops = REELS.map((strip) => { const next = nextInt(rng, strip.length); rng = next.rng; return next.value; }) as unknown as Stops;
  const pending: ClassicSpin = { ordinal: state.spins + 1, bet: state.bet, stops,
    payout: state.bet * multiplierFor(centerSymbols(stops)), at };
  return { ...state, rng: rng.value, credits: state.credits - state.bet, pending, revision: state.revision + 1 };
}
/** Idempotent: reopening a tab settles its already-reserved result only once. */
export function settleSpin(state: ClassicState): ClassicState {
  if (state.pending === null) return state;
  const spin = state.pending;
  return { ...state, pending: null, credits: state.credits + spin.payout, stops: spin.stops,
    spins: spin.ordinal, wagered: state.wagered + spin.bet, paid: state.paid + spin.payout,
    history: [spin, ...state.history].slice(0, 80), revision: state.revision + 1 };
}
/** Exhaustive, equal-stop model, not a sample estimate or a promise for a session. */
export function classicMath(): { rtp: number; hitRate: number; profitRate: number; outcomes: number } {
  let total = 0; let hits = 0; let profits = 0; let outcomes = 0;
  for (const a of REELS[0]!) for (const b of REELS[1]!) for (const c of REELS[2]!) {
    const multiplier = multiplierFor([a, b, c]);
    outcomes++; total += multiplier; if (multiplier > 0) hits++; if (multiplier > 1) profits++;
  }
  return { rtp: total / outcomes, hitRate: hits / outcomes, profitRate: profits / outcomes, outcomes };
}

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
function validStops(value: unknown): value is Stops {
  return Array.isArray(value) && value.length === 3 && value.every((stop, reel) => integer(stop) && stop < REELS[reel]!.length);
}
function validSpin(value: unknown): value is ClassicSpin {
  if (value === null || typeof value !== "object") return false;
  const spin = value as ClassicSpin;
  return integer(spin.ordinal) && spin.ordinal > 0 && BETS.some((bet) => bet === spin.bet) && validStops(spin.stops)
    && integer(spin.at) && spin.payout === spin.bet * multiplierFor(centerSymbols(spin.stops));
}
export function isClassicState(value: unknown): value is ClassicState {
  if (value === null || typeof value !== "object") return false;
  const state = value as ClassicState;
  if (state.version !== CLASSIC_VERSION || ![state.revision, state.seed, state.rng, state.credits, state.spins, state.wagered, state.paid].every(integer)
    || state.seed > 0xffff_ffff || state.rng > 0xffff_ffff || !BETS.some((bet) => bet === state.bet)
    || !validStops(state.stops) || !Array.isArray(state.history) || state.history.length !== Math.min(80, state.spins)
    || !state.history.every((spin, index) => validSpin(spin) && spin.ordinal === state.spins - index)
    || !(state.pending === null || (validSpin(state.pending) && state.pending.ordinal === state.spins + 1 && state.pending.bet === state.bet))) return false;
  return state.credits === INITIAL_CREDITS - state.wagered + state.paid - (state.pending?.bet ?? 0);
}
