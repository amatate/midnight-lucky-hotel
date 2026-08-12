import { act, cleanup, render, renderHook, screen, within } from "@testing-library/react";
import { createElement } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameScreen } from "@/app/GameScreen";
import { useGame } from "@/app/useGame";
import { dispatchCommand } from "@/core/run";
import { createRun } from "@/core/run";
import type { GameEvent } from "@/core/events";
import { createPresentationQueue } from "@/presentation/queue";
import { RUN_STORAGE_KEY } from "@/persistence/storage";

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

  it("recovers SPINNING by closing into the explicit stop control without dispatching early", async () => {
    const user = userEvent.setup();
    const saved = spinningState(201);
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(saved));
    render(createElement(GameScreen, { seed: 999 }));

    const dialog = screen.getByRole("dialog", { name: "恢复上次进度" });
    expect(within(dialog).getByRole("button", { name: "继续停轮" })).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "直接结算" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "继续停轮" }));
    expect(screen.getByRole("button", { name: "停轮" })).toBeVisible();
    expect(JSON.parse(localStorage.getItem(RUN_STORAGE_KEY)!).commandHistory).toHaveLength(saved.commandHistory.length);
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
    render(createElement(GameScreen, { seed: 206, initialState: resolvingState(206) }));
    expect(screen.getByText(/事件 1\/\d+/)).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.queryByText(/事件 1\/\d+/)).not.toBeInTheDocument();
  });
});
