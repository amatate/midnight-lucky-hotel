import { BASE_PAYTABLE } from "@/content/base-machine";
import { previewKick } from "@/content/services/security";
import { evaluateBaseWins } from "@/core/paylines";
import type { GameCommand } from "@/core/commands";
import type { Grid, LineWin, ReelIndex, RunState } from "@/core/types";

export type InterventionCommand = Extract<GameCommand, { type: "RESPIN_REEL" | "LOCK_AND_RESPIN_OTHERS" | "KICK_REEL" }>;
export type InterventionMode = InterventionCommand["type"];

export const INTERVENTION_LABELS: Readonly<Record<InterventionMode, string>> = {
  RESPIN_REEL: "重转", LOCK_AND_RESPIN_OTHERS: "锁轮", KICK_REEL: "踹击"
};

export function interventionReel(command: InterventionCommand): ReelIndex {
  return command.type === "LOCK_AND_RESPIN_OTHERS" ? command.lockedReelIndex : command.reelIndex;
}

export interface BoardPreview {
  readonly command: InterventionCommand;
  readonly selectedReel: ReelIndex;
  readonly affectedReels: readonly ReelIndex[];
  /** Only a legal, deterministic kick has a future grid. Random respins never do. */
  readonly grid: Grid | null;
  readonly currentLineCount: number;
  readonly previewLineCount: number | null;
  readonly atRiskLineIds: readonly LineWin["lineId"][];
}

/** Caller supplies a currently available command; this reads the stopped board, never settles it. */
export function describeBoardIntervention(state: RunState, command: InterventionCommand): BoardPreview | null {
  if (state.phase !== "AWAITING_INTERVENTION" || state.pendingSpin === null) return null;
  const selectedReel = interventionReel(command);
  const current = state.pendingSpin.draw.grid;
  const before = evaluateBaseWins(current, BASE_PAYTABLE);
  const affectedReels = command.type === "LOCK_AND_RESPIN_OTHERS"
    ? ([0, 1, 2] as const).filter((reel) => reel !== selectedReel)
    : [selectedReel];
  const grid = command.type === "KICK_REEL"
    ? current.map((column, reel) => reel === selectedReel ? previewKick(state, selectedReel) : column) as unknown as Grid
    : null;
  const after = grid === null ? null : evaluateBaseWins(grid, BASE_PAYTABLE);
  return {
    command, selectedReel, affectedReels, grid,
    currentLineCount: before.length,
    previewLineCount: after?.length ?? null,
    atRiskLineIds: before.filter((win) => after === null
      ? win.cells.some(([reel]) => affectedReels.includes(reel))
      : !after.some((next) => next.lineId === win.lineId && next.symbol === win.symbol)
    ).map((win) => win.lineId)
  };
}
