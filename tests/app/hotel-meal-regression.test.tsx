import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import type { Grid, RunState } from "@/core/types";
import { mealExtra, refilledReels } from "@/app/meal-receipt";
import { stayTask } from "@/story/stay-copy";
import { roomProgressCopy } from "@/app/room-copy";
import { getRoomProgress } from "@/content/hotel";
import { SymbolFace } from "@/app/components/SymbolFace";

afterEach(cleanup);
it("formats previously saved fractional room totals to cents in Chinese, English and progress copy", () => {
  const state: RunState = { ...createRun(8), hotel: { cleared: 1, challenge: { tier: 1, status: 'cleared',
    target: 1000, progress: 1524.4499999999998, rounds: { current: 3, total: 3, payout: 1110.12 } } } };
  expect(stayTask(state)).toBe('本房累计 ¥1524.45 / ¥1000');
  expect(stayTask(state, true)).toBe('Room payouts ¥1524.45 / ¥1000');
  expect(roomProgressCopy(getRoomProgress(state)!)).toContain('¥1524.45 / ¥1000');
});

it("a dish blocks just its crossing lines; other lines pay, and the refill is not rescored", () => {
  const grid: Grid = [['cherry','cherry','cherry'], ['cherry','food','cherry'], ['cherry','cherry','cherry']];
  const base = createRun(8);
  const draw = { strips: grid, grid, stops: [0,0,0] as const, rng: base.rng };
  const state: RunState = { ...base, phase: 'AWAITING_INTERVENTION', service: 'kitchen', bankroll: 90,
    reels: grid, pendingEvents: [{ type: 'REELS_DRAWN', draw, sequence: 1 }],
    buffs: [{ id:'food', additivePayout: 0.5, spinsRemaining: 3 }], pendingSpin: { draw, bankrollBefore: 100, wager:10, isFree:false } };
  const resolved = dispatchCommand(state, {type:'ACCEPT_OUTCOME'});
  if (!resolved.ok) throw new Error(`Meal settlement failed: ${resolved.error}`);
  const receipt = resolved.state.spinHistory[0]!;
  expect(receipt.awards.flatMap(a => a.kind === 'line' ? [a.lineId] : [])).toEqual(['top','bottom']);
  expect(receipt.finalGrid[1]).toEqual(['cherry','cherry','cherry']);
  expect(receipt.totalPayout).toBe(18);
  expect(mealExtra(receipt)).toBe(6);
  expect(refilledReels(resolved.events)).toEqual([1]);
  expect(resolved.state.buffs).toContainEqual({ id:'food', additivePayout:0.25, spinsRemaining:3 });
  expect(dispatchCommand(resolved.state,{type:'PRESENTATION_COMPLETE'}).state.phase).toBe('READY_TO_SPIN');
});

it("uses generated symbols first and falls back only on a real image error", () => {
  const {container, rerender} = render(<SymbolFace symbol="lemon" />);
  expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining('lemon-v2.webp'));
  expect(container.querySelector('svg')).toBeNull();
  fireEvent.error(container.querySelector('img')!);
  expect(container.querySelector('svg')).toBeInTheDocument();
  rerender(<SymbolFace symbol="bell" />);
  expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining('bell-v2.webp'));
});
