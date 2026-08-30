import { useEffect, useRef, useState } from "react";
import { SymbolFace } from "@/app/components/SymbolFace";
import { PAYLINES } from "@/core/paylines";
import type { Grid, LineWin, ReelIndex, RowIndex, RunState, SymbolId } from "@/core/types";
import type { ReelMotionPlan } from "@/presentation/reel-timeline";

export interface SlotMachineProps {
  readonly state: RunState;
  readonly motionPlan: ReelMotionPlan | null;
  readonly reducedMotion: boolean;
  readonly displayGrid?: Grid | null;
  readonly highlightedLineIds?: readonly LineWin["lineId"][];
  readonly changedCells?: readonly { reel: ReelIndex; row: RowIndex }[];
}

interface MotionState {
  readonly timerKey: string | null;
  readonly revealedReels: readonly ReelIndex[];
}

const REEL_INDICES = [0, 1, 2] as const;

const FILLER_TAPES: readonly (readonly SymbolId[])[] = [
  ["bell", "blank", "cherry", "lemon", "seven", "food"],
  ["lemon", "wild", "blank", "bell", "cherry", "crack"],
  ["seven", "food", "lemon", "blank", "bell", "wild"]
];

function stripPreview(state: RunState): Grid {
  return REEL_INDICES.map((reel) => REEL_INDICES.map((row) => state.reels[reel][row] ?? "blank")) as unknown as Grid;
}

function resolvedGrid(state: RunState, displayGrid: Grid | null | undefined): Grid {
  if (displayGrid !== null && displayGrid !== undefined) return displayGrid;
  return state.pendingSpin?.draw.grid ?? stripPreview(state);
}

function cellKey(reel: ReelIndex, row: RowIndex): string {
  return `${reel}-${row}`;
}

function highlightedCells(lineIds: readonly LineWin["lineId"][]): ReadonlySet<string> {
  const cells = new Set<string>();
  for (const lineId of lineIds) {
    const line = PAYLINES.find((candidate) => candidate.lineId === lineId);
    if (line === undefined) continue;
    for (const [reel, row] of line.cells) cells.add(cellKey(reel, row));
  }
  return cells;
}

function FillerTape({ reel }: { readonly reel: ReelIndex }): React.JSX.Element {
  return (
    <div className="reel-filler" data-testid="filler-tape" aria-hidden="true">
      <div className="reel-filler-strip">
        {FILLER_TAPES[reel]!.map((symbol, index) => (
          <SymbolFace symbol={symbol} decorative key={`${reel}-${index}-${symbol}`} />
        ))}
      </div>
    </div>
  );
}

function ReducedCover(): React.JSX.Element {
  return <div className="reel-smoked-cover" data-testid="reduced-reel-cover" aria-hidden="true" />;
}

function motionTimerIdentity(plan: ReelMotionPlan | null, reducedMotion: boolean): string | null {
  if (plan === null) return null;
  const reveals = plan.spinningReels.map((reel) => `${reel}@${plan.revealAtMs[reel] ?? plan.completeAtMs}`).join(",");
  return `${plan.cycleKey}|${reducedMotion ? "reduced" : "full"}|${reveals}|${plan.completeAtMs}`;
}

export function SlotMachine({
  state,
  motionPlan,
  reducedMotion,
  displayGrid,
  highlightedLineIds = [],
  changedCells = []
}: SlotMachineProps): React.JSX.Element {
  const resolved = resolvedGrid(state, displayGrid);
  const explicitReplay = displayGrid !== null && displayGrid !== undefined;
  const activePlan = state.phase === "SPINNING" && !explicitReplay ? motionPlan : null;
  const timerKey = motionTimerIdentity(activePlan, reducedMotion);
  const stableGrid = useRef<Grid>(resolved);
  const [motionState, setMotionState] = useState<MotionState>(() => ({
    timerKey,
    revealedReels: []
  }));

  if (activePlan === null) stableGrid.current = resolved;

  useEffect(() => {
    if (activePlan === null || timerKey === null) {
      setMotionState({ timerKey: null, revealedReels: [] });
      return;
    }

    setMotionState({ timerKey, revealedReels: [] });
    const timers = activePlan.spinningReels.map((reel) => setTimeout(() => {
      setMotionState((current) => current.timerKey !== timerKey || current.revealedReels.includes(reel)
        ? current
        : { timerKey, revealedReels: [...current.revealedReels, reel] });
    }, activePlan.revealAtMs[reel] ?? activePlan.completeAtMs));

    return () => timers.forEach(clearTimeout);
  }, [timerKey]);

  const currentCycleReveals = activePlan !== null && motionState.timerKey === timerKey
    ? new Set(motionState.revealedReels)
    : new Set<ReelIndex>();
  const cycleComplete = activePlan !== null && activePlan.spinningReels.every((reel) => currentCycleReveals.has(reel));
  const highlighted = highlightedCells(highlightedLineIds);
  const changed = new Set(changedCells.map(({ reel, row }) => cellKey(reel, row)));
  const targetGrid = state.pendingSpin?.draw.grid ?? resolved;
  const pausedSpinning = state.phase === "SPINNING" && activePlan === null && !explicitReplay;

  return (
    <section
      className={`slot-machine${activePlan !== null || pausedSpinning ? " is-spinning" : ""}${reducedMotion ? " is-reduced" : ""}`}
      aria-label="老虎机转轮"
      data-motion-kind={activePlan?.kind ?? (pausedSpinning ? "paused" : "none")}
    >
      {REEL_INDICES.map((reel) => {
        const isMoving = activePlan?.spinningReels.includes(reel) === true;
        const isRevealed = isMoving && currentCycleReveals.has(reel);
        const reelState = pausedSpinning
          ? "paused"
          : isMoving
            ? isRevealed ? "settled" : "moving"
            : activePlan?.kind === "repair-lock" ? "locked" : "static";
        const grid = explicitReplay
          ? resolved
          : isRevealed
            ? targetGrid
            : cycleComplete
              ? targetGrid
              : activePlan === null
                ? resolved
                : stableGrid.current;

        return (
          <div
            className={`reel reel-${reelState}`}
            data-testid="reel"
            data-reel-state={reelState}
            aria-label={`第${reel + 1}轮`}
            key={reel}
          >
            {pausedSpinning || (isMoving && !isRevealed)
              ? reducedMotion ? <ReducedCover /> : <FillerTape reel={reel} />
              : grid[reel].map((symbol, row) => {
                  const typedRow = row as RowIndex;
                  const key = cellKey(reel, typedRow);
                  const isHighlighted = highlighted.has(key);
                  const isChanged = changed.has(key);
                  return (
                    <div
                      className={`symbol symbol-${symbol}${isHighlighted ? " is-line-highlighted" : ""}${isChanged ? " is-symbol-changed" : ""}`}
                      data-testid="cell"
                      data-cell={key}
                      data-highlighted={isHighlighted ? "true" : undefined}
                      data-changed={isChanged ? "true" : undefined}
                      key={`${key}-${symbol}`}
                    >
                      <SymbolFace symbol={symbol} />
                    </div>
                  );
                })}
          </div>
        );
      })}
    </section>
  );
}
