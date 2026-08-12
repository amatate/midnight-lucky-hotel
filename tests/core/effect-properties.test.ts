import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { drawReels } from "@/core/reels";
import { createRun } from "@/core/run";
import { resolveSpin, type EffectHandler } from "@/core/settlement";
import type { ReelSet, RunState, SymbolId } from "@/core/types";

const allSymbols: readonly SymbolId[] = ["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"];

function resolveSyntheticSpin(seed: number, symbols: readonly number[]) {
  const mapped = symbols.map((value) => allSymbols[((value % allSymbols.length) + allSymbols.length) % allSymbols.length]!);
  const reels: ReelSet = [
    ["cherry", "lemon", "bell", "seven", "wild", "blank", ...mapped.filter((_, index) => index % 3 === 0)],
    ["lemon", "bell", "seven", "wild", "blank", "cherry", ...mapped.filter((_, index) => index % 3 === 1)],
    ["bell", "seven", "wild", "blank", "cherry", "lemon", ...mapped.filter((_, index) => index % 3 === 2)]
  ];
  const draw = drawReels(reels, { value: seed });
  const initial = createRun(seed);
  const state: RunState = {
    ...initial,
    phase: "AWAITING_INTERVENTION",
    service: initial.serviceCandidates[0],
    reels,
    pendingSpin: { draw, isFree: false }
  };
  return { state, result: resolveSpin(state, draw) };
}

describe("effect settlement properties", () => {
  it("always terminates with finite cent-rounded money across arbitrary finite strips", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.array(fc.integer({ min: 0, max: 7 }), { maxLength: 60 }),
        (seed, symbols) => {
          const { state, result } = resolveSyntheticSpin(seed, symbols);
          expect(result.effectCount).toBeLessThanOrEqual(101);
          expect(Number.isSafeInteger(result.state.bankroll * 100)).toBe(true);
          expect(Number.isFinite(result.payout)).toBe(true);
          expect(state.reels).not.toBe(result.state.reels);
        }
      ),
      { numRuns: 300 }
    );
  });

  it("bounds a deliberately cyclic handler at one overload award", () => {
    const cyclic: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED" || signal.type === "EFFECT_APPLIED"
        ? [{ type: "REEVALUATE_LINES" }]
        : [];

    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { state } = resolveSyntheticSpin(seed, []);
        const draw = state.pendingSpin!.draw;
        const result = resolveSpin(state, draw, [cyclic]);
        expect(result.effectCount).toBe(101);
        expect(result.events.filter((event) => event.type === "OVERLOAD")).toHaveLength(1);
        expect(result.attribution.overload).toBe(250);
      }),
      { numRuns: 50 }
    );
  });
});
