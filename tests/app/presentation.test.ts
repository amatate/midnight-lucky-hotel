import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameScreen } from "@/app/GameScreen";
import { SlotMachine } from "@/app/components/SlotMachine";
import { useGame } from "@/app/useGame";
import { dispatchCommand } from "@/core/run";
import { createRun } from "@/core/run";
import type { GameEvent } from "@/core/events";
import { createPresentationQueue } from "@/presentation/queue";
import { RUN_STORAGE_KEY } from "@/persistence/storage";
import type { GameCommand } from "@/core/commands";
import { useSettlementPresentation } from "@/app/useSettlementPresentation";
import type { Grid, RunState } from "@/core/types";
import { playEventTone, unlockAudio } from "@/presentation/audio";
import { vibrateSettlement } from "@/presentation/haptics";

const events: readonly GameEvent[] = [
  { sequence: 3, type: "PAYOUT_COMPLETE", total: 25 },
  { sequence: 1, type: "BET_PLACED", amount: 10 },
  { sequence: 2, type: "PAYOUT_ADDED", amount: 25, source: "base" }
];

describe("presentation queue", () => {
  it("presents events in sequence order without changing the caller's array", () => {
    const input = [...events];
    const queue = createPresentationQueue(input);

    expect([queue.next()?.sequence, queue.next()?.sequence, queue.next()?.sequence]).toEqual([1, 2, 3]);
    expect(queue.next()).toBeNull();
    expect(queue.done).toBe(true);
    expect(input.map((event) => event.sequence)).toEqual([3, 1, 2]);
  });

  it("speedUp changes only future presentation delay metadata", () => {
    const presented = vi.fn();
    const queue = createPresentationQueue(events, { delay: 350, onEvent: presented });

    expect(queue.next()?.sequence).toBe(1);
    queue.speedUp();
    expect(queue.next()?.sequence).toBe(2);
    expect(queue.next()?.sequence).toBe(3);

    expect(presented.mock.calls.map(([, metadata]) => metadata.delayMs)).toEqual([350, 50, 50]);
  });

  it("reports the first dequeued event with the same feedback metadata as every later event", () => {
    const presented = vi.fn();
    const queue = createPresentationQueue(events, { delay: 275, onEvent: presented });

    expect(queue.next()?.sequence).toBe(1);
    expect(presented).toHaveBeenCalledOnce();
    expect(presented).toHaveBeenCalledWith(
      { sequence: 1, type: "BET_PLACED", amount: 10 },
      { delayMs: 275 }
    );
  });

  it("skip returns every remaining event in causal order and marks the queue done", () => {
    const queue = createPresentationQueue(events);
    expect(queue.next()?.sequence).toBe(1);

    expect(queue.skip().map((event) => event.sequence)).toEqual([2, 3]);
    expect(queue.done).toBe(true);
    expect(queue.skip()).toEqual([]);
    expect(queue.next()).toBeNull();
  });

  it("produces identical final rule state after full presentation and skip", () => {
    const committed = resolvingState(77);
    const before = structuredClone(committed);
    const played = createPresentationQueue(committed.pendingEvents);
    while (!played.done) played.next();
    const playedResult = accept(dispatchCommand(committed, { type: "PRESENTATION_COMPLETE" })).state;

    const skipped = createPresentationQueue(committed.pendingEvents);
    skipped.skip();
    const skippedResult = accept(dispatchCommand(committed, { type: "PRESENTATION_COMPLETE" })).state;

    expect(committed).toEqual(before);
    expect(skippedResult).toEqual(playedResult);
  });
});

function accept<T extends { readonly ok: boolean }>(result: T): Extract<T, { readonly ok: true }> {
  if (!result.ok) throw new Error("fixture command failed");
  return result as Extract<T, { readonly ok: true }>;
}

function resolvingState(seed: number) {
  let state = createRun(seed);
  state = accept(dispatchCommand(state, { type: "SELECT_SERVICE", serviceId: state.serviceCandidates[0] })).state;
  state = accept(dispatchCommand(state, { type: "SPIN" })).state;
  state = accept(dispatchCommand(state, { type: "REELS_STOPPED" })).state;
  return accept(dispatchCommand(state, { type: "ACCEPT_OUTCOME" })).state;
}

function spinningState(seed: number) {
  let state = createRun(seed);
  state = accept(dispatchCommand(state, { type: "SELECT_SERVICE", serviceId: state.serviceCandidates[0] })).state;
  return accept(dispatchCommand(state, { type: "SPIN" })).state;
}

function awaitingState(seed: number) {
  return accept(dispatchCommand(spinningState(seed), { type: "REELS_STOPPED" })).state;
}

const REPLAY_GRID: Grid = [
  ["cherry", "cherry", "blank"],
  ["cherry", "lemon", "blank"],
  ["cherry", "bell", "blank"]
];

function manualResolvingState(events: readonly GameEvent[], patch: Partial<RunState> = {}): RunState {
  const base = createRun(707);
  return {
    ...base,
    phase: "RESOLVING_EFFECTS",
    service: "kitchen",
    bankroll: 120,
    pendingSpin: {
      isFree: false,
      draw: { strips: base.reels, stops: [0, 0, 0], grid: REPLAY_GRID, rng: base.rng }
    },
    pendingEvents: events,
    ...patch
  };
}

function SettlementFrameHarness({
  state,
  paused,
  reducedMotion,
  onCommand
}: {
  readonly state: RunState;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly onCommand: (command: GameCommand) => void;
}) {
  const presentation = useSettlementPresentation({ state, paused, reducedMotion, onCommand });
  return createElement(
    "div",
    { "data-testid": "settlement-frame-harness" },
    createElement(SlotMachine, {
      state,
      motionPlan: null,
      reducedMotion,
      displayGrid: presentation?.displayGrid ?? null,
      highlightedLineIds: presentation?.activeLineIds ?? [],
      changedCells: presentation?.changedCells ?? []
    }),
    createElement("output", { "data-testid": "presentation-done" }, presentation?.done ? "done" : "playing"),
    createElement("button", { type: "button", onClick: () => presentation?.skip() }, "测试直接结算")
  );
}

function firstVisibleSymbol(): string | null {
  return screen.getAllByTestId("cell")[0]?.querySelector("[data-symbol]")?.getAttribute("data-symbol") ?? null;
}

function persistedCommandCount(type: GameCommand["type"]): number {
  const value = localStorage.getItem(RUN_STORAGE_KEY);
  if (value === null) return 0;
  const commands = JSON.parse(value).commandHistory as readonly GameCommand[];
  return commands.filter((command) => command.type === type).length;
}

function installMotionPreference(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    get matches() { return matches; },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  return {
    listenerCount: () => listeners.size,
    set(value: boolean) {
      matches = value;
      const event = { matches, media: media.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    }
  };
}

describe("useSettlementPresentation", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("starts at the first causal event, highlights line before part, and advances the replay grid only on the matching change", async () => {
    vi.useFakeTimers();
    const changed: Grid = [
      ["cherry", "lemon", "blank"],
      ["cherry", "lemon", "blank"],
      ["cherry", "bell", "blank"]
    ];
    const events: readonly GameEvent[] = [
      { sequence: 5, type: "PAYOUT_COMPLETE", total: 20 },
      { sequence: 1, type: "REELS_DRAWN", draw: { strips: REPLAY_GRID, stops: [0, 0, 0], grid: REPLAY_GRID, rng: { value: 1 } } },
      { sequence: 4, type: "SYMBOL_CHANGED", reel: 0, row: 1, from: "cherry", to: "lemon" },
      { sequence: 3, type: "PART_TRIGGERED", partId: "lemon-infection", level: 1 },
      { sequence: 2, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 20, source: "base" }
    ];
    const unresolved = manualResolvingState(events, {
      partSlots: [{ id: "lemon-infection", level: 1 }, null, null, null, null]
    });
    const state: RunState = {
      ...unresolved,
      pendingSpin: unresolved.pendingSpin === null ? null : {
        ...unresolved.pendingSpin,
        draw: { ...unresolved.pendingSpin.draw, grid: changed }
      }
    };
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const { result } = renderHook(() => useSettlementPresentation({
      state,
      paused: false,
      reducedMotion: false,
      onCommand
    }));

    expect(result.current?.currentEvent?.sequence).toBe(1);
    expect(result.current?.eventIndex).toBe(1);
    expect(result.current?.displayGrid).toEqual(REPLAY_GRID);
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(result.current?.activeLineIds).toEqual(["top"]);
    expect(result.current?.displayGrid).toEqual(REPLAY_GRID);
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(result.current?.activeLineIds).toEqual([]);
    expect(result.current?.activePartId).toBe("lemon-infection");
    expect(result.current?.displayGrid).toEqual(REPLAY_GRID);
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(result.current?.activePartId).toBeNull();
    expect(result.current?.changedCells).toEqual([{ reel: 0, row: 1 }]);
    expect(result.current?.displayGrid).toEqual(changed);
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(result.current?.currentEvent?.type).toBe("PAYOUT_COMPLETE");
    expect(result.current?.changedCells).toEqual([]);
    expect(result.current?.displayGrid).toEqual(changed);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("keeps the current delay after speed-up and applies the faster delay only to future events", async () => {
    vi.useFakeTimers();
    const state = manualResolvingState(events);
    const { result } = renderHook(() => useSettlementPresentation({
      state,
      paused: false,
      reducedMotion: false,
      onCommand: vi.fn()
    }));

    await act(async () => vi.advanceTimersByTimeAsync(300));
    act(() => result.current?.speedUp());
    expect(result.current?.accelerated).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(49));
    expect(result.current?.eventIndex).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(result.current?.eventIndex).toBe(2);
    await act(async () => vi.advanceTimersByTimeAsync(49));
    expect(result.current?.eventIndex).toBe(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(result.current?.eventIndex).toBe(3);
  });

  it("pauses and clears the active timer, then resumes from a fresh full delay", async () => {
    vi.useFakeTimers();
    const state = manualResolvingState(events);
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const { result, rerender } = renderHook(
      ({ paused }) => useSettlementPresentation({ state, paused, reducedMotion: false, onCommand }),
      { initialProps: { paused: false } }
    );

    await act(async () => vi.advanceTimersByTimeAsync(200));
    rerender({ paused: true });
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(result.current?.eventIndex).toBe(1);
    expect(onCommand).not.toHaveBeenCalled();
    rerender({ paused: false });
    await act(async () => vi.advanceTimersByTimeAsync(349));
    expect(result.current?.eventIndex).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(result.current?.eventIndex).toBe(2);
  });

  it("automatically completes normal and zero-event settlement exactly once, including Strict Mode rerenders", async () => {
    vi.useFakeTimers();
    const onNormal = vi.fn<(command: GameCommand) => void>();
    const normal = manualResolvingState([
      { sequence: 1, type: "PAYOUT_COMPLETE", total: 0 }
    ]);
    const { rerender, unmount } = renderHook(() => useSettlementPresentation({
      state: normal,
      paused: false,
      reducedMotion: false,
      onCommand: onNormal
    }), { wrapper: StrictMode });

    rerender();
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(onNormal.mock.calls).toEqual([[{ type: "PRESENTATION_COMPLETE" }]]);
    unmount();

    const onEmpty = vi.fn<(command: GameCommand) => void>();
    renderHook(() => useSettlementPresentation({
      state: manualResolvingState([]),
      paused: false,
      reducedMotion: false,
      onCommand: onEmpty
    }), { wrapper: StrictMode });
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(onEmpty.mock.calls).toEqual([[{ type: "PRESENTATION_COMPLETE" }]]);
  });

  it("drains replay visuals on skip and sends the same completion command only once", () => {
    const initial: Grid = REPLAY_GRID;
    const final: Grid = [
      ["lemon", "cherry", "blank"],
      ["cherry", "lemon", "blank"],
      ["cherry", "bell", "blank"]
    ];
    const unresolved = manualResolvingState([
      { sequence: 1, type: "REELS_DRAWN", draw: { strips: initial, stops: [0, 0, 0], grid: initial, rng: { value: 1 } } },
      { sequence: 2, type: "SYMBOL_CHANGED", reel: 0, row: 0, from: "cherry", to: "lemon" },
      { sequence: 3, type: "PAYOUT_COMPLETE", total: 0 }
    ]);
    const state: RunState = {
      ...unresolved,
      pendingSpin: unresolved.pendingSpin === null ? null : {
        ...unresolved.pendingSpin,
        draw: { ...unresolved.pendingSpin.draw, grid: final }
      }
    };
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const { result } = renderHook(() => useSettlementPresentation({
      state,
      paused: false,
      reducedMotion: false,
      onCommand
    }));

    act(() => {
      result.current?.skip();
      result.current?.skip();
    });
    expect(result.current?.displayGrid).toEqual(final);
    expect(result.current?.done).toBe(true);
    expect(onCommand.mock.calls).toEqual([[{ type: "PRESENTATION_COMPLETE" }]]);
  });

  it("degrades missing audio and throwing haptic browser APIs to no-ops", () => {
    const audioDescriptor = Object.getOwnPropertyDescriptor(window, "AudioContext");
    const vibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, "vibrate");
    Reflect.deleteProperty(window, "AudioContext");
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: () => { throw new Error("blocked"); }
    });

    expect(unlockAudio()).toBe(false);
    expect(vibrateSettlement([10, 20, 10])).toBe(false);

    if (audioDescriptor === undefined) Reflect.deleteProperty(window, "AudioContext");
    else Object.defineProperty(window, "AudioContext", audioDescriptor);
    if (vibrateDescriptor === undefined) Reflect.deleteProperty(navigator, "vibrate");
    else Object.defineProperty(navigator, "vibrate", vibrateDescriptor);
  });

  it("does not present or complete while initially paused, then plays first-event audio and haptic exactly once", async () => {
    vi.useFakeTimers();
    let starts = 0;
    class SettlementAudioContext {
      readonly destination = {} as AudioDestinationNode;
      readonly currentTime = 0;
      readonly state = "running" as AudioContextState;
      createOscillator(): OscillatorNode {
        return {
          connect: vi.fn(),
          frequency: { value: 0 },
          start: () => { starts += 1; },
          stop: vi.fn(),
          type: "sine"
        } as unknown as OscillatorNode;
      }
      createGain(): GainNode {
        return {
          connect: vi.fn(),
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
        } as unknown as GainNode;
      }
    }
    const audioDescriptor = Object.getOwnPropertyDescriptor(window, "AudioContext");
    const vibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, "vibrate");
    Object.defineProperty(window, "AudioContext", { configurable: true, value: SettlementAudioContext });
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vi.fn(() => true) });
    expect(unlockAudio()).toBe(true);
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const line = { sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 10, source: "base" } as const;
    const { rerender } = renderHook(
      ({ paused }) => useSettlementPresentation({
        state: manualResolvingState([line, { sequence: 2, type: "PAYOUT_COMPLETE", total: 10 }]),
        paused,
        reducedMotion: false,
        onCommand
      }),
      { initialProps: { paused: true }, wrapper: StrictMode }
    );

    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(starts).toBe(0);
    expect(navigator.vibrate).not.toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();

    rerender({ paused: false });
    expect(starts).toBe(3);
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(12);
    rerender({ paused: false });
    expect(starts).toBe(3);
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);

    if (audioDescriptor === undefined) Reflect.deleteProperty(window, "AudioContext");
    else Object.defineProperty(window, "AudioContext", audioDescriptor);
    if (vibrateDescriptor === undefined) Reflect.deleteProperty(navigator, "vibrate");
    else Object.defineProperty(navigator, "vibrate", vibrateDescriptor);
  });

  it("clears settlement timers on unmount and degrades missing or throwing optional feedback APIs to no-ops", async () => {
    vi.useFakeTimers();
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const { unmount } = renderHook(() => useSettlementPresentation({
      state: manualResolvingState([{ sequence: 1, type: "PAYOUT_COMPLETE", total: 0 }]),
      paused: false,
      reducedMotion: false,
      onCommand
    }));
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(onCommand).not.toHaveBeenCalled();

    const descriptor = Object.getOwnPropertyDescriptor(navigator, "vibrate");
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: () => { throw new Error("blocked"); }
    });
    expect(vibrateSettlement([10, 20, 10])).toBe(false);
    expect(() => playEventTone({ sequence: 1, type: "PAYOUT_COMPLETE", total: 10 }, "win")).not.toThrow();
    if (descriptor === undefined) Reflect.deleteProperty(navigator, "vibrate");
    else Object.defineProperty(navigator, "vibrate", descriptor);
  });

  it("resets once guards for a later same-shaped settlement cycle", async () => {
    vi.useFakeTimers();
    const event = { sequence: 1, type: "PAYOUT_COMPLETE", total: 0 } as const;
    const first = manualResolvingState([event], { commandHistory: [{ type: "SELECT_SERVICE", serviceId: "kitchen" }] });
    const second = manualResolvingState([event], {
      commandHistory: [{ type: "SELECT_SERVICE", serviceId: "kitchen" }, { type: "SPIN" }]
    });
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const { rerender } = renderHook(
      ({ state }) => useSettlementPresentation({ state, paused: false, reducedMotion: false, onCommand }),
      { initialProps: { state: first }, wrapper: StrictMode }
    );

    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(onCommand).toHaveBeenCalledTimes(1);
    rerender({ state: second });
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(onCommand).toHaveBeenCalledTimes(2);
    expect(onCommand.mock.calls).toEqual([
      [{ type: "PRESENTATION_COMPLETE" }],
      [{ type: "PRESENTATION_COMPLETE" }]
    ]);
  });

  it("resets guards after a same-seed history rollback before the identical settlement recurs", async () => {
    vi.useFakeTimers();
    const resolving = manualResolvingState([{ sequence: 1, type: "PAYOUT_COMPLETE", total: 0 }]);
    const reset: RunState = {
      ...resolving,
      phase: "READY_TO_SPIN",
      pendingSpin: null,
      pendingEvents: [],
      commandHistory: []
    };
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const { rerender } = renderHook(
      ({ state }) => useSettlementPresentation({ state, paused: false, reducedMotion: false, onCommand }),
      { initialProps: { state: resolving }, wrapper: StrictMode }
    );

    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(onCommand).toHaveBeenCalledTimes(1);
    rerender({ state: reset });
    rerender({ state: resolving });
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(onCommand).toHaveBeenCalledTimes(2);
  });

  it("honors a reduced-motion toggle immediately without replaying the current event", async () => {
    vi.useFakeTimers();
    const state = manualResolvingState(events);
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const { result, rerender } = renderHook(
      ({ reducedMotion }) => useSettlementPresentation({ state, paused: false, reducedMotion, onCommand }),
      { initialProps: { reducedMotion: false } }
    );

    expect(result.current?.currentEvent?.sequence).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(100));
    rerender({ reducedMotion: true });
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(result.current?.eventIndex).toBeGreaterThanOrEqual(2);
    expect(result.current?.eventIndex).toBeLessThanOrEqual(3);
  });

  it("uses the authoritative resolved grid at payout and skip after a real food removal without guessing a row", async () => {
    vi.useFakeTimers();
    const base = createRun(708);
    const strips = [
      ["food", "cherry", "lemon", "blank"],
      ["blank", "cherry", "lemon", "bell"],
      ["blank", "lemon", "bell", "seven"]
    ] as const;
    const original: Grid = [
      ["food", "cherry", "lemon"],
      ["blank", "cherry", "lemon"],
      ["blank", "lemon", "bell"]
    ];
    const draw = { strips, stops: [0, 0, 0] as const, grid: original, rng: { value: 1 } };
    const awaiting: RunState = {
      ...base,
      phase: "AWAITING_INTERVENTION",
      service: "kitchen",
      reels: strips,
      pendingSpin: { isFree: false, draw },
      pendingEvents: [{ sequence: 1, type: "REELS_DRAWN", draw }]
    };
    const accepted = dispatchCommand(awaiting, { type: "ACCEPT_OUTCOME" });
    if (!accepted.ok || accepted.state.pendingSpin === null) throw new Error("food fixture failed");
    const resolving = accepted.state;
    const authoritative = accepted.state.pendingSpin.draw.grid;
    expect(authoritative[0]).not.toContain("food");
    const onFull = vi.fn<(command: GameCommand) => void>();
    const full = renderHook(() => useSettlementPresentation({
      state: resolving,
      paused: false,
      reducedMotion: false,
      onCommand: onFull
    }));

    expect(full.result.current?.displayGrid).toEqual(original);
    while (full.result.current?.currentEvent?.type !== "PAYOUT_COMPLETE") {
      await act(async () => vi.advanceTimersByTimeAsync(350));
    }
    expect(full.result.current?.displayGrid).toEqual(authoritative);
    full.unmount();

    const onSkip = vi.fn<(command: GameCommand) => void>();
    const skipped = renderHook(() => useSettlementPresentation({
      state: resolving,
      paused: false,
      reducedMotion: false,
      onCommand: onSkip
    }));
    act(() => skipped.result.current?.skip());
    expect(skipped.result.current?.displayGrid).toEqual(authoritative);
    expect(onSkip).toHaveBeenCalledOnce();
    skipped.unmount();
  });

  it("commits the authoritative final grid before completing a settlement with no payout-complete event", async () => {
    vi.useFakeTimers();
    const original: Grid = [
      ["food", "cherry", "lemon"],
      ["blank", "cherry", "lemon"],
      ["blank", "lemon", "bell"]
    ];
    const authoritative: Grid = [
      ["cherry", "lemon", "blank"],
      ["blank", "cherry", "lemon"],
      ["blank", "lemon", "bell"]
    ];
    const base = manualResolvingState([]);
    const draw = { strips: base.reels, stops: [0, 0, 0] as const, grid: original, rng: base.rng };
    const resolving = manualResolvingState([
      { sequence: 1, type: "REELS_DRAWN", draw },
      { sequence: 2, type: "FOOD_CONSUMED", reel: 0 }
    ], {
      pendingSpin: { isFree: false, draw: { ...draw, grid: authoritative } }
    });
    const observedAtComplete: { readonly done: string | null; readonly firstSymbol: string | null }[] = [];
    const onCommand = vi.fn<(command: GameCommand) => void>(() => {
      observedAtComplete.push({
        done: screen.getByTestId("presentation-done").textContent,
        firstSymbol: firstVisibleSymbol()
      });
    });
    render(createElement(SettlementFrameHarness, {
      state: resolving,
      paused: false,
      reducedMotion: false,
      onCommand
    }));

    expect(firstVisibleSymbol()).toBe("food");
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await act(async () => vi.advanceTimersByTimeAsync(350));

    expect(observedAtComplete).toEqual([{ done: "done", firstSymbol: "cherry" }]);
    expect(onCommand.mock.calls).toEqual([[{ type: "PRESENTATION_COMPLETE" }]]);
  });

  it("commits a recovered zero-event reduced frame after resume before completing exactly once", async () => {
    vi.useFakeTimers();
    const base = manualResolvingState([]);
    const authoritative: Grid = [
      ["bell", "blank", "blank"],
      ["cherry", "lemon", "blank"],
      ["cherry", "bell", "blank"]
    ];
    const resolving = manualResolvingState([], {
      pendingSpin: {
        isFree: false,
        draw: { strips: base.reels, stops: [0, 0, 0], grid: authoritative, rng: base.rng }
      }
    });
    const observedAtComplete: { readonly done: string | null; readonly firstSymbol: string | null }[] = [];
    const onCommand = vi.fn<(command: GameCommand) => void>(() => {
      observedAtComplete.push({
        done: screen.getByTestId("presentation-done").textContent,
        firstSymbol: firstVisibleSymbol()
      });
    });
    const { rerender } = render(createElement(SettlementFrameHarness, {
      state: resolving,
      paused: true,
      reducedMotion: true,
      onCommand
    }));

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(onCommand).not.toHaveBeenCalled();
    rerender(createElement(SettlementFrameHarness, {
      state: resolving,
      paused: false,
      reducedMotion: true,
      onCommand
    }));
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(observedAtComplete).toEqual([{ done: "done", firstSymbol: "bell" }]);
    expect(onCommand.mock.calls).toEqual([[{ type: "PRESENTATION_COMPLETE" }]]);
  });

  it("commits the authoritative skipped frame before sending completion exactly once", () => {
    const original: Grid = REPLAY_GRID;
    const authoritative: Grid = [
      ["lemon", "cherry", "blank"],
      ["cherry", "lemon", "blank"],
      ["cherry", "bell", "blank"]
    ];
    const base = manualResolvingState([]);
    const draw = { strips: base.reels, stops: [0, 0, 0] as const, grid: original, rng: base.rng };
    const resolving = manualResolvingState([
      { sequence: 1, type: "REELS_DRAWN", draw }
    ], {
      pendingSpin: { isFree: false, draw: { ...draw, grid: authoritative } }
    });
    const observedAtComplete: { readonly done: string | null; readonly firstSymbol: string | null }[] = [];
    const onCommand = vi.fn<(command: GameCommand) => void>(() => {
      observedAtComplete.push({
        done: screen.getByTestId("presentation-done").textContent,
        firstSymbol: firstVisibleSymbol()
      });
    });
    render(createElement(SettlementFrameHarness, {
      state: resolving,
      paused: false,
      reducedMotion: false,
      onCommand
    }));

    fireEvent.click(screen.getByRole("button", { name: "测试直接结算" }));
    fireEvent.click(screen.getByRole("button", { name: "测试直接结算" }));

    expect(observedAtComplete).toEqual([{ done: "done", firstSymbol: "lemon" }]);
    expect(onCommand.mock.calls).toEqual([[{ type: "PRESENTATION_COMPLETE" }]]);
  });
});

describe("presentation recovery UI", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("offers recovery before resuming a saved mid-presentation run", async () => {
    const saved = resolvingState(81);
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(saved));
    render(createElement(GameScreen, { seed: 999 }));

    const dialog = screen.getByRole("dialog", { name: "恢复上次进度" });
    expect(within(dialog).getByRole("button", { name: "继续演出" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "直接结算" })).toBeVisible();
    expect(screen.getByText(`余额 ¥${saved.bankroll}`)).toBeVisible();
  });

  it("wires the current causal event to exact line cells, the equipped part lamp, and a truthful reel highlight", async () => {
    vi.useFakeTimers();
    const state = manualResolvingState([
      { sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 10, source: "base" },
      { sequence: 2, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 },
      { sequence: 3, type: "FOOD_CONSUMED", reel: 1 },
      { sequence: 4, type: "PAYOUT_COMPLETE", total: 10 }
    ], {
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null],
      counters: { blankCharge: 0, cherryWinsThisShift: 1 },
      buffs: [{ id: "food", spinsRemaining: 3, additivePayout: 0.25 }]
    });
    render(createElement(GameScreen, { seed: 707, initialState: state }));

    expect(screen.getByText("食物加成 0 层")).toBeVisible();
    const cells = screen.getAllByTestId("cell");
    expect(cells.filter((cell) => cell.getAttribute("data-highlighted") === "true").map((cell) => cell.getAttribute("data-cell"))).toEqual([
      "0-0", "1-0", "2-0"
    ]);
    await act(async () => vi.advanceTimersByTimeAsync(350));
    const activeParts = screen.getAllByTestId("part-slot").filter((slot) => slot.getAttribute("data-active") === "true");
    expect(activeParts).toHaveLength(1);
    expect(activeParts[0]).toHaveTextContent("果酱罐 · L1");
    expect(screen.getByText("食物加成 0 层")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(screen.getAllByTestId("reel").map((reel) => reel.getAttribute("data-reel-highlighted"))).toEqual([
      null, "true", null
    ]);
    expect(screen.getByText(/第2轮食物已消耗：这份食物提供 1 层 \+25%，接下来 3 次转动有效；多份食物的层数可叠加/)).toBeVisible();
    expect(screen.getByText("食物加成 1 层")).toBeVisible();
    expect(screen.getByLabelText("第 1 层 +25%，剩余 3/3 次转动")).toBeVisible();
  });

  it("mounts the coin layer on the cabinet and measures the real slot-to-balance route", () => {
    const rect = (x: number, y: number, width: number, height: number): DOMRect => ({
      x,
      y,
      width,
      height,
      top: y,
      right: x + width,
      bottom: y + height,
      left: x,
      toJSON: () => ({})
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("game-screen")) return rect(10, 20, 320, 700);
      if (this.classList.contains("slot-machine")) return rect(30, 260, 280, 180);
      if (this.classList.contains("is-payout-destination")) return rect(28, 80, 100, 30);
      return rect(0, 0, 0, 0);
    });
    const resolving = manualResolvingState([
      { sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 20, source: "base" },
      { sequence: 2, type: "PAYOUT_COMPLETE", total: 20 }
    ]);
    const { container } = render(createElement(GameScreen, { seed: 707, initialState: resolving }));

    const cabinet = container.querySelector(".game-screen");
    const burst = screen.getByTestId("coin-burst");
    expect(cabinet).toHaveAttribute("data-coin-cabinet", "true");
    expect(screen.getByRole("region", { name: "老虎机转轮" })).toHaveAttribute("data-coin-source", "true");
    expect(screen.getByText("余额 ¥120")).toHaveAttribute("data-coin-destination", "true");
    expect(burst.parentElement).toBe(cabinet);
    expect(within(screen.getByRole("region", { name: "结算演出队列" })).queryByTestId("coin-burst")).not.toBeInTheDocument();
    expect(burst).toHaveAttribute("data-source-x", "160");
    expect(burst).toHaveAttribute("data-source-y", "330");
    expect(burst).toHaveAttribute("data-target-x", "68");
    expect(burst).toHaveAttribute("data-target-y", "75");
    expect(screen.getAllByTestId("coin-particle")).toHaveLength(8);
  });

  it("keeps equipped-part status and disabled-slot eligibility causal to the presented prefix", async () => {
    vi.useFakeTimers();
    const state = manualResolvingState([
      { sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 10, source: "base" },
      { sequence: 2, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 },
      { sequence: 3, type: "PART_DISABLED", partId: "jam-jar", slot: 0 },
      { sequence: 4, type: "PAYOUT_COMPLETE", total: 10 }
    ], {
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null]
    });
    render(createElement(GameScreen, { seed: 707, initialState: state }));

    expect(screen.getByText(/本转状态：未触发/)).toBeInTheDocument();
    expect(screen.getAllByTestId("part-slot").filter((slot) => slot.getAttribute("data-active") === "true")).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(screen.getByText(/本转状态：已经触发/)).toBeInTheDocument();
    expect(screen.getAllByTestId("part-slot")[0]).toHaveAttribute("data-active", "true");
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(screen.getByText(/本转状态：因可见裂纹失效/)).toBeInTheDocument();
    expect(screen.getAllByTestId("part-slot").filter((slot) => slot.getAttribute("data-active") === "true")).toHaveLength(0);
  });

  it("keeps recovered SPINNING paused, then resumes automatic stopping from a fresh full delay", async () => {
    vi.useFakeTimers();
    const saved = spinningState(201);
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(saved));
    render(createElement(GameScreen, { seed: 999 }));

    const dialog = screen.getByRole("dialog", { name: "恢复上次进度" });
    expect(within(dialog).getByRole("button", { name: "继续停轮" })).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "直接结算" })).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    expect(persistedCommandCount("REELS_STOPPED")).toBe(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "继续停轮" }));
    expect(screen.queryByRole("button", { name: "停轮" })).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(1_439));
    expect(persistedCommandCount("REELS_STOPPED")).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("等待干预")).toBeVisible();
    expect(persistedCommandCount("REELS_STOPPED")).toBe(1);
  });

  it("does not auto-accept behind recovery and starts the result hold only after continue", async () => {
    vi.useFakeTimers();
    const saved = { ...awaitingState(207), interventionPoints: 0, interventionUsedThisSpin: true };
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(saved));
    render(createElement(GameScreen, { seed: 999 }));

    const dialog = screen.getByRole("dialog", { name: "恢复上次进度" });
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByText("等待干预")).toBeVisible();
    expect(persistedCommandCount("ACCEPT_OUTCOME")).toBe(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "继续干预" }));
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(screen.getByText("等待干预")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("结算演出")).toBeVisible();
    expect(persistedCommandCount("ACCEPT_OUTCOME")).toBe(1);
  });

  it("recovers AWAITING_INTERVENTION with an explicit accept that starts presentation once", async () => {
    const user = userEvent.setup();
    const saved = awaitingState(202);
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(saved));
    render(createElement(GameScreen, { seed: 999 }));

    const dialog = screen.getByRole("dialog", { name: "恢复上次进度" });
    expect(within(dialog).getByRole("button", { name: "继续干预" })).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "接受结果" }));

    expect(screen.getByRole("region", { name: "结算演出队列" })).toBeVisible();
    const commands = JSON.parse(localStorage.getItem(RUN_STORAGE_KEY)!).commandHistory;
    expect(commands.filter((command: { type: string }) => command.type === "ACCEPT_OUTCOME")).toHaveLength(1);
    expect(commands.filter((command: { type: string }) => command.type === "PRESENTATION_COMPLETE")).toHaveLength(0);
  });

  it("uses a generic single recovery action outside active spin phases", async () => {
    const user = userEvent.setup();
    const saved = accept(dispatchCommand(createRun(203), {
      type: "SELECT_SERVICE", serviceId: createRun(203).serviceCandidates[0]
    })).state;
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(saved));
    render(createElement(GameScreen, { seed: 999 }));

    const dialog = screen.getByRole("dialog", { name: "恢复上次进度" });
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "继续游戏" }));
    expect(screen.getByRole("button", { name: "拉动老虎机" })).toBeVisible();
  });

  it("an explicit initial state bypasses saved recovery", () => {
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify({ ...createRun(82), bankroll: 12 }));
    render(createElement(GameScreen, { seed: 83, initialState: { ...createRun(83), bankroll: 77 } }));

    expect(screen.queryByRole("dialog", { name: "恢复上次进度" })).not.toBeInTheDocument();
    expect(screen.getByText("余额 ¥77")).toBeVisible();
  });

  it("saves successful commands but not rejected commands", () => {
    const { result } = renderHook(() => useGame(84, createRun(84)));
    expect(localStorage.getItem(RUN_STORAGE_KEY)).toBeNull();

    act(() => result.current.send({ type: "SPIN" }));
    expect(localStorage.getItem(RUN_STORAGE_KEY)).toBeNull();
    act(() => result.current.send({ type: "SELECT_SERVICE", serviceId: result.current.state.serviceCandidates[0] }));
    expect(JSON.parse(localStorage.getItem(RUN_STORAGE_KEY)!).phase).toBe("READY_TO_SPIN");
  });

  it("shows causal event progress and direct settlement completes once", async () => {
    const user = userEvent.setup();
    render(createElement(GameScreen, { seed: 85, initialState: resolvingState(85) }));

    expect(screen.getByRole("region", { name: "结算演出队列" })).toBeVisible();
    expect(screen.getByText(/事件 1\/\d+/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "直接结算" }));

    const persisted = JSON.parse(localStorage.getItem(RUN_STORAGE_KEY)!);
    expect(persisted.commandHistory.filter((command: { type: string }) => command.type === "PRESENTATION_COMPLETE")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "结算演出队列" })).not.toBeInTheDocument();
  });

  it("pauses automatic advancement while the document is hidden", async () => {
    vi.useFakeTimers();
    let isHidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => isHidden);
    render(createElement(GameScreen, { seed: 86, initialState: resolvingState(86) }));
    const before = screen.getByText(/事件 1\/\d+/).textContent;

    isHidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(screen.getByText(/事件 1\/\d+/).textContent).toBe(before);

    isHidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(screen.getByText(/事件 2\/\d+/)).toBeVisible();
  });

  it("pauses automatic reel stopping while hidden and restarts the full phase delay when visible", async () => {
    vi.useFakeTimers();
    let isHidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => isHidden);
    render(createElement(GameScreen, { seed: 208, initialState: spinningState(208) }));

    isHidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    expect(persistedCommandCount("REELS_STOPPED")).toBe(0);

    isHidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(1_439));
    expect(persistedCommandCount("REELS_STOPPED")).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(persistedCommandCount("REELS_STOPPED")).toBe(1);
  });

  it("auto-accepts exactly once after the result hold when no legal intervention remains", async () => {
    vi.useFakeTimers();
    const state = { ...awaitingState(209), interventionPoints: 0, interventionUsedThisSpin: true };
    render(createElement(GameScreen, { seed: 209, initialState: state }));

    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(screen.getByText("等待干预")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("结算演出")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(persistedCommandCount("ACCEPT_OUTCOME")).toBe(1);
  });

  it("uses the reduced-motion delay after an effect rerun without duplicate stopping", async () => {
    vi.useFakeTimers();
    render(createElement(GameScreen, { seed: 210, initialState: spinningState(210) }));

    fireEvent.click(screen.getByRole("checkbox", { name: "减少闪烁" }));
    await act(async () => vi.advanceTimersByTimeAsync(159));
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("等待干预")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(persistedCommandCount("REELS_STOPPED")).toBe(1);
  });

  it("clears automatic flow timers on unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = render(createElement(GameScreen, { seed: 211, initialState: spinningState(211) }));

    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(2_000));

    expect(localStorage.getItem(RUN_STORAGE_KEY)).toBeNull();
  });

  it("treats OS reduced motion as mandatory even when the stored setting is false", async () => {
    localStorage.setItem("midnight-lucky-hotel.reduce-flash", "0");
    installMotionPreference(true);
    const { container } = render(createElement(GameScreen, { seed: 204, initialState: spinningState(204) }));

    expect(container.querySelector(".game-screen.reduce-motion")).toHaveAttribute("data-reduced-motion", "true");
    expect(screen.getByRole("checkbox", { name: "减少闪烁" })).not.toBeChecked();
  });

  it("subscribes to OS motion changes and removes the listener on unmount", () => {
    const motion = installMotionPreference(false);
    const { container, unmount } = render(createElement(GameScreen, { seed: 205, initialState: spinningState(205) }));
    expect(motion.listenerCount()).toBe(1);
    expect(container.querySelector(".game-screen.reduce-motion")).toBeNull();

    act(() => motion.set(true));
    expect(container.querySelector(".game-screen.reduce-motion")).toBeInTheDocument();
    unmount();
    expect(motion.listenerCount()).toBe(0);
  });

  it("uses zero-delay presentation when effective reduced motion is active", async () => {
    vi.useFakeTimers();
    installMotionPreference(true);
    const resolving = manualResolvingState([
      { sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 20, source: "base" },
      { sequence: 2, type: "PAYOUT_COMPLETE", total: 20 }
    ]);
    render(createElement(GameScreen, { seed: 206, initialState: resolving }));
    expect(screen.getByText(/事件 1\/\d+/)).toBeVisible();
    expect(screen.queryByTestId("coin-burst")).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.queryByText(/事件 1\/\d+/)).not.toBeInTheDocument();
  });
});
