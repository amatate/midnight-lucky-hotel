import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameScreen } from "@/app/GameScreen";
import { describeBoardIntervention } from "@/app/board-intervention";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { Grid, ReelSet, RunState, ServiceId } from "@/core/types";
import { RUN_STORAGE_KEY } from "@/persistence/storage";

const GRID: Grid = [["cherry", "lemon", "bell"], ["cherry", "lemon", "bell"], ["cherry", "lemon", "bell"]];
const STRIPS: ReelSet = [
  ["cherry", "lemon", "bell", "blank", "seven", "cherry"],
  ["cherry", "lemon", "bell", "blank", "seven", "cherry"],
  ["cherry", "lemon", "bell", "blank", "seven", "cherry"]
];
function accepted(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
function stopped(service: ServiceId = "security", points = 2): RunState {
  const ready: RunState = { ...createRun(8), phase: "READY_TO_SPIN", service, reels: STRIPS, interventionPoints: points };
  const state = accepted(accepted(ready, { type: "SPIN" }), { type: "REELS_STOPPED" });
  return { ...state, pendingSpin: { ...state.pendingSpin!, draw: { strips: STRIPS, grid: GRID, stops: [0, 0, 0], rng: state.rng } } };
}
function mount(state: RunState): string {
  const saved = JSON.stringify(state);
  localStorage.setItem(RUN_STORAGE_KEY, saved);
  render(<GameScreen seed={8} initialState={state} />);
  return saved;
}
function stored(): RunState { return JSON.parse(localStorage.getItem(RUN_STORAGE_KEY)!); }
function cells(): string[] { return [...document.querySelectorAll("[data-cell] [role='img']")].map((element) => element.getAttribute("aria-label")!); }

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("describes visible base-line risks without inventing random future results or changing state", () => {
  const state = stopped("repair");
  const before = JSON.stringify(state);
  const respin = describeBoardIntervention(state, { type: "RESPIN_REEL", reelIndex: 1 })!;
  expect(respin.grid).toBeNull();
  expect(respin.previewLineCount).toBeNull();
  expect(respin.currentLineCount).toBe(3);
  expect(respin.affectedReels).toEqual([1]);
  expect(respin.atRiskLineIds).toEqual(["top", "middle", "bottom"]);
  expect(describeBoardIntervention(state, { type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex: 1 })!.affectedReels).toEqual([0, 2]);
  expect(JSON.stringify(state)).toBe(before);
});

it("a deterministic kick previews only the chosen column and leaves the checkpoint untouched", () => {
  const state = stopped();
  const before = JSON.stringify(state);
  const preview = describeBoardIntervention(state, { type: "KICK_REEL", reelIndex: 1 })!;
  expect(preview.grid).toEqual([GRID[0], ["lemon", "bell", "blank"], GRID[2]]);
  expect(preview.previewLineCount).toBe(0);
  expect(JSON.stringify(state)).toBe(before);
});

it("selecting and cancelling a reel never changes the save, resource counters, or actual result", () => {
  const before = mount(stopped());
  const original = cells();
  fireEvent.click(screen.getByRole("button", { name: "选择第2轮" }));
  expect(cells()).toEqual(original);
  expect(screen.getByText(/当前 3 条基础中奖线可能被打散/)).toBeVisible();
  expect(document.querySelectorAll(".is-intervention-risk")).toHaveLength(9);
  expect(localStorage.getItem(RUN_STORAGE_KEY)).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "踹击" }));
  expect(cells()).toEqual(["樱桃", "柠檬", "铃铛", "柠檬", "铃铛", "空白", "樱桃", "柠檬", "铃铛"]);
  expect(screen.getByText("盘面是踹击预览 · 尚未执行")).toBeVisible();
  expect(localStorage.getItem(RUN_STORAGE_KEY)).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "取消预览" }));
  expect(cells()).toEqual(original);
  expect(localStorage.getItem(RUN_STORAGE_KEY)).toBe(before);
  expect(screen.getByRole("button", { name: "收下这把" })).toBeVisible();
});

it("confirming a kick records one command, one crack and no wager or point charge, then clears its preview", async () => {
  const state = stopped();
  mount(state);
  fireEvent.click(screen.getByRole("button", { name: "踹击" }));
  fireEvent.click(screen.getByRole("button", { name: "选择第2轮" }));
  const confirm = screen.getByRole("button", { name: "确认踹击第2轮" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  const next = stored();
  expect(next.commandHistory.filter((command) => command.type === "KICK_REEL")).toHaveLength(1);
  expect(next.reels[1].filter((symbol) => symbol === "crack")).toHaveLength(1);
  expect(next.bankroll).toBe(state.bankroll);
  expect(next.interventionPoints).toBe(state.interventionPoints);
  expect(next.rng).toEqual(state.rng);
  expect(next.pendingSpin!.draw.grid).toEqual([GRID[0], ["lemon", "bell", "blank"], GRID[2]]);
  expect(screen.getByRole("region", { name: "老虎机转轮" })).not.toHaveAttribute("data-board-preview");
  expect(screen.queryByRole("button", { name: "选择第2轮" })).not.toBeInTheDocument();
  await act(async () => vi.advanceTimersByTimeAsync(620));
  expect(cells().slice(3, 6)).toEqual(["柠檬", "铃铛", "空白"]);
});

it("locking a selected column identifies the two changing columns and charges only on confirmation", () => {
  const state = stopped("repair");
  const before = mount(state);
  fireEvent.click(screen.getByRole("button", { name: "锁轮" }));
  fireEvent.click(screen.getByRole("button", { name: "选择第2轮" }));
  expect([...document.querySelectorAll("[data-intervention-action]")].map((reel) => reel.getAttribute("data-intervention-action"))).toEqual(["change", "keep", "change"]);
  expect(localStorage.getItem(RUN_STORAGE_KEY)).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "确认锁住第2轮" }));
  expect(stored().interventionPoints).toBe(1);
  expect(stored().bankroll).toBe(state.bankroll);
  expect(stored().pendingSpin!.draw.grid[1]).toEqual(GRID[1]);
});

it("zero points still allows a legal kick, but offers no random respin", () => {
  mount(stopped("security", 0));
  expect(screen.queryByRole("button", { name: "重转" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "选择第1轮" }));
  expect(screen.getByRole("button", { name: "确认踹击第1轮" })).toBeEnabled();
});

it("help pauses confirmation without spending or discarding the chosen preview", () => {
  const before = mount(stopped());
  fireEvent.click(screen.getByRole("button", { name: "选择第1轮" }));
  const confirm = screen.getByRole("button", { name: "确认重转第1轮" });
  fireEvent.click(screen.getByRole("button", { name: "了解盘面干预" }));
  expect(confirm).toBeDisabled();
  expect(localStorage.getItem(RUN_STORAGE_KEY)).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "关闭说明" }));
  expect(screen.getByRole("button", { name: "确认重转第1轮" })).toBeEnabled();
  expect(localStorage.getItem(RUN_STORAGE_KEY)).toBe(before);
});

it("no intervention choice or preview is carried into the next spin", async () => {
  mount(stopped("repair"));
  fireEvent.click(screen.getByRole("button", { name: "选择第1轮" }));
  fireEvent.click(screen.getByRole("button", { name: "确认重转第1轮" }));
  await act(async () => vi.advanceTimersByTimeAsync(620));
  await act(async () => vi.advanceTimersByTimeAsync(300));
  fireEvent.click(screen.getByRole("button", { name: "直接结算" }));
  fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
  await act(async () => vi.advanceTimersByTimeAsync(1440));
  expect(screen.getByRole("button", { name: "选择第1轮" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("button", { name: /确认重转/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "收下这把" })).toBeVisible();
});
