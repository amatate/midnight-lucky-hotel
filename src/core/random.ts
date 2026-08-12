import type { RandomIntResult, RngState } from "@/core/types";

export function nextInt(rng: RngState, maxExclusive: number): RandomIntResult {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError("maxExclusive must be a positive integer");
  }

  const nextState = (rng.value + 0x6d2b79f5) >>> 0;
  let mixed = nextState;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const unit = ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;

  return { value: Math.floor(unit * maxExclusive), rng: { value: nextState } };
}
