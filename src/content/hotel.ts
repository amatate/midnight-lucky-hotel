import type { RoomTier, RunState } from "@/core/types";

export const HOTEL_ROOMS = {
  1: { name: "花园房", bet: 25, target: 450, focusCap: 3 },
  2: { name: "景观房", bet: 50, target: 1200, focusCap: 3 },
  3: { name: "顶层套房", bet: 100, target: 3600, focusCap: 2 }
} as const satisfies Record<RoomTier, { name: string; bet: number; target: number; focusCap: number }>;

export function nextRoomTier(state: RunState): RoomTier | null {
  const cleared = state.hotel?.cleared ?? 0;
  return cleared >= 3 ? null : (cleared + 1) as RoomTier;
}

export function activeRoom(state: Pick<RunState, "hotel">) {
  const challenge = state.hotel?.challenge;
  return challenge?.status === "playing" ? HOTEL_ROOMS[challenge.tier] : null;
}

export function canOpenWorkshop(state: RunState): boolean {
  return state.phase === "AFTER_HOURS" && state.hotel?.challenge != null
    && state.hotel.challenge.status !== "playing" && state.currentCandidates === null
    && state.workshop == null;
}

export function getWorkshopCost(state: RunState): number {
  return state.hotel?.challenge == null ? 0 : HOTEL_ROOMS[state.hotel.challenge.tier].bet * 2;
}
