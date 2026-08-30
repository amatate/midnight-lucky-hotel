import { useEffect, useRef } from "react";
import { availableInterventions } from "@/app/intervention-options";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";
import { reelMotionPlan, type ReelMotionPlan } from "@/presentation/reel-timeline";

export interface AutomaticSpinFlowOptions {
  readonly state: RunState;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly onCommand: (command: GameCommand) => void;
}

export function useAutomaticSpinFlow(options: AutomaticSpinFlowOptions): ReelMotionPlan | null {
  const { state, paused, reducedMotion, onCommand } = options;
  const motionPlan = reelMotionPlan(state, reducedMotion);
  const availableCount = state.phase === "AWAITING_INTERVENTION" ? availableInterventions(state).length : -1;
  const sentKeys = useRef(new Set<string>());
  const onCommandRef = useRef(onCommand);
  const runRef = useRef({ initialSeed: state.initialSeed, historyLength: state.commandHistory.length, generation: 0 });
  onCommandRef.current = onCommand;

  if (state.initialSeed !== runRef.current.initialSeed || state.commandHistory.length < runRef.current.historyLength) {
    runRef.current = {
      initialSeed: state.initialSeed,
      historyLength: state.commandHistory.length,
      generation: runRef.current.generation + 1
    };
    sentKeys.current.clear();
  } else {
    runRef.current.historyLength = state.commandHistory.length;
  }

  const automatic = motionPlan !== null
    ? {
        key: `${runRef.current.generation}:stop:${motionPlan.cycleKey}`,
        delayMs: motionPlan.completeAtMs,
        commandType: "REELS_STOPPED" as const
      }
    : state.phase === "AWAITING_INTERVENTION" && availableCount === 0
      ? {
          key: `${runRef.current.generation}:accept:${state.commandHistory.length}`,
          delayMs: reducedMotion ? 160 : 300,
          commandType: "ACCEPT_OUTCOME" as const
        }
      : null;
  const automaticKey = automatic?.key ?? null;
  const automaticDelayMs = automatic?.delayMs ?? null;
  const automaticCommandType = automatic?.commandType ?? null;

  useEffect(() => {
    if (paused || automaticKey === null || automaticDelayMs === null || automaticCommandType === null || sentKeys.current.has(automaticKey)) {
      return;
    }
    const timer = setTimeout(() => {
      if (sentKeys.current.has(automaticKey)) return;
      sentKeys.current.add(automaticKey);
      onCommandRef.current({ type: automaticCommandType });
    }, automaticDelayMs);
    return () => clearTimeout(timer);
  }, [automaticCommandType, automaticDelayMs, automaticKey, paused]);

  return motionPlan;
}
