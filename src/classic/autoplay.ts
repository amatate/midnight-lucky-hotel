import type { ClassicSpin } from "./engine";

export const AUTO_COUNTS = [10, 25, 50, 100] as const;
export const AUTO_LIMITS = [50, 100, 250, 500] as const;
export type AutoReason = "complete" | "manual" | "background" | "funds" | "limit" | "big-win" | "error";
export interface AutoOptions { readonly count: number; readonly lossLimit: number; readonly stopOnBig: boolean }
export interface AutoRun extends AutoOptions {
  readonly bet: number; readonly lastOrdinal: number; readonly completed: number;
  readonly wagered: number; readonly paid: number; readonly largest: number;
  readonly status: "running" | "stopping" | "stopped"; readonly pending: boolean;
  readonly reason: AutoReason | null;
}
export function startAuto(options: AutoOptions, bet: number, ordinal: number): AutoRun {
  if (!AUTO_COUNTS.some(n => n === options.count) || !AUTO_LIMITS.some(n => n === options.lossLimit)
    || !Number.isSafeInteger(bet) || bet <= 0) throw new Error("Invalid automatic play options");
  return { ...options, bet, lastOrdinal: ordinal, completed: 0, wagered: 0, paid: 0, largest: 0, status: "running", pending: false, reason: null };
}
export function autoBoundary(run: AutoRun, credits: number): AutoReason | null {
  if (run.completed >= run.count) return "complete";
  if (credits < run.bet) return "funds";
  // Never reserve a wager that could take this session past its net-loss budget.
  if (run.wagered - run.paid + run.bet > run.lossLimit) return "limit";
  return null;
}
export function stopAuto(run: AutoRun, reason: AutoReason): AutoRun {
  if (run.status === "stopped") return run;
  return { ...run, status: run.pending ? "stopping" : "stopped", reason };
}
export function cancelAutoReservation(run: AutoRun): AutoRun {
  return { ...run, pending: false, status: run.status === "stopping" ? "stopped" : run.status };
}
export function recordAuto(run: AutoRun, spin: ClassicSpin, credits: number): AutoRun {
  if (!run.pending || spin.ordinal !== run.lastOrdinal + 1 || spin.bet !== run.bet) return run;
  const next: AutoRun = { ...run, pending: false, lastOrdinal: spin.ordinal, completed: run.completed + 1,
    wagered: run.wagered + spin.bet, paid: run.paid + spin.payout, largest: Math.max(run.largest, spin.payout) };
  const reason = run.reason ?? (run.stopOnBig && spin.payout >= spin.bet * 12 ? "big-win" : autoBoundary(next, credits));
  return reason ? { ...next, status: "stopped", reason } : next;
}
export function autoGap(spin: ClassicSpin | null): number {
  if (!spin) return 500;
  return spin.payout >= spin.bet * 12 ? 3_000 : spin.payout > spin.bet ? 1_200 : spin.payout > 0 ? 800 : 650;
}
