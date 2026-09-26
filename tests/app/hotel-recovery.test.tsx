import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RunSummary } from "@/app/components/RunSummary";
import { UpgradePicker } from "@/app/components/UpgradePicker";
import { createRun, dispatchCommand } from "@/core/run";
import type { RunState } from "@/core/types";

const failed = (): RunState => ({ ...createRun(8), phase: "AFTER_HOURS", service: "repair",
  shift: 5, baseSpinsInShift: 3, afterHoursLevel: 12, freeAfterHoursLevel: 1, betMode: "aggressive",
  bankroll: 4043, blockStartBankroll: 3108, shiftPayout: 1185, shiftWager: 150, exitUnlocked: true,
  hotel: { cleared: 1, challenge: { tier: 2, status: "failed", target: 2000 } },
  expenses: { wagers: 1380, kitchen: 0, chapel: 516, repair: 0 }
});

it("shows local net profit, all lifetime expenses, old result target and exact next overtime price", () => {
  const onCommand = vi.fn();
  render(<RunSummary state={failed()} trajectory={[]} onCommand={onCommand} onRestartSameSeed={vi.fn()} onRestartNextSeed={vi.fn()} />);
  expect(screen.getByText("当前钱包 ¥4043")).toBeVisible();
  expect(screen.getByText("+¥935")).toBeVisible();
  expect(screen.getByText(/自由加班下一转：¥31.25/)).toBeVisible();
  expect(screen.queryByText(/最终余额/)).not.toBeInTheDocument();
  expect(screen.getByText(/本段奖金 ¥1185 \/ ¥2000/)).toBeVisible();
  expect(screen.getByText(/新版目标：本段奖金合计 ¥1200/)).toBeVisible();
  fireEvent.click(screen.getByText("整局累计账本（从开局至今）"));
  expect(screen.getByText(/献祭／奉献 −¥516/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "查看金币整备 · ¥100" }));
  expect(onCommand).toHaveBeenCalledWith({ type: "OPEN_WORKSHOP" });
});

it("makes paid confirmation and the no-tip skip explicit", () => {
  const opened = dispatchCommand(failed(), { type: "OPEN_WORKSHOP" });
  if (!opened.ok) throw new Error(opened.error.message);
  const state: RunState = { ...opened.state, currentCandidates: { synergy: "fruit-salad", pivot: "carbon-copy", wildcard: "safety-fuse" } };
  const onCommand = vi.fn();
  render(<UpgradePicker state={state} onCommand={onCommand} />);
  fireEvent.click(screen.getByRole("button", { name: "选择水果沙拉" }));
  fireEvent.click(screen.getByRole("button", { name: "支付 ¥100 · 购买水果沙拉" }));
  expect(onCommand).toHaveBeenCalledWith({ type: "CHOOSE_UPGRADE", choice: { id: "fruit-salad", action: "apply" } });
  expect(screen.getByRole("button", { name: "本次不购买（不返小费）" })).toBeVisible();
});
