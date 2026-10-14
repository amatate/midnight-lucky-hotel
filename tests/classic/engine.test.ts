import { describe, expect, it } from "vitest";
import { beginSpin, BETS, centerSymbols, changeBet, classicMath, createClassic, isClassicState, multiplierFor, PAYTABLE, REELS, settleSpin, symbolAt } from "@/classic/engine";
import { CLASSIC_KEY, openClassic, resetClassic, saveClassic } from "@/classic/storage";
import { reelAngle, spinDuration, stopTime } from "@/classic/motion";
import { renderClassicMotor } from "@/classic/motor";

describe("independent classic machine", () => {
  it("enumerates every stop and documents break-even separately from profit", () => {
    expect(REELS.map((strip) => strip.length)).toEqual([20, 20, 20]);
    expect(classicMath()).toEqual({ outcomes: 8000, rtp: .940125, hitRate: .515125, profitRate: .131125 });
    expect(multiplierFor(["cherry", "lemon", "bar"])).toBe(1);
    expect(multiplierFor(["bar", "cherry", "cherry"])).toBe(2);
    expect(multiplierFor(["blank", "blank", "blank"])).toBe(0);
    expect(multiplierFor(["seven", "bell", "bar"])).toBe(0);
    expect(() => multiplierFor([])).toThrow();
  });
  it.each(PAYTABLE)("pays $count $symbol at $multiplier times the bet", ({ symbol, count, multiplier }) => {
    expect(multiplierFor(Array.from({ length: 3 }, (_, i) => i < count ? symbol : "blank"))).toBe(multiplier);
  });
  it("reserves funds/outcome once and settles exactly once", () => {
    const initial = createClassic(8);
    const pending = beginSpin(initial, 100);
    expect(pending.credits).toBe(990);
    expect(pending.pending?.payout).toBe(multiplierFor(centerSymbols(pending.pending!.stops)) * 10);
    expect(pending.stops).toEqual(initial.stops);
    expect(() => beginSpin(pending, 101)).toThrow();
    expect(() => changeBet(pending, 25)).toThrow();
    const final = settleSpin(pending);
    expect(final.credits).toBe(990 + pending.pending!.payout);
    expect(final.wagered).toBe(10); expect(final.paid).toBe(pending.pending!.payout);
    expect(final.history).toEqual([pending.pending]); expect(final.stops).toEqual(pending.pending!.stops);
    expect(settleSpin(final)).toBe(final);
    expect(isClassicState(pending)).toBe(true); expect(isClassicState(final)).toBe(true);
  });
  it("preserves the same random sequence across presentation and bet changes", () => {
    const normal = beginSpin(createClassic(0), 100);
    const large = beginSpin(changeBet(createClassic(0), 50), 200);
    expect(normal.pending!.stops).toEqual(large.pending!.stops);
    expect(large.pending!.payout).toBe(normal.pending!.payout * 5);
    expect(normal.rng).toBe(large.rng);
  });
  it("validates bets, boundaries and bankrupt sessions", () => {
    for (const bet of BETS) expect(changeBet(createClassic(1), bet).bet).toBe(bet);
    expect(() => changeBet(createClassic(1), -5)).toThrow();
    expect(() => createClassic(-1)).toThrow();
    expect(() => createClassic(2 ** 32)).toThrow();
    expect(() => beginSpin({ ...createClassic(1), credits: 0 }, 1)).toThrow();
    expect(symbolAt(0, -1)).toBe(REELS[0]!.at(-1));
  });
  it("retains 80 itemized spins, without truncating totals", () => {
    let state = createClassic(7);
    for (let i = 0; i < 100 && state.credits >= state.bet; i++) state = settleSpin(beginSpin(state, i));
    expect(state.spins).toBe(100); expect(state.history).toHaveLength(80);
    expect(state.wagered).toBe(1_000); expect(state.credits).toBe(1_000 - state.wagered + state.paid);
    expect(isClassicState(state)).toBe(true);
  });
  it("rejects malformed saves and inconsistent payouts/accounting", () => {
    const state = settleSpin(beginSpin(createClassic(1), 0));
    for (const malformed of [null, {}, { ...state, credits: -1 }, { ...state, credits: state.credits + 1 },
      { ...state, version: 2 }, { ...state, stops: [0, 20, 0] }, { ...state, history: [] },
      { ...state, history: [{ ...state.history[0], payout: 999 }] }]) expect(isClassicState(malformed)).toBe(false);
  });
  it("ends all visible drum motions on the actual awarded stops", () => {
    const motion = { from: [19, 0, 5], to: [1, 19, 2], startedAt: 0, reduced: false } as const;
    for (let reel = 0; reel < 3; reel++) {
      expect(reelAngle(motion, reel, 0)).toBeCloseTo(motion.from[reel]! * Math.PI / 10);
      expect(reelAngle(motion, reel, spinDuration(false)) % (Math.PI * 2)).toBeCloseTo(motion.to[reel]! * Math.PI / 10);
      expect(reelAngle({ ...motion, reduced: true }, reel, stopTime(reel, true))).toBeCloseTo(motion.to[reel]! * Math.PI / 10);
    }
  });
  it("keeps the mechanical bed finite, bounded, and independent of game randomness", () => {
    const data = renderClassicMotor();
    expect(data.length).toBe(Math.ceil(2.55 * 22_050));
    expect([...data].every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1)).toBe(true);
    expect(data.some((sample) => Math.abs(sample) > .02)).toBe(true);
    expect(renderClassicMotor()).toBe(data);
  });
});

describe("classic storage boundary", () => {
  function store() {
    const data = new Map<string, string>([["hotel-archive", "leave-me-alone"]]);
    return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  }
  it("recovers an interrupted spin once, without rerolling or touching hotel keys", () => {
    const storage = store(); const start = openClassic(storage, 44);
    const pending = saveClassic(start, beginSpin(start.state, 5), storage);
    const recovered = openClassic(storage, 999);
    expect(recovered.state).toEqual(settleSpin(pending.state));
    expect(recovered.state.credits).toBe(1_110);
    expect(openClassic(storage, 123)).toEqual(recovered);
    expect(storage.data.get("hotel-archive")).toBe("leave-me-alone");
    expect([...storage.data.keys()]).toEqual(["hotel-archive", CLASSIC_KEY]);
  });
  it("refuses stale tabs and corrupt or unavailable saves without overwriting them", () => {
    const storage = store(); const original = openClassic(storage, 1);
    const latest = saveClassic(original, changeBet(original.state, 25), storage);
    expect(() => saveClassic(original, changeBet(original.state, 50), storage)).toThrow("classic-conflict");
    expect(() => resetClassic(original.raw, storage)).toThrow("classic-conflict");
    expect(storage.getItem(CLASSIC_KEY)).toBe(latest.raw);
    storage.setItem(CLASSIC_KEY, "broken");
    expect(() => openClassic(storage, 1)).toThrow("classic-invalid");
    expect(storage.getItem(CLASSIC_KEY)).toBe("broken");
    expect(() => saveClassic({ raw: "broken", state: original.state }, original.state, { ...storage, setItem: () => { throw new Error("quota"); } })).toThrow("quota");
    expect(storage.getItem(CLASSIC_KEY)).toBe("broken");
  });
  it("resets only the explicitly confirmed classic session", () => {
    const storage = store(); const original = openClassic(storage, 1);
    const next = saveClassic(original, settleSpin(beginSpin(original.state, 0)), storage);
    const reset = resetClassic(next.raw, storage);
    expect(reset.state.credits).toBe(1_000); expect(reset.state.history).toEqual([]);
    expect(storage.data.get("hotel-archive")).toBe("leave-me-alone");
  });
});
