import type { PaidSpinLimit, RoomObjective, RoomTier, RunState } from "@/core/types";

export interface HotelRoom {
  readonly name: string;
  readonly bet: number;
  /** Money threshold: total, best spin, or the minimum for a scoring spin. */
  readonly target: number;
  readonly focusCap: number;
  readonly paidSpins: PaidSpinLimit;
  readonly rounds?: 3;
  readonly objective: RoomObjective;
  readonly hint: string;
}

export const HOTEL_ROOM_TIERS = [1, 2, 3, 4, 5, 6] as const;
export const MAX_ROOM_TIER = 6;
export const HOTEL_ROOMS: Readonly<Record<RoomTier, HotelRoom>> = {
  1: { name: "花园房", bet: 25, target: 1000, focusCap: 3, paidSpins: 3, rounds: 3, objective: { kind: "total-payout" }, hint: "三回合累计奖金；前两回合后各强化一次，把新部件带进下一回合。" },
  2: { name: "景观房", bet: 50, target: 2400, focusCap: 3, paidSpins: 3, rounds: 3, objective: { kind: "total-payout" }, hint: "三回合专精：前两次休息各强化一次，补命中或升级核心，再用最后一回合兑现。" },
  3: { name: "顶层套房", bet: 100, target: 6000, focusCap: 3, paidSpins: 3, rounds: 3, objective: { kind: "total-payout" }, hint: "三回合展示成型机器：中途仍可补强，安排食物与部件蓄能的爆发时机。" },
  4: { name: "留声机房", bet: 125, target: 2500, focusCap: 3, paidSpins: 4, objective: { kind: "best-spin" }, hint: "追求一次爆发。集中叠加部件、食物和连线，比平均赚一点更有用。" },
  5: { name: "双星阁", bet: 150, target: 1200, focusCap: 3, paidSpins: 4, objective: { kind: "scoring-spins", count: 3 }, hint: "至少三转各自达标，不要求连续。一把大奖不能替代稳定出奖。" },
  6: { name: "长夜套房", bet: 200, target: 16000, focusCap: 3, paidSpins: 5, objective: { kind: "total-payout" }, hint: "五转长局：餐效和干预点不会随转数增加，免费转也是重要收入。" }
};

export function nextRoomTier(state: RunState): RoomTier | null {
  const cleared = state.hotel?.cleared ?? 0;
  return HOTEL_ROOM_TIERS.find((tier) => tier > cleared) ?? null;
}

export function activeRoom(state: Pick<RunState, "hotel">): HotelRoom | null {
  const challenge = state.hotel?.challenge;
  return challenge?.status === "playing" ? HOTEL_ROOMS[challenge.tier] : null;
}

/** Also valid at a room's completed boundary; ordinary shifts/overtime stay three. */
export function getPaidSpinLimit(state: Pick<RunState, "hotel">): PaidSpinLimit {
  const challenge = state.hotel?.challenge;
  return challenge == null ? 3 : challenge.paidSpins ?? HOTEL_ROOMS[challenge.tier].paidSpins;
}

export function isRoomIntermission(state: Pick<RunState, "hotel" | "phase">): boolean {
  const challenge = state.hotel?.challenge;
  return state.phase === "AFTER_HOURS" && challenge?.status === "playing"
    && challenge.rounds !== undefined && challenge.rounds.current < challenge.rounds.total;
}

export function getRoomRewardsGranted(state: Pick<RunState, "hotel">): number {
  const hotel = state.hotel;
  const tier = hotel?.challenge?.tier;
  return tier === 1 ? hotel?.gardenRewardsGranted ?? 0
    : tier === 2 || tier === 3 ? hotel?.roomRewardsGranted?.[tier] ?? 0 : 0;
}

export function grantRoomRestReward(state: RunState, round: 1 | 2): NonNullable<RunState["hotel"]> {
  const hotel = state.hotel!;
  const tier = hotel.challenge!.tier;
  return tier === 1 ? { ...hotel, gardenRewardsGranted: round }
    : { ...hotel, roomRewardsGranted: { 2: 0, 3: 0, ...hotel.roomRewardsGranted, [tier]: round } };
}

export interface RoomProgress {
  readonly objective: RoomObjective;
  readonly value: number;
  readonly required: number;
  readonly target: number;
  readonly cleared: boolean;
  readonly rounds?: number;
}

/** Pure projection: retries have distinct block ordinals, not additional mutable counters.
 * During settlement the UI supplies the amount already presented, never the final receipt.
 * Free-spin receipts count for all objectives, but don't use a paid pull.
 */
export function getRoomProgress(state: RunState, visibleSpinPayout?: number): RoomProgress | null {
  const challenge = state.hotel?.challenge;
  if (challenge == null) return null;
  const room = HOTEL_ROOMS[challenge.tier];
  const objective = challenge.objective ?? room.objective;
  // Older Garden saves with no captured target were always a single 450-point block.
  const legacyTargets = { 1: 450, 2: 1200, 3: 3600 };
  const target = challenge.target ?? (challenge.tier <= 3 && challenge.rounds === undefined
    ? legacyTargets[challenge.tier as 1 | 2 | 3] : room.target);
  const last = state.spinHistory.at(-1);
  const hideUnpresented = state.phase === "RESOLVING_EFFECTS" && visibleSpinPayout !== undefined;
  const amounts = state.spinHistory
    .filter((receipt) => receipt.shift === state.shift && receipt.afterHoursLevel === state.afterHoursLevel)
    .map((receipt) => hideUnpresented && receipt === last ? visibleSpinPayout : receipt.totalPayout);
  const value = challenge.status !== "playing" && challenge.progress !== undefined ? challenge.progress
    : objective.kind === "best-spin" ? Math.max(0, ...amounts)
      : objective.kind === "scoring-spins" ? amounts.filter((amount) => amount >= target).length
        : Math.max(0, (challenge.rounds?.payout ?? 0) + state.shiftPayout - (hideUnpresented ? (last?.totalPayout ?? 0) - visibleSpinPayout : 0));
  const required = objective.kind === "scoring-spins" ? objective.count : target;
  return { objective, value, required, target, cleared: value >= required,
    ...(challenge.rounds === undefined ? {} : { rounds: challenge.rounds.total }) };
}

export function canOpenWorkshop(state: RunState): boolean {
  return state.phase === "AFTER_HOURS" && state.hotel?.challenge != null
    && state.hotel.challenge.status !== "playing" && state.currentCandidates === null
    && state.workshop == null;
}

export function getWorkshopCost(state: RunState): number {
  return state.hotel?.challenge == null ? 0 : HOTEL_ROOMS[state.hotel.challenge.tier].bet * 2;
}
