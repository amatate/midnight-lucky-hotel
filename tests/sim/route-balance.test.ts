import { afterEach, expect, it, vi } from "vitest";
import * as reels from "@/core/reels";
import { estimateMachine } from "@/sim/monte-carlo";

afterEach(() => vi.restoreAllMocks());

it("includes blessing pollution in later simulated draws and clears it after three paid spins", () => {
  const draw = vi.spyOn(reels, "drawReels");
  estimateMachine({ reels: [Array(12).fill("seven"), Array(12).fill("seven"), Array(12).fill("seven")],
    parts: [{ id: "triple-blessing", level: 2 }], toolLevel: 2,
    bankroll: 10000, bet: 10, horizonSpins: 4, sampleCount: 1, simulationSeed: 820127 });
  // First call validates the input strips; subsequent calls are actual simulated spins.
  const lengths = draw.mock.calls.slice(1).map(([strips]) => strips[0].length);
  expect(lengths).toHaveLength(4);
  expect(lengths[0]).toBe(12);
  expect(lengths[1]).toBe(13);
  expect(lengths[3]).toBe(12);
});
