import { useCallback, useRef, useState } from "react";
import type { GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { createRun, dispatchCommand } from "@/core/run";
import type { CommandError, RunState } from "@/core/types";

export interface GameController {
  readonly state: RunState;
  readonly events: readonly GameEvent[];
  readonly error: CommandError | null;
  readonly send: (command: GameCommand) => void;
  readonly restartSameSeed: () => void;
  readonly restartNextSeed: () => void;
}

function nextSeed(seed: number): number {
  return (Math.trunc(seed) + 0x9e37_79b9) >>> 0;
}

export function useGame(seed: number): GameController {
  const [state, setState] = useState<RunState>(() => createRun(seed));
  const stateRef = useRef(state);
  const [events, setEvents] = useState<readonly GameEvent[]>([]);
  const [error, setError] = useState<CommandError | null>(null);

  const replaceRun = useCallback((runSeed: number) => {
    const next = createRun(runSeed);
    stateRef.current = next;
    setState(next);
    setEvents([]);
    setError(null);
  }, []);

  const send = useCallback((command: GameCommand) => {
    const result = dispatchCommand(stateRef.current, command);
    if (!result.ok) {
      setError(result.error);
      setEvents([]);
      return;
    }
    stateRef.current = result.state;
    setState(result.state);
    setEvents(result.events);
    setError(null);
  }, []);

  const restartSameSeed = useCallback(() => replaceRun(stateRef.current.initialSeed), [replaceRun]);
  const restartNextSeed = useCallback(() => replaceRun(nextSeed(stateRef.current.initialSeed)), [replaceRun]);

  return { state, events, error, send, restartSameSeed, restartNextSeed };
}
