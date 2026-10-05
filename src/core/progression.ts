import type { BetMode, Money, RunState } from "@/core/types";
import { activeRoom } from "@/content/hotel";

export const BET_MULTIPLIER = {
  conservative: 0.5,
  normal: 1,
  aggressive: 2
} as const satisfies Readonly<Record<BetMode, number>>;

export function getIntroShiftLimit(state: Pick<RunState, "introShifts">): number {
  return state.introShifts ?? 5;
}

export function roundMoney(value: number): Money {
  if (!Number.isFinite(value)) throw new RangeError("money must be finite");
  return Math.round(value * 100) / 100;
}

type OvertimeState = Pick<RunState, "afterHoursLevel" | "freeAfterHoursLevel"> & Partial<Pick<RunState, "commandHistory">>;

export function getFreeAfterHoursLevel(state: OvertimeState): number {
  return state.freeAfterHoursLevel ?? Math.max(0, state.afterHoursLevel
    - (state.commandHistory?.filter((command) => command.type === "ENTER_ROOM").length ?? 0));
}

export function getNextOvertimeBet(state: RunState): number {
  return getCurrentBet({ ...state, hotel: { cleared: state.hotel?.cleared ?? 0, challenge: null },
    freeAfterHoursLevel: getFreeAfterHoursLevel(state) + 1 });
}

export function getCurrentBet(state: Pick<RunState, "baseBet" | "betMode" | "hotel"> & OvertimeState): number {
  const room = activeRoom(state);
  if (room !== null) return room.bet;
  const afterHoursScale = 1.25 ** getFreeAfterHoursLevel(state);
  return roundMoney(state.baseBet * BET_MULTIPLIER[state.betMode] * afterHoursScale);
}

/** Lowest paid pull available for the current normal or after-hours level. */
export function getMinimumBet(state: RunState): number {
  const room = activeRoom(state);
  if (room !== null) return room.bet;
  return roundMoney(state.baseBet * BET_MULTIPLIER.conservative * 1.25 ** getFreeAfterHoursLevel(state));
}

/** Service prices use the normal stake, so switching bet mode cannot buy a cheaper buff. */
export function getStandardBet(state: Pick<RunState, "baseBet" | "hotel"> & OvertimeState): number {
  return activeRoom(state)?.bet ?? roundMoney(state.baseBet * 1.25 ** getFreeAfterHoursLevel(state));
}

export function getMealCost(state: Pick<RunState, "baseBet" | "hotel"> & OvertimeState): number {
  return roundMoney(getStandardBet(state) * 0.75);
}

export function getMartyrCost(state: Pick<RunState, "baseBet" | "hotel" | "bankroll"> & OvertimeState): number {
  if (!Number.isFinite(state.bankroll) || state.bankroll <= 0) return 0;
  return roundMoney(Math.min(Math.ceil(state.bankroll * 0.1), 2 * getStandardBet(state)));
}
