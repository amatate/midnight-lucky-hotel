import type { GameCommand } from "@/core/commands";
import type { ReelIndex, RunState } from "@/core/types";

export interface ReelMotionPlan {
  readonly cycleKey: string;
  readonly kind: "base" | "respin" | "repair-lock" | "kick";
  readonly spinningReels: readonly ReelIndex[];
  readonly revealAtMs: Readonly<Partial<Record<ReelIndex, number>>>;
  readonly completeAtMs: number;
}

type MotionCommand = Extract<GameCommand, {
  readonly type: "SPIN" | "RESPIN_REEL" | "LOCK_AND_RESPIN_OTHERS" | "KICK_REEL";
}>;

function isMotionCommand(command: GameCommand): command is MotionCommand {
  return command.type === "SPIN" || command.type === "RESPIN_REEL" ||
    command.type === "LOCK_AND_RESPIN_OTHERS" || command.type === "KICK_REEL";
}

function reducedPlan(plan: ReelMotionPlan): ReelMotionPlan {
  const revealAtMs = Object.fromEntries(plan.spinningReels.map((reel) => [reel, 160])) as Partial<Record<ReelIndex, number>>;
  return { ...plan, revealAtMs, completeAtMs: 160 };
}

export function reelMotionPlan(state: RunState, reducedMotion: boolean): ReelMotionPlan | null {
  if (state.phase !== "SPINNING") return null;
  const command = state.commandHistory.findLast(isMotionCommand);
  if (command === undefined) return null;

  let plan: ReelMotionPlan;
  switch (command.type) {
    case "SPIN":
      plan = {
        cycleKey: `${state.commandHistory.length}:SPIN`,
        kind: "base",
        spinningReels: [0, 1, 2],
        revealAtMs: { 0: 1000, 1: 1220, 2: 1440 },
        completeAtMs: 1440
      };
      break;
    case "RESPIN_REEL":
      plan = {
        cycleKey: `${state.commandHistory.length}:RESPIN_REEL:${command.reelIndex}`,
        kind: "respin",
        spinningReels: [command.reelIndex],
        revealAtMs: { [command.reelIndex]: 620 },
        completeAtMs: 620
      };
      break;
    case "LOCK_AND_RESPIN_OTHERS": {
      const spinningReels = ([0, 1, 2] as const).filter((reel) => reel !== command.lockedReelIndex);
      plan = {
        cycleKey: `${state.commandHistory.length}:LOCK_AND_RESPIN_OTHERS:${command.lockedReelIndex}`,
        kind: "repair-lock",
        spinningReels,
        revealAtMs: { [spinningReels[0]!]: 480, [spinningReels[1]!]: 620 },
        completeAtMs: 620
      };
      break;
    }
    case "KICK_REEL":
      plan = {
        cycleKey: `${state.commandHistory.length}:KICK_REEL:${command.reelIndex}`,
        kind: "kick",
        spinningReels: [command.reelIndex],
        revealAtMs: { [command.reelIndex]: 620 },
        completeAtMs: 620
      };
      break;
  }
  return reducedMotion ? reducedPlan(plan) : plan;
}
