import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { GameScreen } from "@/app/GameScreen";
import { stoppedBoardBasis } from "@/app/board-intervention";
import { getBuildFit } from "@/content/build-fit";
import { createRun, dispatchCommand } from "@/core/run";
import { resolveBasePaylines } from "@/core/base-settlement";
import { getCurrentBet } from "@/core/progression";
import type { Grid, RunState } from "@/core/types";
import { activeRecord, readLibrary } from "@/persistence/archives";
import { setLanguage } from "@/i18n/language";

beforeEach(() => { localStorage.clear(); setLanguage("zh", false); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const checkpoint = () => activeRecord(readLibrary())!.snapshot;
const home = () => fireEvent.click(within(screen.getByRole("navigation", { name: "机台导航" })).getByRole("button", { name: "返回前台" }));
function start() {
  render(<App seed={8} />);
  fireEvent.click(screen.getByRole("button", { name: "开始新局" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^维修间/ }));
}

it("returns home during a spin without accepting or redrawing, and Escape cancels resume safely", async () => {
  start();
  fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
  const before = checkpoint();
  expect(before.phase).toBe("SPINNING");
  home();
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(checkpoint()).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "继续游戏" }));
  const dialog = screen.getByRole("dialog", { name: "恢复上次进度" });
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.getByRole("region", { name: "酒店前台" })).toBeVisible();
  expect(checkpoint()).toEqual(before);
});

it("returning mid-settlement and continuing never pays the receipt twice", async () => {
  start();
  fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
  await act(async () => vi.advanceTimersByTimeAsync(1440));
  fireEvent.click(screen.getByRole("button", { name: "收下这把" }));
  const before = checkpoint();
  expect(before.phase).toBe("RESOLVING_EFFECTS");
  home();
  fireEvent.click(screen.getByRole("button", { name: "继续游戏" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "恢复上次进度" })).getByRole("button", { name: "直接结算" }));
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(checkpoint().bankroll).toBe(before.bankroll);
  expect(checkpoint().spinHistory).toEqual(before.spinHistory);
  expect(checkpoint().rng).toEqual(before.rng);
});

it("does not leave the cabinet when saving fails", () => {
  start();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  home();
  expect(screen.getByRole("region", { name: "午夜好运老虎机" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "酒店前台" })).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("自动保存失败");
});

it("provides a direct home action on the terminal report", () => {
  const onHome = vi.fn();
  render(<GameScreen seed={8} initialState={{ ...createRun(8), phase: "RUN_WON" }} onHome={onHome} />);
  fireEvent.click(within(screen.getByRole("region", { name: "本局总结" })).getByRole("button", { name: "返回前台" }));
  expect(onHome).toHaveBeenCalledOnce();
});

it("reads and highlights the stopped basis without settling, using the bet basis even on a free spin", () => {
  const base = createRun(8);
  const draw = dispatchCommand({ ...base, phase: "READY_TO_SPIN", service: "repair" }, { type: "SPIN" });
  if (!draw.ok) throw new Error("fixture failed");
  const grid: Grid = [["cherry", "blank", "blank"], ["cherry", "blank", "blank"], ["cherry", "blank", "blank"]];
  const state: RunState = { ...draw.state, phase: "AWAITING_INTERVENTION", pendingSpin: {
    ...draw.state.pendingSpin!, isFree: true, wager: 0, draw: { ...draw.state.pendingSpin!.draw, grid }
  } };
  const before = JSON.stringify(state);
  expect(stoppedBoardBasis(state)).toEqual({ lineIds: ["top"], amount: resolveBasePaylines(grid, getCurrentBet(state)) });
  render(<GameScreen seed={8} initialState={state} />);
  expect(screen.getByText("盘面基础 · 未结算")).toBeVisible();
  expect(screen.getByText("1 条线 · 部件另算")).toBeVisible();
  expect(document.querySelectorAll('[data-highlighted="true"]')).toHaveLength(3);
  expect(JSON.stringify(state)).toBe(before);
  expect(stoppedBoardBasis({ ...state, phase: "SPINNING" })).toBeNull();
});

it("keeps three compact offers with full cost and risk in the confirmation, and labels tools truthfully", () => {
  const state: RunState = { ...createRun(8), phase: "CHOOSING_UPGRADE", service: "repair",
    currentCandidates: { synergy: "cherry-press", pivot: "seven-purification", wildcard: "calculator" } };
  render(<GameScreen seed={8} initialState={state} />);
  expect(screen.getAllByTestId("upgrade-card")).toHaveLength(3);
  expect(screen.queryByText("豪赌")).toBeNull();
  const card = screen.getByRole("heading", { name: "计算器" }).closest("article")!;
  expect(card).toHaveTextContent("信息工具");
  expect(card).not.toHaveTextContent("跨路线");
  fireEvent.click(within(card).getByRole("button", { name: "选择计算器" }));
  const dialog = screen.getByRole("dialog", { name: "安装 · 计算器" });
  expect(dialog).toHaveTextContent("不改变中奖概率和奖金");
  expect(dialog).toHaveTextContent("消耗");
  expect(dialog).toHaveTextContent("限制与代价");
  expect(getBuildFit(state, "calculator").kind).toBe("neutral");
});
