import { describe, expect, it, vi } from "vitest";
import { BASE_REELS } from "@/content/base-machine";
import { handleEstimateMessage, postEstimateResponse } from "@/sim/worker";

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

  it.each([
    ["null", null],
    ["primitive", 7],
    ["wrong discriminator", { type: "NOPE", requestId: "wrong", request: {} }],
    ["missing request id", { type: "ESTIMATE", request: {} }],
    ["missing request", { type: "ESTIMATE", requestId: "missing" }]
  ])("returns a serializable error without throwing for malformed %s envelopes", (_name, message) => {
    expect(() => handleEstimateMessage(message)).not.toThrow();
    const result = handleEstimateMessage(message);

    expect(result.type).toBe("ESTIMATE_ERROR");
    expect(() => structuredClone(result)).not.toThrow();
  });

  it("does not reread a poisoned request-id getter while constructing the error", () => {
    const message = Object.defineProperty({}, "requestId", {
      get(): never {
        throw new Error("poisoned request id");
      }
    });

    expect(() => handleEstimateMessage(message)).not.toThrow();
    expect(() => structuredClone(handleEstimateMessage(message))).not.toThrow();
  });

  it("posts a serializable fallback if posting the estimate result fails", () => {
    const posted: unknown[] = [];
    let attempts = 0;
    const scope = {
      postMessage(value: unknown): void {
        attempts += 1;
        if (attempts === 1) throw new DOMException("cannot clone", "DataCloneError");
        posted.push(value);
      }
    };

    expect(() => postEstimateResponse(scope, {
      type: "ESTIMATE",
      requestId: "clone-failure",
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
    })).not.toThrow();
    expect(posted).toEqual([{
      type: "ESTIMATE_ERROR",
      requestId: "clone-failure",
      error: { name: "DataCloneError", message: "cannot clone" }
    }]);
    expect(() => structuredClone(posted[0])).not.toThrow();
  });

  it("swallows an unrecoverable second post failure at the worker boundary", () => {
    const scope = {
      postMessage(): never {
        throw new DOMException("cannot clone", "DataCloneError");
      }
    };

    expect(() => postEstimateResponse(scope, null)).not.toThrow();
  });
});
