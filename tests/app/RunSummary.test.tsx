import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunSummary } from "@/app/components/RunSummary";
import { createRun } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";

afterEach(cleanup);

describe("RunSummary", () => {
  it("summarizes a lost run and exposes deterministic restart choices", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const restartSameSeed = vi.fn();
    const restartNextSeed = vi.fn();
    const state: RunState = {
      ...createRun(11),
      phase: "RUN_LOST",
      bankroll: 78,
      attribution: { base: 8, part: 30, intervention: 0, service: 0, agitation: 0, overload: 0 },
      expenses: { wagers: 50, kitchen: 10, chapel: 0, repair: 0 }
    };
    render(
      <RunSummary
        state={state}
        trajectory={[]}
        onCommand={onCommand}
        onRestartSameSeed={restartSameSeed}
        onRestartNextSeed={restartNextSeed}
      />
    );

    expect(screen.getByRole("heading", { name: "本局失败" })).toBeVisible();
    expect(screen.getByText("最终余额 ¥78")).toBeVisible();
    await user.click(screen.getByText("整局累计账本（从开局至今）"));
    expect(screen.getByText("相对开局 ¥100，余额变化 -¥22")).toBeVisible();
    expect(screen.getByText("累计奖金 ¥38 · 累计下注 −¥50")).toBeVisible();
    expect(screen.getByText("最大收入：机器部件 +¥30")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "同种子重开" }));
    await user.click(screen.getByRole("button", { name: "下一种子重开" }));
    expect(restartSameSeed).toHaveBeenCalledOnce();
    expect(restartNextSeed).toHaveBeenCalledOnce();
  });

  it("hides acquisition advice after the run ends while showing an eligible estimate", () => {
    const state: RunState = {
      ...createRun(14),
      phase: "RUN_LOST" as const,
      service: "kitchen" as const,
      acquiredUpgrades: ["lemon-crate" as const],
      partSlots: [{ id: "jam-jar" as const, level: 1 as const }, null, null, null, null],
      toolLevel: 2 as const
    };
    render(
      <RunSummary
        state={state}
        trajectory={[{
          band: "near-break-even", symbolProbabilities: null, rtpMean: 1.02, rtp95: null,
          payoutStandardDeviation: null, ruinProbability: null, expectedAffordableSpins: null
        }]}
        onCommand={vi.fn()}
        onRestartSameSeed={vi.fn()}
        onRestartNextSeed={vi.fn()}
      />
    );

    expect(screen.queryByText(/构筑提示|补强方向/)).not.toBeInTheDocument();
    expect(screen.getByText("当前模拟 RTP 102% · 仅为估算")).toBeVisible();
    expect(screen.queryByText(/RTP 轨迹点|主要支出/)).not.toBeInTheDocument();
  });

  it("offers cash out and continue only at an unlocked shift boundary", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: GameCommand) => void>();
    render(
      <RunSummary
        state={{ ...createRun(12), phase: "SHIFT_COMPLETE", bankroll: 212, exitUnlocked: true }}
        trajectory={[]}
        onCommand={onCommand}
        onRestartSameSeed={vi.fn()}
        onRestartNextSeed={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "本班完成" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "结账离开" }));
    await user.click(screen.getByRole("button", { name: "继续加班" }));
    expect(onCommand).toHaveBeenNthCalledWith(1, { type: "CASH_OUT" });
    expect(onCommand).toHaveBeenNthCalledWith(2, { type: "CONTINUE" });
  });

  it("labels a cashed-out won run and keeps restart available", () => {
    render(
      <RunSummary
        state={{ ...createRun(13), phase: "RUN_WON", bankroll: 245, exitUnlocked: true }}
        trajectory={[]}
        onCommand={vi.fn()}
        onRestartSameSeed={vi.fn()}
        onRestartNextSeed={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "本局胜利 · 已结账" })).toBeVisible();
    expect(screen.getByRole("button", { name: "同种子重开" })).toBeVisible();
  });
});
