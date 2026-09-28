import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameScreen } from "@/app/GameScreen";
import { ActionBar } from "@/app/components/ActionBar";
import { GameGuide } from "@/app/components/GameGuide";
import { createRun } from "@/core/run";
import { activeRecord, readLibrary } from "@/persistence/archives";
import type { RunState } from "@/core/types";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const ready = (patch: Partial<RunState> = {}): RunState => ({ ...createRun(8), phase: "READY_TO_SPIN", service: "kitchen", ...patch });

it("shows the actual room meal cost even when the action is disabled; reading never sends a command", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  render(<ActionBar state={ready({ bankroll: 10, hotel: { cleared: 0, challenge: { tier: 1, status: "playing" } } })} onCommand={onCommand} />);
  expect(screen.getByRole("button", { name: "购买食物（¥18.75）" })).toBeDisabled();
  const trigger = screen.getByRole("button", { name: "了解购买食物" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "购买食物" });
  expect(dialog).toHaveTextContent("立即支付 ¥18.75");
  expect(dialog).toHaveTextContent("余额 ¥10，不足以支付餐费");
  expect(dialog).toHaveTextContent("3 转适用赔付 +50%");
  expect(screen.getByRole("button", { name: "关闭说明" })).toHaveFocus();
  await user.tab(); expect(screen.getByRole("button", { name: "关闭说明" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus(); expect(onCommand).not.toHaveBeenCalled();
});

it("pauses automatic stopping while help is open, without changing archived state or RNG", async () => {
  vi.useFakeTimers();
  render(<GameScreen seed={8} initialState={ready()} />);
  fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
  fireEvent.click(screen.getByRole("button", { name: /^机台状态/ }));
  fireEvent.click(screen.getByRole("button", { name: "了解干预点" }));
  const before = activeRecord(readLibrary())!;
  const storedBefore = localStorage.getItem("midnight-lucky-hotel.run.v2");
  expect(before.snapshot.phase).toBe("SPINNING");
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  // initialState mounts use the legacy mirror; readLibrary assigns ephemeral checkpoint metadata.
  expect(activeRecord(readLibrary())!.snapshot).toEqual(before.snapshot);
  expect(localStorage.getItem("midnight-lucky-hotel.run.v2")).toBe(storedBefore);
  expect(screen.getByRole("dialog", { name: "干预点" })).toHaveTextContent("每次重转、锁轮或祈祷花 1 点");
  fireEvent.click(within(screen.getByRole("dialog", { name: "干预点" })).getByRole("button", { name: "关闭说明" }));
  // Closing nested help must not resume until the outer status drawer also closes.
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(activeRecord(readLibrary())!.snapshot.phase).toBe("SPINNING");
  fireEvent.click(screen.getByRole("button", { name: "关闭说明" }));
  await act(async () => vi.advanceTimersByTimeAsync(1_440));
  expect(activeRecord(readLibrary())!.snapshot.phase).toBe("AWAITING_INTERVENTION");
  expect(activeRecord(readLibrary())!.snapshot.rng).toEqual(before.snapshot.rng);
});

it("opens part details as a read-only floating window, with capped jam progress", () => {
  render(<GameScreen seed={8} initialState={ready({ counters: { cherryWinsThisShift: 12, blankCharge: 0 },
    partSlots: [{ id: "jam-jar", level: 2 }, null, null, null, null] })} />);
  const before = activeRecord(readLibrary())!;
  fireEvent.click(screen.getByRole("button", { name: /果酱罐 · L2/ }));
  const dialog = screen.getByRole("dialog", { name: "果酱罐 · L2" });
  expect(within(dialog).getByRole("group", { name: "果酱罐部件详情" })).toHaveTextContent("下一条额外奖金 ¥60");
  expect(dialog).toHaveTextContent("最多计 6 层");
  fireEvent.click(dialog.parentElement!);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(activeRecord(readLibrary())).toEqual(before);
});

it("keeps the game paused after closing a nested help window until the menu also closes", async () => {
  vi.useFakeTimers();
  render(<GameScreen seed={8} initialState={ready()} />);
  fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
  fireEvent.click(screen.getByRole("button", { name: "菜单" }));
  fireEvent.click(screen.getByRole("button", { name: "玩法与术语" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "游戏介绍" })).getByRole("button", { name: "关闭说明" }));
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(activeRecord(readLibrary())!.snapshot.phase).toBe("SPINNING");
  fireEvent.click(within(screen.getByRole("dialog", { name: "酒店菜单" })).getByRole("button", { name: "关闭说明" }));
  await act(async () => vi.advanceTimersByTimeAsync(1500));
  expect(activeRecord(readLibrary())!.snapshot.phase).toBe("AWAITING_INTERVENTION");
});

it("also pauses while reading the ledger without recording a game command", async () => {
  vi.useFakeTimers();
  render(<GameScreen seed={8} initialState={ready()} />);
  fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
  fireEvent.click(screen.getByRole("button", { name: "账本" }));
  const before = activeRecord(readLibrary())!.snapshot;
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(activeRecord(readLibrary())!.snapshot).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "关闭账本" }));
  await act(async () => vi.advanceTimersByTimeAsync(1500));
  expect(activeRecord(readLibrary())!.snapshot.phase).toBe("AWAITING_INTERVENTION");
});

it("also pauses settlement completion and resumes once after closing help", async () => {
  vi.useFakeTimers();
  render(<GameScreen seed={8} initialState={ready({ reels: [Array(12).fill("cherry"), Array(12).fill("cherry"), Array(12).fill("cherry")] })} />);
  fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
  await act(async () => vi.advanceTimersByTimeAsync(1_440));
  fireEvent.click(screen.getByRole("button", { name: "收下这把" }));
  fireEvent.click(screen.getByRole("button", { name: /^机台状态/ }));
  const before = activeRecord(readLibrary())!.snapshot;
  expect(before.phase).toBe("RESOLVING_EFFECTS");
  await act(async () => vi.advanceTimersByTimeAsync(20_000));
  expect(activeRecord(readLibrary())!.snapshot).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "关闭说明" }));
  // Each timeline step schedules its next timer in an effect after React commits.
  for (let step = 0; step < 40 && screen.getByRole("region", { name: "当前决策" }).getAttribute("data-phase") === "RESOLVING_EFFECTS"; step++) {
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
  }
  const after = activeRecord(readLibrary())!.snapshot;
  expect(after.phase).toBe("READY_TO_SPIN");
  expect(after.commandHistory.filter((command) => command.type === "PRESENTATION_COMPLETE")).toHaveLength(1);
});

it("puts route choices, glossary, public room targets and estimate limitations into the guide", () => {
  render(<GameGuide />);
  fireEvent.click(screen.getByText("干预点、裂纹、恶兆：用在哪里？"));
  expect(screen.getByText(/飞轮、磁铁、保修欺诈免疫裂纹/)).toBeVisible();
  fireEvent.click(screen.getByText("升级、合同、加班和客房目标"));
  expect(screen.getByText(/顶层套房：3 次付费转，每转 ¥100；本段奖金合计 ¥3600/)).toBeVisible();
  fireEvent.click(screen.getByText("RTP、报告、种子与日志怎么看"));
  expect(screen.getByText(/不是实时胜率/)).toBeVisible();
});

it("starts with the short play loop and reveals payout math only when requested", () => {
  render(<GameGuide />);
  expect(screen.getByText("先玩一班：只需记住这三步").closest("details")).toHaveAttribute("open");
  const payout = screen.getByText("奖金怎么算？为什么中奖不等于净赚？");
  expect(payout.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(payout);
  expect(payout.closest("details")).toHaveAttribute("open");
});
