import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameScreen } from "@/app/GameScreen";
import { Hud } from "@/app/components/Hud";
import { ActionBar } from "@/app/components/ActionBar";
import { UPGRADE_IDS } from "@/content/upgrades";
import { createRun } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { RunState, UpgradeId } from "@/core/types";
import type { MachineEstimate } from "@/sim/types";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

async function chooseFirstService(): Promise<void> {
  const user = userEvent.setup();
  const chooser = screen.getByRole("region", { name: "选择服务" });
  await user.click(within(chooser).getAllByRole("button")[0]!);
}

async function completeSpin(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "拉动老虎机" }));
  await user.click(screen.getByRole("button", { name: "停轮" }));
  await user.click(screen.getByRole("button", { name: "接受结果" }));
  await user.click(screen.getByRole("button", { name: "直接结算" }));
}

function offeredState(id: UpgradeId, patch: Partial<RunState> = {}): RunState {
  const alternatives = UPGRADE_IDS.filter((candidate) => candidate !== id);
  return {
    ...createRun(60),
    phase: "CHOOSING_UPGRADE",
    service: "repair",
    baseSpinsInShift: 3,
    currentCandidates: { synergy: id, pivot: alternatives[0]!, wildcard: alternatives[1]! },
    ...patch
  };
}

describe("GameScreen", () => {
  it("selects one of three seeded services and exposes a playable normal-bet machine", async () => {
    render(<GameScreen seed={42} />);

    const chooser = screen.getByRole("region", { name: "选择服务" });
    expect(within(chooser).getAllByRole("button")).toHaveLength(3);

    await chooseFirstService();

    expect(screen.getByText("下注 ¥10")).toBeVisible();
    expect(screen.getByRole("button", { name: "拉动老虎机" })).toHaveAttribute("data-thumb-control", "true");
    expect(screen.getAllByTestId("reel")).toHaveLength(3);
    expect(screen.getAllByTestId("cell")).toHaveLength(9);
    expect(screen.getAllByTestId("part-slot")).toHaveLength(5);
    expect(screen.getByText("胜率区间")).toBeVisible();
    expect(screen.queryByText(/RTP/)).not.toBeInTheDocument();
  });

  it("routes a paid spin through explicit stop, intervention, acceptance, and presentation", async () => {
    const user = userEvent.setup();
    render(<GameScreen seed={91} />);
    await chooseFirstService();

    await user.click(screen.getByRole("button", { name: "拉动老虎机" }));
    expect(screen.getByText("余额 ¥90")).toBeVisible();
    expect(screen.getByText("转轮旋转中")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "停轮" }));
    expect(screen.getByText("等待干预")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重转第1轮" }));
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "停轮" }));

    await user.click(screen.getByRole("button", { name: "接受结果" }));
    expect(screen.getByText("结算演出")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "直接结算" }));
    expect(screen.getByText("第 1 班 · 1/3")).toBeVisible();
  });

  it("uses a dedicated 48px downward pointer gesture without firing below the threshold", async () => {
    render(<GameScreen seed={7} />);
    await chooseFirstService();
    const lever = screen.getByTestId("pull-gesture");

    fireEvent.pointerDown(lever, { clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(lever, { clientY: 57, pointerId: 1 });
    expect(screen.queryByText("转轮旋转中")).not.toBeInTheDocument();

    fireEvent.pointerDown(lever, { clientY: 10, pointerId: 2 });
    fireEvent.pointerUp(lever, { clientY: 58, pointerId: 2 });
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    expect(screen.getByText("余额 ¥90")).toBeVisible();
  });

  it("reaches a three-card upgrade boundary after three presented base spins", async () => {
    render(<GameScreen seed={123} />);
    await chooseFirstService();

    await completeSpin();
    await completeSpin();
    await completeSpin();

    expect(screen.getByText("第 1 班 · 3/3")).toBeVisible();
    expect(screen.getAllByTestId("upgrade-card")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "放弃升级" })).toBeVisible();
  });

  it("reveals numeric estimates only at their purchased tool levels", () => {
    const estimate: MachineEstimate = {
      band: "favorable",
      symbolProbabilities: [
        { cherry: 1, lemon: 0, bell: 0, seven: 0, wild: 0, blank: 0, food: 0, crack: 0 },
        { cherry: 0, lemon: 1, bell: 0, seven: 0, wild: 0, blank: 0, food: 0, crack: 0 },
        { cherry: 0, lemon: 0, bell: 1, seven: 0, wild: 0, blank: 0, food: 0, crack: 0 }
      ],
      rtpMean: 1.12,
      rtp95: [1.01, 1.23],
      payoutStandardDeviation: 0.41,
      ruinProbability: 0.08,
      expectedAffordableSpins: 11.5
    };
    const { rerender } = render(<Hud state={createRun(1)} estimate={estimate} estimateStatus="ready" />);

    expect(screen.getByText("有利")).toBeInTheDocument();
    expect(screen.queryByText(/RTP/)).not.toBeInTheDocument();
    expect(screen.queryByText(/破产风险/)).not.toBeInTheDocument();

    rerender(<Hud state={{ ...createRun(1), toolLevel: 2 }} estimate={estimate} estimateStatus="ready" />);
    expect(screen.getByText("RTP 112.0%")).toBeInTheDocument();
    expect(screen.queryByText(/破产风险/)).not.toBeInTheDocument();

    rerender(<Hud state={{ ...createRun(1), toolLevel: 3 }} estimate={estimate} estimateStatus="ready" />);
    expect(screen.getByText("破产风险 8.0%")).toBeInTheDocument();
  });

  it("shows acquired upgrades as a persistent observable recovery surface", () => {
    render(<GameScreen seed={12} initialState={{
      ...createRun(12),
      phase: "READY_TO_SPIN",
      service: "repair",
      acquiredUpgrades: ["calculator", "jam-jar"],
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null]
    }} />);

    const acquired = screen.getByRole("region", { name: "已获得升级" });
    expect(within(acquired).getByText("计算器")).toBeVisible();
    expect(within(acquired).getByText("果酱罐")).toBeVisible();
  });

  it("offers boundary crack removal only for reels containing literal permanent cracks", () => {
    const state: RunState = {
      ...createRun(14),
      phase: "CHOOSING_UPGRADE",
      service: "repair",
      tips: 1,
      reels: [["crack", "cherry"], ["lemon"], ["bell", "crack"]],
      currentCandidates: { synergy: "artificial-crack", pivot: "pruning-shears", wildcard: "calculator" }
    };
    const onCommand = vi.fn<(command: GameCommand) => void>();
    render(<ActionBar state={state} onCommand={onCommand} />);

    expect(screen.getAllByRole("button", { name: /修复第\d轮裂纹/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "修复第1轮裂纹（1 小费）" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "修复第2轮裂纹（1 小费）" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "修复第3轮裂纹（1 小费）" })).toBeVisible();
  });

  it.each([
    ["lemon-crate", "柠檬木箱", "第一目标转轮"],
    ["artificial-crack", "人为裂纹", "目标转轮"],
    ["cherry-pitter", "樱桃去核器", "目标符号"],
    ["carbon-copy", "复写纸", "目标符号"],
    ["jam-jar", "果酱罐", null]
  ] as const)("dispatches the %s target category through the real game controller", async (id, name, targetLabel) => {
    const user = userEvent.setup();
    render(<GameScreen seed={60} initialState={offeredState(id)} />);

    await user.click(screen.getByRole("button", { name: `选择${name}` }));
    if (targetLabel !== null) expect(screen.getByLabelText(targetLabel)).toBeVisible();
    await user.click(screen.getByRole("button", { name: `获取${name}` }));

    expect(screen.getByText("准备拉动")).toBeVisible();
    expect(screen.getByText("第 2 班 · 0/3")).toBeVisible();
    expect(screen.queryByText(/INVALID_/)).not.toBeInTheDocument();
  });

  it("dispatches a user-selected full-slot part replacement through the real game controller", async () => {
    const user = userEvent.setup();
    const full: RunState["partSlots"] = [
      { id: "jam-jar", level: 1 },
      { id: "fruit-salad", level: 1 },
      { id: "midnight-bell", level: 1 },
      { id: "blank-capacitor", level: 1 },
      { id: "safety-fuse", level: 1 }
    ];
    render(<GameScreen seed={61} initialState={offeredState("overload-motor", { partSlots: full })} />);

    await user.click(screen.getByRole("button", { name: "选择过载马达" }));
    await user.selectOptions(screen.getByLabelText("替换部件槽"), "2");
    await user.click(screen.getByRole("button", { name: "获取过载马达" }));

    expect(screen.getByText("准备拉动")).toBeVisible();
    expect(screen.getAllByText("过载马达")).toHaveLength(2);
    expect(screen.queryByText("午夜钟声")).not.toBeInTheDocument();
  });

  it("repairs a boundary reel and replaces stale cards through real dispatch", async () => {
    const user = userEvent.setup();
    const state = offeredState("scrap-magnet", {
      service: "repair",
      tips: 1,
      reels: [["crack", "crack"], createRun(62).reels[1], createRun(62).reels[2]],
      currentCandidates: { synergy: "scrap-magnet", pivot: "warranty-fraud", wildcard: "artificial-crack" }
    });
    render(<GameScreen seed={62} initialState={state} />);

    await user.click(screen.getByRole("button", { name: "修复第1轮裂纹（1 小费）" }));

    expect(screen.queryByRole("button", { name: /修复第1轮裂纹/ })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("upgrade-card")).toHaveLength(3);
    expect(screen.queryByRole("heading", { name: "废料磁铁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "骗保单" })).not.toBeInTheDocument();
    expect(screen.getByText("小费 0")).toBeVisible();
  });

  it("requires an after-hours upgrade decision before real continuation", async () => {
    const user = userEvent.setup();
    const state = {
      ...offeredState("artificial-crack"),
      phase: "AFTER_HOURS" as const,
      afterHoursLevel: 1,
      currentCandidates: { synergy: "artificial-crack", pivot: "pruning-shears", wildcard: "calculator" } as const
    };
    render(<GameScreen seed={63} initialState={state} />);

    expect(screen.queryByRole("button", { name: "继续加班" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "放弃升级" }));
    expect(screen.getByRole("button", { name: "继续加班" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "继续加班" }));
    expect(screen.getByText("准备拉动")).toBeVisible();
  });

  it("cashes out through real dispatch and restarts a fifth-shift loss", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<GameScreen seed={64} initialState={{
      ...createRun(64), phase: "SHIFT_COMPLETE", service: "repair", bankroll: 220, exitUnlocked: true
    }} />);

    await user.click(screen.getByRole("button", { name: "结账离开" }));
    expect(screen.getByRole("heading", { name: "本局胜利 · 已结账" })).toBeVisible();
    unmount();

    render(<GameScreen seed={65} initialState={{ ...createRun(65), phase: "RUN_LOST", shift: 5, bankroll: 4 }} />);
    expect(screen.getByRole("heading", { name: "本局失败" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "同种子重开" }));
    expect(screen.getByRole("region", { name: "选择服务" })).toBeVisible();
  });
});
