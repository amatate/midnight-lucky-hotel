import type { RoomTier, RunState } from "./types";

/** Captured by the stay rules version. Fees are real wallet costs, never payout goals. */
export type StayTier = 0 | RoomTier;
export const ROOM_RENT: Readonly<Record<StayTier, number>> = { 0: 50, 1: 150, 2: 300, 3: 600, 4: 750, 5: 900, 6: 1500 };
export function rentDue(state: RunState): { tier: StayTier; amount: number } | null {
  if (!state.stay) return null;
  if (state.phase === "SHIFT_COMPLETE" && !state.stay.paid.includes(0)) return { tier: 0, amount: ROOM_RENT[0] };
  const room = state.hotel?.challenge;
  return state.phase === "AFTER_HOURS" && room?.status === "billing" ? { tier: room.tier, amount: ROOM_RENT[room.tier] } : null;
}
