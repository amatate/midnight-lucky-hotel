import type { GameEvent } from "@/core/events";
import type { BetMode, CommandError, ReelIndex, RunState, ServiceId, UpgradeChoice } from "@/core/types";

export type GameCommand =
  | { readonly type: "SELECT_SERVICE"; readonly serviceId: ServiceId }
  | { readonly type: "SET_BET_MODE"; readonly mode: BetMode }
  | { readonly type: "SPIN" }
  | { readonly type: "REELS_STOPPED" }
  | { readonly type: "RESPIN_REEL"; readonly reelIndex: ReelIndex }
  | { readonly type: "ACCEPT_OUTCOME" }
  | { readonly type: "PRESENTATION_COMPLETE" }
  | { readonly type: "CHOOSE_UPGRADE"; readonly choice: UpgradeChoice }
  | { readonly type: "CASH_OUT" }
  | { readonly type: "CONTINUE" };

export type DispatchResult =
  | { readonly ok: true; readonly state: RunState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly state: RunState; readonly error: CommandError };
