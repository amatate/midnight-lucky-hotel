import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameScreen, playerFacingCommandError } from "@/app/GameScreen";
import { Hud } from "@/app/components/Hud";
import { ActionBar } from "@/app/components/ActionBar";
import { SYMBOL_LABELS } from "@/app/labels";
import { UPGRADE_IDS } from "@/content/upgrades";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { RunState, UpgradeId } from "@/core/types";
import { RUN_STORAGE_KEY } from "@/persistence/storage";
import type { MachineEstimate } from "@/sim/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => localStorage.clear());

async function chooseFirstService(): Promise<void> {
  const chooser = screen.getByRole("group", { name: "选择服务" });
  fireEvent.click(within(chooser).getAllByRole("button")[0]!);
}

async function completeSpin(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
  await act(async () => vi.advanceTimersByTimeAsync(1_440));
  fireEvent.click(screen.getByRole("button", { name: "收下这把" }));
  fireEvent.click(screen.getByRole("button", { name: "直接结算" }));
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
  it.each([
    ["INVALID_PHASE", "当前阶段不能执行这项操作。"],
    ["INSUFFICIENT_FUNDS", "余额不足，无法完成这项操作。"],
    ["INVALID_TARGET", "当前选择不可用，请重新选择。"],
    ["RESOURCE_EXHAUSTED", "所需资源已经用完，请选择其他行动。"]
  ] as const)("maps %s to deterministic Chinese player copy", (code, expected) => {
    const rawMessage = "raw English controller detail";
    const copy = playerFacingCommandError({ code, message: rawMessage });
    expect(copy).toBe(expected);
    expect(copy).not.toContain(code);
    expect(copy).not.toContain(rawMessage);
  });

  it("renders translated feedback instead of controller internals after a rejected command", () => {
    const base = createRun(38);
    const spin = dispatchCommand({ ...base, phase: "READY_TO_SPIN", service: "repair" }, { type: "SPIN" });
    if (!spin.ok) throw new Error("fixture spin failed");
    render(<GameScreen seed={38} initialState={{
      ...spin.state,
      phase: "SHIFT_COMPLETE",
      tips: 1,
      exitUnlocked: true,
      reels: [["crack", ...base.reels[0]], base.reels[1], base.reels[2]]
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "修复第1轮裂纹（1 小费）" }));

    expect(screen.getByText("当前阶段不能执行这项操作。")).toBeVisible();
    expect(screen.queryByText(/INVALID_PHASE|REMOVE_CRACKS is invalid during SHIFT_COMPLETE/)).not.toBeInTheDocument();
  });

  it("presents one current decision beneath a single physical cabinet with room-number counters", () => {
    render(<GameScreen seed={39} />);

    const decisions = screen.getAllByRole("region", { name: "当前决策" });
    expect(decisions).toHaveLength(1);
    expect(within(decisions[0]!).getByRole("group", { name: "选择服务" })).toBeVisible();

    const cabinet = screen.getByRole("region", { name: "午夜好运老虎机" });
    const counters = within(cabinet).getByRole("group", { name: "酒店房号计数窗" });
    expect(within(counters).getByText("余额 ¥100")).toHaveAttribute("data-counter", "bankroll");
    expect(within(counters).getByText("目标 ¥200")).toHaveAttribute("data-counter", "target");
    expect(within(counters).getByText("下注 ¥10")).toHaveAttribute("data-counter", "bet");
    expect(within(cabinet).getByRole("button", { name: "拉动老虎机" })).toBeDisabled();
    expect(screen.queryByText("功能原型")).not.toBeInTheDocument();
    expect(screen.getByText("减弱动态与闪烁")).toBeVisible();
  });

  it("explains every offered service's identity, exact action, synergies, and cost before selection", () => {
    const state: RunState = {
      ...createRun(40),
      serviceCandidates: ["repair", "kitchen", "security"]
    };
    const { container } = render(<GameScreen seed={40} initialState={state} />);

    const chooser = screen.getByRole("group", { name: "选择服务" });
    expect(chooser).toBe(within(screen.getByRole("region", { name: "当前决策" })).getByRole("group", { name: "选择服务" }));
    expect(within(chooser).getAllByText("定位")).toHaveLength(3);
    expect(within(chooser).getAllByText("行动")).toHaveLength(3);
    expect(within(chooser).getAllByText("协同")).toHaveLength(3);
    expect(within(chooser).getAllByText("代价／风险")).toHaveLength(3);
    expect(within(chooser).getByText(/支付 ¥10/)).toHaveTextContent("之后 3 次转动的全部赔付 +25%");
    expect(within(chooser).getByText(/确定性地让选定转轮/)).toHaveTextContent("占用本转唯一一次干预");
    expect(container).not.toHaveTextContent(/reel-growth|bankroll-cost|intervention/);
  });

  it("selects one of three seeded services and exposes a playable normal-bet machine", async () => {
    render(<GameScreen seed={42} />);

    const chooser = screen.getByRole("group", { name: "选择服务" });
    expect(within(chooser).getAllByRole("button")).toHaveLength(3);

    await chooseFirstService();

    expect(screen.getByText("下注 ¥10")).toBeVisible();
    expect(screen.getByRole("button", { name: "拉动老虎机" })).toHaveAttribute("data-thumb-control", "true");
    expect(screen.getAllByTestId("reel")).toHaveLength(3);
    expect(screen.getAllByTestId("cell")).toHaveLength(9);
    expect(screen.getAllByTestId("part-slot")).toHaveLength(5);
    expect(screen.getByText("会计工具")).toBeVisible();
    expect(screen.queryByText(/RTP/)).not.toBeInTheDocument();
  });

  it("blocks only an unaffordable selected bet and points to a legal cheaper mode", async () => {
    const user = userEvent.setup();
    render(<GameScreen seed={43} initialState={{
      ...createRun(43),
      phase: "READY_TO_SPIN",
      service: "repair",
      bankroll: 15,
      betMode: "aggressive"
    }} />);

    expect(screen.getByRole("button", { name: "拉动老虎机" })).toBeDisabled();
    expect(screen.getByText("余额 ¥15 不足以支付当前激进下注 ¥20；可切换到保守下注 ¥5。")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "保守" }));

    expect(screen.getByText("下注 ¥5")).toBeVisible();
    expect(screen.getByRole("button", { name: "拉动老虎机" })).toBeEnabled();
    expect(screen.queryByText(/不足以支付当前激进下注/)).not.toBeInTheDocument();
  });

  it("keeps a queued free spin pull legal at zero bankroll", async () => {
    const user = userEvent.setup();
    render(<GameScreen seed={44} initialState={{
      ...createRun(44),
      phase: "READY_TO_SPIN",
      service: "repair",
      bankroll: 0,
      betMode: "aggressive",
      freeSpinQueue: 1
    }} />);

    const lever = screen.getByRole("button", { name: "拉动老虎机" });
    expect(lever).toBeEnabled();
    await user.click(lever);

    expect(screen.getByText("转轮旋转中")).toBeVisible();
    expect(screen.getByText("余额 ¥0")).toBeVisible();
  });

  it("keeps a below-minimum paid pull legal so the accepted loss transition can run", async () => {
    const user = userEvent.setup();
    render(<GameScreen seed={45} initialState={{
      ...createRun(45),
      phase: "READY_TO_SPIN",
      service: "repair",
      bankroll: 4.99
    }} />);

    const lever = screen.getByRole("button", { name: "拉动老虎机" });
    expect(lever).toBeEnabled();
    await user.click(lever);

    expect(screen.getByRole("heading", { name: "本局失败" })).toBeVisible();
    expect(screen.queryByText(/余额不足以支付当前/)).not.toBeInTheDocument();
  });

  it("keeps a below-minimum safety-fuse pull legal so the accepted rescue can run", async () => {
    const user = userEvent.setup();
    render(<GameScreen seed={46} initialState={{
      ...createRun(46),
      phase: "READY_TO_SPIN",
      service: "repair",
      bankroll: 4.99,
      partSlots: [{ id: "safety-fuse", level: 1 }, null, null, null, null]
    }} />);

    expect(screen.getByText("安全保险丝 · L1")).toBeVisible();
    const lever = screen.getByRole("button", { name: "拉动老虎机" });
    expect(lever).toBeEnabled();
    await user.click(lever);

    expect(screen.getByText("余额 ¥24.99")).toBeVisible();
    expect(screen.queryByText("安全保险丝 · L1")).not.toBeInTheDocument();
    expect(screen.queryByText(/INSUFFICIENT_FUNDS|bankroll is below/)).not.toBeInTheDocument();
  });

  it("automatically stops each motion cycle once and waits for the player's intervention decision", async () => {
    vi.useFakeTimers();
    render(<GameScreen seed={91} />);
    await chooseFirstService();

    fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
    expect(screen.getByText("余额 ¥90")).toBeVisible();
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    expect(screen.queryByRole("button", { name: "停轮" })).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(1_439));
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("等待干预")).toBeVisible();
    expect(screen.getByRole("button", { name: "收下这把" })).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByText("等待干预")).toBeVisible();
    let history = JSON.parse(localStorage.getItem("midnight-lucky-hotel.run.v1")!).commandHistory as readonly GameCommand[];
    expect(history.filter((command) => command.type === "REELS_STOPPED")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "重转第1轮" }));
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(619));
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("等待干预")).toBeVisible();
    history = JSON.parse(localStorage.getItem("midnight-lucky-hotel.run.v1")!).commandHistory as readonly GameCommand[];
    expect(history.filter((command) => command.type === "REELS_STOPPED")).toHaveLength(2);

    expect(screen.queryByRole("button", { name: "收下这把" })).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(screen.getByText("等待干预")).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("结算演出")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "直接结算" }));
    expect(screen.getByText("第 1 班 · 1/3")).toBeVisible();
  });

  it("wires the shared reel plan so a base result appears one authoritative reel at a time", async () => {
    vi.useFakeTimers();
    const seed = 92;
    const initial = createRun(seed);
    const serviceId = initial.serviceCandidates[0];
    const readyResult = dispatchCommand(initial, { type: "SELECT_SERVICE", serviceId });
    if (!readyResult.ok) throw new Error("fixture service selection failed");
    const spinResult = dispatchCommand(readyResult.state, { type: "SPIN" });
    if (!spinResult.ok || spinResult.state.pendingSpin === null) throw new Error("fixture spin failed");
    const expected = spinResult.state.pendingSpin.draw.grid;

    render(<GameScreen seed={seed} initialState={initial} />);
    await chooseFirstService();
    fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));

    const machine = screen.getByRole("region", { name: "老虎机转轮" });
    expect(within(machine).queryAllByRole("img")).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(within(machine).queryAllByRole("img")).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(within(screen.getAllByTestId("reel")[0]!).getAllByRole("img").map((cell) => cell.getAttribute("aria-label"))).toEqual(
      expected[0].map((symbol) => SYMBOL_LABELS[symbol])
    );
    expect(within(machine).queryAllByRole("img")).toHaveLength(3);
    await act(async () => vi.advanceTimersByTimeAsync(440));
    expect(within(machine).getAllByRole("img").map((cell) => cell.getAttribute("aria-label"))).toEqual(
      expected.flatMap((reel) => reel.map((symbol) => SYMBOL_LABELS[symbol]))
    );
    expect(screen.getByText("等待干预")).toBeVisible();
  });

  it("keeps the generated result private while hidden and restarts reel timing after visibility returns", async () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    render(<GameScreen seed={93} />);
    await chooseFirstService();
    fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
    const machine = screen.getByRole("region", { name: "老虎机转轮" });

    await act(async () => vi.advanceTimersByTimeAsync(900));
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(within(machine).queryAllByRole("img")).toHaveLength(0);
    expect(screen.getByText("转轮旋转中")).toBeVisible();

    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(within(machine).queryAllByRole("img")).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(within(machine).queryAllByRole("img")).toHaveLength(3);
  });

  it("keeps a recovered spinning result covered until the player resumes a fresh reel cycle", async () => {
    vi.useFakeTimers();
    const initial = createRun(94);
    const ready = dispatchCommand(initial, { type: "SELECT_SERVICE", serviceId: initial.serviceCandidates[0] });
    if (!ready.ok) throw new Error("fixture service selection failed");
    const spinning = dispatchCommand(ready.state, { type: "SPIN" });
    if (!spinning.ok) throw new Error("fixture spin failed");
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(spinning.state));
    render(<GameScreen seed={999} />);

    const machine = screen.getByRole("region", { name: "老虎机转轮" });
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(within(machine).queryAllByRole("img")).toHaveLength(0);
    expect(screen.getByText("转轮旋转中")).toBeVisible();

    fireEvent.click(within(screen.getByRole("dialog", { name: "恢复上次进度" })).getByRole("button", { name: "继续停轮" }));
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(within(machine).queryAllByRole("img")).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(within(machine).queryAllByRole("img")).toHaveLength(3);
  });

  it("uses the physical lever's 82% journey without firing below the threshold", async () => {
    render(<GameScreen seed={7} />);
    await chooseFirstService();
    const lever = screen.getByTestId("pull-gesture");

    fireEvent.pointerDown(lever, { clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(lever, { clientY: 108.3, pointerId: 1 });
    fireEvent.pointerUp(lever, { clientY: 108.3, pointerId: 1 });
    expect(screen.queryByText("转轮旋转中")).not.toBeInTheDocument();

    fireEvent.pointerDown(lever, { clientY: 10, pointerId: 2 });
    fireEvent.pointerMove(lever, { clientY: 108.4, pointerId: 2 });
    fireEvent.pointerUp(lever, { clientY: 108.4, pointerId: 2 });
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    expect(screen.getByText("余额 ¥90")).toBeVisible();
  });

  it("keeps the lever mounted and disabled through its impact while the reels start", async () => {
    vi.useFakeTimers();
    render(<GameScreen seed={8} />);
    await chooseFirstService();

    fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));

    const lever = screen.getByTestId("pull-gesture");
    expect(screen.getByText("转轮旋转中")).toBeVisible();
    expect(lever).toHaveAttribute("data-lever-state", "impact");
    expect(screen.getByRole("button", { name: "拉动老虎机" })).toBeDisabled();
    await act(async () => vi.advanceTimersByTimeAsync(70));
    expect(lever).toHaveAttribute("data-lever-state", "returning");
    await act(async () => vi.advanceTimersByTimeAsync(210));
    expect(lever).toHaveAttribute("data-lever-state", "idle");
  });

  it("reaches a three-card upgrade boundary after three presented base spins", async () => {
    vi.useFakeTimers();
    render(<GameScreen seed={123} />);
    await chooseFirstService();

    await completeSpin();
    await completeSpin();
    await completeSpin();

    expect(screen.getByText("第 1 班 · 3/3")).toBeVisible();
    expect(screen.getAllByTestId("upgrade-card")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "放弃升级" })).toBeVisible();
  });

  it("turns an upgrade boundary into the only full-width decision scene and hides the play cabinet", () => {
    render(<GameScreen seed={59} initialState={offeredState("lemon-crate")} />);

    const decision = screen.getByRole("region", { name: "当前决策" });
    expect(within(decision).getByRole("group", { name: "选择升级" })).toBeVisible();
    expect(within(decision).getAllByTestId("upgrade-card")).toHaveLength(3);
    expect(screen.queryByRole("region", { name: "午夜好运老虎机" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "老虎机转轮" })).not.toBeInTheDocument();
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

    expect(screen.queryByText("有利")).not.toBeInTheDocument();
    expect(screen.queryByText(/符号概率/)).not.toBeInTheDocument();
    expect(screen.queryByText(/RTP/)).not.toBeInTheDocument();
    expect(screen.queryByText(/破产风险/)).not.toBeInTheDocument();

    rerender(<Hud state={{ ...createRun(1), toolLevel: 1 }} estimate={estimate} estimateStatus="ready" />);
    expect(screen.getByText(/计算器 · 每轮符号概率/)).toBeInTheDocument();
    expect(screen.queryByText("有利")).not.toBeInTheDocument();
    expect(screen.queryByText(/RTP/)).not.toBeInTheDocument();

    rerender(<Hud state={{ ...createRun(1), toolLevel: 2 }} estimate={estimate} estimateStatus="ready" />);
    expect(screen.getByText("估算风险带：有利")).toBeInTheDocument();
    expect(screen.getByText("估算 RTP 112.0%")).toBeInTheDocument();
    expect(screen.getByText("估算 95% 区间 101.0%–123.0%")).toBeInTheDocument();
    expect(screen.queryByText(/破产风险/)).not.toBeInTheDocument();

    rerender(<Hud state={{ ...createRun(1), toolLevel: 3 }} estimate={estimate} estimateStatus="ready" />);
    expect(screen.getByText("观察期破产概率 8.0%")).toBeInTheDocument();
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

  it("keeps unaffordable ready actions visible but disables their rejected commands", () => {
    const onCommand = vi.fn<(command: GameCommand) => void>();
    const { rerender } = render(<ActionBar state={{
      ...createRun(15),
      phase: "READY_TO_SPIN",
      service: "kitchen",
      bankroll: 9
    }} onCommand={onCommand} />);

    const food = screen.getByRole("button", { name: "购买食物（¥10）" });
    expect(food).toBeDisabled();
    expect(screen.getByText("余额不足：厨房服务需要 ¥10。")).toBeVisible();
    fireEvent.click(food);
    expect(onCommand).not.toHaveBeenCalled();

    rerender(<ActionBar state={{
      ...createRun(16),
      phase: "READY_TO_SPIN",
      service: "chapel",
      bankroll: 0.5,
      partSlots: [{ id: "martyr-coin", level: 1 }, null, null, null, null]
    }} onCommand={onCommand} />);

    const martyr = screen.getByRole("button", { name: "启用殉道者硬币（献祭 ¥1）" });
    expect(martyr).toBeDisabled();
    expect(screen.getByText("余额不足：殉道者硬币需要 ¥1。")).toBeVisible();
    fireEvent.click(martyr);
    expect(onCommand).not.toHaveBeenCalled();
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
    expect(screen.getByText("过载马达 · L1")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "已获得升级" })).getByText("过载马达")).toBeVisible();
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

  it("keeps legal crack repair beside the after-hours summary, cash-out, and continue actions", async () => {
    const user = userEvent.setup();
    const base = createRun(66);
    render(<GameScreen seed={66} initialState={{
      ...base,
      phase: "AFTER_HOURS",
      service: "repair",
      afterHoursLevel: 1,
      currentCandidates: null,
      tips: 1,
      exitUnlocked: true,
      reels: [["crack", "crack", ...base.reels[0]], base.reels[1], base.reels[2]]
    }} />);

    const decision = screen.getByRole("region", { name: "当前决策" });
    expect(within(decision).getByRole("heading", { name: "加班边界" })).toBeVisible();
    expect(within(decision).getByRole("button", { name: "修复第1轮裂纹（1 小费）" })).toBeVisible();
    expect(within(decision).getByRole("button", { name: "结账离开" })).toBeVisible();
    expect(within(decision).getByRole("button", { name: "继续加班" })).toBeVisible();

    await user.click(within(decision).getByRole("button", { name: "修复第1轮裂纹（1 小费）" }));

    expect(screen.queryByRole("button", { name: /修复第1轮裂纹/ })).not.toBeInTheDocument();
    expect(screen.getByText("主要支出：下注")).toBeVisible();
    expect(screen.getByRole("button", { name: "结账离开" })).toBeVisible();
    expect(screen.getByRole("button", { name: "继续加班" })).toBeVisible();
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
    expect(screen.getByRole("group", { name: "选择服务" })).toBeVisible();
  });
});
