import { expect, it } from "vitest";
import { COIN_PRESETS, MAX_COINS, cosmeticRandom, payoutCoinCue } from "@/classic/coin-plan";
import { PHYSICS_STEP, createCoinPhysics, type CoinImpact } from "@/classic/coin-physics";
import { renderCoinImpact } from "@/presentation/coin-impact";

it("scales cosmetic cues without celebrating a loss or break-even", () => {
  for (const payout of [0, 5, 10, NaN]) expect(payoutCoinCue({ ordinal: 1, bet: 10, payout })).toBeNull();
  expect(payoutCoinCue({ ordinal: 1, bet: 10, payout: 20 })?.tier).toBe("small");
  expect(payoutCoinCue({ ordinal: 2, bet: 10, payout: 50 })?.tier).toBe("medium");
  expect(payoutCoinCue({ ordinal: 3, bet: 10, payout: 120 })?.tier).toBe("large");
  const a = cosmeticRandom(8), b = cosmeticRandom(8);
  expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
});

it("uses actual bounded rigid-body contacts, clears each burst and stops when idle", async () => {
  const hits: CoinImpact[] = []; const physics = await createCoinPhysics((impact) => hits.push(impact));
  try {
    for (const tier of ["small", "medium", "large"] as const) {
      physics.start({ id: 1, seed: 104729, tier });
      for (let i = 0; i < 150; i++) physics.advance(PHYSICS_STEP);
      expect(physics.bodies).toHaveLength(COIN_PRESETS[tier].count);
      expect(physics.bodies.length).toBeLessThanOrEqual(MAX_COINS);
      for (const body of physics.bodies) {
        const p = body.translation(); expect(Object.values(p).every(Number.isFinite)).toBe(true);
        expect(p.y).toBeGreaterThan(-.1); expect(Math.abs(p.x)).toBeLessThan(3); expect(Math.abs(p.z)).toBeLessThan(.9);
      }
      for (let i = 0; i < 240; i++) physics.advance(PHYSICS_STEP);
      expect(physics.active).toBe(false); expect(physics.bodies).toHaveLength(0);
      expect(physics.world.bodies.len()).toBe(0); expect(physics.world.colliders.len()).toBe(5);
      const steps = physics.steps; physics.advance(5); expect(physics.steps).toBe(steps);
    }
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.strength >= 0 && hit.strength <= 1 && Math.abs(hit.pan) <= .8)).toBe(true);
  } finally { physics.dispose(); physics.dispose(); }
});

it("caps catch-up and replacing a burst never accumulates bodies", async () => {
  const physics = await createCoinPhysics(() => {});
  try {
    physics.start({ id: 1, seed: 1, tier: "large" }); physics.advance(100);
    expect(physics.steps).toBeLessThanOrEqual(4);
    physics.start({ id: 2, seed: 2, tier: "small" }); expect(physics.bodies).toHaveLength(0);
    expect(physics.elapsed).toBe(0); physics.clear(); expect(physics.world.bodies.len()).toBe(0);
  } finally { physics.dispose(); }
});

it("renders three short distinct finite, non-clipping contact sounds", () => {
  const variants = [0, 1, 2].map(renderCoinImpact);
  for (const data of variants) {
    expect(data.length).toBeLessThan(6000); expect(data.every(Number.isFinite)).toBe(true);
    expect(Math.max(...data.map(Math.abs))).toBeLessThan(1); expect(data.some((value) => Math.abs(value) > .1)).toBe(true);
  }
  expect(variants[0]).not.toEqual(variants[1]);
});
