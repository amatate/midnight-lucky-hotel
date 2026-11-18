import type { ReelWindow, SymbolId } from "@/core/types";

/** Visual tape only. Never samples RNG or writes a reel, stop, award or save. */
export interface DrumPath {
  readonly from: ReelWindow;
  readonly to: ReelWindow;
  readonly strip: readonly SymbolId[];
  readonly travel: number;
}

/** Same acceleration/cruise/brake profile as the classic cabinet, with seating
 * contained inside the existing hotel reveal deadline (not extra game time). */
export function drumDistance(elapsed: number, duration: number, travel: number, start = 0): number {
  if (elapsed >= duration) return travel;
  if (elapsed <= 0) return start;
  const seating = Math.min(110, duration * .18);
  const stop = duration - seating;
  if (elapsed >= stop) {
    const t = (elapsed - stop) / seating;
    return travel + Math.sin(t * Math.PI * 2) * (1 - t) * .075;
  }
  const t = elapsed / stop, accel = .10, brake = .58;
  const distance = t < accel ? t * t / (2 * accel) : t < brake ? t - accel / 2
    : brake - accel / 2 + (1 - brake) * (1 - Math.pow((1 - t) / (1 - brake), 3)) / 3;
  return start + (travel - start) * distance / (brake - accel / 2 + (1 - brake) / 3);
}

/** Front-facing panels are index +1 / index / index -1, top to bottom.
 * Decorations use the real variable-length strip; the final three symbols
 * always come from the authoritative grid, including non-canonical cascades. */
export function drumSymbol(path: DrumPath, index: number): SymbolId {
  if (Math.abs(index - path.travel) <= 1) return path.to[1 - (index - path.travel)]!;
  if (Math.abs(index) <= 1) return path.from[1 - index]!;
  const length = path.strip.length;
  return length ? path.strip[((-index % length) + length) % length]! : "blank";
}
