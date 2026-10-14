import { REELS, type Stops } from "./engine";

export interface ReelMotion {
  readonly from: Stops;
  readonly to: Stops;
  readonly startedAt: number;
  readonly reduced: boolean;
}
export const STOP_TIMES = [1_650, 2_100, 2_550] as const;
export const SPIN_DURATION = 2_720;
export const stopTime = (reel: number, reduced: boolean): number => reduced ? 180 + reel * 160 : STOP_TIMES[reel]!;
export const spinDuration = (reduced: boolean): number => reduced ? 580 : SPIN_DURATION;

/** Integrated acceleration/cruise/braking, then a tiny mechanical seating movement. */
export function reelAngle(motion: ReelMotion, reel: number, elapsed: number): number {
  const step = Math.PI * 2 / REELS[reel]!.length;
  const from = motion.from[reel]! * step;
  const target = motion.to[reel]! * step;
  const duration = stopTime(reel, motion.reduced);
  if (motion.reduced) return elapsed < duration ? from : target;
  const finish = from + Math.PI * 2 * (4 + reel) + ((target - from + Math.PI * 2) % (Math.PI * 2));
  if (elapsed >= duration) {
    const seat = Math.min(1, (elapsed - duration) / 150);
    return finish + Math.sin(seat * Math.PI * 2) * (1 - seat) * .025;
  }
  const t = Math.max(0, elapsed / duration);
  const accel = .10; const brake = .58;
  const distance = t < accel ? t * t / (2 * accel) : t < brake ? t - accel / 2
    : brake - accel / 2 + (1 - brake) * (1 - Math.pow((1 - t) / (1 - brake), 3)) / 3;
  const total = brake - accel / 2 + (1 - brake) / 3;
  return from + (finish - from) * distance / total;
}
