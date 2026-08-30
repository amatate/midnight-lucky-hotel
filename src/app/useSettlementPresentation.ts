import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { PAYLINES } from "@/core/paylines";
import { getCurrentBet } from "@/core/progression";
import type { Grid, LineWin, PartId, ReelIndex, RowIndex, RunState } from "@/core/types";
import { playEventTone, unlockAudio } from "@/presentation/audio";
import { feedbackPlan } from "@/presentation/feedback";
import { vibrateSettlement } from "@/presentation/haptics";
import { buildGridReplay, type GridReplay } from "@/presentation/replay";
import { summarizePresentation, type PresentationSummary } from "@/presentation/summary";

export interface SettlementPresentationState {
  readonly summary: PresentationSummary;
  readonly currentEvent: GameEvent | null;
  readonly eventIndex: number;
  readonly eventTotal: number;
  readonly activeLineIds: readonly LineWin["lineId"][];
  readonly activePartId: PartId | null;
  readonly changedCells: readonly { reel: ReelIndex; row: RowIndex }[];
  readonly displayGrid: Grid | null;
  readonly done: boolean;
  readonly accelerated: boolean;
  readonly speedUp: () => void;
  readonly skip: () => void;
}

export interface SettlementPresentationOptions {
  readonly state: RunState;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly onCommand: (command: GameCommand) => void;
}

interface PresentationView {
  readonly key: string | null;
  readonly currentEvent: GameEvent | null;
  readonly eventIndex: number;
  readonly displayGrid: Grid | null;
  readonly changedCells: readonly { reel: ReelIndex; row: RowIndex }[];
  readonly delayMs: number;
  readonly done: boolean;
  readonly accelerated: boolean;
}

interface PresentationCycle {
  readonly key: string;
  readonly events: readonly GameEvent[];
  readonly replay: GridReplay;
  readonly summary: PresentationSummary;
  readonly resolvedGrid: Grid | null;
  readonly eventTotal: number;
  readonly initialView: PresentationView;
}

const EMPTY_VIEW: PresentationView = {
  key: null,
  currentEvent: null,
  eventIndex: 0,
  displayGrid: null,
  changedCells: [],
  delayMs: 0,
  done: false,
  accelerated: false
};

function settlementKey(state: RunState): string | null {
  if (state.phase !== "RESOLVING_EFFECTS") return null;
  const events = state.pendingEvents;
  const signature = events.map((event) => `${event.sequence}:${event.type}`).join(",");
  return `${state.initialSeed}:${state.commandHistory.length}:${events.length}:${signature}`;
}

function eventView(
  cycle: Pick<PresentationCycle, "key" | "replay" | "resolvedGrid">,
  event: GameEvent | null,
  eventIndex: number,
  previousGrid: Grid | null,
  accelerated: boolean,
  delayMs: number
): PresentationView {
  const replayFrame = event === null
    ? undefined
    : cycle.replay.frames.find((frame) => frame.sequence === event.sequence);
  const atAuthoritativeBoundary = event?.type === "PAYOUT_COMPLETE";
  return {
    key: cycle.key,
    currentEvent: event,
    eventIndex,
    displayGrid: atAuthoritativeBoundary ? cycle.resolvedGrid : replayFrame?.grid ?? previousGrid,
    changedCells: replayFrame?.changedCells ?? [],
    delayMs,
    done: false,
    accelerated
  };
}

function createCycle(state: RunState, key: string, reducedMotion: boolean): PresentationCycle {
  const ordered = [...state.pendingEvents].sort((left, right) => left.sequence - right.sequence);
  const replay = buildGridReplay(ordered);
  const summary = summarizePresentation(ordered, getCurrentBet(state));
  const resolvedGrid = state.pendingSpin?.draw.grid ?? replay.finalGrid;
  const first = ordered[0] ?? null;
  const base = { key, replay, resolvedGrid };
  const initialView = eventView(base, first, first === null ? 0 : 1, replay.initialGrid, false, reducedMotion ? 0 : 350);
  return { key, events: ordered, replay, summary, resolvedGrid, eventTotal: ordered.length, initialView };
}

function activeLineIds(event: GameEvent | null): readonly LineWin["lineId"][] {
  if (event?.type !== "LINE_WIN") return [];
  const line = PAYLINES.find((candidate) => candidate.lineId === event.lineId);
  return line === undefined ? [] : [line.lineId];
}

function eventHaptic(event: GameEvent): number {
  switch (event.type) {
    case "LINE_WIN":
    case "PART_TRIGGERED":
    case "PAYOUT_ADDED":
    case "SYMBOL_CHANGED":
    case "FOOD_CONSUMED":
      return 8;
    default:
      return 0;
  }
}

export function useSettlementPresentation(
  options: SettlementPresentationOptions
): SettlementPresentationState | null {
  const { state, paused, reducedMotion, onCommand } = options;
  const key = settlementKey(state);
  const cycle = useMemo(() => key === null ? null : createCycle(state, key, reducedMotion), [key, state]);
  const [view, setView] = useState<PresentationView>(() => cycle?.initialView ?? EMPTY_VIEW);
  const onCommandRef = useRef(onCommand);
  const completedKeys = useRef(new Set<string>());
  const presentedEvents = useRef(new Set<string>());
  const futureDelayMs = useRef(reducedMotion ? 0 : 350);
  const lastReducedMotion = useRef(reducedMotion);

  useLayoutEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useLayoutEffect(() => {
    if (key === null) {
      completedKeys.current.clear();
      presentedEvents.current.clear();
      futureDelayMs.current = reducedMotion ? 0 : 350;
      lastReducedMotion.current = reducedMotion;
      if (view.key !== null) setView(EMPTY_VIEW);
      return;
    }
    if (cycle !== null && view.key !== key) {
      futureDelayMs.current = reducedMotion ? 0 : 350;
      lastReducedMotion.current = reducedMotion;
      setView(cycle.initialView);
    }
  }, [cycle, key, reducedMotion, view.key]);

  useLayoutEffect(() => {
    if (key === null || view.key !== key || lastReducedMotion.current === reducedMotion) return;
    lastReducedMotion.current = reducedMotion;
    const delayMs = reducedMotion ? 0 : view.accelerated ? 50 : 350;
    futureDelayMs.current = delayMs;
    if (view.delayMs !== delayMs) setView((current) => current.key === key ? { ...current, delayMs } : current);
  }, [key, reducedMotion, view.accelerated, view.delayMs, view.key]);

  const complete = useCallback((cycleKey: string) => {
    if (completedKeys.current.has(cycleKey)) return;
    completedKeys.current.add(cycleKey);
    onCommandRef.current({ type: "PRESENTATION_COMPLETE" });
  }, []);

  useEffect(() => {
    if (key === null || paused || view.key !== key || view.done || view.currentEvent === null || cycle === null) return;
    const feedbackKey = `${key}:${view.eventIndex}:${view.currentEvent.sequence}`;
    if (presentedEvents.current.has(feedbackKey)) return;
    presentedEvents.current.add(feedbackKey);
    const plan = feedbackPlan(cycle.summary.tier, reducedMotion);
    playEventTone(view.currentEvent, view.eventIndex === 1 ? plan.tone : "none");
    vibrateSettlement(view.eventIndex === 1 ? plan.hapticPattern : eventHaptic(view.currentEvent));
  }, [cycle, key, paused, reducedMotion, view.currentEvent, view.done, view.eventIndex, view.key]);

  useEffect(() => {
    if (key === null || paused || view.key !== key || view.done || cycle === null) return;
    const timer = setTimeout(() => {
      if (view.currentEvent === null) {
        setView((current) => current.key === key
          ? { ...current, displayGrid: cycle.resolvedGrid ?? current.displayGrid, done: true }
          : current);
        complete(key);
        return;
      }
      const next = cycle.events[view.eventIndex] ?? null;
      if (next === null) {
        setView((current) => current.key === key
          ? {
              ...current,
              displayGrid: cycle.resolvedGrid ?? current.displayGrid,
              changedCells: [],
              done: true
            }
          : current);
        complete(key);
        return;
      }
      setView((current) => current.key !== key
        ? current
        : eventView(cycle, next, current.eventIndex + 1, current.displayGrid, current.accelerated, futureDelayMs.current));
    }, view.currentEvent === null ? 0 : view.delayMs);
    return () => clearTimeout(timer);
  }, [complete, cycle, key, paused, view.currentEvent, view.delayMs, view.done, view.eventIndex, view.key]);

  const speedUp = useCallback(() => {
    if (key === null || cycle?.key !== key) return;
    unlockAudio();
    futureDelayMs.current = reducedMotion ? 0 : 50;
    setView((current) => current.key === key ? { ...current, accelerated: true } : current);
  }, [cycle, key, reducedMotion]);

  const skip = useCallback(() => {
    if (key === null || cycle?.key !== key) return;
    unlockAudio();
    setView((existing) => existing.key !== key
      ? existing
      : {
          ...existing,
          currentEvent: null,
          eventIndex: cycle.eventTotal,
          displayGrid: cycle.resolvedGrid ?? existing.displayGrid,
          changedCells: [],
          done: true
        });
    complete(key);
  }, [complete, cycle, key]);

  if (key === null || cycle === null) return null;
  const visibleView = view.key === key ? view : cycle.initialView;
  return {
    summary: cycle.summary,
    currentEvent: visibleView.currentEvent,
    eventIndex: visibleView.eventIndex,
    eventTotal: cycle.eventTotal,
    activeLineIds: activeLineIds(visibleView.currentEvent),
    activePartId: visibleView.currentEvent?.type === "PART_TRIGGERED" ? visibleView.currentEvent.partId : null,
    changedCells: visibleView.changedCells,
    displayGrid: visibleView.displayGrid,
    done: visibleView.done,
    accelerated: visibleView.accelerated,
    speedUp,
    skip
  };
}
