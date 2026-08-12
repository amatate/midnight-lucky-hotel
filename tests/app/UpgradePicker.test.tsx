import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpgradePicker } from "@/app/components/UpgradePicker";
import { createRun } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";

afterEach(cleanup);

function upgradeState(patch: Partial<RunState> = {}): RunState {
  return {
    ...createRun(5),
    phase: "CHOOSING_UPGRADE",
    service: "kitchen",
    currentCandidates: {
      synergy: "lemon-crate",
      pivot: "cherry-pitter",
      wildcard: "jam-jar"
    },
    ...patch
  };
}

describe("UpgradePicker", () => {
  it("shows exactly three role cards and confirms a visible valid target", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: GameCommand) => void>();
    render(<UpgradePicker state={upgradeState()} onCommand={onCommand} />);

    expect(screen.getAllByTestId("upgrade-card")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "选择柠檬木箱" }));
    expect(screen.getByLabelText("第一目标转轮")).toHaveValue("0");
    expect(screen.getByLabelText("第二目标转轮")).toHaveValue("1");
    await user.click(screen.getByRole("button", { name: "获取柠檬木箱" }));

    expect(onCommand).toHaveBeenCalledWith({
      type: "CHOOSE_UPGRADE",
      choice: { id: "lemon-crate", action: "apply", target: { kind: "two-reels", reels: [0, 1] } }
    });
  });

  it("allows a full part inventory to replace a user-selected slot", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const state = upgradeState({
      currentCandidates: { synergy: "lemon-crate", pivot: "cherry-pitter", wildcard: "fruit-salad" },
      partSlots: [
        { id: "jam-jar", level: 1 },
        { id: "leftovers", level: 1 },
        { id: "triple-blessing", level: 1 },
        { id: "midnight-bell", level: 1 },
        { id: "safety-fuse", level: 1 }
      ]
    });
    render(<UpgradePicker state={state} onCommand={onCommand} />);

    await user.click(screen.getByRole("button", { name: "选择水果沙拉" }));
    await user.selectOptions(screen.getByLabelText("替换部件槽"), "3");
    await user.click(screen.getByRole("button", { name: "获取水果沙拉" }));

    expect(onCommand).toHaveBeenCalledWith({
      type: "CHOOSE_UPGRADE",
      choice: { id: "fruit-salad", action: "replace", replaceSlot: 3 }
    });
  });

  it("offers direct decline and paid reroll controls", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: GameCommand) => void>();
    render(<UpgradePicker state={upgradeState({ tips: 1 })} onCommand={onCommand} />);

    await user.click(screen.getByRole("button", { name: "重抽升级（1 小费）" }));
    await user.click(screen.getByRole("button", { name: "放弃升级" }));

    expect(onCommand).toHaveBeenNthCalledWith(1, { type: "REROLL_CANDIDATES" });
    expect(onCommand).toHaveBeenNthCalledWith(2, { type: "DECLINE_UPGRADE" });
  });

  it("clears a stale confirmation when rerolled offers arrive", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const { rerender } = render(<UpgradePicker state={upgradeState()} onCommand={onCommand} />);

    await user.click(screen.getByRole("button", { name: "选择柠檬木箱" }));
    expect(screen.getByRole("button", { name: "获取柠檬木箱" })).toBeVisible();
    rerender(<UpgradePicker state={upgradeState({
      currentCandidates: { synergy: "fruit-salad", pivot: "seven-purification", wildcard: "safety-fuse" }
    })} onCommand={onCommand} />);

    expect(screen.queryByRole("button", { name: "获取柠檬木箱" })).not.toBeInTheDocument();
  });
});
