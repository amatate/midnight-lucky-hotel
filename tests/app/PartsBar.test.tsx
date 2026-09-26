import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PartsBar } from "@/app/components/PartsBar";
import { createRun } from "@/core/run";
import type { RunState } from "@/core/types";

afterEach(cleanup);

describe("PartsBar", () => {
  it("opens a five-socket machine part in a read-only floating inspection", async () => {
    const user = userEvent.setup();
    const state: RunState = {
      ...createRun(91),
      phase: "READY_TO_SPIN",
      service: "kitchen",
      counters: { ...createRun(91).counters, cherryWinsThisShift: 2 },
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null],
      attribution: { ...createRun(91).attribution, part: 42.5 }
    };
    render(<PartsBar state={state} />);

    const panel = screen.getByRole("region", { name: "部件栏" });
    expect(within(panel).getByText("本局全部部件贡献 ¥42.5")).toBeVisible();
    expect(within(panel).getAllByTestId("part-slot")).toHaveLength(5);
    const socket = within(panel).getByRole("button", { name: /果酱罐.*L1/ });
    expect(socket).toHaveAttribute("aria-expanded", "false");
    expect(socket).not.toHaveAttribute("aria-controls");
    expect(within(socket).getByTestId("part-glyph")).toHaveAttribute("aria-hidden", "true");

    await user.click(socket);

    expect(socket).toHaveAttribute("aria-expanded", "true");
    expect(socket).toHaveAttribute("aria-haspopup", "dialog");
    const dialog = screen.getByRole("dialog", { name: "果酱罐 · L1" });
    const part = within(dialog).getByRole("group", { name: "果酱罐部件详情" });
    expect(within(part).getByText(/每条樱桃中奖线都会充能/)).toBeInTheDocument();
    expect(within(part).getByText(/L1 → L2/).closest("p")).toHaveTextContent("0.5 × 当前下注提高为 1 × 当前下注");
    expect(within(part).getByText(/本班已有 2 条樱桃中奖线/).closest("p")).toHaveTextContent("下一条额外奖金 ¥10");
    expect(within(part).getByText(/当前状态：等待触发/)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/shift-scaling|fruit|cherry/);
    expect(panel).not.toHaveTextContent(/果酱罐贡献/);
  });

  it("marks only the causally presented disabled slot with a crack and restores no future event early", async () => {
    const state: RunState = {
      ...createRun(92),
      phase: "RESOLVING_EFFECTS",
      service: "security",
      partSlots: [{ id: "overload-motor", level: 2 }, null, null, null, null],
      pendingEvents: [{ sequence: 1, type: "PART_DISABLED", partId: "overload-motor", slot: 0 }]
    };
    const { rerender } = render(<PartsBar state={state} presentedThroughSequence={0} />);

    expect(screen.getAllByTestId("part-slot")[0]).not.toHaveAttribute("data-disabled");
    expect(screen.queryByText("本转失效")).not.toBeInTheDocument();

    rerender(<PartsBar state={state} presentedThroughSequence={1} />);

    const disabled = screen.getAllByTestId("part-slot")[0]!;
    expect(disabled).toHaveAttribute("data-disabled", "true");
    expect(within(disabled).getByText("本转失效")).toBeVisible();
    await userEvent.setup().click(within(disabled).getByRole("button", { name: /过载马达.*L2/ }));
    const dialog = screen.getByRole("dialog", { name: "过载马达 · L2" });
    expect(dialog).toHaveTextContent("本转状态：因可见裂纹失效");
    expect(within(dialog).getByText(/L1 → L2/).closest("p")).toHaveTextContent("0.5 × 当前下注");
  });

  it("reveals total part contribution only when its payout is presented", () => {
    const state: RunState = {
      ...createRun(93),
      phase: "RESOLVING_EFFECTS",
      partSlots: [{ id: "votive-candle", level: 2 }, null, null, null, null],
      attribution: { ...createRun(93).attribution, part: 140 },
      pendingEvents: [
        { sequence: 1, type: "PART_TRIGGERED", partId: "votive-candle", level: 2 },
        { sequence: 2, type: "PAYOUT_ADDED", source: "part", partId: "votive-candle", preMultiplierAmount: 120, appliedMultiplier: 1, amount: 120 },
        { sequence: 3, type: "PAYOUT_COMPLETE", total: 120 }
      ]
    };
    const before = structuredClone(state);
    const { rerender } = render(<PartsBar state={state} presentedThroughSequence={null} />);
    expect(screen.getByText("本局全部部件贡献 ¥20")).toBeVisible();

    rerender(<PartsBar state={state} presentedThroughSequence={1} />);
    expect(screen.getByText("本局全部部件贡献 ¥20")).toBeVisible();

    rerender(<PartsBar state={state} presentedThroughSequence={2} />);
    expect(screen.getByText("本局全部部件贡献 ¥140")).toBeVisible();

    rerender(<PartsBar state={state} />);
    expect(screen.getByText("本局全部部件贡献 ¥140")).toBeVisible();
    expect(state).toEqual(before);
  });
});
