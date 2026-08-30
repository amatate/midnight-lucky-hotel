import type { FeedbackTier } from "@/presentation/summary";

export interface FeedbackPlan {
  readonly coinCount: 0 | 8 | 24 | 48;
  readonly shakePx: 0 | 3 | 6;
  readonly hapticPattern: number | readonly number[];
  readonly tone: "none" | "win" | "chain" | "runaway";
}

export interface CoinPath {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly delayMs: number;
}

const PLANS: Readonly<Record<FeedbackTier, FeedbackPlan>> = {
  none: { coinCount: 0, shakePx: 0, hapticPattern: 0, tone: "none" },
  win: { coinCount: 8, shakePx: 0, hapticPattern: 12, tone: "win" },
  chain: { coinCount: 24, shakePx: 3, hapticPattern: [10, 40, 10, 40, 22], tone: "chain" },
  runaway: { coinCount: 48, shakePx: 6, hapticPattern: [22, 24, 12, 24, 30], tone: "runaway" }
};

const COIN_PATHS: readonly CoinPath[] = Array.from({ length: 48 }, (_unused, index) => ({
  index,
  x: (index * 37) % 101 - 50,
  y: -70 - ((index * 29) % 81),
  rotation: (index * 83) % 361 - 180,
  delayMs: (index % 8) * 18
}));

export function feedbackPlan(tier: FeedbackTier, reducedMotion: boolean): FeedbackPlan {
  const plan = PLANS[tier];
  return reducedMotion ? { ...plan, coinCount: 0, shakePx: 0 } : plan;
}

export function coinBurstPaths(count: number): readonly CoinPath[] {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.min(48, Math.trunc(count))) : 0;
  return COIN_PATHS.slice(0, safeCount);
}
