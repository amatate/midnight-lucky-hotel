import type {
  AttributionSource,
  BaseSymbolId,
  ContractId,
  PartId,
  ReelDraw,
  ReelIndex,
  RowIndex,
  ServiceId,
  SymbolId
} from "@/core/types";

export type GameEvent =
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
      readonly lineId: string;
      readonly symbol: SymbolId;
      readonly amount: number;
      readonly source: AttributionSource;
    }
  | { readonly sequence: number; readonly type: "PART_TRIGGERED"; readonly partId: PartId; readonly level: 1 | 2 }
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
  | { readonly sequence: number; readonly type: "OVERLOAD"; readonly amount: number }
  | { readonly sequence: number; readonly type: "PAYOUT_COMPLETE"; readonly total: number }
  | { readonly sequence: number; readonly type: "SHIFT_CHANGED"; readonly shift: number }
  | { readonly sequence: number; readonly type: "RUN_ENDED"; readonly outcome: "won" | "lost" | "cashed-out" };

export type GameEventDraft = GameEvent extends infer Event
  ? Event extends GameEvent
    ? Omit<Event, "sequence">
    : never
  : never;
