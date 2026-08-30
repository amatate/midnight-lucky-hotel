import { cleanup, render, screen, within } from "@testing-library/react";
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
  it("explains all three candidates before selection with exact player-facing role labels and no tags", () => {
    const { container } = render(<UpgradePicker state={upgradeState()} onCommand={vi.fn()} />);

    expect(screen.getByText("强化现有组合")).toBeVisible();
    expect(screen.getByText("修补风险／换路线")).toBeVisible();
    expect(screen.getByText("高风险改规则")).toBeVisible();
    expect(screen.getAllByText("效果")).toHaveLength(3);
    expect(screen.getAllByText("当前影响")).toHaveLength(3);
    expect(screen.getAllByText("协同")).toHaveLength(3);
    expect(screen.getAllByText("代价／风险")).toHaveLength(3);
    expect(screen.getByText(/两个不同转轮，各永久加入 2 个柠檬/)).toBeVisible();
    expect(screen.getByText(/1 个非樱桃、非百搭符号替换为樱桃/)).toBeVisible();
    expect(screen.getByText(/此前樱桃中奖线数 × 0.5 × 当前下注/)).toBeVisible();
    expect(container).not.toHaveTextContent(/reel-growth|reel-control|shift-scaling/);
  });

  it("explains an owned part as an L1 to L2 numerical upgrade before selection", () => {
    render(<UpgradePicker state={upgradeState({
      currentCandidates: { synergy: "jam-jar", pivot: "cherry-pitter", wildcard: "lemon-crate" },
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null]
    })} onCommand={vi.fn()} />);

    const card = screen.getByRole("heading", { name: "果酱罐" }).closest("article")!;
    expect(within(card).getByText(/L1 → L2/).closest("p")).toHaveTextContent("0.5 × 当前下注提高为 1 × 当前下注");
  });

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

  it("expands target controls and a truthful maintenance ticket inside the selected full-width card", async () => {
    const user = userEvent.setup();
    const state = upgradeState({
      reels: [
        ["lemon", "cherry"],
        ["lemon", "bell"],
        ["seven", "blank"]
      ]
    });
    render(<UpgradePicker state={state} onCommand={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "选择柠檬木箱" }));

    const card = screen.getByRole("heading", { name: "柠檬木箱" }).closest("article")!;
    expect(within(card).getByLabelText("第一目标转轮")).toHaveValue("0");
    expect(within(card).getByLabelText("第二目标转轮")).toHaveValue("1");
    const ticket = within(card).getByRole("complementary", { name: "维修票据" });
    expect(ticket).toHaveTextContent("第1轮：柠檬 1 → 3；总长度 2 → 4");
    expect(ticket).toHaveTextContent("第2轮：柠檬 1 → 3；总长度 2 → 4");
    expect(ticket).toHaveTextContent("机会提高");
    expect(ticket).not.toHaveTextContent(/概率|RTP|%/);
  });

  it("adds exact probability to the in-card maintenance ticket only after calculator level one", async () => {
    const user = userEvent.setup();
    const state = upgradeState({
      toolLevel: 1,
      reels: [
        ["lemon", "cherry"],
        ["lemon", "bell"],
        ["seven", "blank"]
      ]
    });
    render(<UpgradePicker state={state} onCommand={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "选择柠檬木箱" }));

    const card = screen.getByRole("heading", { name: "柠檬木箱" }).closest("article")!;
    const ticket = within(card).getByRole("complementary", { name: "维修票据" });
    expect(ticket).toHaveTextContent("概率 50.0% → 75.0%");
    expect(ticket).not.toHaveTextContent(/RTP/);
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
    const selectedCard = screen.getByRole("heading", { name: "水果沙拉" }).closest("article")!;
    expect(within(selectedCard).getByText(/将替换槽 4 的午夜钟声 L1/)).toHaveTextContent("水果沙拉会以 L1 装入该槽");
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

  it("shows eligible target symbols with Chinese names", async () => {
    const user = userEvent.setup();
    render(<UpgradePicker state={upgradeState({
      currentCandidates: { synergy: "carbon-copy", pivot: "cherry-pitter", wildcard: "jam-jar" }
    })} onCommand={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "选择复写纸" }));

    expect(screen.getByRole("option", { name: "第1轮 · 樱桃" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /cherry/ })).not.toBeInTheDocument();
  });
});
