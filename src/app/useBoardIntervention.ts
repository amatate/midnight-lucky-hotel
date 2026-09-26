import { useMemo, useRef, useState } from "react";
import { availableInterventions } from "@/app/intervention-options";
import { describeBoardIntervention, interventionReel, type BoardPreview, type InterventionCommand, type InterventionMode } from "@/app/board-intervention";
import type { GameCommand } from "@/core/commands";
import type { ReelIndex, RunState } from "@/core/types";

interface Choice {
  readonly source: RunState;
  readonly mode: InterventionMode;
  readonly reel: ReelIndex | null;
}

export interface BoardInterventionController {
  readonly enabled: boolean;
  readonly modes: readonly InterventionMode[];
  readonly mode: InterventionMode | null;
  readonly selectableReels: readonly ReelIndex[];
  readonly selectedReel: ReelIndex | null;
  readonly preview: BoardPreview | null;
  readonly selectMode: (mode: InterventionMode) => void;
  readonly selectReel: (reel: ReelIndex) => void;
  readonly cancel: () => void;
  readonly confirm: () => void;
}

export function useBoardIntervention(state: RunState, paused: boolean, onCommand: (command: GameCommand) => void): BoardInterventionController {
  const commands = useMemo(() => availableInterventions(state).filter((command): command is InterventionCommand =>
    command.type === "RESPIN_REEL" || command.type === "LOCK_AND_RESPIN_OTHERS" || command.type === "KICK_REEL"
  ), [state]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const committed = useRef<RunState | null>(null);
  const modes = [...new Set(commands.map((command) => command.type))];
  // A preview belongs to exactly one authoritative checkpoint, not just the same reel number.
  const current = choice?.source === state ? choice : null;
  const mode = current !== null && modes.includes(current.mode) ? current.mode : modes[0] ?? null;
  const selectableReels = commands.filter((command) => command.type === mode).map(interventionReel);
  const selectedReel = current?.reel != null && selectableReels.includes(current.reel) ? current.reel : null;
  const command = commands.find((candidate) => candidate.type === mode && interventionReel(candidate) === selectedReel);
  const preview = command === undefined ? null : describeBoardIntervention(state, command);
  const enabled = !paused && state.phase === "AWAITING_INTERVENTION" && commands.length > 0;
  return {
    enabled, modes, mode, selectableReels, selectedReel, preview,
    selectMode: (nextMode) => {
      if (!enabled || !modes.includes(nextMode)) return;
      const nextReel = commands.some((candidate) => candidate.type === nextMode && interventionReel(candidate) === selectedReel)
        ? selectedReel : null;
      setChoice({ source: state, mode: nextMode, reel: nextReel });
    },
    selectReel: (reel) => {
      if (enabled && mode !== null && selectableReels.includes(reel)) {
        committed.current = null;
        setChoice({ source: state, mode, reel });
      }
    },
    cancel: () => { committed.current = null; setChoice(null); },
    confirm: () => {
      if (!enabled || command === undefined || committed.current === state) return;
      committed.current = state;
      setChoice(null);
      onCommand(command);
    }
  };
}
