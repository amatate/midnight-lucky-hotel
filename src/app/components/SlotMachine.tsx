import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SymbolFace } from "@/app/components/SymbolFace";
import { HotelDrums } from "@/app/components/HotelDrums";
import { PAYLINES } from "@/core/paylines";
import type { BoardInterventionController } from "@/app/useBoardIntervention";
import type { Grid, LineWin, ReelIndex, RowIndex, RunState, SymbolId } from "@/core/types";
import type { ReelMotionPlan } from "@/presentation/reel-timeline";
import { playSfx } from "@/presentation/audio";
import "@/app/drums.css";
import { openingDisplay } from "@/app/hotel-opening";

export interface SlotMachineProps {
  readonly state: RunState;
  readonly motionPlan: ReelMotionPlan | null;
  readonly reducedMotion: boolean;
  readonly displayGrid?: Grid | null;
  readonly idleGrid?: Grid | null;
  readonly highlightedLineIds?: readonly LineWin["lineId"][];
  readonly changedCells?: readonly { reel: ReelIndex; row: RowIndex }[];
  readonly highlightedReels?: readonly ReelIndex[];
  readonly shakePx?: number;
  readonly intervention?: BoardInterventionController;
  readonly foodSelection?: { readonly reel: ReelIndex; readonly onSelect: (reel: ReelIndex) => void } | undefined;
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

function FillerTape({ reel, strip }: { readonly reel: ReelIndex; readonly strip: readonly SymbolId[] }): React.JSX.Element {
  // Decorative motion samples the real strip; it never draws or predicts a result.
  const tape = Array.from({ length: 6 }, (_, index) => strip[Math.floor(index * strip.length / 6)] ?? "blank");
  return (
    <div className="reel-filler" data-testid="filler-tape" aria-hidden="true">
      <div className="reel-filler-strip">
        {[...tape, ...tape].map((symbol, index) => (
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
  idleGrid,
  highlightedLineIds = [],
  changedCells = [],
  highlightedReels = [],
  shakePx = 0,
  intervention,
  foodSelection
}: SlotMachineProps): React.JSX.Element {
  const safeShakePx = Math.max(0, Math.min(6, Number.isFinite(shakePx) ? shakePx : 0));
  const explicitReplay = displayGrid !== null && displayGrid !== undefined;
  const activePlan = state.phase === "SPINNING" && !explicitReplay ? motionPlan : null;
  const timerKey = motionTimerIdentity(activePlan, reducedMotion);
  const startedAt = useMemo(() => performance.now(), [timerKey]);
  const [drumsReady, setDrumsReady] = useState(false);
  const immediateGrid = explicitReplay ? displayGrid : state.pendingSpin?.draw.grid;
  const idle = useMemo(() => idleGrid ?? state.spinHistory.at(-1)?.finalGrid ?? openingDisplay(state),
    [idleGrid, state.spinHistory, state.reels, state.initialSeed]);
  const [stableGrid, setStableGrid] = useState<Grid>(() => immediateGrid ?? idle);
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
      nextStable = state.pendingSpin?.draw.grid ?? idle;
    } else if (activePlan === null && state.pendingSpin !== null) {
      nextStable = state.pendingSpin.draw.grid;
    } else if (state.pendingSpin === null && !previous.hadPendingSpin && state.reels !== previous.reels) {
      nextStable = idle;
    }

    if (nextStable !== null && nextStable !== stableGrid) setStableGrid(nextStable);
    observation.current = {
      initialSeed: state.initialSeed,
      commandHistoryLength: state.commandHistory.length,
      hadPendingSpin: state.pendingSpin !== null,
      reels: state.reels
    };
  }, [activePlan, displayGrid, explicitReplay, idle, stableGrid, state]);

  useEffect(() => {
    if (activePlan === null || timerKey === null) {
      setMotionState({ timerKey: null, revealedReels: [] });
      return;
    }

    setMotionState({ timerKey, revealedReels: [] });
    const timers = activePlan.spinningReels.map((reel) => setTimeout(() => {
      playSfx("stop", 1 + reel * .035);
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
  const board = state.phase === "AWAITING_INTERVENTION" && !explicitReplay ? intervention : undefined;
  const atRisk = highlightedCells(board?.preview?.atRiskLineIds ?? []);
  const changed = new Set(changedCells.map(({ reel, row }) => cellKey(reel, row)));
  const visibleGrid = immediateGrid ?? stableGrid;
  const targetGrid = state.pendingSpin?.draw.grid ?? visibleGrid;
  const pausedSpinning = state.phase === "SPINNING" && activePlan === null && !explicitReplay;
  const shownGrid = REEL_INDICES.map(reel => (board?.preview?.grid ?? (explicitReplay ? visibleGrid
    : currentCycleReveals.has(reel) || cycleComplete ? targetGrid : activePlan === null ? visibleGrid : stableGrid))[reel]) as unknown as Grid;

  return (
    <section
      className={`slot-machine continuous-drums${activePlan !== null || pausedSpinning ? " is-spinning" : ""}${reducedMotion ? " is-reduced" : ""}${safeShakePx > 0 ? " is-feedback-shaking" : ""}`}
      aria-label="老虎机转轮"
      data-motion-kind={activePlan?.kind ?? (pausedSpinning ? "paused" : "none")}
      data-renderer={drumsReady && !reducedMotion ? "3d" : "2d"}
      data-coin-source="true"
      data-board-preview={board?.preview?.grid != null ? "kick" : undefined}
      style={{ "--cabinet-shake": `${safeShakePx}px` } as React.CSSProperties}
    >
      <HotelDrums frame={{ grid: shownGrid, startGrid: idle, target: targetGrid,
        strips: state.pendingSpin?.draw.strips ?? state.reels, plan: activePlan, paused: pausedSpinning, startedAt }}
        reducedMotion={reducedMotion} onReady={setDrumsReady} />
      {REEL_INDICES.map((reel) => {
        const isMoving = activePlan?.spinningReels.includes(reel) === true;
        const isRevealed = isMoving && currentCycleReveals.has(reel);
        const reelState = pausedSpinning
          ? "paused"
          : isMoving
            ? isRevealed ? "settled" : "moving"
            : activePlan?.kind === "repair-lock" ? "locked" : "static";
        const actualGrid = explicitReplay
          ? visibleGrid
          : isRevealed
            ? targetGrid
            : cycleComplete
              ? targetGrid
                : activePlan === null
                  ? visibleGrid
                  : stableGrid;
        // Never feed a speculative board into stableGrid or the reel-motion timeline.
        const grid = board?.preview?.grid ?? actualGrid;
        const selected = board?.selectedReel === reel || foodSelection?.reel === reel;
        const affected = board?.preview?.affectedReels.includes(reel) === true;
        const boardAction = board?.preview == null ? undefined : affected
          ? board.preview.grid === null ? "change" : "preview"
          : "keep";
        const isReelHighlighted = highlightedReels.includes(reel);

        return (
          <div
            className={`reel reel-${reelState}${isReelHighlighted ? " is-reel-highlighted" : ""}`}
            data-testid="reel"
            data-reel-state={reelState}
            data-reel-highlighted={isReelHighlighted ? "true" : undefined}
            data-intervention-action={boardAction}
            data-intervention-selected={selected ? "true" : undefined}
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
                : <FillerTape reel={reel} strip={state.pendingSpin?.draw.strips[reel] ?? state.reels[reel]} />
              : grid[reel].map((symbol, row) => {
                  const typedRow = row as RowIndex;
                  const key = cellKey(reel, typedRow);
                  const isHighlighted = highlighted.has(key);
                  const isChanged = changed.has(key);
                  const isPreviewChanged = board?.preview?.grid != null && symbol !== actualGrid[reel][typedRow];
                  return (
                    <div
                      className={`symbol symbol-${symbol}${isHighlighted ? " is-line-highlighted" : ""}${isChanged ? " is-symbol-changed" : ""}${atRisk.has(key) ? " is-intervention-risk" : ""}${isPreviewChanged ? " is-preview-changed" : ""}`}
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
            {board?.selectableReels.includes(reel) && <button
              type="button" className="reel-select-overlay" aria-label={`选择第${reel + 1}轮`}
              aria-pressed={selected} disabled={!board.enabled} onClick={() => board.selectReel(reel)}
            ><span>{boardAction === "keep" ? "保持" : boardAction === "preview" ? "预览" : selected ? "已选" : `第${reel + 1}轮`}</span></button>}
            {foodSelection !== undefined && <button type="button" className="reel-select-overlay" aria-label={`送餐至第${reel + 1}轮`}
              aria-pressed={selected} onClick={() => foodSelection.onSelect(reel)}><span>{selected ? "送餐目标" : "选择"}</span></button>}
          </div>
        );
      })}
      {activePlan === null && !pausedSpinning && highlightedLineIds.length > 0 && <svg className="drum-paylines" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
        {PAYLINES.filter((line) => highlightedLineIds.includes(line.lineId)).map((line) => <polyline key={line.lineId}
          points={line.cells.map(([reel, row]) => `${reel * 100 + 50},${row * 100 + 50}`).join(" ")} />)}
      </svg>}
    </section>
  );
}
