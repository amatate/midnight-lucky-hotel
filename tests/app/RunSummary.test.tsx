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
      bankroll: 4,
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
    expect(screen.getByText("最终余额 ¥4")).toBeVisible();
    expect(screen.getByText("主要收入：机器部件")).toBeVisible();
    expect(screen.getByText("主要支出：下注")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "同种子重开" }));
    await user.click(screen.getByRole("button", { name: "下一种子重开" }));
    expect(restartSameSeed).toHaveBeenCalledOnce();
    expect(restartNextSeed).toHaveBeenCalledOnce();
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
