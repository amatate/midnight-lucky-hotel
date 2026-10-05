import type {
  AttributionSource,
  BaseSymbolId,
  ContractId,
  PartId,
  ReelDraw,
  ReelIndex,
  RowIndex,
  RoomTier,
  RoomObjective,
  PaidSpinLimit,
  ServiceId,
  LineWin,
  SymbolId
} from "@/core/types";

type FormulaFields = {
  readonly preMultiplierAmount: number;
  readonly appliedMultiplier: number;
  readonly amount: number;
};

type PayoutAddedEvent =
  | ({
      readonly sequence: number;
      readonly type: "PAYOUT_ADDED";
      readonly source: "part";
      readonly partId: PartId;
    } & FormulaFields)
  | ({
      readonly sequence: number;
      readonly type: "PAYOUT_ADDED";
      readonly source: Exclude<AttributionSource, "part" | "overload">;
    } & FormulaFields);

type PatternLineWinEvent = {
  readonly sequence: number;
  readonly type: "PATTERN_LINE_WIN";
  readonly patternId: "fruit-salad";
  readonly partId: "fruit-salad";
  readonly lineId: LineWin["lineId"];
} & FormulaFields;

export type GameEvent =
  | { readonly sequence: number; readonly type: "STARTER_GRANTED"; readonly partId: PartId; readonly tips: number; readonly omen: number; readonly cracks: number }
  | { readonly sequence: number; readonly type: "ROOM_ROUND_COMPLETED"; readonly round: number; readonly payout: number; readonly totalPayout: number; readonly reward: boolean }
  | { readonly sequence: number; readonly type: "ROOM_ROUND_STARTED"; readonly round: number }
  | { readonly sequence: number; readonly type: "WORKSHOP_PURCHASED"; readonly cost: number }
  | { readonly sequence: number; readonly type: "MEAL_SERVED"; readonly spins: number; readonly additivePayout: number }
  | { readonly sequence: number; readonly type: "PART_UPGRADED"; readonly partId: PartId; readonly cost: number }
  | { readonly sequence: number; readonly type: "ROOM_ENTERED"; readonly tier: RoomTier; readonly bet: number; readonly target: number; readonly focus: number; readonly paidSpins?: PaidSpinLimit; readonly objective?: RoomObjective; readonly rounds?: 3 }
  | { readonly sequence: number; readonly type: "ROOM_COMPLETED"; readonly tier: RoomTier; readonly payout: number; readonly target: number; readonly cleared: boolean; readonly paidSpins?: PaidSpinLimit; readonly objective?: RoomObjective; readonly progress?: number; readonly rounds?: 3 }
  | { readonly sequence: number; readonly type: "BET_PLACED"; readonly amount: number }
  | { readonly sequence: number; readonly type: "REELS_DRAWN"; readonly draw: ReelDraw }
  | {
      readonly sequence: number;
      readonly type: "INTERVENTION_USED";
      readonly kind: "respin" | "repair-lock" | "kick" | "prayer";
      readonly target: ReelIndex | BaseSymbolId;
    }
  | {
      readonly sequence: number;
      readonly type: "LINE_WIN";
      readonly lineId: LineWin["lineId"];
      readonly symbol: SymbolId;
      readonly source: Exclude<AttributionSource, "overload">;
      readonly preMultiplierAmount: number;
      readonly appliedMultiplier: number;
      readonly amount: number;
    }
  | { readonly sequence: number; readonly type: "PART_TRIGGERED"; readonly partId: PartId; readonly level: 1 | 2 }
  | { readonly sequence: number; readonly type: "PART_DISABLED"; readonly partId: PartId; readonly slot: number }
  | { readonly sequence: number; readonly type: "FOOD_CONSUMED"; readonly reel: ReelIndex }
  | PayoutAddedEvent
  | PatternLineWinEvent
  | {
      readonly sequence: number;
      readonly type: "SYMBOL_CHANGED";
      readonly reel: ReelIndex;
      readonly row: RowIndex;
      readonly from: SymbolId;
      readonly to: SymbolId;
    }
  | {
      readonly sequence: number;
      readonly type: "RESOURCE_CHANGED";
      readonly resource: "tips" | "focus" | "omen" | "agitation" | "freeSpins";
      readonly delta: number;
    }
  | { readonly sequence: number; readonly type: "SERVICE_USED"; readonly serviceId: ServiceId; readonly cost: number }
  | {
      readonly sequence: number;
      readonly type: "CONTRACT_PROGRESS";
      readonly contractId: ContractId;
      readonly progress: number;
      readonly completed: boolean;
    }
  | {
      readonly sequence: number;
      readonly type: "SPIN_COMMITTED";
      readonly interventionUsed: boolean;
      readonly preInterventionPaying: boolean;
      readonly finalPayout: number;
    }
  | { readonly sequence: number; readonly type: "BLOCK_COMPLETED"; readonly bankroll: number }
  | ({ readonly sequence: number; readonly type: "OVERLOAD" } & FormulaFields)
  | { readonly sequence: number; readonly type: "PAYOUT_COMPLETE"; readonly total: number }
  | { readonly sequence: number; readonly type: "SHIFT_CHANGED"; readonly shift: number }
  | { readonly sequence: number; readonly type: "RUN_ENDED"; readonly outcome: "won" | "lost" | "cashed-out" };

export type GameEventDraft = GameEvent extends infer Event
  ? Event extends GameEvent
    ? Omit<Event, "sequence">
    : never
  : never;
