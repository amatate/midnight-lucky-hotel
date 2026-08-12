import { BASE_PAYTABLE } from "@/content/base-machine";
import { safeMoney, safePayout } from "@/core/money";
import { evaluateBaseWins } from "@/core/paylines";
import type { Grid } from "@/core/types";

export interface BaseMachineSpinInput {
  readonly grid: Grid;
  /** Supplied wager for this accepted spin. */
  readonly currentBet: number;
  /** Bankroll after the paid wager, or unchanged for a free pull. */
  readonly bankroll: number;
  readonly shiftPayout: number;
  readonly agitation: number;
}

export interface BaseMachineSpinResult {
  readonly payout: number;
  readonly bankroll: number;
  readonly shiftPayout: number;
  readonly agitation: number;
}

/** Resolves only the raw reel/paytable awards, before always-on agitation. */
export function resolveBasePaylines(grid: Grid, currentBet: number): number {
  const bet = safeMoney(currentBet);
  let payout = 0;
  for (const win of evaluateBaseWins(grid, BASE_PAYTABLE)) {
    payout = safeMoney(payout + safePayout(win.multiplier * bet));
  }
  return payout;
}

/**
 * Resolves the always-on base paylines and agitation state without parts,
 * special symbols, interventions, or buffs. Its money semantics mirror
 * `resolveSpin`, but avoid building the general effect/event machinery.
 */
export function resolveBaseMachineSpin(input: BaseMachineSpinInput): BaseMachineSpinResult {
  const currentBet = safeMoney(input.currentBet);
  let payout = resolveBasePaylines(input.grid, currentBet);

  const basePayout = payout;
  let agitation = input.agitation;
  if (basePayout > 0 && agitation > 0) {
    payout = safeMoney(payout + safePayout(agitation * 0.5 * currentBet));
    agitation = 0;
  } else if (basePayout === 0 && agitation < 5) {
    agitation += 1;
  }

  return {
    payout,
    bankroll: safeMoney(input.bankroll + payout),
    shiftPayout: safeMoney(input.shiftPayout + payout),
    agitation
  };
}
