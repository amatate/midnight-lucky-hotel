import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShiftReceipt } from "@/app/components/ShiftReceipt";
import { createRun } from "@/core/run";

afterEach(cleanup);

describe("ShiftReceipt", () => {
  it("renders truthful shift totals from the newest snapshot", () => {
    const base = createRun(51);
    render(<ShiftReceipt state={{
      ...base,
      shiftHistory: [{ shift: 2, bankroll: 138, reels: base.reels, parts: [], totalWager: 30, totalPayout: 48 }]
    }} />);

    expect(screen.getByText("第 2 班收工")).toBeVisible();
    expect(screen.getByText("本班转轮盈亏 +¥18")).toBeVisible();
    expect(screen.getByText("余额 ¥138 / 目标 ¥150")).toBeVisible();
    expect(screen.getByText("下注 ¥30 · 赔付 ¥48")).toBeVisible();
  });

  it("labels overtime and renders nothing without a snapshot", () => {
    const base = createRun(52);
    const { rerender } = render(<ShiftReceipt state={{
      ...base,
      shiftHistory: [{ shift: 5, afterHoursLevel: 2, bankroll: 180, reels: base.reels, parts: [], totalWager: 30, totalPayout: 20 }]
    }} />);
    expect(screen.getByText("加班第 2 段收工")).toBeVisible();

    rerender(<ShiftReceipt state={base} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
