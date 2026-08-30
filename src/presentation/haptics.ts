export function vibrate(pattern: number | readonly number[] = 18): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(pattern as number | number[]);
  } catch {
    return false;
  }
}

export function vibrateLeverDetent(): boolean {
  return vibrate(10);
}

export function vibrateSettlement(pattern: number | readonly number[]): boolean {
  if (typeof pattern === "number" && pattern <= 0) return false;
  if (Array.isArray(pattern) && pattern.length === 0) return false;
  return vibrate(pattern);
}
