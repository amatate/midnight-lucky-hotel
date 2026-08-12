import type { BetMode, Money, RunState } from "@/core/types";

export const BET_MULTIPLIER = {
  conservative: 0.5,
  normal: 1,
  aggressive: 2
} as const satisfies Readonly<Record<BetMode, number>>;

export function roundMoney(value: number): Money {
  if (!Number.isFinite(value)) throw new RangeError("money must be finite");
  return Math.round(value * 100) / 100;
}

export function getCurrentBet(state: RunState): number {
  const afterHoursScale = 1.25 ** state.afterHoursLevel;
  return roundMoney(state.baseBet * BET_MULTIPLIER[state.betMode] * afterHoursScale);
}
