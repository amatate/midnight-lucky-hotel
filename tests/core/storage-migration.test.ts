import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameEvent } from "@/core/events";
import type { RunState } from "@/core/types";
import {
  clearRun,
  LEGACY_RUN_STORAGE_KEY,
  loadRun,
  RUN_STORAGE_KEY,
  saveRun
} from "@/persistence/storage";

function accept(state: RunState, command: Parameters<typeof dispatchCommand>[1]): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type} fixture failed: ${result.error.message}`);
  return result.state;
}

function readyState(seed = 201): RunState {
  const initial = createRun(seed);
  return accept(initial, { type: "SELECT_SERVICE", serviceId: initial.serviceCandidates[0] });
}

function awaitingWinningState(seed = 202): RunState {
  let state = accept(readyState(seed), { type: "SPIN" });
  state = accept(state, { type: "REELS_STOPPED" });
  return {
    ...state,
    pendingSpin: {
      ...state.pendingSpin!,
      draw: {
        ...state.pendingSpin!.draw,
        grid: [
          ["blank", "lemon", "blank"],
          ["blank", "wild", "blank"],
          ["blank", "lemon", "blank"]
        ]
      }
    }
  };
}

function asV1(state: RunState): Record<string, unknown> {
  const snapshot = structuredClone(state) as unknown as Record<string, unknown>;
  snapshot.schemaVersion = 1;
  delete snapshot.spinHistory;
  delete snapshot.nextSpinOrdinal;
  if (snapshot.pendingSpin !== null && typeof snapshot.pendingSpin === "object") {
    delete (snapshot.pendingSpin as Record<string, unknown>).bankrollBefore;
    delete (snapshot.pendingSpin as Record<string, unknown>).wager;
  }
  return snapshot;
}

function writeLegacy(state: RunState): void {
  localStorage.setItem(LEGACY_RUN_STORAGE_KEY, JSON.stringify(asV1(state)));
}

describe("schema v1 migration", () => {
  beforeEach(() => localStorage.clear());

  it("migrates a READY v1 snapshot without inventing history and persists v2", () => {
    const ready = readyState();
    const legacy = asV1(ready);
    localStorage.setItem("midnight-lucky-hotel.run.v1", JSON.stringify(legacy));

    const loaded = loadRun();

    expect(loaded).toEqual({ ok: true, state: expect.objectContaining({
      schemaVersion: 2,
      spinHistory: [],
      nextSpinOrdinal: 1,
      rng: ready.rng,
      bankroll: ready.bankroll
    }) });
    expect(localStorage.getItem(RUN_STORAGE_KEY)).not.toBeNull();
  });

  it.each([
    ["paid", false, 10],
    ["free", true, 0]
  ] as const)("recovers %s SPINNING metadata without advancing RNG", (_label, isFree, wager) => {
    const ready = { ...readyState(203), freeSpinQueue: isFree ? 1 : 0 };
    const spinning = accept(ready, { type: "SPIN" });
    writeLegacy(spinning);

    const loaded = loadRun();

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.rng).toEqual(spinning.rng);
    expect(loaded.state.pendingSpin).toEqual({
      draw: spinning.pendingSpin!.draw,
      isFree,
      bankrollBefore: spinning.bankroll + wager,
      wager
    });
    expect(asV1(loaded.state)).toEqual(asV1(spinning));
  });

  it("migrates the last resolving segment into exactly one legacy-formula receipt", () => {
    const resolving = accept(awaitingWinningState(), { type: "ACCEPT_OUTCOME" });
    writeLegacy(resolving);

    const loaded = loadRun();

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.spinHistory).toHaveLength(1);
    expect(loaded.state.nextSpinOrdinal).toBe(2);
    expect(loaded.state.spinHistory[0]).toMatchObject({
      ordinal: 1,
      bankrollAfter: resolving.bankroll,
      finalGrid: resolving.pendingSpin!.draw.grid
    });
    expect(loaded.state.spinHistory[0]!.awards).not.toHaveLength(0);
    expect(loaded.state.spinHistory[0]!.awards.every((award) => award.formula.kind === "legacy-unavailable")).toBe(true);
    expect(loaded.state.rng).toEqual(resolving.rng);
  });

  it("accepts historical amount-only v1 payout events but marks their receipt formulas unavailable", () => {
    const resolving = accept(awaitingWinningState(204), { type: "ACCEPT_OUTCOME" });
    const expectedAmount = resolving.pendingEvents.find((event) => event.type === "LINE_WIN")?.amount;
    expect(expectedAmount).toBeDefined();
    const legacy = asV1(resolving);
    legacy.pendingEvents = (legacy.pendingEvents as GameEvent[]).map((event) => {
      if (event.type !== "LINE_WIN") return event;
      const { preMultiplierAmount: _pre, appliedMultiplier: _multiplier, ...amountOnly } = event;
      return amountOnly;
    });
    localStorage.setItem(LEGACY_RUN_STORAGE_KEY, JSON.stringify(legacy));

    const loaded = loadRun();

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.spinHistory[0]!.awards).toEqual([
      expect.objectContaining({ kind: "line", formula: { kind: "legacy-unavailable" } })
    ]);
    expect(loaded.state.pendingEvents).toContainEqual(expect.objectContaining({
      type: "LINE_WIN",
      preMultiplierAmount: expectedAmount,
      appliedMultiplier: 1,
      amount: expectedAmount
    }));
  });

  it("blocks v1 fallback when a present v2 snapshot is invalid", () => {
    writeLegacy(readyState(205));
    localStorage.setItem(RUN_STORAGE_KEY, "{");

    expect(loadRun()).toEqual({ ok: false, reason: "INVALID_SNAPSHOT" });
  });

  it("rejects oversized, unconserved, unknown-award, and formula-less v2 receipts", () => {
    const resolving = accept(awaitingWinningState(206), { type: "ACCEPT_OUTCOME" });
    const receipt = resolving.spinHistory[0]!;
    const cases: unknown[] = [
      {
        ...resolving,
        spinHistory: Array.from({ length: 101 }, (_unused, index) => ({ ...receipt, ordinal: index + 1 })),
        nextSpinOrdinal: 102
      },
      {
        ...resolving,
        spinHistory: [{ ...receipt, bankrollAfter: receipt.bankrollAfter + 1 }]
      },
      {
        ...resolving,
        spinHistory: [{ ...receipt, awards: [{ ...receipt.awards[0], kind: "mystery" }] }]
      },
      {
        ...resolving,
        pendingEvents: resolving.pendingEvents.map((event) => {
          if (event.type !== "LINE_WIN") return event;
          const { preMultiplierAmount: _pre, appliedMultiplier: _multiplier, ...amountOnly } = event;
          return amountOnly;
        })
      }
    ];

    for (const snapshot of cases) {
      localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(snapshot));
      expect(loadRun()).toEqual({ ok: false, reason: "INVALID_SNAPSHOT" });
    }
  });

  it("leaves the in-memory state and receipt usable when v2 storage is denied", () => {
    const resolving = accept(awaitingWinningState(207), { type: "ACCEPT_OUTCOME" });
    const before = structuredClone(resolving);
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("denied"); });

    expect(() => saveRun(resolving)).not.toThrow();
    expect(resolving).toEqual(before);
    expect(resolving.spinHistory).toHaveLength(1);
    set.mockRestore();
  });

  it("attempts both storage-key removals even when the first removal is denied", () => {
    const remove = vi.spyOn(Storage.prototype, "removeItem")
      .mockImplementationOnce(() => { throw new DOMException("denied"); })
      .mockImplementation(() => undefined);

    expect(() => clearRun()).not.toThrow();
    expect(remove).toHaveBeenNthCalledWith(1, RUN_STORAGE_KEY);
    expect(remove).toHaveBeenNthCalledWith(2, LEGACY_RUN_STORAGE_KEY);
    remove.mockRestore();
  });

  it("returns INVALID_SNAPSHOT rather than throwing when storage reads are denied", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("denied"); });

    expect(loadRun()).toEqual({ ok: false, reason: "INVALID_SNAPSHOT" });
    get.mockRestore();
  });
});
