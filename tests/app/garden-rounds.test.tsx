import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { GameScreen } from "@/app/GameScreen";
import { RoomChoices, RoomIntermission } from "@/app/components/HotelChallenge";
import { Hud } from "@/app/components/Hud";
import { RunSummary } from "@/app/components/RunSummary";
import { dispatchCommand } from "@/core/run";
import { createLegacyRun as createRun } from "../fixtures/legacy-run";
import type { RunState } from "@/core/types";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
function rest(reward = true): RunState {
  return { ...createRun(8), phase: "AFTER_HOURS", service: "kitchen", shift: 5, afterHoursLevel: 1,
    exitUnlocked: true, bankroll: 800, baseSpinsInShift: 3, shiftPayout: 200, shiftWager: 75,
    hotel: { cleared: 0, gardenRewardsGranted: 1, challenge: { tier: 1, status: "playing", target: 1000,
      paidSpins: 3, objective: { kind: "total-payout" }, rounds: { current: 1, total: 3, payout: 0 } } },
    currentCandidates: reward ? { synergy: "fruit-salad", pivot: "scrap-magnet", wildcard: "safety-fuse" } : null };
}
it("shows maintenance choices rather than a premature final report, then starts the next round", () => {
  render(<GameScreen seed={8} initialState={rest()} />);
  expect(screen.getByRole("region", { name: "客房回合休息" })).toHaveTextContent("还剩 2 回合");
  expect(screen.getAllByTestId("upgrade-card")).toHaveLength(3);
  expect(screen.queryByRole("region", { name: "本局总结" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "结账离开" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "选择水果沙拉" }));
  fireEvent.click(screen.getByRole("button", { name: "获取水果沙拉" }));
  expect(screen.getByText("花园房 · 回合 2/3")).toBeVisible();
  expect(screen.getByRole("progressbar", { name: "本房累计奖金目标" })).toHaveAttribute("aria-valuenow", "200");
  expect(screen.getByRole("button", { name: "拉动老虎机" })).toBeEnabled();
});
it("explains a consumed rest reward and only offers a next-round action on retries", () => {
  let last = rest(false);
  render(<><RoomIntermission state={last} onCommand={(command) => {
    const result = dispatchCommand(last, command); if (result.ok) last = result.state;
  }} /><RoomChoices state={last} onCommand={() => {}} /></>);
  expect(screen.getByText(/重试不重复赠送/)).toBeVisible();
  expect(screen.queryByRole("region", { name: "升房挑战" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "继续第 2 回合" }));
  expect(last.hotel?.challenge?.rounds?.current).toBe(2);
});
it("discloses cumulative room income separately from the wallet and final round's receipt", () => {
  const base = rest(false);
  const state: RunState = { ...base, afterHoursLevel: 3, shiftPayout: 350, blockStartBankroll: 900, bankroll: 1175,
    hotel: { ...base.hotel!, gardenRewardsGranted: 2, cleared: 1,
      challenge: { ...base.hotel!.challenge!, status: "cleared", progress: 1050, rounds: { current: 3, total: 3, payout: 700 } } } };
  render(<RunSummary state={state} trajectory={[]} onCommand={() => {}} onRestartSameSeed={() => {}} onRestartNextSeed={() => {}} />);
  expect(screen.getByRole("region", { name: "客房挑战结果" })).toHaveTextContent("本房累计奖金 ¥1050 / ¥1000");
  expect(screen.getByText("当前钱包 ¥1175")).toBeVisible();
  expect(screen.getByRole("region", { name: "当前回合收支" })).toHaveTextContent("第 3 回合奖金¥350");
});
it("keeps state explanations behind a readable, read-only resource key", () => {
  const state = { ...rest(), phase: "READY_TO_SPIN" as const, currentCandidates: null };
  render(<Hud compact state={state} estimate={null} estimateStatus="idle" />);
  fireEvent.click(screen.getByRole("button", { name: /^机台状态/ }));
  expect(within(screen.getByRole("dialog", { name: "机台状态" })).getByRole("button", { name: "了解干预点" })).toBeVisible();
});
