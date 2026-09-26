import { beforeEach, describe, expect, it } from "vitest";
import { assignCandidateRoles } from "@/core/candidates";
import { createRun, dispatchCommand } from "@/core/run";
import { resolveSpin } from "@/core/settlement";
import { normalizeDrawIdentity } from "@/core/reels";
import type { GameCommand } from "@/core/commands";
import type { Grid, PartId, ReelSet, RunState, SymbolId } from "@/core/types";
import { activeRecord, canMigrateArchive, exportArchive, importArchive, initializeLibrary, migrateArchive, openArchiveSession, readLibrary, recordAction, verifyArchive } from "@/persistence/archives";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { saveRun } from "@/persistence/storage";

const solid = (symbol: SymbolId): ReelSet => Array.from({ length: 3 }, () => Array<SymbolId>(12).fill(symbol)) as unknown as ReelSet;
const ready = (patch: Partial<RunState> = {}): RunState => ({ ...createRun(8), phase: "READY_TO_SPIN", service: "kitchen", bankroll: 2000, ...patch });
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error.message}`);
  expect(decodeRunStateV2(result.state), command.type).not.toBeNull();
  return result.state;
}
function pull(state: RunState): RunState {
  for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
  return state;
}
function fixed(state: RunState, reels: ReelSet, free = false) {
  const draw = normalizeDrawIdentity({ strips: reels, stops: [0, 0, 0],
    grid: reels.map((strip) => [strip[0], strip[1], strip[2]]) as unknown as Grid, rng: state.rng });
  const input = { ...state, reels, phase: "AWAITING_INTERVENTION" as const,
    pendingSpin: { draw, isFree: free, bankrollBefore: state.bankroll + (free ? 0 : 10), wager: free ? 0 : 10 } };
  return resolveSpin(input, draw);
}
const partPayout = (result: ReturnType<typeof fixed>, id: PartId) => result.events.reduce((n, event) =>
  n + (event.type === "PAYOUT_ADDED" && "partId" in event && event.partId === id ? event.amount : 0), 0);
beforeEach(() => localStorage.clear());

describe("build diversity rules", () => {
  it.each([1, 2] as const)("fruit vat L%s counts paying fruit spins, not lines; pays only every third paid hit", (level) => {
    let state = ready({ reels: solid("lemon"), partSlots: [{ id: "harvest-vat", level }, null, null, null, null] });
    for (let index = 0; index < 3; index++) {
      const result = fixed(state, solid("lemon"));
      expect(partPayout(result, "harvest-vat")).toBe(index === 2 ? (level === 1 ? 120 : 240) : 0);
      state = result.state;
      expect(state.counters.harvestCharge).toBe((index + 1) % 3);
    }
  });
  it("does not charge or open the vat on free spins, misses, bell or wild-only wins", () => {
    const state = ready({ counters: { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 2 }, partSlots: [{ id: "harvest-vat", level: 2 }, null, null, null, null] });
    for (const symbol of ["blank", "bell", "wild"] as const) expect(fixed(state, solid(symbol)).state.counters.harvestCharge).toBe(2);
    const free = fixed(state, solid("cherry"), true);
    expect(free.state.counters.harvestCharge).toBe(2);
    expect(partPayout(free, "harvest-vat")).toBe(0);
  });
  it("counts multiple salad lines once and amplifies the actual harvest with food", () => {
    const state = ready({ counters: { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 2 },
      buffs: [{ id: "food", spinsRemaining: 3, additivePayout: 0.5 }],
      partSlots: [{ id: "fruit-salad", level: 1 }, { id: "harvest-vat", level: 1 }, null, null, null] });
    const result = fixed(state, [solid("cherry")[0], solid("lemon")[0], solid("bell")[0]]);
    expect(partPayout(result, "harvest-vat")).toBe(180);
    expect(result.state.counters.harvestCharge).toBe(0);
  });
  it("carries fruit charge across shift boundaries, saves and L2 refinement", () => {
    let state = pull(ready({ baseSpinsInShift: 2, reels: solid("lemon"), tips: 3,
      partSlots: [{ id: "harvest-vat", level: 1 }, null, null, null, null] }));
    expect(state.counters.harvestCharge).toBe(1);
    state = send(state, { type: "DECLINE_UPGRADE" });
    state = send(state, { type: "UPGRADE_PART", slot: 0 });
    expect(state.counters.harvestCharge).toBe(1);
    expect(decodeRunStateV2(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
  it("clears stored resources on replacement rather than transferring them to another part", () => {
    const state = ready({ phase: "CHOOSING_UPGRADE", baseSpinsInShift: 3,
      counters: { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 2, votiveCharge: 3 },
      currentCandidates: { synergy: "safety-fuse", pivot: "carbon-copy", wildcard: "tithe-box" },
      partSlots: [{ id: "harvest-vat", level: 2 }, { id: "votive-candle", level: 2 }, { id: "jam-jar", level: 1 }, { id: "fruit-salad", level: 1 }, { id: "lemon-infection", level: 1 }] });
    expect(send(state, { type: "CHOOSE_UPGRADE", choice: { id: "safety-fuse", action: "replace", replaceSlot: 0 } }).counters).toMatchObject({ harvestCharge: 0, votiveCharge: 3 });
    expect(send(state, { type: "CHOOSE_UPGRADE", choice: { id: "safety-fuse", action: "replace", replaceSlot: 1 } }).counters).toMatchObject({ harvestCharge: 2, votiveCharge: 0 });
  });
  it("lighting reserves at most three omen for one tip; collector cannot cash them again", () => {
    const state = ready({ omen: 5, tips: 3, partSlots: [{ id: "votive-candle", level: 2 }, { id: "omen-collector", level: 2 }, null, null, null] });
    const lit = send(state, { type: "LIGHT_CANDLE" });
    expect(lit).toMatchObject({ omen: 2, tips: 2, interventionPoints: 2, counters: { votiveCharge: 3 } });
    expect(lit.rng).toEqual(state.rng);
    expect(dispatchCommand(lit, { type: "LIGHT_CANDLE" }).ok).toBe(false);
    const settled = fixed(lit, solid("seven"));
    expect(partPayout(settled, "votive-candle")).toBe(120);
    expect(partPayout(settled, "omen-collector")).toBe(20);
    expect(settled.state.omen).toBe(0);
    expect(settled.state.counters.votiveCharge).toBe(0);
  });
  it("candle pays even on a miss/free spin, but disabled charges survive until it works", () => {
    const state = ready({ counters: { blankCharge: 0, cherryWinsThisShift: 0, votiveCharge: 2 }, partSlots: [{ id: "votive-candle", level: 1 }, null, null, null, null] });
    const damaged = fixed(state, solid("crack"));
    expect(partPayout(damaged, "votive-candle")).toBe(0);
    expect(damaged.state.counters.votiveCharge).toBe(2);
    const result = fixed(damaged.state, solid("blank"), true);
    expect(partPayout(result, "votive-candle")).toBe(40);
    expect(result.state.counters.votiveCharge).toBe(0);
    expect(partPayout(fixed(result.state, solid("blank")), "votive-candle")).toBe(0);
  });
  it("rejects unavailable lighting without spending resources or rolling random numbers", () => {
    const state = ready({ partSlots: [{ id: "votive-candle", level: 1 }, null, null, null, null] });
    for (const patch of [{ tips: 0, omen: 3 }, { tips: 3, omen: 0 }, { phase: "SPINNING" as const, tips: 3, omen: 3 }]) {
      const input = { ...state, ...patch }; const copy = structuredClone(input);
      expect(dispatchCommand(input, { type: "LIGHT_CANDLE" }).ok).toBe(false);
      expect(input).toEqual(copy);
    }
  });
  it.each([1, 2] as const)("flywheel L%s protects before damage and pays once, without removing cracks", (level) => {
    const reels: ReelSet = [["crack", "crack", "blank", "bell"], ["blank", "blank", "blank"], ["blank", "blank", "blank"]];
    const state = ready({ partSlots: [{ id: "shock-absorber", level }, { id: "blank-capacitor", level: 1 }, { id: "overload-motor", level: 1 }, null, null] });
    const result = fixed(state, reels);
    expect(partPayout(result, "shock-absorber")).toBe(level === 1 ? 20 : 60);
    expect(result.events.filter((event) => event.type === "PART_DISABLED")).toHaveLength(level === 1 ? 1 : 0);
    expect(result.events.some((event) => event.type === "PART_DISABLED" && event.partId === "shock-absorber")).toBe(false);
    expect(result.state.reels.flat().filter((symbol) => symbol === "crack")).toHaveLength(2);
    expect(result.state.freeSpinQueue).toBe(1);
  });
  it("flywheel pays for physical cracks only, not repeated views of one short-strip cell", () => {
    const state = ready({ partSlots: [{ id: "shock-absorber", level: 2 }, null, null, null, null] });
    expect(partPayout(fixed(state, [["crack"], ["blank"], ["blank"]]), "shock-absorber")).toBe(30);
  });
  it("allows one late meal, keeps its price and three-spin duration, and refuses a second meal", () => {
    const state = ready({ baseSpinsInShift: 2 });
    const meal = send(state, { type: "BUY_FOOD", reelIndex: 0 });
    expect(meal.bankroll).toBe(1992.5);
    expect(meal.buffs).toContainEqual({ id: "food", spinsRemaining: 3, additivePayout: 0.5 });
    expect(dispatchCommand(meal, { type: "BUY_FOOD", reelIndex: 1 }).ok).toBe(false);
  });
  it("rerolls guarantee a different ID, not a reshuffle of the same three", () => {
    for (const seed of [8, 42, 91, 124]) {
      let state = ready({ rng: { value: seed }, phase: "CHOOSING_UPGRADE", baseSpinsInShift: 3, tips: 4,
        currentCandidates: { synergy: "lemon-crate", pivot: "seven-purification", wildcard: "safety-fuse" } });
      for (let i = 0; i < 4; i++) {
        const before = state;
        state = send(state, { type: "REROLL_CANDIDATES" });
        expect(Object.values(state.currentCandidates!).some((id) => !Object.values(before.currentCandidates!).includes(id))).toBe(true);
        expect(state.tips).toBe(before.tips - 1);
      }
    }
    const offers = { synergy: "lemon-crate", pivot: "seven-purification", wildcard: "safety-fuse" } as const;
    expect(() => assignCandidateRoles(ready(), Object.values(offers), offers)).toThrow();
  });
  it("workshop rerolls respect the money remaining after the purchase price", () => {
    let state = ready({ phase: "AFTER_HOURS", shift: 5, afterHoursLevel: 1, baseSpinsInShift: 3, exitUnlocked: true,
      bankroll: 50, tips: 8, hotel: { cleared: 0, challenge: { tier: 1, status: "failed" } },
      workshop: { cost: 50, status: "shopping" }, currentCandidates: { synergy: "lemon-crate", pivot: "seven-purification", wildcard: "safety-fuse" } });
    for (let i = 0; i < 8; i++) {
      state = send(state, { type: "REROLL_CANDIDATES" });
      expect(Object.values(state.currentCandidates!)).not.toContain("tithe-box");
    }
  });
});

describe("new resources and prior six-room archive", () => {
  it("validates bounded optional counters without adding them to old snapshots", () => {
    const state = ready();
    expect(decodeRunStateV2(state)).toEqual(state);
    for (const counters of [{ harvestCharge: 3 }, { harvestCharge: -1 }, { votiveCharge: 4 }, { votiveCharge: 1.5 }, { unknown: 1 }])
      expect(decodeRunStateV2({ ...state, counters: { ...state.counters, ...counters } })).toBeNull();
  });
  it("exports, reloads and replays lighting, a delayed meal, harvest and receipt attribution", () => {
    saveRun(ready({ omen: 3, tips: 3, reels: solid("lemon"),
      partSlots: [{ id: "harvest-vat", level: 2 }, { id: "votive-candle", level: 2 }, null, null, null] }));
    const session = openArchiveSession(activeRecord(initializeLibrary())!.snapshot);
    const log = (command: GameCommand) => {
      const state = session.record.snapshot; const result = dispatchCommand(state, command);
      expect(result.ok).toBe(true); recordAction(session, state, command, result); expect(session.warning).toBeNull();
    };
    log({ type: "LIGHT_CANDLE" });
    for (let index = 0; index < 3; index++) {
      if (index === 2) log({ type: "BUY_FOOD", reelIndex: 0 });
      for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) log({ type });
      expect(decodeRunStateV2(JSON.parse(JSON.stringify(session.record.snapshot)))).not.toBeNull();
    }
    expect(session.record.snapshot.spinHistory.some((receipt) => receipt.awards.some((award) => award.kind === "part-bonus" && award.partId === "votive-candle"))).toBe(true);
    const record = importArchive(readLibrary(), exportArchive(session.record)).runs.at(-1)!;
    expect(verifyArchive(record)).toContain("核验通过");
  });
  it("forks previous six-room progress unchanged, including a pending paid draw", () => {
    let state = ready({ phase: "AFTER_HOURS", shift: 5, baseSpinsInShift: 3, afterHoursLevel: 3, exitUnlocked: true,
      hotel: { cleared: 3, challenge: { tier: 3, status: "cleared" } } });
    state = send(send(state, { type: "ENTER_ROOM" }), { type: "SPIN" });
    saveRun(state);
    const library = initializeLibrary();
    const source = { ...activeRecord(library)!, rulesVersion: "rules-b692b1c641f44aad" };
    expect(canMigrateArchive(source)).toBe(true);
    const imported = importArchive(library, exportArchive(source));
    const old = imported.runs.at(-1)!;
    const raw = JSON.stringify(old);
    const migrated = migrateArchive(imported, old);
    expect(activeRecord(migrated)?.snapshot).toEqual(state);
    expect(activeRecord(migrated)?.parentId).toBe(old.id);
    expect(JSON.stringify(migrated.runs.find((run) => run.id === old.id))).toBe(raw);
  });
});
