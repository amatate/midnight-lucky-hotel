import type { GameCommand } from "@/core/commands";
import { dispatchCommand } from "@/core/run";
import type { RunState } from "@/core/types";

const INTERVENTION_CANDIDATES = [
  { type: "RESPIN_REEL", reelIndex: 0 },
  { type: "RESPIN_REEL", reelIndex: 1 },
  { type: "RESPIN_REEL", reelIndex: 2 },
  { type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex: 0 },
  { type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex: 1 },
  { type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex: 2 },
  { type: "KICK_REEL", reelIndex: 0 },
  { type: "KICK_REEL", reelIndex: 1 },
  { type: "KICK_REEL", reelIndex: 2 }
] as const satisfies readonly GameCommand[];

export function availableInterventions(state: RunState): readonly GameCommand[] {
  return INTERVENTION_CANDIDATES.filter((command) => dispatchCommand(state, command).ok);
}
