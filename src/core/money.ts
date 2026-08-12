import type { Money } from "@/core/types";

/** Largest value whose cents remain representable as a safe integer. */
export const MAX_MONEY = Number.MAX_SAFE_INTEGER / 100;

/** Settlement-grade cent rounding with finite saturation. */
export function safeMoney(value: number): Money {
  if (Number.isNaN(value)) return 0;
  const bounded = Math.min(MAX_MONEY, Math.max(-MAX_MONEY, value));
  return Math.round(bounded * 100) / 100;
}

/** Settlement-grade nonnegative payout normalization. */
export function safePayout(value: number): Money {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return safeMoney(value);
}
