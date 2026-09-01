import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { safeMoney } from "@/core/money";
import { PAYLINES } from "@/core/paylines";
import { getCurrentBet } from "@/core/progression";
import type { Grid, LineWin, PartId, ReceiptAward, ReelIndex, RowIndex, RunState, SpinReceipt } from "@/core/types";
import { playEventTone, unlockAudio } from "@/presentation/audio";
import { feedbackPlan } from "@/presentation/feedback";
import { vibrateSettlement } from "@/presentation/haptics";
import { buildGridReplay, type GridReplay } from "@/presentation/replay";
import { summarizePresentation, type PresentationSummary } from "@/presentation/summary";

export interface SettlementPresentationState {
  readonly summary: PresentationSummary;
  readonly currentEvent: GameEvent | null;
  readonly explanationEvents: readonly GameEvent[];
  readonly eventIndex: number;
  readonly eventTotal: number;
  readonly activeLineIds: readonly LineWin["lineId"][];
  readonly activePartId: PartId | null;
  readonly changedCells: readonly { reel: ReelIndex; row: RowIndex }[];
  readonly displayGrid: Grid | null;
  readonly done: boolean;
  readonly accelerated: boolean;
  readonly settlementStartBankroll: number;
  readonly visiblePayoutTarget: number;
  readonly visibleBankrollTarget: number;
  readonly awardDelta: number;
  readonly moneyResetKey: string;
  readonly moneyAnimationKey: string;
  readonly moneyDurationMs: number;
  readonly speedUp: () => void;
  readonly skip: () => void;
}

export interface SettlementPresentationOptions {
  readonly state: RunState;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly onCommand: (command: GameCommand) => void;
}

type StepKind = "anticipation" | "empty" | "explanation" | "ignition" | "money" | "landing" | "gap" | "completion";

interface PresentationStep {
  readonly kind: StepKind;
  readonly event: GameEvent | null;
  readonly eventIndex: number;
  readonly durationMs: number;
  readonly payoutTarget: number;
  readonly bankrollTarget: number;
  readonly awardDelta: number;
  readonly moneyAnimationKey: string;
  readonly explanationEvents?: readonly GameEvent[];
}

interface PresentationView {
  readonly key: string | null;
  readonly stepIndex: number;
  readonly currentEvent: GameEvent | null;
  readonly explanationEvents: readonly GameEvent[];
  readonly eventIndex: number;
  readonly displayGrid: Grid | null;
  readonly changedCells: readonly { reel: ReelIndex; row: RowIndex }[];
  readonly delayMs: number;
  readonly visiblePayoutTarget: number;
  readonly visibleBankrollTarget: number;
  readonly awardDelta: number;
  readonly moneyAnimationKey: string;
  readonly moneyDurationMs: number;
  readonly done: boolean;
  readonly accelerated: boolean;
}

interface PresentationCycle {
  readonly key: string;
  readonly events: readonly GameEvent[];
  readonly replay: GridReplay;
  readonly summary: PresentationSummary;
  readonly receipt: SpinReceipt | null;
  readonly resolvedGrid: Grid | null;
  readonly eventTotal: number;
  readonly settlementStartBankroll: number;
  readonly finalPayout: number;
  readonly finalBankroll: number;
  readonly steps: readonly PresentationStep[];
}

const EMPTY_VIEW: PresentationView = {
  key: null, stepIndex: 0, currentEvent: null, explanationEvents: [], eventIndex: 0, displayGrid: null, changedCells: [], delayMs: 0,
  visiblePayoutTarget: 0, visibleBankrollTarget: 0, awardDelta: 0, moneyAnimationKey: "idle", moneyDurationMs: 0,
  done: false, accelerated: false
};

function settlementKey(state: RunState): string | null {
  if (state.phase !== "RESOLVING_EFFECTS") return null;
  const signature = state.pendingEvents.map((event) => `${event.sequence}:${event.type}`).join(",");
  return `${state.initialSeed}:${state.commandHistory.length}:${state.nextSpinOrdinal}:${state.pendingEvents.length}:${signature}`;
}

export function settlementMoneyDurationMs(amount: number, wager: number, accelerated: boolean, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  if (accelerated) return 80;
  const ratio = wager > 0 ? amount / wager : amount > 0 ? Number.POSITIVE_INFINITY : 0;
  return ratio <= 1 ? 240 : ratio <= 3 ? 360 : 520;
}

function awardAtSequence(awards: readonly ReceiptAward[], sequence: number): ReceiptAward | null {
  return awards.find((award) => award.sequence === sequence) ?? null;
}

function scaleTimeline(steps: readonly PresentationStep[], tier: PresentationSummary["tier"]): readonly PresentationStep[] {
  if (tier === "none") return steps;
  const minimum = tier === "win" ? 700 : 1_200;
  const maximum = tier === "win" ? 1_000 : 2_200;
  const natural = steps.reduce((total, step) => total + step.durationMs, 0);
  if (natural > maximum) {
    const factor = (maximum - 120) / (natural - 120);
    const raw = steps.map((step) => step.kind === "anticipation" ? step.durationMs : step.durationMs * factor);
    const integer = raw.map((duration) => Math.floor(duration));
    let remainder = maximum - integer.reduce((total, duration) => total + duration, 0);
    const byFraction = raw
      .map((duration, index) => ({ index, fraction: duration - integer[index]! }))
      .filter(({ index }) => steps[index]?.kind !== "completion")
      .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
    for (let index = 0; index < remainder; index += 1) integer[byFraction[index % byFraction.length]!.index]! += 1;
    return steps.map((step, index) => ({ ...step, durationMs: integer[index]! }));
  }
  if (natural < minimum) {
    const finalLanding = steps.findLastIndex((step) => step.kind === "landing");
    const fallback = steps.findLastIndex((step) => step.durationMs > 0);
    const target = finalLanding >= 0 ? finalLanding : fallback;
    return steps.map((step, index) => index === target ? { ...step, durationMs: step.durationMs + minimum - natural } : step);
  }
  return steps;
}

function presentationPacingTier(
  summaryTier: PresentationSummary["tier"],
  awardCount: number
): PresentationSummary["tier"] {
  if (summaryTier === "none" || summaryTier === "runaway") return summaryTier;
  return summaryTier === "chain" || awardCount >= 2 ? "chain" : "win";
}

function buildSteps(
  key: string,
  events: readonly GameEvent[],
  summary: PresentationSummary,
  receipt: SpinReceipt | null,
  settlementStartBankroll: number,
  wager: number
): readonly PresentationStep[] {
  if (summary.tier === "none") {
    return [{
      kind: "empty", event: events.find((event) => event.type === "PAYOUT_COMPLETE") ?? null, eventIndex: events.length,
      durationMs: 350, payoutTarget: 0, bankrollTarget: settlementStartBankroll, awardDelta: 0, moneyAnimationKey: `${key}:empty`
    }];
  }
  const awards = receipt?.awards ?? [];
  const result: PresentationStep[] = [{
    kind: "anticipation", event: null, eventIndex: 0, durationMs: 120, payoutTarget: 0,
    bankrollTarget: settlementStartBankroll, awardDelta: 0, moneyAnimationKey: `${key}:start`
  }];
  let payoutTarget = 0;
  let cursor = 0;
  while (cursor < events.length) {
    const event = events[cursor]!;
    const award = awardAtSequence(awards, event.sequence);
    if (event.type === "PAYOUT_COMPLETE" && award === null) {
      result.push({
        kind: "completion", event, eventIndex: cursor + 1, durationMs: 0, payoutTarget,
        bankrollTarget: safeMoney(settlementStartBankroll + payoutTarget), awardDelta: 0, moneyAnimationKey: `${key}:complete`
      });
      cursor += 1;
      continue;
    }
    if (award !== null) {
      const beforeBankroll = safeMoney(settlementStartBankroll + payoutTarget);
      const animationKey = `${key}:${award.sequence}`;
      result.push({
        kind: "ignition", event, eventIndex: cursor + 1, durationMs: 80, payoutTarget,
        bankrollTarget: beforeBankroll, awardDelta: 0, moneyAnimationKey: `${animationKey}:ignite`
      });
      payoutTarget = safeMoney(payoutTarget + award.amount);
      const afterBankroll = safeMoney(settlementStartBankroll + payoutTarget);
      result.push({
        kind: "money", event, eventIndex: cursor + 1, durationMs: settlementMoneyDurationMs(award.amount, wager, false, false),
        payoutTarget, bankrollTarget: afterBankroll, awardDelta: award.amount, moneyAnimationKey: animationKey
      });
      result.push({ kind: "landing", event, eventIndex: cursor + 1, durationMs: 180, payoutTarget, bankrollTarget: afterBankroll, awardDelta: 0, moneyAnimationKey: animationKey });
      result.push({ kind: "gap", event, eventIndex: cursor + 1, durationMs: 80, payoutTarget, bankrollTarget: afterBankroll, awardDelta: 0, moneyAnimationKey: animationKey });
      cursor += 1;
      continue;
    }
    const run: { readonly event: GameEvent; readonly eventIndex: number }[] = [];
    while (cursor < events.length) {
      const candidate = events[cursor]!;
      if (candidate.type === "PAYOUT_COMPLETE" || awardAtSequence(awards, candidate.sequence) !== null) break;
      run.push({ event: candidate, eventIndex: cursor + 1 });
      cursor += 1;
    }
    const finalExplanation = run.at(-1);
    if (finalExplanation !== undefined) {
      result.push({
        kind: "explanation",
        event: finalExplanation.event,
        explanationEvents: run.map(({ event: explanation }) => explanation),
        eventIndex: finalExplanation.eventIndex,
        durationMs: 160,
        payoutTarget,
        bankrollTarget: safeMoney(settlementStartBankroll + payoutTarget),
        awardDelta: 0,
        moneyAnimationKey: `${key}:explain:${run[0]!.event.sequence}-${finalExplanation.event.sequence}`
      });
    }
  }
  return scaleTimeline(result, presentationPacingTier(summary.tier, awards.length));
}

function acceleratedSegmentMs(cycle: PresentationCycle, acceleratedFromIndex: number): number {
  const remainingTimed = cycle.steps.slice(acceleratedFromIndex + 1).filter((step) => step.kind !== "completion").length;
  return remainingTimed * 80 > 2_200 ? 2_200 / remainingTimed : 80;
}

function stepDuration(cycle: PresentationCycle, stepIndex: number, accelerated: boolean, reducedMotion: boolean, acceleratedFromIndex: number): number {
  if (reducedMotion) return 0;
  const step = cycle.steps[stepIndex];
  if (step === undefined) return 0;
  if (!accelerated || stepIndex <= acceleratedFromIndex) return step.durationMs;
  return step.kind === "completion" ? 0 : acceleratedSegmentMs(cycle, acceleratedFromIndex);
}

function viewForStep(
  cycle: PresentationCycle,
  stepIndex: number,
  previousGrid: Grid | null,
  accelerated: boolean,
  reducedMotion: boolean,
  acceleratedFromIndex: number
): PresentationView {
  const step = cycle.steps[stepIndex];
  if (step === undefined) {
    return {
      ...EMPTY_VIEW, key: cycle.key, stepIndex, displayGrid: cycle.resolvedGrid ?? previousGrid,
      visiblePayoutTarget: cycle.finalPayout, visibleBankrollTarget: cycle.finalBankroll,
      moneyAnimationKey: `${cycle.key}:complete`, done: true, accelerated
    };
  }
  const explanationSequences = new Set(step.explanationEvents?.map((event) => event.sequence) ?? []);
  const explanationFrames = step.kind === "explanation"
    ? cycle.replay.frames.filter((frame) => explanationSequences.has(frame.sequence))
    : [];
  const replayFrame = step.kind === "explanation"
    ? explanationFrames.at(-1)
    : step.event === null ? undefined : cycle.replay.frames.find((frame) => frame.sequence === step.event?.sequence);
  const changedCells = explanationFrames.reduce<{ reel: ReelIndex; row: RowIndex }[]>((cells, frame) => {
    for (const cell of frame.changedCells) {
      if (!cells.some((candidate) => candidate.reel === cell.reel && candidate.row === cell.row)) cells.push(cell);
    }
    return cells;
  }, []);
  const durationMs = stepDuration(cycle, stepIndex, accelerated, reducedMotion, acceleratedFromIndex);
  return {
    key: cycle.key, stepIndex, currentEvent: step.event, explanationEvents: step.explanationEvents ?? [], eventIndex: step.eventIndex,
    displayGrid: step.event?.type === "PAYOUT_COMPLETE" ? cycle.resolvedGrid : replayFrame?.grid ?? previousGrid,
    changedCells: step.kind === "explanation" ? changedCells : [],
    delayMs: durationMs, visiblePayoutTarget: step.payoutTarget, visibleBankrollTarget: step.bankrollTarget,
    awardDelta: step.awardDelta, moneyAnimationKey: step.moneyAnimationKey,
    moneyDurationMs: step.kind === "money" ? durationMs : 0, done: false, accelerated
  };
}

function createCycle(state: RunState, key: string): PresentationCycle {
  const events = [...state.pendingEvents].sort((left, right) => left.sequence - right.sequence);
  const receipt = state.spinHistory.at(-1) ?? null;
  const wager = receipt?.wager ?? state.pendingSpin?.wager ?? getCurrentBet(state);
  const summary = summarizePresentation(events, wager);
  const replay = buildGridReplay(events);
  const resolvedGrid = state.pendingSpin?.draw.grid ?? receipt?.finalGrid ?? replay.finalGrid;
  const bankrollBefore = receipt?.bankrollBefore ?? state.pendingSpin?.bankrollBefore ?? safeMoney(state.bankroll + wager - summary.total);
  const settlementStartBankroll = safeMoney(bankrollBefore - wager);
  const finalPayout = receipt?.totalPayout ?? summary.total;
  const finalBankroll = receipt?.bankrollAfter ?? safeMoney(settlementStartBankroll + finalPayout);
  return {
    key, events, replay, summary, receipt, resolvedGrid, eventTotal: events.length, settlementStartBankroll, finalPayout, finalBankroll,
    steps: buildSteps(key, events, summary, receipt, settlementStartBankroll, wager)
  };
}

function activeLineIds(event: GameEvent | null): readonly LineWin["lineId"][] {
  if (event?.type !== "LINE_WIN" && event?.type !== "PATTERN_LINE_WIN") return [];
  const line = PAYLINES.find((candidate) => candidate.lineId === event.lineId);
  return line === undefined ? [] : [line.lineId];
}

function eventHaptic(event: GameEvent): number {
  switch (event.type) {
    case "LINE_WIN":
    case "PATTERN_LINE_WIN":
    case "PART_TRIGGERED":
    case "PAYOUT_ADDED":
    case "SYMBOL_CHANGED":
    case "FOOD_CONSUMED": return 8;
    default: return 0;
  }
}

export function useSettlementPresentation(options: SettlementPresentationOptions): SettlementPresentationState | null {
  const { state, paused, reducedMotion, onCommand } = options;
  const key = settlementKey(state);
  const cycle = useMemo(() => key === null ? null : createCycle(state, key), [key, state]);
  const initialFor = useCallback((current: PresentationCycle, reduced: boolean) =>
    viewForStep(current, 0, current.replay.initialGrid ?? current.resolvedGrid, false, reduced, -1), []);
  const [view, setView] = useState<PresentationView>(() => cycle === null ? EMPTY_VIEW : initialFor(cycle, reducedMotion));
  const onCommandRef = useRef(onCommand);
  const completedKeys = useRef(new Set<string>());
  const presentedSteps = useRef(new Set<string>());
  const acceleratedFromIndex = useRef(-1);
  const lastReducedMotion = useRef(reducedMotion);

  useLayoutEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useLayoutEffect(() => {
    if (key === null) {
      completedKeys.current.clear();
      presentedSteps.current.clear();
      acceleratedFromIndex.current = -1;
      lastReducedMotion.current = reducedMotion;
      if (view.key !== null) setView(EMPTY_VIEW);
      return;
    }
    if (cycle !== null && view.key !== key) {
      acceleratedFromIndex.current = -1;
      lastReducedMotion.current = reducedMotion;
      setView(initialFor(cycle, reducedMotion));
    }
  }, [cycle, initialFor, key, reducedMotion, view.key]);

  useLayoutEffect(() => {
    if (key === null || cycle === null || view.key !== key || lastReducedMotion.current === reducedMotion) return;
    lastReducedMotion.current = reducedMotion;
    setView((current) => current.key !== key ? current : {
      ...current,
      delayMs: stepDuration(cycle, current.stepIndex, current.accelerated, reducedMotion, acceleratedFromIndex.current),
      moneyDurationMs: cycle.steps[current.stepIndex]?.kind === "money"
        ? stepDuration(cycle, current.stepIndex, current.accelerated, reducedMotion, acceleratedFromIndex.current) : 0
    });
  }, [cycle, key, reducedMotion, view.key]);

  const complete = useCallback((cycleKey: string) => {
    if (completedKeys.current.has(cycleKey)) return;
    completedKeys.current.add(cycleKey);
    onCommandRef.current({ type: "PRESENTATION_COMPLETE" });
  }, []);

  useEffect(() => {
    if (key === null || paused || view.key !== key || view.done || view.currentEvent === null || cycle === null) return;
    const feedbackKey = `${key}:${view.currentEvent.sequence}`;
    if (presentedSteps.current.has(feedbackKey)) return;
    presentedSteps.current.add(feedbackKey);
    const plan = feedbackPlan(cycle.summary.tier, reducedMotion);
    playEventTone(view.currentEvent, view.eventIndex === 1 ? plan.tone : "none");
    vibrateSettlement(view.eventIndex === 1 ? plan.hapticPattern : eventHaptic(view.currentEvent));
  }, [cycle, key, paused, reducedMotion, view.currentEvent, view.done, view.eventIndex, view.key, view.stepIndex]);

  useEffect(() => {
    if (key === null || paused || view.key !== key || view.done || cycle === null) return;
    const timer = setTimeout(() => {
      setView((current) => current.key !== key ? current : viewForStep(
        cycle, current.stepIndex + 1, current.displayGrid, current.accelerated, reducedMotion, acceleratedFromIndex.current
      ));
    }, view.delayMs);
    return () => clearTimeout(timer);
  }, [cycle, key, paused, reducedMotion, view.delayMs, view.done, view.key, view.stepIndex]);

  useEffect(() => {
    if (key === null || paused || view.key !== key || !view.done) return;
    complete(key);
  }, [complete, key, paused, view.done, view.key]);

  const speedUp = useCallback(() => {
    if (key === null || cycle?.key !== key) return;
    unlockAudio();
    setView((current) => {
      if (current.key !== key || current.accelerated) return current;
      acceleratedFromIndex.current = current.stepIndex;
      return { ...current, accelerated: true };
    });
  }, [cycle, key]);

  const skip = useCallback(() => {
    if (key === null || cycle?.key !== key) return;
    unlockAudio();
    setView((current) => current.key !== key ? current : {
      ...current, stepIndex: cycle.steps.length, currentEvent: null, eventIndex: cycle.eventTotal,
      explanationEvents: [], displayGrid: cycle.resolvedGrid ?? current.displayGrid, changedCells: [], delayMs: 0,
      visiblePayoutTarget: cycle.finalPayout, visibleBankrollTarget: cycle.finalBankroll, awardDelta: 0,
      moneyAnimationKey: `${key}:skip`, moneyDurationMs: 0, done: true
    });
  }, [cycle, key]);

  if (key === null || cycle === null) return null;
  const visible = view.key === key ? view : initialFor(cycle, reducedMotion);
  return {
    summary: cycle.summary,
    currentEvent: visible.currentEvent,
    explanationEvents: visible.explanationEvents,
    eventIndex: visible.eventIndex,
    eventTotal: cycle.eventTotal,
    activeLineIds: activeLineIds(visible.currentEvent),
    activePartId: [...visible.explanationEvents].reverse().find((event) => event.type === "PART_TRIGGERED")?.partId
      ?? (visible.currentEvent?.type === "PART_TRIGGERED" ? visible.currentEvent.partId : null),
    changedCells: visible.changedCells,
    displayGrid: visible.displayGrid,
    done: visible.done,
    accelerated: visible.accelerated,
    settlementStartBankroll: cycle.settlementStartBankroll,
    visiblePayoutTarget: visible.visiblePayoutTarget,
    visibleBankrollTarget: visible.visibleBankrollTarget,
    awardDelta: visible.awardDelta,
    moneyResetKey: key,
    moneyAnimationKey: visible.moneyAnimationKey,
    moneyDurationMs: visible.moneyDurationMs,
    speedUp,
    skip
  };
}
