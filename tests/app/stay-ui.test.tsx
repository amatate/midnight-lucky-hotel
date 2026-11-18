import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import type { RunState } from "@/core/types";
import { StayPanel, RoomCardCollection } from "@/story/StayPanel";
import { RoomChoices } from "@/app/components/HotelChallenge";
import { RunSummary } from "@/app/components/RunSummary";
import { stayPhaseLabel } from "@/story/stay-copy";
import { setLanguage } from "@/i18n/language";

afterEach(() => { cleanup(); setLanguage("zh", false); });
const bill = (): RunState => ({ ...createRun(8, true), phase: "SHIFT_COMPLETE", shift: 3, baseSpinsInShift: 3, exitUnlocked: true, service: "repair", bankroll: 150 });
it("shows the real debit and dispatches one explicit payment command", () => {
  const onCommand = vi.fn(); render(<StayPanel state={bill()} onCommand={onCommand} />);
  expect(screen.getByText("钱包 ¥150 → 支付后 ¥100")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "向澪交房费 ¥50 · 领房卡" }));
  expect(onCommand).toHaveBeenCalledExactlyOnceWith({ type: "PAY_ROOM_RENT" });
});
it("does not offer a false card or negative post-payment wallet when funds are missing", () => {
  const onCommand = vi.fn(); render(<StayPanel state={{ ...bill(), bankroll: 49 }} onCommand={onCommand} />);
  expect(screen.getByRole("button", { name: "向澪交房费 ¥50 · 领房卡" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("还差 ¥1");
  expect(screen.queryByLabelText("标准房 房卡")).not.toBeInTheDocument();
});
it("localizes the new payment and next-room surfaces, and exposes seven card slots", () => {
  setLanguage("en", false);
  const paid = dispatchCommand(bill(), { type: "PAY_ROOM_RENT" }).state;
  const { container } = render(<><StayPanel state={paid} /><RoomChoices state={paid} onCommand={vi.fn()} /><RoomCardCollection cards={[0]} /></>);
  expect(container.textContent).not.toMatch(/\p{Script=Han}/u);
  expect(container.querySelectorAll('.room-card-grid button')).toHaveLength(7);
  expect(screen.getByRole("button", { name: /Ask Mio for · Garden Room/ })).toBeEnabled();
});
it("does not introduce rent or story panels into legacy saves", () => {
  const { container } = render(<StayPanel state={createRun(8)} onCommand={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});
it("does not direct an unpaid standard-room guest to an unavailable lounge", () => {
  const props = { trajectory: [], onCommand: vi.fn(), onRestartSameSeed: vi.fn(), onRestartNextSeed: vi.fn() };
  const { rerender } = render(<RunSummary state={bill()} {...props} />);
  expect(screen.queryByText(/大堂自由玩下一转/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "去大堂自由玩" })).not.toBeInTheDocument();
  rerender(<RunSummary state={dispatchCommand(bill(), { type: "PAY_ROOM_RENT" }).state} {...props} />);
  expect(screen.getByText(/大堂自由玩下一转/)).toBeVisible();
  expect(screen.getByRole("button", { name: "去大堂自由玩" })).toBeEnabled();
});
it("labels checkout and room breaks as a guest journey, not a won work shift", () => {
  expect(stayPhaseLabel(bill())).toBe("入住结算");
  expect(stayPhaseLabel({ ...bill(), phase: "RUN_WON" })).toBe("已退房");
  expect(stayPhaseLabel({ ...bill(), phase: "RUN_WON" }, true)).toBe("Checked out");
  expect(stayPhaseLabel({ ...bill(), phase: "AFTER_HOURS" })).toBe("本轮结算");
});
it("does not suggest paying an ended stay's uncollected room fee", () => {
  render(<StayPanel state={{ ...bill(), phase: "RUN_LOST", bankroll: 144 }} onCommand={vi.fn()} />);
  expect(screen.getByText(/未收取 · 本次入住已结束/)).toBeVisible();
  expect(screen.queryByText(/完成任务后确认扣款/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /交房费/ })).not.toBeInTheDocument();
});
