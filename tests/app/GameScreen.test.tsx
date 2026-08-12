import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { GameScreen } from "@/app/GameScreen";
import { Hud } from "@/app/components/Hud";
import { createRun } from "@/core/run";
import type { MachineEstimate } from "@/sim/types";

afterEach(cleanup);

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
  await user.click(screen.getByRole("button", { name: "播放结算/继续" }));
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
    await user.click(screen.getByRole("button", { name: "播放结算/继续" }));
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
});
