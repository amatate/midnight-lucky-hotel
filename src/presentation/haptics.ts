export function vibrate(pattern: number | readonly number[] = 18): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(pattern as number | number[]);
  } catch {
    return false;
  }
}
