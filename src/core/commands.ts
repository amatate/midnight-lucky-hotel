import type { GameEvent } from "@/core/events";
import type { BaseSymbolId, BetMode, CommandError, ReelIndex, RunState, ServiceId, UpgradeChoice } from "@/core/types";

export type GameCommand =
  | { readonly type: "SELECT_SERVICE"; readonly serviceId: ServiceId }
  | { readonly type: "SET_BET_MODE"; readonly mode: BetMode }
  | { readonly type: "BUY_FOOD"; readonly reelIndex: ReelIndex }
  | { readonly type: "PRAY"; readonly symbol: BaseSymbolId }
  | { readonly type: "ENABLE_MARTYR" }
  | { readonly type: "SPIN" }
  | { readonly type: "REELS_STOPPED" }
  | { readonly type: "RESPIN_REEL"; readonly reelIndex: ReelIndex }
  | { readonly type: "LOCK_AND_RESPIN_OTHERS"; readonly lockedReelIndex: ReelIndex }
  | { readonly type: "KICK_REEL"; readonly reelIndex: ReelIndex }
  | { readonly type: "ACCEPT_OUTCOME" }
  | { readonly type: "PRESENTATION_COMPLETE" }
  | { readonly type: "CHOOSE_UPGRADE"; readonly choice: UpgradeChoice }
  | { readonly type: "DECLINE_UPGRADE" }
  | { readonly type: "REMOVE_CRACKS"; readonly reelIndex: ReelIndex }
  | { readonly type: "REROLL_CANDIDATES" }
  | { readonly type: "CASH_OUT" }
  | { readonly type: "CONTINUE" };

export type DispatchResult =
  | { readonly ok: true; readonly state: RunState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly state: RunState; readonly error: CommandError };
