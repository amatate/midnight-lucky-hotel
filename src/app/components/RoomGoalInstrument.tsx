import type { RoomObjective } from "@/core/types";

/** Receives already-presented progress, not a final receipt or the wallet. */
export function RoomGoalInstrument({ objective, value, target }: {
  readonly objective: RoomObjective | null; readonly value: number; readonly target: number;
}): React.JSX.Element {
  const ratio = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
  if (objective?.kind === "scoring-spins") return <span className="goal-star-lamps" aria-hidden="true">
    {Array.from({ length: objective.count }, (_, index) => <i key={index} data-lit={index < value}>★</i>)}
  </span>;
  if (objective?.kind === "best-spin") return <svg className="goal-peak-gauge" viewBox="0 0 160 56" aria-hidden="true" focusable="false">
    <path d="M18 47A64 64 0 0 1 142 47" fill="none" stroke="currentColor" strokeWidth="1" />
    {[0, 1, 2, 3, 4].map((tick) => <path key={tick} d="M80 3v7" transform={`rotate(${tick * 28 - 56} 80 70)`} stroke="currentColor" />)}
    <path className="goal-needle" d="M80 53V8" transform={`rotate(${ratio * 120 - 60} 80 53)`} stroke="currentColor" strokeWidth="2" />
    <circle cx="80" cy="53" r="3" fill="currentColor" />
  </svg>;
  return <span className="goal-total-fill" style={{ width: `${ratio * 100}%` }} />;
}
