import { HOTEL_ROOMS } from "@/content/hotel";
import { generateContract } from "@/core/contracts";
import { getFreeAfterHoursLevel, roundMoney } from "@/core/progression";
import type { RoomTier, RunState } from "@/core/types";

/** One actual paid block: resets uses, not permanent construction, stored charges or food duration. */
export function resetForAfterHoursBlock(state: RunState, level: number, roomTier?: RoomTier): RunState {
  const room = roomTier === undefined ? null : HOTEL_ROOMS[roomTier];
  const maximum = Math.min((state.service === "repair" ? 3 : 2) + state.nextShiftFocusBonus, room?.focusCap ?? Infinity);
  const reset: RunState = {
    ...state, phase: "READY_TO_SPIN", afterHoursLevel: level,
    freeAfterHoursLevel: getFreeAfterHoursLevel(state) + (room === null ? 1 : 0),
    blockStartBankroll: state.bankroll, blockReelAdditions: [[], [], []], workshop: null,
    hotel: { ...state.hotel, cleared: state.hotel?.cleared ?? 0,
      ...(room?.rounds === undefined ? {} : {
        gardenRewardsGranted: state.hotel?.gardenRewardsGranted ?? 0,
        roomRewardsGranted: state.hotel?.roomRewardsGranted ?? { 2: 0, 3: 0 }
      }),
      challenge: room === null || roomTier === undefined ? null : {
        tier: roomTier, status: "playing", target: room.target, paidSpins: room.paidSpins, objective: room.objective,
        ...(room.rounds === undefined ? {} : { rounds: { current: 1, total: room.rounds, payout: 0 } })
      } },
    baseSpinsInShift: 0, shiftWager: 0, shiftPayout: 0,
    interventionPoints: maximum, maxInterventionPoints: maximum, nextShiftFocusBonus: 0,
    interventionUsedThisSpin: false, temporaryReelAdditions: [[], [], []],
    pendingPrayer: null, pendingSpin: null, currentCandidates: null,
    counters: { ...state.counters, cherryWinsThisShift: 0 },
    shiftFlags: { foodBought: false, prayerUsed: false, kickUsed: false, repairLockUsed: false,
      martyrEnabled: false, warrantyPaid: false, returnedFoodCount: 0 }
  };
  const generated = generateContract(reset);
  return { ...reset, contract: generated.contract, rng: generated.rng };
}

export function advanceRoomRound(state: RunState): RunState {
  const challenge = state.hotel!.challenge!;
  const rounds = challenge.rounds!;
  const next = resetForAfterHoursBlock(state, state.afterHoursLevel + 1, challenge.tier);
  return { ...next,
    // A free choice may rescue a depleted wallet before the next round starts.
    phase: state.bankroll < HOTEL_ROOMS[challenge.tier].bet ? "RUN_LOST" : "READY_TO_SPIN",
    hotel: { ...next.hotel!, challenge: { ...challenge,
      rounds: { ...rounds, current: (rounds.current + 1) as 2 | 3,
        payout: roundMoney(rounds.payout + state.shiftPayout) } } }
  };
}
