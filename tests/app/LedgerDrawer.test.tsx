import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LedgerDrawer } from "@/app/components/LedgerDrawer";
import type { Grid, SpinReceipt } from "@/core/types";

const RECEIPT_GRID: Grid = [
  ["cherry", "blank", "lemon"],
  ["lemon", "wild", "bell"],
  ["bell", "food", "crack"]
];

const PAID_RECEIPT: SpinReceipt = {
  ordinal: 7,
  shift: 2,
  afterHoursLevel: 0,
  isFree: false,
  baseSpinIndex: 3,
  bankrollBefore: 100,
  wager: 10,
  finalGrid: RECEIPT_GRID,
  awards: [{
    sequence: 4,
    kind: "pattern-line",
    patternId: "fruit-salad",
    partId: "fruit-salad",
    lineId: "top",
    formula: { kind: "known", preMultiplierAmount: 23, appliedMultiplier: 1 },
    amount: 23
  }],
  totalPayout: 23,
  bankrollAfter: 113
};

const FREE_RECEIPT: SpinReceipt = {
  ordinal: 8,
  shift: 2,
  afterHoursLevel: 0,
  isFree: true,
  baseSpinIndex: null,
  bankrollBefore: 113,
  wager: 0,
  finalGrid: RECEIPT_GRID,
  awards: [{
    sequence: 2,
    kind: "line",
    lineId: "middle",
    symbol: "cherry",
    source: "base",
    formula: { kind: "legacy-unavailable" },
    amount: 8
  }],
  totalPayout: 8,
  bankrollAfter: 121
};

const OVERTIME_RECEIPT: SpinReceipt = {
  ordinal: 9,
  shift: 2,
  afterHoursLevel: 1,
  isFree: false,
  baseSpinIndex: 1,
  bankrollBefore: 121,
  wager: 10,
  finalGrid: RECEIPT_GRID,
  awards: [{
    sequence: 3,
    kind: "opaque",
    formula: { kind: "legacy-unavailable" },
    amount: 5
  }],
  totalPayout: 5,
  bankrollAfter: 116
};

afterEach(cleanup);

describe("LedgerDrawer", () => {
  it("shows newest-first receipt summaries and expands only trusted award details", async () => {
    const user = userEvent.setup();
    render(<LedgerDrawer receipts={[PAID_RECEIPT, FREE_RECEIPT, OVERTIME_RECEIPT]} />);

    expect(screen.getByRole("button", { name: "账本" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "账本" }));
    const dialog = screen.getByRole("dialog", { name: "前台账本" });
    expect(dialog).toBeVisible();
    const summaryButtons = within(dialog).getAllByRole("button", { expanded: false });
    expect(summaryButtons.map((button) => button.textContent)).toEqual([
      "加班第 1 段 · 第 1 转-¥10 → +¥5 · 净 -¥5",
      "免费转 · 小票 #8¥0 → +¥8 · 净 +¥8",
      "第 2 班 · 第 3 转-¥10 → +¥23 · 净 +¥13"
    ]);

    await user.click(within(dialog).getByRole("button", { name: /第 2 班 · 第 3 转/ }));
    expect(within(dialog).getByText("水果沙拉 · 顶线")).toBeVisible();
    expect(within(dialog).getByText("¥23 × 1 = ¥23")).toBeVisible();
    expect(within(dialog).getByText("转前余额").nextElementSibling).toHaveTextContent("¥100");
    expect(within(dialog).getByText("下注").nextElementSibling).toHaveTextContent("-¥10");
    expect(within(dialog).getByText("转后余额").nextElementSibling).toHaveTextContent("¥113");

    await user.click(within(dialog).getByRole("button", { name: /免费转 · 小票 #8/ }));
    expect(within(dialog).getByText("樱桃 · 中线")).toBeVisible();
    expect(within(dialog).queryByText(/×/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /加班第 1 段 · 第 1 转/ }));
    expect(within(dialog).getByText("本转合计（明细不可用）")).toBeVisible();
  });

  it("shows an instructive empty state and silently omits only malformed rows", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LedgerDrawer receipts={[]} />);
    await user.click(screen.getByRole("button", { name: "账本" }));
    expect(screen.getByText("拉动一次后，前台会在这里留下结算小票")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "关闭账本" }));
    const receipts = [
      PAID_RECEIPT,
      { ...PAID_RECEIPT, ordinal: "损坏的小票" },
      FREE_RECEIPT
    ] as unknown as readonly SpinReceipt[];
    rerender(<LedgerDrawer receipts={receipts} />);
    await user.click(screen.getByRole("button", { name: "账本" }));

    const dialog = screen.getByRole("dialog", { name: "前台账本" });
    expect(within(dialog).getByRole("button", { name: /第 2 班 · 第 3 转/ })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: /免费转 · 小票 #8/ })).toBeVisible();
    expect(within(dialog).queryByText("损坏的小票")).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { expanded: false })).toHaveLength(2);
  });

  it("traps focus, closes on Escape, and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    render(<LedgerDrawer receipts={[PAID_RECEIPT]} />);
    const trigger = screen.getByRole("button", { name: "账本" });

    await user.click(trigger);
    const close = screen.getByRole("button", { name: "关闭账本" });
    const receipt = screen.getByRole("button", { name: /第 2 班 · 第 3 转/ });
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(receipt).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "前台账本" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
