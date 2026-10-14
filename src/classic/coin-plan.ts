/** Cosmetic data only. Never reads or advances the game's random stream. */
export type CoinTier = "small" | "medium" | "large";
export interface CoinCue { readonly id: number; readonly seed: number; readonly tier: CoinTier }
export const MAX_COINS = 32;
export const COIN_PRESETS = {
  small: { count: 8, interval: .09, lifetime: 4.2 },
  medium: { count: 18, interval: .065, lifetime: 4.8 },
  large: { count: MAX_COINS, interval: .055, lifetime: 5.6 }
} as const;
export function payoutCoinCue(spin: { readonly ordinal: number; readonly payout: number; readonly bet: number }): CoinCue | null {
  if (!Number.isFinite(spin.payout) || !Number.isFinite(spin.bet) || spin.bet <= 0 || spin.payout <= spin.bet) return null;
  return { id: spin.ordinal, seed: (spin.ordinal * 7919 + Math.round(spin.payout * 100)) >>> 0,
    tier: spin.payout >= spin.bet * 12 ? "large" : spin.payout >= spin.bet * 5 ? "medium" : "small" };
}
export function cosmeticRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 0x100000000; };
}
