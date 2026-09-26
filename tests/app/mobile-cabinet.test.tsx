import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { GameScreen } from "@/app/GameScreen";
import { Hud } from "@/app/components/Hud";
import { createRun, dispatchCommand } from "@/core/run";
import type { RunState } from "@/core/types";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const ready = (patch: Partial<RunState> = {}): RunState => ({
  ...createRun(8), phase: "READY_TO_SPIN", service: "repair", ...patch
});

it("updates the thumb button's spending disclosure when the player changes the bet", () => {
  render(<GameScreen seed={8} initialState={ready()} />);
  const pull = screen.getByRole("button", { name: "拉动老虎机" });
  expect(pull).toHaveAccessibleDescription("花费 ¥10");
  fireEvent.click(screen.getByRole("button", { name: /准备 \/ 调注/ }));
  fireEvent.click(screen.getByRole("button", { name: "激进" }));
  expect(pull).toHaveAccessibleDescription("花费 ¥20");
});

it("never labels a queued free spin as a paid pull", () => {
  render(<GameScreen seed={8} initialState={ready({ freeSpinQueue: 1, bankroll: 1 })} />);
  const pull = screen.getByRole("button", { name: "拉动老虎机" });
  expect(pull).toHaveAccessibleDescription("免费转 · 不扣下注");
  expect(pull).toBeEnabled();
});

it("uses this room's payout, not accumulated wealth, for room progress", () => {
  render(<Hud state={ready({ bankroll: 4000, shiftPayout: 300,
    hotel: { cleared: 1, challenge: { tier: 2, status: "playing" } }
  })} estimate={null} estimateStatus="idle" />);
  const progress = screen.getByRole("progressbar", { name: "本段奖金目标" });
  expect(progress).toHaveAttribute("aria-valuenow", "300");
  expect(progress).toHaveAttribute("aria-valuemax", "1200");
});

it("keeps the idle win plaque distinct from the wallet and offers its persistent ledger", () => {
  render(<GameScreen seed={8} initialState={ready()} />);
  const receipt = screen.getByRole("region", { name: "转动到账" });
  expect(receipt).toHaveTextContent("等待第一转");
  fireEvent.click(within(receipt).getByRole("button", { name: "账本" }));
  expect(screen.getByRole("dialog", { name: "前台账本" })).toHaveTextContent("结算小票");
});

it("keeps secondary counters folded without losing their explanations or food duration", () => {
  render(<Hud state={ready({ buffs: [{ id: "food", additivePayout: 0.5, spinsRemaining: 2 }] })}
    estimate={null} estimateStatus="idle" />);
  const toggle = screen.getByText("状态与加成");
  expect(toggle.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(toggle);
  expect(screen.getByRole("region", { name: "食物加成" })).toHaveTextContent("+50% · 2 转");
  fireEvent.click(screen.getByRole("button", { name: "了解裂纹" }));
  expect(screen.getByRole("dialog", { name: "裂纹" })).toHaveTextContent("先影响最右边的部件");
});

it("does not advertise queued future free spins while the current reels are moving", () => {
  const spinning = dispatchCommand(ready({ freeSpinQueue: 2 }), { type: "SPIN" });
  if (!spinning.ok) throw new Error("fixture spin failed");
  render(<GameScreen seed={8} initialState={spinning.state} />);
  const pull = screen.getByRole("button", { name: "拉动老虎机" });
  expect(pull).not.toHaveTextContent("免费转");
  expect(pull).not.toHaveTextContent("花费");
});

it("exposes the unavailable pull's reason to assistive technology", () => {
  render(<GameScreen seed={8} initialState={ready({ bankroll: 15, betMode: "aggressive" })} />);
  const pull = screen.getByRole("button", { name: "拉动老虎机" });
  expect(pull).toBeDisabled();
  expect(pull).toHaveAccessibleDescription(/余额不足/);
});
