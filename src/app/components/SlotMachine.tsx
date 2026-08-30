import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  readonly highlightedReels?: readonly ReelIndex[];
  readonly shakePx?: number;
}

interface MotionState {
  readonly timerKey: string | null;
  readonly revealedReels: readonly ReelIndex[];
}

interface StableObservation {
  readonly initialSeed: number;
  readonly commandHistoryLength: number;
  readonly hadPendingSpin: boolean;
  readonly reels: RunState["reels"];
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

function ReducedCover({ durationMs }: { readonly durationMs: number | null }): React.JSX.Element {
  const timedStyle = durationMs === null
    ? undefined
    : {
        "--reduced-cover-duration": `${durationMs}ms`,
        animationName: "reduced-cover-fade",
        animationDuration: `${durationMs}ms`,
        animationTimingFunction: "linear",
        animationFillMode: "both"
      } as React.CSSProperties;
  return (
    <div
      className="reel-smoked-cover"
      data-testid="reduced-reel-cover"
      data-cover-duration-ms={durationMs ?? undefined}
      style={timedStyle}
      aria-hidden="true"
    />
  );
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
  changedCells = [],
  highlightedReels = [],
  shakePx = 0
}: SlotMachineProps): React.JSX.Element {
  const safeShakePx = Math.max(0, Math.min(6, Number.isFinite(shakePx) ? shakePx : 0));
  const explicitReplay = displayGrid !== null && displayGrid !== undefined;
  const activePlan = state.phase === "SPINNING" && !explicitReplay ? motionPlan : null;
  const timerKey = motionTimerIdentity(activePlan, reducedMotion);
  const immediateGrid = explicitReplay ? displayGrid : state.pendingSpin?.draw.grid;
  const [stableGrid, setStableGrid] = useState<Grid>(() => immediateGrid ?? stripPreview(state));
  const observation = useRef<StableObservation>({
    initialSeed: state.initialSeed,
    commandHistoryLength: state.commandHistory.length,
    hadPendingSpin: state.pendingSpin !== null,
    reels: state.reels
  });
  const [motionState, setMotionState] = useState<MotionState>(() => ({
    timerKey,
    revealedReels: []
  }));

  useLayoutEffect(() => {
    const previous = observation.current;
    const resetRun = previous.initialSeed !== state.initialSeed ||
      state.commandHistory.length < previous.commandHistoryLength;
    let nextStable: Grid | null = null;

    if (explicitReplay) {
      nextStable = displayGrid;
    } else if (resetRun) {
      nextStable = state.pendingSpin?.draw.grid ?? stripPreview(state);
    } else if (activePlan === null && state.pendingSpin !== null) {
      nextStable = state.pendingSpin.draw.grid;
    } else if (state.pendingSpin === null && !previous.hadPendingSpin && state.reels !== previous.reels) {
      nextStable = stripPreview(state);
    }

    if (nextStable !== null && nextStable !== stableGrid) setStableGrid(nextStable);
    observation.current = {
      initialSeed: state.initialSeed,
      commandHistoryLength: state.commandHistory.length,
      hadPendingSpin: state.pendingSpin !== null,
      reels: state.reels
    };
  }, [activePlan, displayGrid, explicitReplay, stableGrid, state]);

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
  const visibleGrid = immediateGrid ?? stableGrid;
  const targetGrid = state.pendingSpin?.draw.grid ?? visibleGrid;
  const pausedSpinning = state.phase === "SPINNING" && activePlan === null && !explicitReplay;

  return (
    <section
      className={`slot-machine${activePlan !== null || pausedSpinning ? " is-spinning" : ""}${reducedMotion ? " is-reduced" : ""}${safeShakePx > 0 ? " is-feedback-shaking" : ""}`}
      aria-label="老虎机转轮"
      data-motion-kind={activePlan?.kind ?? (pausedSpinning ? "paused" : "none")}
      data-coin-source="true"
      style={{ "--cabinet-shake": `${safeShakePx}px` } as React.CSSProperties}
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
          ? visibleGrid
          : isRevealed
            ? targetGrid
            : cycleComplete
              ? targetGrid
                : activePlan === null
                  ? visibleGrid
                  : stableGrid;
        const isReelHighlighted = highlightedReels.includes(reel);

        return (
          <div
            className={`reel reel-${reelState}${isReelHighlighted ? " is-reel-highlighted" : ""}`}
            data-testid="reel"
            data-reel-state={reelState}
            data-reel-highlighted={isReelHighlighted ? "true" : undefined}
            aria-label={`第${reel + 1}轮`}
            key={reel}
          >
            {pausedSpinning || (isMoving && !isRevealed)
              ? reducedMotion
                ? <ReducedCover
                    durationMs={activePlan === null
                      ? null
                      : activePlan.revealAtMs[reel] ?? activePlan.completeAtMs}
                    key={timerKey ?? "paused"}
                  />
                : <FillerTape reel={reel} />
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
