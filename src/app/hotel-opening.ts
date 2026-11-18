import { nextInt } from "@/core/random";
import type { Grid, RunState } from "@/core/types";

/** Generate a seed only when the guest actually starts a new night. */
export function freshHotelSeed(previous?: number): number {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return seed === previous ? (seed + 1) >>> 0 : seed;
}

/** An idle display, not the first paid draw. Its separate stream never advances the run. */
export function openingDisplay({ initialSeed, reels }: Pick<RunState, "initialSeed" | "reels">): Grid {
  let visual = { value: (initialSeed ^ 0xac78152d) >>> 0 };
  return reels.map(strip => {
    const pick = nextInt(visual, strip.length);
    visual = pick.rng;
    return [0, 1, 2].map(row => strip[(pick.value + row) % strip.length]!);
  }) as unknown as Grid;
}
