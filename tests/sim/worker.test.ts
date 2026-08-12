import { describe, expect, it, vi } from "vitest";
import { BASE_REELS } from "@/content/base-machine";
import { handleEstimateMessage } from "@/sim/worker";

describe("accountant worker protocol", () => {
  it("does not install a worker listener when imported on the DOM main thread", async () => {
    const priorListener = globalThis.onmessage;
    const mainThreadListener = vi.fn();
    globalThis.onmessage = mainThreadListener;

    try {
      vi.resetModules();
      await import("@/sim/worker");

      expect(globalThis.onmessage).toBe(mainThreadListener);
    } finally {
      globalThis.onmessage = priorListener;
    }
  });

  it("returns a serializable estimate result with the matching request id", () => {
    const result = handleEstimateMessage({
      type: "ESTIMATE",
      requestId: "estimate-1",
      request: {
        reels: BASE_REELS,
        parts: [],
        toolLevel: 0,
        bankroll: 100,
        bet: 10,
        horizonSpins: 1,
        sampleCount: 1,
        simulationSeed: 1
      }
    });

    expect(result).toMatchObject({ type: "ESTIMATE_RESULT", requestId: "estimate-1" });
    expect(() => structuredClone(result)).not.toThrow();
  });

  it("turns validation failures into serializable error responses", () => {
    const result = handleEstimateMessage({
      type: "ESTIMATE",
      requestId: "estimate-bad",
      request: {
        reels: BASE_REELS,
        parts: [],
        toolLevel: 0,
        bankroll: 100,
        bet: 0,
        horizonSpins: 1,
        sampleCount: 1,
        simulationSeed: 1
      }
    });

    expect(result).toEqual({
      type: "ESTIMATE_ERROR",
      requestId: "estimate-bad",
      error: { name: "RangeError", message: "bet must be finite and positive" }
    });
    expect(() => structuredClone(result)).not.toThrow();
  });
});
