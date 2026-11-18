import { beforeEach, describe, expect, it } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { PartInstance, RunState } from "@/core/types";
import { canEditReel, canEditWorkbench, getReserveParts } from "@/core/workbench";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { activeRecord, canMigrateArchive, initializeLibrary, migrateArchive, openArchiveSession, readLibrary, recordAction,
  RULES_VERSION, startArchivedRun, verifyArchive } from "@/persistence/archives";

const vat: PartInstance = { id: "harvest-vat", level: 1 };
const bell: PartInstance = { id: "midnight-bell", level: 1 };
function ready(patch: Partial<RunState> = {}): RunState {
  return { ...createRun(12), phase: "READY_TO_SPIN", service: "kitchen", partSlots: [vat, null, null, null, null], ...patch };
}
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
const swap: GameCommand = { type: "SWAP_REEL_SYMBOLS", reelIndex: 0, firstIndex: 0, secondIndex: 7 };
const shelve: GameCommand = { type: "MOVE_PART", from: { area: "machine", slot: 0 }, to: { area: "reserve", slot: 0 } };

beforeEach(() => localStorage.clear());

describe("build workbench", () => {
  it("moves a part into reserve without changing bankroll or RNG, clears its charge, and restores it", () => {
    const state = ready({ counters: { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 2 } });
    const stored = send(state, shelve);
    expect(stored.partSlots[0]).toBeNull();
    expect(getReserveParts(stored)).toEqual([vat, null]);
    expect(stored.counters.harvestCharge).toBe(0);
    expect(stored.rng).toEqual(state.rng);
    expect(stored.bankroll).toBe(state.bankroll);
    expect(stored.pendingEvents.at(-1)).toMatchObject({ type: "PARTS_MOVED", resetCounters: ["harvestCharge"] });
    expect(send(stored, shelve).partSlots[0]).toEqual(vat);
    expect(state.partSlots[0]).toEqual(vat);
  });

  it("keeps charges when reordering active slots and swaps occupied reserve slots without duplication", () => {
    const state = ready({ counters: { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 2 },
      partSlots: [vat, bell, null, null, null], workbench: { name: "test", reserve: [{ id: "blank-capacitor", level: 1 }, null] } });
    const reordered = send(state, { type: "MOVE_PART", from: { area: "machine", slot: 0 }, to: { area: "machine", slot: 4 } });
    expect(reordered.counters.harvestCharge).toBe(2);
    const exchanged = send(reordered, { type: "MOVE_PART", from: { area: "machine", slot: 1 }, to: { area: "reserve", slot: 0 } });
    expect(exchanged.partSlots[1]?.id).toBe("blank-capacitor");
    expect(getReserveParts(exchanged)[0]).toEqual(bell);
    expect(decodeRunStateV2(exchanged)).toEqual(exchanged);
  });

  it("forbids mid-round, pending, free-spin, terminal and out-of-bounds modifications", () => {
    for (const state of [ready({ baseSpinsInShift: 1 }), ready({ freeSpinQueue: 1 }), ready({ phase: "RUN_WON" }),
      ready({ phase: "SPINNING" }), createRun(12)]) {
      expect(canEditWorkbench(state)).toBe(false);
      expect(dispatchCommand(state, shelve)).toMatchObject({ ok: false, state });
    }
    expect(dispatchCommand(ready(), { type: "MOVE_PART", from: { area: "machine", slot: 5 }, to: { area: "reserve", slot: 0 } }).ok).toBe(false);
  });

  it("swaps two permanent symbols once per block, preserving multiplicities and temporary additions", () => {
    const state = ready({ temporaryReelAdditions: [["food"], [], []], blockReelAdditions: [["blank"], [], []] });
    const edited = send(state, swap);
    expect(edited.reels[0]).not.toEqual(state.reels[0]);
    expect([...edited.reels[0]].sort()).toEqual([...state.reels[0]].sort());
    expect(edited.blockReelAdditions).toEqual(state.blockReelAdditions);
    expect(edited.temporaryReelAdditions).toEqual(state.temporaryReelAdditions);
    expect(edited.rng).toEqual(state.rng);
    expect(canEditReel(edited)).toBe(false);
    expect(dispatchCommand(edited, swap)).toMatchObject({ ok: false, error: { code: "RESOURCE_EXHAUSTED" } });
  });

  it("does not consume a reel edit for same-symbol / invalid positions or give another edit after leaving a break", () => {
    const state = ready({ phase: "CHOOSING_UPGRADE", baseSpinsInShift: 3,
      currentCandidates: { synergy: "harvest-vat", pivot: "carbon-copy", wildcard: "cherry-pitter" } });
    expect(dispatchCommand(state, { type: "SWAP_REEL_SYMBOLS", reelIndex: 0, firstIndex: 0, secondIndex: 2 }).ok).toBe(false);
    expect(dispatchCommand(state, { type: "SWAP_REEL_SYMBOLS", reelIndex: 0, firstIndex: -1, secondIndex: 999 }).ok).toBe(false);
    const edited = send(state, swap);
    const next = send(edited, { type: "DECLINE_UPGRADE" });
    expect(next.phase).toBe("READY_TO_SPIN");
    expect(canEditReel(next)).toBe(false);
    expect(canEditReel({ ...next, shift: next.shift + 1 })).toBe(true);
  });

  it("names builds, validates reserve size and rejects duplicate ownership across active/reserve", () => {
    const state = send(ready(), { type: "SET_BUILD_NAME", name: "果园实验一号" });
    expect(decodeRunStateV2(state)).toEqual(state);
    expect(dispatchCommand(state, { type: "SET_BUILD_NAME", name: "a".repeat(33) }).ok).toBe(false);
    expect(dispatchCommand(state, { type: "SET_BUILD_NAME", name: "bad\u0000name" }).ok).toBe(false);
    expect(decodeRunStateV2({ ...state, workbench: { name: "x", reserve: [null, null, null] } })).toBeNull();
    expect(decodeRunStateV2({ ...state, workbench: { name: "x", reserve: [vat, null] } })).toBeNull();
  });

  it("upgrades a reserved part in place, and puts a new part in reserve when the machine is full", () => {
    const slots = [bell, { id: "cherry-press", level: 1 }, { id: "jam-jar", level: 1 },
      { id: "safety-fuse", level: 1 }, { id: "blank-capacitor", level: 1 }] as const;
    const base = ready({ phase: "CHOOSING_UPGRADE", baseSpinsInShift: 3, partSlots: slots,
      currentCandidates: { synergy: "harvest-vat", pivot: "carbon-copy", wildcard: "cherry-pitter" } });
    const acquired = send(base, { type: "CHOOSE_UPGRADE", choice: { action: "apply", id: "harvest-vat" } });
    expect(acquired.partSlots).toEqual(slots);
    expect(getReserveParts(acquired)[0]).toEqual(vat);
    const upgraded = send({ ...base, workbench: acquired.workbench! }, { type: "CHOOSE_UPGRADE", choice: { action: "apply", id: "harvest-vat" } });
    expect(getReserveParts(upgraded)[0]).toEqual({ ...vat, level: 2 });
    const replaced = send(base, { type: "CHOOSE_UPGRADE", choice: { action: "replace", id: "harvest-vat", replaceSlot: 0 } });
    expect(replaced.partSlots[0]).toEqual(vat);
    expect(getReserveParts(replaced)[0]).toEqual(bell);
  });

  it("allows upgrading owned reserve hardware after its prerequisite was shelved, but still gates new hardware", () => {
    const state = ready({ phase: "CHOOSING_UPGRADE", baseSpinsInShift: 3,
      currentCandidates: { synergy: "salad-dressing", pivot: "carbon-copy", wildcard: "cherry-pitter" } });
    expect(dispatchCommand(state, { type: "CHOOSE_UPGRADE", choice: { action: "apply", id: "salad-dressing" } }).ok).toBe(false);
    const owned: RunState = { ...state, workbench: { name: "Salad", reserve: [{ id: "salad-dressing", level: 1 }, null] } };
    const upgraded = send(owned, { type: "CHOOSE_UPGRADE", choice: { action: "apply", id: "salad-dressing" } });
    expect(getReserveParts(upgraded)[0]).toEqual({ id: "salad-dressing", level: 2 });
    expect(upgraded.partSlots).toEqual(state.partSlots);
  });

  it("carries a break edit across entering a room and across its round-reward transition", () => {
    const boundary = ready({ phase: "SHIFT_COMPLETE", shift: 3, baseSpinsInShift: 3, bankroll: 1000, exitUnlocked: true });
    const firstRoom = send(send(boundary, swap), { type: "ENTER_ROOM" });
    expect(firstRoom.afterHoursLevel).toBe(1);
    expect(canEditReel(firstRoom)).toBe(false);
    const intermission: RunState = { ...firstRoom, phase: "AFTER_HOURS", baseSpinsInShift: 3,
      currentCandidates: { synergy: "harvest-vat", pivot: "carbon-copy", wildcard: "cherry-pitter" },
      hotel: { ...firstRoom.hotel!, gardenRewardsGranted: 1 } };
    expect(canEditReel(intermission)).toBe(true);
    const secondRound = send(send(intermission, swap), { type: "DECLINE_UPGRADE" });
    expect(secondRound.hotel?.challenge?.rounds?.current).toBe(2);
    expect(canEditReel(secondRound)).toBe(false);
    expect(decodeRunStateV2(secondRound)).toEqual(secondRound);
  });

  it("cannot refund paid candle/part costs or reset once-per-block flags by cycling reserve hardware", () => {
    let state = ready({ service: "chapel", tips: 10, omen: 4, partSlots: [{ id: "votive-candle", level: 1 }, null, null, null, null],
      shiftFlags: { ...ready().shiftFlags, warrantyPaid: true, martyrEnabled: true, returnedFoodCount: 1 } });
    state = send(state, { type: "LIGHT_CANDLE" });
    state = send(state, { type: "UPGRADE_PART", slot: 0 });
    const charged = state;
    for (let index = 0; index < 4; index++) state = send(state, shelve);
    expect(state.tips).toBe(6);
    expect(state.omen).toBe(1);
    expect(state.counters.votiveCharge).toBe(0);
    expect(state.shiftFlags).toEqual(charged.shiftFlags);
    expect(state.bankroll).toBe(charged.bankroll);
    expect(state.partSlots[0]?.level).toBe(2);
  });

  it("serializes and verifies workbench commands through the real action archive", () => {
    const library = startArchivedRun(initializeLibrary(), 12);
    const session = openArchiveSession(activeRecord(library)!.snapshot);
    const commands: GameCommand[] = [
      { type: "SELECT_SERVICE", serviceId: session.record.snapshot.serviceCandidates[0] },
      { type: "SET_BUILD_NAME", name: "My machine" }, shelve, swap
    ];
    for (const command of commands) {
      const before = session.record.snapshot;
      const result = dispatchCommand(before, command);
      expect(result.ok).toBe(true);
      recordAction(session, before, command, result);
    }
    const reloaded = activeRecord(readLibrary())!;
    expect(reloaded.snapshot.workbench?.name).toBe("My machine");
    expect(reloaded.entries.at(-1)?.changes.reels).toBeDefined();
    expect(verifyArchive(reloaded)).toContain("核验通过");
  });

  it("forks the prior rules version without changing its original snapshot, entries or archive", () => {
    const library = startArchivedRun(initializeLibrary(), 12);
    const source = { ...activeRecord(library)!, rulesVersion: "rules-845e52cdfe9b1204" };
    const original = structuredClone(source);
    expect(canMigrateArchive(source)).toBe(true);
    const migrated = migrateArchive({ ...library, runs: [source] }, source);
    const active = activeRecord(migrated)!;
    expect(active.rulesVersion).toBe(RULES_VERSION);
    expect(active.parentId).toBe(source.id);
    expect(active.snapshot).toEqual(original.snapshot);
    expect(migrated.runs.find((run) => run.id === source.id)).toEqual(original);
    expect(source).toEqual(original);
  });

  it.each(["SPINNING", "AWAITING_INTERVENTION", "RESOLVING_EFFECTS"] as const)("keeps a pre-workbench %s checkpoint intact and safely resumes its pending spin", (phase) => {
    const library = startArchivedRun(initializeLibrary(), 17);
    const session = openArchiveSession(activeRecord(library)!.snapshot);
    const perform = (command: GameCommand): void => {
      const before = session.record.snapshot;
      recordAction(session, before, command, dispatchCommand(before, command));
    };
    perform({ type: "SELECT_SERVICE", serviceId: session.record.snapshot.serviceCandidates[0] });
    perform({ type: "SPIN" });
    if (phase !== "SPINNING") perform({ type: "REELS_STOPPED" });
    if (phase === "RESOLVING_EFFECTS") perform({ type: "ACCEPT_OUTCOME" });
    const source = { ...session.record, rulesVersion: "rules-845e52cdfe9b1204" };
    const old = structuredClone(source);
    const migrated = migrateArchive({ ...session.library, runs: [source] }, source);
    const active = activeRecord(migrated)!;
    expect(active.snapshot).toEqual(old.snapshot);
    const resumed = openArchiveSession(active.snapshot);
    const commands: GameCommand[] = [
      ...(phase === "SPINNING" ? [{ type: "REELS_STOPPED" } as const] : []),
      ...(phase !== "RESOLVING_EFFECTS" ? [{ type: "ACCEPT_OUTCOME" } as const] : []),
      { type: "PRESENTATION_COMPLETE" }
    ];
    for (const command of commands) {
      const before = resumed.record.snapshot;
      recordAction(resumed, before, command, dispatchCommand(before, command));
    }
    expect(resumed.record.snapshot.pendingSpin).toBeNull();
    expect(resumed.record.snapshot.rng).toEqual(source.snapshot.rng);
    expect(resumed.record.snapshot.spinHistory).toHaveLength(1);
    expect(verifyArchive(resumed.record)).toContain("核验通过");
    expect(readLibrary().runs.find((run) => run.id === source.id)).toEqual(old);
  });
});
