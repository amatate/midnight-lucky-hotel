export interface WheelMotion { readonly index: number; readonly from: number; readonly startedAt: number; readonly reduced: boolean }
export const WHEEL_DURATION = 3_600;
export const wheelDuration = (reduced: boolean) => reduced ? 240 : WHEEL_DURATION;
export const wheelRestAngle = (index: number) => ((8 - index) % 8) * 45;
/** Physical sectors are equal probability; the pointer rests exactly at the awarded sector's center. */
export function wheelAngle(motion: WheelMotion, elapsed: number): number {
  const target = wheelRestAngle(motion.index);
  const from = wheelRestAngle(motion.from);
  if (motion.reduced) return elapsed < 240 ? from : target;
  const finish = from + 4 * 360 + ((target - from + 360) % 360);
  const running = WHEEL_DURATION - 180;
  if (elapsed >= running) {
    const seat = Math.min(1, (elapsed - running) / 180);
    return finish + Math.sin(seat * Math.PI * 2) * (1 - seat) * 1.2;
  }
  const t = Math.max(0, elapsed / running);
  // Short acceleration, long eased braking, then a restrained detent rebound.
  const accel = .12;
  const distance = t < accel ? t * t / (2 * accel) : accel / 2 + (1 - accel) * (1 - Math.pow((1 - t) / (1 - accel), 4)) / 4;
  return from + (finish - from) * distance / (accel / 2 + (1 - accel) / 4);
}
