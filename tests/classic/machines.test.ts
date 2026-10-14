import { describe, expect, it } from "vitest";
import { createClassic, classicMath } from "@/classic/engine";
import { CLASSIC_KEY } from "@/classic/storage";
import { POOL_SEED, POOL_STEP, WHEEL_PRIZES, beginMachineSpin, changeMachineBet, createMachine, featureAward, isFeatureMachineState, isFeatureState, machineMath, machineReels, money, settleMachineSpin, type FeatureState, type FeatureMachine } from "@/classic/machines";
import { machineKey, openMachine, resetMachine, saveMachine } from "@/classic/machine-storage";
import { wheelAngle, wheelDuration, wheelRestAngle } from "@/classic/feature-motion";

describe("classic family math and physical invariants", () => {
  it("preserves the original and enumerates the actual feature math", () => {
    expect(createMachine("original", 8)).toEqual(createClassic(8));
    expect(classicMath().rtp).toBe(.940125);
    for (const machine of ["original", "diamond", "wheel", "vault"] as const) expect(machineReels(machine).map((strip) => strip.length)).toEqual([20, 20, 20]);
    expect(machineMath("diamond").rtp).toBeCloseTo(.95, 8);
    expect(machineMath("wheel").rtp).toBeCloseTo(.96325, 8);
    expect(machineMath("wheel").featureRate).toBe(.05);
    expect(machineMath("vault").rtp).toBeCloseTo(.897005, 8);
    expect(machineMath("vault").longRunRtp).toBe(.937);
    expect(machineMath("vault", POOL_SEED + 32_000).rtp).toBeCloseTo(.937005, 8);
  });
  it("substitutes diamonds only for full matches and explains the multiplier", () => {
    expect(featureAward("diamond", ["bar", "diamond", "bar"], 10)).toMatchObject({ basePayout: 30, bonusPayout: 30, payout: 60, multiplier: 2, feature: "multiply" });
    expect(featureAward("diamond", ["diamond", "bell", "diamond"], 10)).toMatchObject({ basePayout: 60, bonusPayout: 180, payout: 240, multiplier: 4 });
    expect(featureAward("diamond", ["diamond", "diamond", "diamond"], 10)).toMatchObject({ payout: 1_000, feature: "diamond-jackpot" });
    expect(featureAward("diamond", ["diamond", "blank", "diamond"], 10).payout).toBe(0);
    expect(featureAward("diamond", ["cherry", "diamond", "lemon"], 10)).toMatchObject({ payout: 10, multiplier: 1, feature: "none" });
    expect(featureAward("diamond", ["cherry", "diamond", "cherry"], 10).payout).toBe(60);
  });
  it("adds wheel awards to base payouts, using only the right center trigger", () => {
    WHEEL_PRIZES.forEach((prize, index) => expect(featureAward("wheel", ["cherry", "bar", "wheel"], 10, 0, index)).toMatchObject({ basePayout: 10, bonusPayout: prize * 10, payout: 10 + prize * 10, wheelIndex: index }));
    expect(() => featureAward("wheel", ["bar", "bar", "wheel"], 10)).toThrow();
    expect(() => featureAward("wheel", ["bar", "bar", "wheel"], 10, 0, 8)).toThrow();
    expect(featureAward("wheel", ["wheel", "bar", "blank"], 10, 0, 0).feature).toBe("none");
  });
  it("funds the vault once, pays exact decimal chips, and resets only after a jackpot", () => {
    const start = createMachine("vault", 2957) as FeatureState;
    const pending = beginMachineSpin(start, 10) as FeatureState;
    expect(pending.pending).toMatchObject({ feature: "jackpot", basePayout: 0, payout: 2000.4, poolBefore: 20000, poolAfter: 20000 });
    expect(pending.pool).toBe(POOL_SEED);
    const settled = settleMachineSpin(pending) as FeatureState;
    expect(settled.credits).toBe(2990.4); expect(settled.pool).toBe(POOL_SEED);
    expect(settled.poolPaid).toBe(POOL_SEED + POOL_STEP); expect(settled.jackpots).toBe(1);
    expect(isFeatureMachineState(settled, "vault")).toBe(true);
    expect(settleMachineSpin(settled)).toBe(settled);
    expect(featureAward("vault", ["seven", "cherry", "seven"], 25, POOL_SEED)).toMatchObject({ basePayout: 25, bonusPayout: 250, payout: 275, feature: "mini" });
  });
  it.each(["diamond", "wheel", "vault"] as const)("keeps %s outcomes independent of bet and display", (id) => {
    const initial = createMachine(id, 16);
    const a = beginMachineSpin(initial, 1) as FeatureState;
    const b = beginMachineSpin(changeMachineBet(initial, 50), 2) as FeatureState;
    expect(a.pending!.stops).toEqual(b.pending!.stops); expect(a.rng).toBe(b.rng);
    expect(b.pending!.payout).toBe(money(a.pending!.payout * 5));
    expect(a.pending!.wheelIndex).toBe(b.pending!.wheelIndex);
    expect(() => beginMachineSpin(a, 3)).toThrow(); expect(() => changeMachineBet(a, 25)).toThrow();
    expect(isFeatureMachineState(a, id)).toBe(true);
  });
  it("retains detailed history, pool accounting and money across mixed bets", () => {
    let state = createMachine("vault", 2957) as FeatureState;
    for (let i = 0; i < 120; i++) {
      state = settleMachineSpin(beginMachineSpin(changeMachineBet(state, i % 2 ? 5 : 10), i)) as FeatureState;
      expect(isFeatureMachineState(state, "vault")).toBe(true);
    }
    expect(state.history).toHaveLength(80); expect(state.spins).toBe(120);
    expect(state.credits).toBe(money(1000 - state.wagered + state.paid));
  });
  it("ends each bonus wheel sector exactly under the pointer with a finite rebound", () => {
    for (let index = 0; index < 8; index++) for (const reduced of [true, false]) {
      const motion = { index, from: 3, reduced, startedAt: 0 };
      expect(wheelAngle(motion, 0)).toBe(wheelRestAngle(3));
      expect(wheelAngle(motion, wheelDuration(reduced)) % 360).toBeCloseTo(wheelRestAngle(index), 7);
      expect(wheelAngle(motion, wheelDuration(reduced) + 500)).toBe(wheelAngle(motion, wheelDuration(reduced)));
    }
  });
});

describe("family save isolation and recovery", () => {
  const store = () => { const data = new Map<string, string>([["hotel", "unchanged"], [CLASSIC_KEY, JSON.stringify(createClassic(44))]]); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; };
  it.each(["diamond", "wheel", "vault"] as const)("recovers a reserved %s result once and leaves other machines untouched", (id) => {
    const storage = store(); const original = storage.getItem(CLASSIC_KEY);
    const start = openMachine(id, storage, id === "vault" ? 2957 : 16);
    const reserved = saveMachine(id, start, beginMachineSpin(start.state, 7), storage);
    const recovered = openMachine(id, storage, 123);
    expect(recovered.state).toEqual(settleMachineSpin(reserved.state));
    expect(openMachine(id, storage, 456)).toEqual(recovered);
    expect(storage.getItem(CLASSIC_KEY)).toBe(original); expect(storage.getItem("hotel")).toBe("unchanged");
    expect([...storage.data.keys()]).toEqual(["hotel", CLASSIC_KEY, machineKey(id)]);
  });
  it("preserves a wheel result across closure before its bonus button", () => {
    const storage = store(); const start = openMachine("wheel", storage, 16);
    const pending = saveMachine("wheel", start, beginMachineSpin(start.state, 0), storage);
    expect(pending.state.pending).toMatchObject({ feature: "wheel", wheelIndex: 3, payout: 20 });
    expect(openMachine("wheel", storage).state).toMatchObject({ credits: 1010, spins: 1, pending: null });
    expect(openMachine("wheel", storage).state).toMatchObject({ credits: 1010, spins: 1 });
  });
  it("refuses stale writes, wrong cabinet data, and malformed feature awards", () => {
    const storage = store(); const before = openMachine("wheel", storage, 16);
    const after = saveMachine("wheel", before, beginMachineSpin(before.state, 0), storage);
    expect(() => saveMachine("wheel", before, changeMachineBet(before.state, 25), storage)).toThrow("classic-conflict");
    expect(() => resetMachine("wheel", before.raw, storage)).toThrow("classic-conflict");
    expect(() => saveMachine("diamond", before, before.state, storage)).toThrow("classic-invalid");
    const state = after.state as FeatureState;
    for (const mutated of [{ ...state, credits: state.credits + .01 }, { ...state, pending: { ...state.pending, wheelIndex: 4 } },
      { ...state, pending: { ...state.pending, payout: 999 } }, { ...state, pool: 1 }, { ...state, pending: { ...state.pending, feature: "jackpot" } }]) expect(isFeatureMachineState(mutated, "wheel")).toBe(false);
    storage.setItem(machineKey("wheel"), "broken");
    expect(() => openMachine("wheel", storage)).toThrow("classic-invalid");
    expect(storage.getItem(machineKey("wheel"))).toBe("broken");
  });
  it("rejects inconsistent vault pool data and resets only the named cabinet", () => {
    const storage = store(); const diamond = openMachine("diamond", storage, 0);
    const start = openMachine("vault", storage, 1);
    const next = saveMachine("vault", start, settleMachineSpin(beginMachineSpin(start.state, 0)), storage);
    expect(isFeatureState(next.state)).toBe(true);
    expect(isFeatureMachineState({ ...next.state, pool: 20008 }, "vault")).toBe(false);
    expect(resetMachine("vault", next.raw, storage).state).toMatchObject({ pool: POOL_SEED, credits: 1000, spins: 0 });
    expect(storage.getItem(machineKey("diamond"))).toBe(diamond.raw); expect(storage.getItem("hotel")).toBe("unchanged");
  });
});
