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

  it("never mutates committed rule state when played or skipped", () => {
    const committed = Object.freeze({ phase: "RESOLVING_EFFECTS", bankroll: 115 });
    const before = JSON.stringify(committed);

    const played = createPresentationQueue(events);
    while (!played.done) played.next();
    const skipped = createPresentationQueue(events);
    skipped.skip();

    expect(JSON.stringify(committed)).toBe(before);
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

describe("presentation recovery UI", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
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
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(createElement(GameScreen, { seed: 86, initialState: resolvingState(86) }));
    const before = screen.getByText(/事件 1\/\d+/).textContent;

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByText(/事件 1\/\d+/).textContent).toBe(before);

    hidden.mockRestore();
    vi.useRealTimers();
  });
});
