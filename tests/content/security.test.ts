import { describe, expect, it } from "vitest";
import { kickReel, previewKick } from "@/content/services/security";
import { dispatchCommand, createRun } from "@/core/run";
import { resolveSpin, type EffectHandler } from "@/core/settlement";
import type { ReelDraw, ReelSet, RunState } from "@/core/types";

function readyKickState(patch: Partial<RunState> = {}): RunState {
  const strips: ReelSet = [
    ["cherry", "lemon", "bell", "seven"],
    ["lemon", "bell", "seven", "cherry"],
    ["bell", "seven", "cherry", "lemon"]
  ];
  const draw: ReelDraw = {
    strips,
    stops: [0, 1, 2],
    grid: [
      ["cherry", "lemon", "bell"],
      ["bell", "seven", "cherry"],
      ["cherry", "lemon", "bell"]
    ],
    rng: { value: 777 }
  };
  return {
    ...createRun(91),
    phase: "AWAITING_INTERVENTION",
    service: "security",
    reels: strips,
    pendingSpin: { draw, isFree: false },
    interventionPoints: 0,
    ...patch
  };
}

describe("security kick", () => {
  it("previews and executes the same deterministic one-step window without RNG or focus cost", () => {
    const state = readyKickState();
    const rng = state.rng;
    const preview = previewKick(state, 0);

    const result = kickReel(state, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(preview).toEqual(["lemon", "bell", "seven"]);
    expect(result.state.pendingSpin?.draw.grid[0]).toEqual(preview);
    expect(result.state.pendingSpin?.draw.stops[0]).toBe(1);
    expect(result.state.rng).toEqual(rng);
    expect(result.state.pendingSpin?.draw.rng).toEqual({ value: 777 });
    expect(result.state.interventionPoints).toBe(0);
    expect(result.state.interventionUsedThisSpin).toBe(true);
    expect(result.state.shiftFlags.kickUsed).toBe(true);
    expect(result.state.phase).toBe("SPINNING");
    expect(result.events).toEqual([
      { sequence: 1, type: "INTERVENTION_USED", kind: "kick", target: 0 },
      expect.objectContaining({ sequence: 2, type: "REELS_DRAWN" })
    ]);
    expect(result.state.commandHistory.at(-1)).toEqual({ type: "KICK_REEL", reelIndex: 0 });
  });

  it("appends one permanent crack after movement without changing the previewed window", () => {
    const state = readyKickState();
    const originalLength = state.reels[1].length;
    const preview = previewKick(state, 1);

    const result = kickReel(state, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.pendingSpin?.draw.grid[1]).toEqual(preview);
    expect(result.state.pendingSpin?.draw.strips[1]).toEqual([...state.pendingSpin!.draw.strips[1], "crack"]);
    expect(result.state.reels[1]).toEqual([...state.reels[1], "crack"]);
    expect(result.state.reels[1]).toHaveLength(originalLength + 1);
  });

  it.each([
    { level: 1 as const, step: 2, cracks: 2 },
    { level: 2 as const, step: 3, cracks: 2 }
  ])("uses equipped loose-spring level $level for a $step-step kick", ({ level, step, cracks }) => {
    const state = readyKickState({
      partSlots: [{ id: "loose-spring", level }, null, null, null, null]
    });
    const preview = previewKick(state, 0);

    const result = kickReel(state, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.pendingSpin?.draw.stops[0]).toBe(step);
    expect(result.state.pendingSpin?.draw.grid[0]).toEqual(preview);
    expect(result.state.pendingSpin?.draw.strips[0].slice(-cracks)).toEqual(Array(cracks).fill("crack"));
    expect(result.state.reels[0].slice(-cracks)).toEqual(Array(cracks).fill("crack"));
  });

  it("keeps prayer additions temporary and kick cracks permanent after settlement", () => {
    const permanent: ReelSet = [
      ["cherry", "lemon", "bell", "seven"],
      ["lemon", "bell", "seven", "cherry"],
      ["bell", "seven", "cherry", "lemon"]
    ];
    const state = readyKickState({
      reels: permanent,
      temporaryReelAdditions: [["seven", "seven"], ["seven", "seven"], ["seven", "seven"]],
      pendingPrayer: "seven",
      pendingSpin: {
        isFree: false,
        draw: {
          strips: [
            [...permanent[0], "seven", "seven"],
            [...permanent[1], "seven", "seven"],
            [...permanent[2], "seven", "seven"]
          ],
          stops: [0, 0, 0],
          grid: [
            ["cherry", "lemon", "bell"],
            ["lemon", "bell", "seven"],
            ["bell", "seven", "cherry"]
          ],
          rng: { value: 777 }
        }
      }
    });

    const kicked = kickReel(state, 0);
    expect(kicked.ok).toBe(true);
    if (!kicked.ok) throw new Error(kicked.error.message);
    expect(kicked.state.pendingSpin?.draw.strips[0]).toEqual([...permanent[0], "crack", "seven", "seven"]);

    let stopped = dispatchCommand(kicked.state, { type: "REELS_STOPPED" });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) throw new Error(stopped.error.message);
    const settled = dispatchCommand(stopped.state, { type: "ACCEPT_OUTCOME" });

    expect(settled.ok).toBe(true);
    if (!settled.ok) throw new Error(settled.error.message);
    expect(settled.state.reels[0]).toEqual([...permanent[0], "crack"]);
    expect(settled.state.reels[1]).toEqual(permanent[1]);
    expect(settled.state.reels[2]).toEqual(permanent[2]);
  });

  it.each([
    ["wrong phase", readyKickState({ phase: "READY_TO_SPIN" }), "INVALID_PHASE"],
    ["wrong service", readyKickState({ service: "chapel" }), "INVALID_TARGET"],
    ["missing draw", readyKickState({ pendingSpin: null }), "INVALID_TARGET"],
    ["used this spin", readyKickState({ interventionUsedThisSpin: true }), "RESOURCE_EXHAUSTED"],
    ["used this shift", readyKickState({ shiftFlags: { ...readyKickState().shiftFlags, kickUsed: true } }), "RESOURCE_EXHAUSTED"]
  ] as const)("rejects %s without mutating state", (_name, state, code) => {
    const snapshot = structuredClone(state);
    const result = kickReel(state, 1);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe(code);
    expect(result.state).toBe(state);
    expect(state).toEqual(snapshot);
  });

  it("lets prayer occupy the spin intervention and rejects kick through command dispatch", () => {
    const state = readyKickState({ interventionUsedThisSpin: true, interventionPoints: 2 });

    const result = dispatchCommand(state, { type: "KICK_REEL", reelIndex: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("RESOURCE_EXHAUSTED");
  });

  it("rejects an invalid reel and preview using the same legality checks", () => {
    const state = readyKickState();
    const invalid = 3 as 0;

    expect(() => previewKick(state, invalid)).toThrow(new RangeError("reel index must be 0, 1, or 2"));
    const result = kickReel(state, invalid);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("INVALID_TARGET");
  });

  it("keeps a one-symbol wrapped preview mapped to its original blank and hides the appended crack", () => {
    const strips: ReelSet = [["blank"], ["cherry", "lemon"], ["bell", "seven"]];
    const state = readyKickState({
      reels: strips,
      partSlots: [{ id: "blank-capacitor", level: 1 }, null, null, null, { id: "jam-jar", level: 1 }],
      pendingSpin: {
        isFree: false,
        draw: {
          strips,
          stops: [0, 0, 0],
          grid: [
            ["blank", "blank", "blank"],
            ["cherry", "lemon", "cherry"],
            ["bell", "seven", "bell"]
          ],
          rng: { value: 777 }
        }
      }
    });
    const preview = previewKick(state, 0);
    const kicked = kickReel(state, 0);

    expect(kicked.ok).toBe(true);
    if (!kicked.ok) throw new Error(kicked.error.message);
    expect(preview).toEqual(["blank", "blank", "blank"]);
    expect(kicked.state.pendingSpin?.draw.grid[0]).toEqual(preview);
    const settled = resolveSpin(kicked.state, kicked.state.pendingSpin!.draw);
    expect(settled.state.counters.blankCharge).toBe(1);
    expect(settled.events.filter((event) => event.type === "PART_DISABLED")).toHaveLength(0);
    expect(settled.state.reels[0]).toEqual(["blank", "crack"]);
  });

  it("keeps a two-symbol wrapped preview mapped to the shown entries for transformations", () => {
    const strips: ReelSet = [["blank", "lemon"], ["cherry", "bell"], ["seven", "lemon"]];
    const state = readyKickState({
      reels: strips,
      pendingSpin: {
        isFree: false,
        draw: {
          strips,
          stops: [0, 0, 0],
          grid: [
            ["blank", "lemon", "blank"],
            ["cherry", "bell", "cherry"],
            ["seven", "lemon", "seven"]
          ],
          rng: { value: 777 }
        }
      }
    });
    const preview = previewKick(state, 0);
    const kicked = kickReel(state, 0);
    expect(kicked.ok).toBe(true);
    if (!kicked.ok) throw new Error(kicked.error.message);
    expect(preview).toEqual(["lemon", "blank", "lemon"]);
    expect(kicked.state.pendingSpin?.draw.grid[0]).toEqual(preview);
    const transformShown: EffectHandler = (_context, signal) =>
      signal.type === "GRID_ACCEPTED"
        ? [{ type: "TRANSFORM_CELL", reel: 0, row: 0, symbol: "seven" }]
        : [];

    const settled = resolveSpin(kicked.state, kicked.state.pendingSpin!.draw, [
      { kind: "system", handler: transformShown }
    ]);

    expect(settled.state.reels[0]).toEqual(["blank", "seven", "crack"]);
    expect(settled.state.pendingSpin?.draw.grid[0]).toEqual(["seven", "blank", "seven"]);
  });

  it("removes one shown wrapped food entry once and retains the hidden appended crack", () => {
    const strips: ReelSet = [["food"], ["cherry", "lemon"], ["bell", "seven"]];
    const state = readyKickState({
      reels: strips,
      pendingSpin: {
        isFree: false,
        draw: {
          strips,
          stops: [0, 0, 0],
          grid: [
            ["food", "food", "food"],
            ["cherry", "lemon", "cherry"],
            ["bell", "seven", "bell"]
          ],
          rng: { value: 777 }
        }
      }
    });
    const kicked = kickReel(state, 0);
    expect(kicked.ok).toBe(true);
    if (!kicked.ok) throw new Error(kicked.error.message);

    const settled = resolveSpin(kicked.state, kicked.state.pendingSpin!.draw);

    expect(settled.events.filter((event) => event.type === "FOOD_CONSUMED")).toHaveLength(1);
    expect(settled.state.reels[0]).toEqual(["crack"]);
    expect(settled.state.buffs).toHaveLength(1);
  });

  it("canonicalizes malformed optional mapping metadata for preview, execution, and settlement", () => {
    const base = readyKickState();
    const malformed = {
      ...base,
      pendingSpin: {
        ...base.pendingSpin!,
        draw: {
          ...base.pendingSpin!.draw,
          entryIds: [null, { nope: true }, Array(4)],
          visibleSourceIds: [Array(3), null, { nope: true }]
        } as unknown as ReelDraw
      }
    };

    expect(() => previewKick(malformed, 0)).not.toThrow();
    const kicked = kickReel(malformed, 0);
    expect(kicked.ok).toBe(true);
    if (!kicked.ok) throw new Error(kicked.error.message);
    expect(() => resolveSpin(kicked.state, kicked.state.pendingSpin!.draw)).not.toThrow();
    expect(kicked.state.pendingSpin?.draw.entryIds?.every((ids) =>
      ids.every((id) => Number.isSafeInteger(id))
    )).toBe(true);
  });
});
