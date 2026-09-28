import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { eventLabel } from "@/app/archive-copy";
import { Hud } from "@/app/components/Hud";
import { RoomChoices, RoomResult } from "@/app/components/HotelChallenge";
import type { SettlementPresentationState } from "@/app/useSettlementPresentation";
import { HOTEL_ROOMS } from "@/content/hotel";
import { createRun } from "@/core/run";
import type { RoomTier, RunState, SpinReceipt } from "@/core/types";
import { summarizePresentation } from "@/presentation/summary";

afterEach(cleanup);

function receipt(totalPayout: number, ordinal: number, isFree = false): SpinReceipt {
  return { ordinal, shift: 5, afterHoursLevel: 4, isFree, baseSpinIndex: isFree ? null : 1,
    bankrollBefore: 10000, wager: isFree ? 0 : 150, totalPayout, bankrollAfter: 10000 + totalPayout,
    finalGrid: [["cherry", "cherry", "cherry"], ["cherry", "cherry", "cherry"], ["cherry", "cherry", "cherry"]], awards: [] };
}

function roomState(tier: RoomTier, payouts: readonly number[], patch: Partial<RunState> = {}): RunState {
  const room = HOTEL_ROOMS[tier];
  return { ...createRun(8), phase: "READY_TO_SPIN", service: "repair", shift: 5,
    afterHoursLevel: 4, bankroll: 10000, exitUnlocked: true, currentCandidates: null,
    shiftPayout: payouts.reduce((sum, amount) => sum + amount, 0),
    spinHistory: payouts.map((amount, ordinal) => receipt(amount, ordinal + 1)),
    hotel: { cleared: 0, challenge: { tier, status: "playing", target: room.target,
      paidSpins: room.paidSpins, objective: room.objective } }, ...patch };
}

function presentation(visiblePayoutTarget: number): SettlementPresentationState {
  return { summary: summarizePresentation([], 150), currentEvent: null, explanationEvents: [],
    eventIndex: 0, eventTotal: 1, activeLineIds: [], activePartId: null, changedCells: [], displayGrid: null,
    done: false, accelerated: false, settlementStartBankroll: 10000, visiblePayoutTarget,
    visibleBankrollTarget: 10000 + visiblePayoutTarget, awardDelta: 0, moneyResetKey: "room",
    moneyAnimationKey: "room", moneyDurationMs: 0, speedUp: () => {}, skip: () => {} };
}

describe("room objective readouts", () => {
  it.each([
    { tier: 2 as const, payouts: [300, 400], label: "本段奖金目标", value: "700", max: "1200" },
    { tier: 4 as const, payouts: [700, 1800], label: "单转最高目标", value: "1800", max: "2500" },
    { tier: 5 as const, payouts: [1200, 0, 1400], label: "达标转数目标", value: "2", max: "3" }
  ])("shows $label independently from the wallet", ({ tier, payouts, label, value, max }) => {
    render(<Hud state={roomState(tier, payouts)} estimate={null} estimateStatus="idle" />);
    expect(screen.getByRole("progressbar", { name: label })).toHaveAttribute("aria-valuenow", value);
    expect(screen.getByRole("progressbar", { name: label })).toHaveAttribute("aria-valuemax", max);
    expect(screen.getByRole("region", { name: "客房进度" })).toHaveTextContent(`${HOTEL_ROOMS[tier].paidSpins} 次付费转`);
  });

  it.each([
    { tier: 2 as const, payouts: [300, 2400], label: "本段奖金目标", before: "300", shown: 600, after: "900" },
    { tier: 4 as const, payouts: [700, 5000], label: "单转最高目标", before: "700", shown: 1800, after: "1800" },
    { tier: 5 as const, payouts: [1250, 0, 2200, 1300], label: "达标转数目标", before: "2", shown: 1200, after: "3" }
  ])("does not reveal $label before awards are presented", ({ tier, payouts, label, before, shown, after }) => {
    const state = roomState(tier, payouts, { phase: "RESOLVING_EFFECTS",
      spinHistory: payouts.map((amount, ordinal) => receipt(amount, ordinal + 1, ordinal === payouts.length - 1)) });
    const view = render(<Hud state={state} estimate={null} estimateStatus="idle" />);
    expect(screen.getByRole("progressbar", { name: label })).toHaveAttribute("aria-valuenow", before);
    view.rerender(<Hud state={state} estimate={null} estimateStatus="idle" settlementPresentation={presentation(shown)} />);
    expect(screen.getByRole("progressbar", { name: label })).toHaveAttribute("aria-valuenow", after);
  });

  it("keeps ordinary-shift progress based on the wallet", () => {
    render(<Hud state={createRun(8)} estimate={null} estimateStatus="idle" />);
    expect(screen.getByRole("progressbar", { name: "余额目标" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("lists all six rooms and requires the next room's whole paid-turn budget", () => {
    render(<RoomChoices state={roomState(3, [], { phase: "AFTER_HOURS", bankroll: 499,
      hotel: { cleared: 3, challenge: null } })} onCommand={() => {}} />);
    const choices = screen.getByRole("region", { name: "升房挑战" });
    expect(within(choices).getAllByRole("listitem")).toHaveLength(6);
    expect(within(choices).getByRole("button", { name: "升房挑战 · 留声机房" })).toBeDisabled();
    expect(choices).toHaveTextContent("下一房备付金 ¥500（4 次 × ¥125）");
    expect(choices).toHaveTextContent("至少 3 转各得 ¥1200，不要求连续");
    expect(choices).toHaveTextContent("全部回合转完再判通关");
  });

  it("preserves old recorded targets without changing historical results", () => {
    render(<RoomResult state={roomState(2, [1185], { phase: "AFTER_HOURS",
      hotel: { cleared: 1, challenge: { tier: 2, status: "failed", target: 2000 } } })} />);
    const result = screen.getByRole("region", { name: "客房挑战结果" });
    expect(result).toHaveTextContent("本段奖金 ¥1185 / ¥2000 · 已通关 1/6 间");
    expect(result).toHaveTextContent("以上是旧规则成绩");
    expect(result).toHaveTextContent("本段奖金合计 ¥1200");
  });

  it("uses the completed best-spin snapshot instead of total room payout", () => {
    render(<RoomResult state={roomState(4, [1000, 2400, 2300, 1000], { phase: "AFTER_HOURS",
      hotel: { cleared: 3, challenge: { tier: 4, status: "failed", target: 2500,
        paidSpins: 4, objective: { kind: "best-spin" }, progress: 2400 } } })} />);
    const result = screen.getByRole("region", { name: "客房挑战结果" });
    expect(result).toHaveTextContent("单转最高 ¥2400 / ¥2500");
    expect(result).toHaveTextContent("本段奖金共 ¥6700");
    expect(result).not.toHaveTextContent("本段奖金 ¥6700 / ¥2500");
  });
});

describe("room log snapshots", () => {
  it("logs recorded turn limits and scoring objective rather than inferring totals", () => {
    expect(eventLabel({ sequence: 1, type: "ROOM_ENTERED", tier: 5, bet: 150, target: 1200,
      focus: 3, paidSpins: 4, objective: { kind: "scoring-spins", count: 3 } })).toContain("4 次付费转 · 至少 3 转各得 ¥1,200");
    expect(eventLabel({ sequence: 2, type: "ROOM_COMPLETED", tier: 5, payout: 7600, target: 1200,
      cleared: true, paidSpins: 4, objective: { kind: "scoring-spins", count: 3 }, progress: 3 }))
      .toContain("达标转数 3 / 3（每转 ≥ ¥1,200） · 4 次付费转 · 本段奖金合计 ¥7,600");
  });

  it("treats legacy events as three-spin total-payout challenges, independent of the current table", () => {
    expect(eventLabel({ sequence: 1, type: "ROOM_ENTERED", tier: 4, bet: 100, target: 2000, focus: 2 }))
      .toContain("3 次付费转 · 本段奖金合计 ¥2,000");
    expect(eventLabel({ sequence: 2, type: "ROOM_COMPLETED", tier: 4, payout: 1800, target: 2000, cleared: false }))
      .toContain("本段奖金 ¥1,800 / ¥2,000 · 3 次付费转");
  });

  it("does not mistake total payout for a missing best-spin score", () => {
    const label = eventLabel({ sequence: 2, type: "ROOM_COMPLETED", tier: 4, payout: 8000, target: 2500,
      cleared: false, paidSpins: 4, objective: { kind: "best-spin" } });
    expect(label).toContain("成绩未记录；目标：单转奖金达到 ¥2,500");
    expect(label).not.toContain("单转最高 ¥8,000");
  });
});
