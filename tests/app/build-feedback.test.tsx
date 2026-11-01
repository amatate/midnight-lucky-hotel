import { cleanup, render, renderHook, screen, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { payoutTier, summarizePresentation } from "@/presentation/summary";
import { changedPart, presentedCounters, receiptPartAwards, settlementEntry } from "@/presentation/part-feedback";
import { createRun } from "@/core/run";
import type { GameEvent } from "@/core/events";
import type { RunState, SpinReceipt } from "@/core/types";
import type { ActionEntry } from "@/persistence/archives";
import { PartReadout } from "@/app/components/PartReadout";
import { ReceiptPartStory } from "@/app/components/ReceiptPartStory";
import { PartInstallFeedback } from "@/app/components/PartInstallFeedback";
import { PresentedCoins } from "@/app/components/CoinBurst";
import { useSettlementPresentation } from "@/app/useSettlementPresentation";
import { setLanguage } from "@/i18n/language";

afterEach(() => { cleanup(); vi.useRealTimers(); setLanguage("zh", false); });
const before = { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 2, votiveCharge: 2 };
const events: readonly GameEvent[] = [
  { sequence: 1, type: "PART_TRIGGERED", partId: "harvest-vat", level: 1 },
  { sequence: 2, type: "PAYOUT_ADDED", source: "part", partId: "harvest-vat", preMultiplierAmount: 120, appliedMultiplier: 1, amount: 120 },
  { sequence: 3, type: "PART_TRIGGERED", partId: "votive-candle", level: 1 },
  { sequence: 4, type: "PAYOUT_ADDED", source: "part", partId: "votive-candle", preMultiplierAmount: 40, appliedMultiplier: 1, amount: 40 },
  { sequence: 5, type: "PAYOUT_COMPLETE", total: 160 }
];
const receipt: SpinReceipt = { ordinal: 1, shift: 1, afterHoursLevel: 0, isFree: false, baseSpinIndex: 1,
  bankrollBefore: 100, bankrollAfter: 250, wager: 10, totalPayout: 160,
  finalGrid: [["cherry", "lemon", "bell"], ["cherry", "lemon", "bell"], ["cherry", "lemon", "bell"]],
  awards: [{ sequence: 2, kind: "part-bonus", partId: "harvest-vat", source: "part", amount: 120,
    formula: { kind: "known", preMultiplierAmount: 120, appliedMultiplier: 1 } },
  { sequence: 4, kind: "part-bonus", partId: "votive-candle", source: "part", amount: 40,
    formula: { kind: "known", preMultiplierAmount: 40, appliedMultiplier: 1 } }] };
const resolving: RunState = { ...createRun(8), phase: "RESOLVING_EFFECTS", pendingEvents: events,
  counters: { ...before, harvestCharge: 0, votiveCharge: 0 }, spinHistory: [receipt] };

it("separates returns, profits, and large payouts including free spins", () => {
  expect([0, 5, 10, 10.01, 29.99, 30, 80].map(total => payoutTier(total, 10, 10)))
    .toEqual(["none", "return", "return", "win", "win", "chain", "runaway"]);
  expect(payoutTier(1, 0, 10)).toBe("win");
  expect(payoutTier(30, 0, 10)).toBe("chain");
  expect(payoutTier(80, 0, 10)).toBe("runaway");
  expect(payoutTier(0, 0, 0)).toBe("none");
  expect(summarizePresentation([{ sequence: 1, type: "PAYOUT_COMPLETE", total: 1 }], 10, 0).tier).toBe("win");
});

it("lets a real coin cue finish after its money tween and never replays a paused cue", async () => {
  vi.useFakeTimers();
  const { rerender } = render(<PresentedCoins animationKey="spin1:award2" paying count={4} sourcePartId="harvest-vat" cancel={false} />);
  expect(screen.getByTestId("coin-burst")).toBeInTheDocument();
  rerender(<PresentedCoins animationKey="spin1:award2" paying={false} count={4} sourcePartId="harvest-vat" cancel={false} />);
  await act(async () => vi.advanceTimersByTimeAsync(700));
  expect(screen.getByTestId("coin-burst")).toBeInTheDocument();
  await act(async () => vi.advanceTimersByTimeAsync(81));
  expect(screen.queryByTestId("coin-burst")).not.toBeInTheDocument();
  rerender(<PresentedCoins animationKey="spin1:award3" paying count={4} sourcePartId="harvest-vat" cancel={false} />);
  expect(screen.getByTestId("coin-burst")).toBeInTheDocument();
  rerender(<PresentedCoins animationKey="spin1:award3" paying count={4} sourcePartId="harvest-vat" cancel />);
  rerender(<PresentedCoins animationKey="spin1:award3" paying count={4} sourcePartId="harvest-vat" cancel={false} />);
  expect(screen.queryByTestId("coin-burst")).not.toBeInTheDocument();
});

it("reveals the full vat on ignition and drains each part only at its own payout", () => {
  const snapshot = structuredClone(resolving);
  expect(presentedCounters(resolving, null, before)).toEqual(before);
  expect(presentedCounters(resolving, 1, before)).toMatchObject({ harvestCharge: 3, votiveCharge: 2 });
  expect(presentedCounters(resolving, 2, before)).toMatchObject({ harvestCharge: 0, votiveCharge: 2 });
  expect(presentedCounters(resolving, 3, before)).toMatchObject({ votiveCharge: 2 });
  expect(presentedCounters(resolving, 4, before)).toMatchObject({ votiveCharge: 0 });
  expect(presentedCounters(resolving, null, null)).toEqual({});
  expect(resolving).toEqual(snapshot);
});

it("keeps known pre-spin charges visible rather than leaking the committed final reset", () => {
  const { rerender } = render(<PartReadout part={{ id: "harvest-vat", level: 1 }} state={resolving} disabled={false} visibleCounters={before} />);
  expect(screen.getByText("2/3")).toBeVisible();
  rerender(<PartReadout part={{ id: "harvest-vat", level: 1 }} state={resolving} disabled={false} visibleCounters={{}} />);
  expect(screen.getByText("结算中")).toBeVisible();
});

it("only animates a real installation/upgrade, never initial hydration or a rejected command", () => {
  const start = createRun(8);
  const next: RunState = { ...start, partSlots: [{ id: "harvest-vat", level: 1 }, null, null, null, null], commandHistory: [{ type: "SELECT_SERVICE", serviceId: "kitchen" }] };
  expect(changedPart(next, next)).toBeNull();
  expect(changedPart(start, next)).toEqual({ part: { id: "harvest-vat", level: 1 }, slot: 0, upgraded: false });
  expect(changedPart(next, { ...next, initialSeed: 9 })).toBeNull();
  const origin = { current: null };
  const { rerender, container } = render(<PartInstallFeedback state={start} origin={origin} paused={false} reducedMotion />);
  expect(container).toBeEmptyDOMElement();
  rerender(<PartInstallFeedback state={next} origin={origin} paused={false} reducedMotion />);
  expect(screen.getByRole("status")).toHaveTextContent("部件就位");
  expect(document.querySelector(".part-install-flight")).toBeNull();
});

it("rebuilds the readable part receipt from persisted evidence, without duplicate totals", () => {
  expect(receiptPartAwards(receipt)).toEqual([{ id: "harvest-vat", amount: 120 }, { id: "votive-candle", amount: 40 }]);
  const entry: ActionEntry = { ordinal: 4, at: "2026-11-01T00:00:00Z", actor: "player", command: { type: "ACCEPT_OUTCOME" }, ok: true, error: null,
    shift: 1, afterHoursLevel: 0, spin: 1, events, changes: { counters: { before, after: resolving.counters } } };
  expect(settlementEntry([entry], receipt)).toBe(entry);
  expect(settlementEntry([entry], { ...receipt, ordinal: 2 })).toBeUndefined();
  const { rerender, container } = render(<ReceiptPartStory receipt={receipt} entries={[entry]} />);
  expect(screen.getByText("开桶 +¥120")).toBeVisible();
  expect(screen.getByText("兑现 +¥40")).toBeVisible();
  expect(screen.getByText(/已包含在总额内/)).toBeVisible();
  setLanguage("en", false);
  rerender(<ReceiptPartStory receipt={receipt} entries={[entry]} />);
  expect(container.textContent).not.toMatch(/\p{Script=Han}/u);
});

it("presents charge-only triggers even with no monetary payout and keeps skip rule-neutral", async () => {
  vi.useFakeTimers();
  const state: RunState = { ...resolving, pendingEvents: [{ sequence: 1, type: "PART_TRIGGERED", partId: "blank-capacitor", level: 1 }, { sequence: 2, type: "PAYOUT_COMPLETE", total: 0 }],
    spinHistory: [{ ...receipt, totalPayout: 0, awards: [], bankrollAfter: 90 }], counters: { ...before, blankCharge: 1 } };
  const original = structuredClone(state);
  const onCommand = vi.fn();
  const { result } = renderHook(() => useSettlementPresentation({ state, paused: false, reducedMotion: false, onCommand }));
  expect(result.current?.visiblePayoutTarget).toBe(0);
  await act(async () => vi.advanceTimersByTimeAsync(120));
  expect(result.current?.activePartId).toBe("blank-capacitor");
  expect(result.current?.summary.tier).toBe("none");
  act(() => result.current?.skip());
  expect(onCommand).toHaveBeenCalledExactlyOnceWith({ type: "PRESENTATION_COMPLETE" });
  expect(state).toEqual(original);
});
