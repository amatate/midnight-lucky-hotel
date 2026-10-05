import { beforeEach, describe, expect, it } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import { generateCandidates } from "@/core/candidates";
import { applyRouteKit, ROUTE_KITS } from "@/content/route-kits";
import { getBuildFit } from "@/content/build-fit";
import { routeReadiness } from "@/app/route-readiness";
import { eventLabel } from "@/app/archive-copy";
import { settlementEventLabel } from "@/app/components/WinPresentation";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { isGameEventV2 } from "@/persistence/codec-shared";
import { activeRecord, initializeLibrary, openArchiveSession, recordAction, exportArchive, importArchive,
  migrateArchive, canMigrateArchive, verifyArchive } from "@/persistence/archives";
import { saveRun } from "@/persistence/storage";
import type { GameCommand } from "@/core/commands";
import type { RunState, ServiceId } from "@/core/types";

const services = ["kitchen", "chapel", "security", "repair"] as const;
function initialFor(service: ServiceId): RunState {
  let seed = 8;
  while (!createRun(seed).serviceCandidates.includes(service)) seed++;
  return createRun(seed);
}
function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(result.error.message);
  expect(decodeRunStateV2(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state);
  return result.state;
}
beforeEach(() => localStorage.clear());
describe("route starters and readable builds", () => {
  it.each(services)("grants %s once, records it, and changes no random state itself", (service) => {
    const initial = initialFor(service); const before = structuredClone(initial);
    const kitOnly = applyRouteKit(initial, service);
    expect(kitOnly.rng).toEqual(initial.rng);
    const state = send(initial, { type: "SELECT_SERVICE", serviceId: service });
    expect(initial).toEqual(before);
    expect(state.partSlots[0]).toEqual({ id: ROUTE_KITS[service].part, level: 1 });
    expect(state.acquiredUpgrades).toEqual([ROUTE_KITS[service].part]);
    expect(state.tips).toBe(ROUTE_KITS[service].tips);
    expect(state.omen).toBe(ROUTE_KITS[service].omen);
    expect(applyRouteKit(state, service)).toBe(state);
    expect(dispatchCommand(state, { type: "SELECT_SERVICE", serviceId: service }).ok).toBe(false);
    const event = state.pendingEvents[0]!;
    expect(event.type).toBe("STARTER_GRANTED");
    expect(isGameEventV2(event)).toBe(true);
    expect(settlementEventLabel(state, event)).toBe(eventLabel(event));
    expect(state.reels.map((strip) => strip.length)).toEqual(service === "security" ? [13, 13, 13] : [12, 12, 12]);
    if (service === "chapel") expect(state.reels.map((s) => s.filter((symbol) => symbol === "seven").length)).toEqual([4, 4, 4]);
    if (service === "repair") expect(state.reels.map((s) => s.filter((symbol) => symbol === "cherry").length)).toEqual([6, 6, 6]);
  });
  it.each(services)("offers an opening connection for %s, preserving three unique choices", (service) => {
    const state = send(initialFor(service), { type: "SELECT_SERVICE", serviceId: service });
    const expected = { kitchen: ["cherry-pitter", "lemon-crate"], chapel: ["triple-blessing"], security: ["shock-absorber"], repair: ["cherry-pitter", "cherry-press"] }[service];
    for (let seed = 0; seed < 8; seed++) {
      const result = generateCandidates({ ...state, phase: "CHOOSING_UPGRADE", baseSpinsInShift: 3, rng: { value: seed } });
      expect(expected).toContain(result.candidates.synergy);
      expect(new Set(Object.values(result.candidates)).size).toBe(3);
      expect(result.rng.value).toBe((seed + 3 * 0x6d2b79f5) >>> 0);
    }
  });
  it("replays, exports and imports the starter and the first settled spin", () => {
    const session = openArchiveSession(initialFor("chapel"));
    for (const command of [{ type: "SELECT_SERVICE", serviceId: "chapel" }, { type: "LIGHT_CANDLE" }, { type: "PRAY", symbol: "seven" },
      { type: "SPIN" }, { type: "REELS_STOPPED" }, { type: "ACCEPT_OUTCOME" }, { type: "PRESENTATION_COMPLETE" }] satisfies GameCommand[]) {
      const before = session.record.snapshot;
      const result = dispatchCommand(before, command);
      expect(result.ok).toBe(true);
      recordAction(session, before, command, result);
      expect(session.warning).toBeNull();
    }
    expect(verifyArchive(session.record)).toContain("核验通过");
    const imported = importArchive(initializeLibrary(), exportArchive(session.record)).runs.at(-1)!;
    expect(verifyArchive(imported)).toContain("核验通过");
  });
  it.each(["CHOOSING_SERVICE", "SPINNING"] as const)("forks the previous pacing version at %s without injecting a starter or changing the draw", (phase) => {
    const { routeKits: _kit, ...bare } = initialFor("chapel");
    let state: RunState = bare;
    if (phase === "SPINNING") state = send(send(state, { type: "SELECT_SERVICE", serviceId: "chapel" }), { type: "SPIN" });
    saveRun(state);
    let library = initializeLibrary();
    library = importArchive(library, exportArchive({ ...activeRecord(library)!, rulesVersion: "rules-1f79cf61a16111a4" }));
    const old = library.runs.at(-1)!;
    expect(canMigrateArchive(old)).toBe(true);
    const fork = migrateArchive(library, old);
    expect(fork.runs.find((record) => record.id === old.id)).toEqual(old);
    const resumed = activeRecord(fork)!;
    expect(resumed.snapshot).toEqual(state);
    expect(verifyArchive(resumed)).toContain("核验通过");
    if (phase === "CHOOSING_SERVICE") expect(send(resumed.snapshot, { type: "SELECT_SERVICE", serviceId: "chapel" }).acquiredUpgrades).toEqual([]);
  });
  it("labels conflicting or inactive choices and does not favor them as reinforcement", () => {
    const state: RunState = { ...initialFor("kitchen"), service: "kitchen", shift: 2,
      partSlots: [{ id: "lemon-infection", level: 1 }, { id: "harvest-vat", level: 1 }, null, null, null],
      acquiredUpgrades: ["lemon-infection", "harvest-vat"] };
    expect(getBuildFit(state, "cherry-press").kind).toBe("conflict");
    expect(getBuildFit({ ...state, partSlots: [null, null, null, null, null] }, "salad-dressing").kind).toBe("setup");
    expect(getBuildFit(state, "lemon-crate").kind).toBe("fits");
    for (let seed = 0; seed < 12; seed++) expect(getBuildFit(state, generateCandidates({ ...state, rng: { value: seed } }).candidates.synergy).kind).toBe("fits");
  });
  it("shows real charge, conditional rewards, and physical crack counts without mutation", () => {
    const kitchen = send(initialFor("kitchen"), { type: "SELECT_SERVICE", serviceId: "kitchen" });
    const state: RunState = { ...kitchen, counters: { ...kitchen.counters, harvestCharge: 2 } };
    const before = structuredClone(state);
    expect(routeReadiness(state)).toMatchObject({ badge: "果桶 2/3", next: expect.stringContaining("+¥120") });
    expect(routeReadiness(state).detail).toContain("不是下一转保证中奖");
    expect(state).toEqual(before);
    expect(routeReadiness(send(initialFor("security"), { type: "SELECT_SERVICE", serviceId: "security" })).badge).toBe("裂纹 3 · 保护 1");
    const candle = send(send(initialFor("chapel"), { type: "SELECT_SERVICE", serviceId: "chapel" }), { type: "LIGHT_CANDLE" });
    expect(routeReadiness(candle)).toMatchObject({ badge: "烛台已存 2", next: expect.stringContaining("+¥40") });
    expect(decodeRunStateV2({ ...state, routeKits: false })).toBeNull();
    expect(isGameEventV2({ type: "STARTER_GRANTED", sequence: 1, partId: "votive-candle", tips: -1, omen: 0, cracks: 0 })).toBe(false);
  });
  it("does not recommend unavailable service actions after a build pivot", () => {
    const state: RunState = { ...initialFor("kitchen"), service: "kitchen",
      partSlots: [{ id: "triple-blessing", level: 1 }, null, null, null, null] };
    expect(routeReadiness(state).next).toContain("当前服务不能祈祷");
    expect(routeReadiness({ ...state, partSlots: [{ id: "shock-absorber", level: 1 }, null, null, null, null] }).next).toContain("当前服务不能踹击");
  });
});
