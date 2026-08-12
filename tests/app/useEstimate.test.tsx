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
  });
});
