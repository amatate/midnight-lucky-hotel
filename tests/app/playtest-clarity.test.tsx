import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRun } from "@/core/run";
import { UpgradePicker } from "@/app/components/UpgradePicker";
import type { RunState } from "@/core/types";

afterEach(cleanup);
beforeEach(() => localStorage.clear());
const machine = (): RunState => ({ ...createRun(5), phase: "CHOOSING_UPGRADE", service: "kitchen",
  currentCandidates: { synergy: "lemon-crate", pivot: "cherry-pitter", wildcard: "pruning-shears" } });

describe("visual maintenance ticket", () => {
  it("shows exactly two appended lemons per chosen reel without spending or revealing locked estimates", async () => {
    const state = machine();
    const before = structuredClone(state);
    const send = vi.fn();
    render(<UpgradePicker state={state} onCommand={send} />);
    await userEvent.click(screen.getByRole("button", { name: "选择柠檬木箱" }));
    const preview = screen.getByRole("region", { name: "转轮改造预览" });
    expect(within(preview).getAllByLabelText(/新增：柠檬/)).toHaveLength(4);
    expect(within(preview).getAllByRole("group", { name: /第[12]轮改造/ })).toHaveLength(2);
    expect(preview).not.toHaveTextContent(/%|RTP/);
    expect(state).toEqual(before);
    expect(send).not.toHaveBeenCalled();
  });

  it("marks replacement as one removed symbol and one appended cherry", async () => {
    render(<UpgradePicker state={machine()} onCommand={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "选择樱桃去核器" }));
    const preview = screen.getByRole("region", { name: "转轮改造预览" });
    expect(within(preview).getAllByLabelText(/^移除：/)).toHaveLength(1);
    expect(within(preview).getAllByLabelText("新增：樱桃")).toHaveLength(1);
  });

  it("marks pruning as removal without suggesting a new symbol", async () => {
    render(<UpgradePicker state={machine()} onCommand={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "选择修枝剪" }));
    const preview = screen.getByRole("region", { name: "转轮改造预览" });
    expect(within(preview).getAllByLabelText(/^移除：/)).toHaveLength(1);
    expect(within(preview).queryByLabelText(/^新增：/)).not.toBeInTheDocument();
  });

  it("keeps temporary blessing pollution distinct from permanent modification", async () => {
    render(<UpgradePicker state={{ ...machine(), currentCandidates: { synergy: "triple-blessing", pivot: "cherry-pitter", wildcard: "lemon-crate" } }} onCommand={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "选择三重祝福" }));
    const consequences = screen.getByRole("list", { name: "影响何时发生" });
    expect(consequences).toHaveTextContent("本班影响");
    expect(consequences).toHaveTextContent("临时空白");
    expect(consequences).toHaveTextContent("下一班清除");
  });
});
