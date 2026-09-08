import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PartDiscovery } from "@/app/components/PartDiscovery";
import { GameScreen } from "@/app/GameScreen";
import { createRun } from "@/core/run";
import type { RunState } from "@/core/types";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const state = (): RunState => ({ ...createRun(12), phase: "RESOLVING_EFFECTS", nextSpinOrdinal: 2,
  partSlots: [{ id: "triple-blessing", level: 1 }, null, null, null, null],
  pendingEvents: [
    { sequence: 1, type: "PART_TRIGGERED", partId: "triple-blessing", level: 1 },
    { sequence: 2, type: "PAYOUT_ADDED", source: "part", partId: "triple-blessing", amount: 35, preMultiplierAmount: 35, appliedMultiplier: 1 },
    { sequence: 3, type: "PAYOUT_COMPLETE", total: 70 }
  ] });

it("introduces a part only when its event is visible and never reveals unpresented money", () => {
  const run = state(); const original = structuredClone(run);
  const { rerender } = render(<PartDiscovery state={run} presentedThroughSequence={null} />);
  expect(screen.queryByRole("region", { name: "初次发现" })).not.toBeInTheDocument();
  rerender(<PartDiscovery state={run} presentedThroughSequence={1} />);
  expect(screen.getByRole("region", { name: "初次发现" })).toHaveTextContent("三重祝福");
  expect(screen.getByRole("region", { name: "初次发现" })).not.toHaveTextContent("35");
  rerender(<PartDiscovery state={run} presentedThroughSequence={2} />);
  expect(screen.getByRole("region", { name: "初次发现" })).toHaveTextContent("+¥35");
  expect(run).toEqual(original);
});

it("does not reopen a dismissed discovery after remounting or the next spin", async () => {
  const { unmount } = render(<PartDiscovery state={state()} presentedThroughSequence={3} />);
  await userEvent.click(screen.getByRole("button", { name: "明白了" }));
  expect(screen.queryByRole("region", { name: "初次发现" })).not.toBeInTheDocument();
  unmount();
  render(<PartDiscovery state={{ ...state(), nextSpinOrdinal: 3 }} presentedThroughSequence={3} />);
  expect(screen.queryByRole("region", { name: "初次发现" })).not.toBeInTheDocument();
});

it("does not misattribute base winnings to a transforming part", () => {
  const run: RunState = { ...state(), pendingEvents: [
    { sequence: 1, type: "PART_TRIGGERED", partId: "lemon-infection", level: 1 },
    { sequence: 2, type: "PAYOUT_ADDED", source: "base", amount: 90, preMultiplierAmount: 90, appliedMultiplier: 1 },
    { sequence: 3, type: "PAYOUT_COMPLETE", total: 90 }
  ] };
  render(<PartDiscovery state={run} presentedThroughSequence={3} />);
  const note = screen.getByRole("region", { name: "初次发现" });
  expect(note).toHaveTextContent("改造");
  expect(note).not.toHaveTextContent("+¥90");
});

it("retains a post-settlement fuse rescue that is outside the finalized spin receipt", () => {
  const run: RunState = { ...state(), phase: "READY_TO_SPIN", bankroll: 20,
    partSlots: [null, null, null, null, null],
    spinHistory: [{ ordinal: 1, shift: 1, afterHoursLevel: 0, isFree: false, baseSpinIndex: 1,
      bankrollBefore: 10, wager: 10, finalGrid: [["blank", "blank", "blank"], ["blank", "blank", "blank"], ["blank", "blank", "blank"]],
      awards: [], totalPayout: 0, bankrollAfter: 0 }],
    pendingEvents: [
      { sequence: 1, type: "PART_TRIGGERED", partId: "safety-fuse", level: 1 },
      { sequence: 2, type: "PAYOUT_ADDED", source: "part", partId: "safety-fuse", amount: 20, preMultiplierAmount: 20, appliedMultiplier: 1 }
    ] };
  render(<PartDiscovery state={run} />);
  expect(screen.getByRole("region", { name: "初次发现" })).toHaveTextContent("+¥20");
});

it("queues simultaneous discoveries even when their original event buffer has cleared", async () => {
  const run: RunState = { ...state(), pendingEvents: [
    ...state().pendingEvents,
    { sequence: 4, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 }
  ] };
  const { rerender } = render(<PartDiscovery state={run} presentedThroughSequence={4} />);
  expect(screen.getByRole("region", { name: "初次发现" })).toHaveTextContent("三重祝福");
  rerender(<PartDiscovery state={{ ...run, phase: "READY_TO_SPIN", pendingEvents: [] }} />);
  await userEvent.click(screen.getByRole("button", { name: "明白了" }));
  expect(screen.getByRole("region", { name: "初次发现" })).toHaveTextContent("果酱罐");
});

it("introduces the real presentation-complete fuse rescue through the controller event result", async () => {
  localStorage.setItem("midnight-lucky-hotel.reduce-flash", "1");
  render(<GameScreen seed={42} initialState={{ ...createRun(42), phase: "READY_TO_SPIN", service: "repair", bankroll: 10,
    reels: [["blank", "blank", "blank"], ["blank", "blank", "blank"], ["blank", "blank", "blank"]],
    partSlots: [{ id: "safety-fuse", level: 1 }, null, null, null, null] }} />);
  await userEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
  await userEvent.click(await screen.findByRole("button", { name: "收下这把" }));
  expect(await screen.findByRole("region", { name: "初次发现" })).toHaveTextContent("安全保险丝");
  expect(screen.getByRole("region", { name: "初次发现" })).toHaveTextContent("+¥20");
});

it("does not mark a queued but never displayed part as learned after unmount", () => {
  const run: RunState = { ...state(), pendingEvents: [...state().pendingEvents,
    { sequence: 4, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 }] };
  const { unmount } = render(<PartDiscovery state={run} />);
  expect(screen.getByRole("region", { name: "初次发现" })).toHaveTextContent("三重祝福");
  unmount();
  render(<PartDiscovery state={{ ...run, nextSpinOrdinal: 3, pendingEvents: [
    { sequence: 1, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 }
  ] }} />);
  expect(screen.getByRole("region", { name: "初次发现" })).toHaveTextContent("果酱罐");
});

it("introduces the spring on an observed successful kick, without requiring a payout trigger", () => {
  const run: RunState = { ...state(), phase: "AWAITING_INTERVENTION",
    partSlots: [{ id: "loose-spring", level: 1 }, null, null, null, null],
    pendingEvents: [{ sequence: 1, type: "INTERVENTION_USED", kind: "kick", target: 0 }] };
  render(<PartDiscovery state={run} />);
  expect(screen.getByRole("region", { name: "初次发现" })).toHaveTextContent("松动弹簧");
});
