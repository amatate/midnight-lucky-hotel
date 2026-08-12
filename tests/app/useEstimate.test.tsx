import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEstimate } from "@/app/useEstimate";
import { createRun } from "@/core/run";
import type { EstimateWorkerRequest, MachineEstimate } from "@/sim/types";

const ESTIMATE: MachineEstimate = {
  band: "near-break-even",
  symbolProbabilities: null,
  rtpMean: null,
  rtp95: null,
  payoutStandardDeviation: null,
  ruinProbability: null,
  expectedAffordableSpins: null
};

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  constructor() {
    FakeWorker.instances.push(this);
  }
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

describe("useEstimate", () => {
  it("terminates its module worker as soon as the guarded result arrives", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const { result } = renderHook(() => useEstimate(createRun(22)));

    await act(() => vi.advanceTimersByTimeAsync(120));
    const worker = FakeWorker.instances[0]!;
    const request = worker.postMessage.mock.calls[0]![0] as EstimateWorkerRequest;
    await act(async () => worker.onmessage?.({
      data: { type: "ESTIMATE_RESULT", requestId: request.requestId, estimate: ESTIMATE }
    } as MessageEvent));

    expect(result.current).toEqual({ estimate: ESTIMATE, status: "ready" });
    expect(worker.terminate).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(result.current).toEqual({ estimate: ESTIMATE, status: "ready" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("clears every deadline when the guarded worker returns an error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const { result } = renderHook(() => useEstimate(createRun(25)));

    await act(() => vi.advanceTimersByTimeAsync(120));
    const worker = FakeWorker.instances[0]!;
    const request = worker.postMessage.mock.calls[0]![0] as EstimateWorkerRequest;
    await act(async () => worker.onmessage?.({
      data: { type: "ESTIMATE_ERROR", requestId: request.requestId, error: { name: "Error", message: "failed" } }
    } as MessageEvent));

    expect(result.current.status).toBe("unavailable");
    expect(worker.terminate).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(result.current.status).toBe("unavailable");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("measures pending and unavailable deadlines from dependency start", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const { result } = renderHook(() => useEstimate(createRun(23)));

    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(result.current.status).toBe("idle");
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.status).toBe("pending");
    await act(() => vi.advanceTimersByTimeAsync(1249));
    expect(result.current.status).toBe("pending");
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.status).toBe("unavailable");
    expect(FakeWorker.instances[0]!.terminate).toHaveBeenCalledOnce();
  });

  it("keeps a synchronous fallback failure unavailable after every deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", undefined);
    const state = { ...createRun(24), bankroll: Number.NaN };
    const { result } = renderHook(() => useEstimate(state));

    await act(() => vi.advanceTimersByTimeAsync(120));
    expect(result.current.status).toBe("unavailable");
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(result.current.status).toBe("unavailable");
  });
});
