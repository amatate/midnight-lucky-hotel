import { describe, expect, it } from "vitest";
import { BASE_REELS } from "@/content/base-machine";
import { resolveBaseMachineSpin } from "@/core/base-settlement";
import { MAX_MONEY } from "@/core/money";
import { drawReels } from "@/core/reels";
import { createRun } from "@/core/run";
import { resolveSpin } from "@/core/settlement";
import type { ReelDraw, RunState } from "@/core/types";

function oracle(draw: ReelDraw, patch: {
  readonly bankroll: number;
  readonly shiftPayout: number;
  readonly currentBet: number;
  readonly agitation: number;
}) {
  const state: RunState = {
    ...createRun(0),
    phase: "AWAITING_INTERVENTION",
    bankroll: patch.bankroll,
    shiftPayout: patch.shiftPayout,
    baseBet: patch.currentBet,
    betMode: "normal",
    reels: draw.strips,
    agitation: patch.agitation,
    pendingSpin: { draw, isFree: false }
  };
  const settled = resolveSpin(state, draw);
  return {
    payout: settled.payout,
    bankroll: settled.state.bankroll,
    shiftPayout: settled.state.shiftPayout,
    agitation: settled.state.agitation
  };
}

describe("base-machine fast settlement differential", () => {
  it("matches resolveSpin across deterministic draws, money scales, and agitation states", () => {
    const bets = [0.01, 10, MAX_MONEY] as const;
    const bankrolls = [0, 123.45, MAX_MONEY - 1] as const;
    const shiftPayouts = [0, 67.89, MAX_MONEY - 1] as const;
    const agitationStates = [0, 3, 5] as const;

    for (let seed = 0; seed < 96; seed += 1) {
      const draw = drawReels(BASE_REELS, { value: seed });
      const patch = {
        currentBet: bets[seed % bets.length]!,
        bankroll: bankrolls[(seed * 5) % bankrolls.length]!,
        shiftPayout: shiftPayouts[(seed * 7) % shiftPayouts.length]!,
        agitation: agitationStates[(seed * 11) % agitationStates.length]!
      };

      expect(resolveBaseMachineSpin({ grid: draw.grid, ...patch })).toEqual(oracle(draw, patch));
    }
  });

  it.each([
    ["all blank", [["blank"], ["blank"], ["blank"]] as const, 4],
    ["all wild multi-line", [["wild"], ["wild"], ["wild"]] as const, 3]
  ])("matches resolveSpin for an explicit %s board", (_name, reels, agitation) => {
    const draw = drawReels(reels, { value: 99 });
    const patch = {
      bankroll: MAX_MONEY - 1,
      shiftPayout: MAX_MONEY - 1,
      currentBet: MAX_MONEY,
      agitation
    };

    expect(resolveBaseMachineSpin({ grid: draw.grid, ...patch })).toEqual(oracle(draw, patch));
  });
});
