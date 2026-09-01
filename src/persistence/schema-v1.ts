import type { GameEvent } from "@/core/events";
import type { AttributionSource, ReelDraw, RunState } from "@/core/types";
import {
  hasShape,
  isBoolean,
  isGameEventV1,
  isReelDraw,
  validateCommonSnapshot
} from "@/persistence/codec-shared";

type AmountOnlyEventV1 =
  | {
      readonly sequence: number;
      readonly type: "LINE_WIN";
      readonly lineId: "top" | "middle" | "bottom" | "diagonal-down" | "diagonal-up";
      readonly symbol: "cherry" | "lemon" | "bell" | "seven" | "wild" | "blank" | "food" | "crack";
      readonly amount: number;
      readonly source: Exclude<AttributionSource, "overload">;
    }
  | {
      readonly sequence: number;
      readonly type: "PAYOUT_ADDED";
      readonly amount: number;
      readonly source: AttributionSource;
    }
  | { readonly sequence: number; readonly type: "OVERLOAD"; readonly amount: number };

export type GameEventV1 = GameEvent | AmountOnlyEventV1;

export interface PendingSpinV1 {
  readonly draw: ReelDraw;
  readonly isFree: boolean;
}

export type RunStateV1 = Omit<
  RunState,
  "schemaVersion" | "pendingSpin" | "pendingEvents" | "spinHistory" | "nextSpinOrdinal"
> & {
  readonly schemaVersion: 1;
  readonly pendingSpin: PendingSpinV1 | null;
  readonly pendingEvents: readonly GameEventV1[];
};

const ROOT_KEYS_V1 = [
  "schemaVersion", "initialSeed", "rng", "phase", "bankroll", "checkoutTarget", "shift", "baseSpinsInShift",
  "shiftWager", "shiftPayout", "baseBet", "betMode", "interventionPoints", "maxInterventionPoints",
  "nextShiftFocusBonus", "interventionUsedThisSpin", "reels", "temporaryReelAdditions", "pendingPrayer",
  "pendingSpin", "freeSpinQueue", "service", "serviceCandidates", "tips", "agitation", "omen", "counters",
  "shiftFlags", "partSlots", "toolLevel", "buffs", "contract", "afterHoursLevel", "exitUnlocked",
  "currentCandidates", "acquiredUpgrades", "pendingEvents", "attribution", "expenses", "shiftHistory",
  "commandHistory"
] as const;

function isPendingSpinV1(value: unknown): value is PendingSpinV1 {
  return hasShape(value, ["draw", "isFree"])
    && isReelDraw(value.draw)
    && isBoolean(value.isFree);
}

export function decodeRunStateV1(value: unknown): RunStateV1 | null {
  if (!hasShape(value, ROOT_KEYS_V1) || value.schemaVersion !== 1) return null;
  if (!validateCommonSnapshot(value, isPendingSpinV1, isGameEventV1)) return null;
  return value as unknown as RunStateV1;
}
