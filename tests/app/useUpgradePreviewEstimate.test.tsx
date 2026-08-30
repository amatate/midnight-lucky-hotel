import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEstimateRequest, useEstimate } from "@/app/useEstimate";
import {
  buildUpgradePreviewRequest,
  useUpgradePreviewEstimate
} from "@/app/useUpgradePreviewEstimate";
import { createRun } from "@/core/run";
import type { RunState, UpgradeChoice } from "@/core/types";
import type { EstimateWorkerRequest, MachineEstimate } from "@/sim/types";

const CURRENT_ESTIMATE: MachineEstimate = {
  band: "near-break-even",
  symbolProbabilities: null,
  rtpMean: 0.92,
  rtp95: [0.87, 0.97],
  payoutStandardDeviation: null,
  ruinProbability: null,
  expectedAffordableSpins: null
};

const PROJECTED_ESTIMATE: MachineEstimate = {
  ...CURRENT_ESTIMATE,
  band: "favorable",
  rtpMean: 1.08,
  rtp95: [1.01, 1.15]
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

function upgradeState(patch: Partial<RunState> = {}): RunState {
  return {
    ...createRun(81),
    phase: "CHOOSING_UPGRADE",
    service: "chapel",
    bankroll: 37,
    toolLevel: 2,
    partSlots: [{ id: "omen-collector", level: 1 }, null, null, null, null],
    currentCandidates: { synergy: "tithe-box", pivot: "cherry-pitter", wildcard: "calculator" },
    ...patch
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

describe("upgrade preview estimates", () => {
  it("projects a reel modification through the real controller without mutating the run", () => {
    const state = upgradeState();
    const snapshot = structuredClone(state);
    const choice = {
      id: "tithe-box",
      action: "apply",
      target: { kind: "reel", reel: 0 }
    } as const satisfies UpgradeChoice;

    const before = buildEstimateRequest(state);
    const after = buildUpgradePreviewRequest(state, choice);

    expect(after).not.toBeNull();
    expect(state).toEqual(snapshot);
    expect(state.rng).toEqual(snapshot.rng);
    expect(after!.reels[0].filter((symbol) => symbol === "seven")).toHaveLength(2);
    expect(after!.parts).toEqual(before.parts);
    expect({ ...after, reels: before.reels, parts: before.parts }).toEqual(before);
    expect(after!.bankroll).toBe(37);
    expect(after!.simulationSeed).toBe(state.initialSeed ^ state.rng.value);
    expect(after!.horizonSpins).toBe(12);
    expect(after!.sampleCount).toBe(24);
  });

  it("keeps the current and projected worker requests paired except for machine configuration", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const state = upgradeState();
    const choice = {
      id: "tithe-box",
      action: "apply",
      target: { kind: "reel", reel: 1 }
    } as const satisfies UpgradeChoice;

    renderHook(() => ({
      current: useEstimate(state),
      projected: useUpgradePreviewEstimate(state, choice)
    }));
    await act(() => vi.advanceTimersByTimeAsync(120));

    expect(FakeWorker.instances).toHaveLength(2);
    const requests = FakeWorker.instances.map((worker) =>
      worker.postMessage.mock.calls[0]![0] as EstimateWorkerRequest
    );
    const before = requests.find((request) => request.request.reels[1].length === 12)!.request;
    const after = requests.find((request) => request.request.reels[1].length === 13)!.request;
    expect({ ...after, reels: before.reels, parts: before.parts }).toEqual(before);
    expect(after.bankroll).toBe(before.bankroll);
    expect(after.bet).toBe(before.bet);
    expect(after.toolLevel).toBe(before.toolLevel);
    expect(after.horizonSpins).toBe(before.horizonSpins);
    expect(after.sampleCount).toBe(before.sampleCount);
    expect(after.simulationSeed).toBe(before.simulationSeed);
  });

  it("does not build or run projected estimates before the ledger gate or for an invalid target", async () => {
    const choice = {
      id: "tithe-box",
      action: "apply",
      target: { kind: "reel", reel: 0 }
    } as const satisfies UpgradeChoice;
    expect(buildUpgradePreviewRequest(upgradeState({ toolLevel: 1 }), choice)).toBeNull();
    expect(buildUpgradePreviewRequest(upgradeState(), {
      id: "lemon-crate",
      action: "apply",
      target: { kind: "two-reels", reels: [0, 0] }
    })).toBeNull();

    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const { result } = renderHook(() => useUpgradePreviewEstimate(upgradeState({ toolLevel: 1 }), choice));
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(FakeWorker.instances).toHaveLength(0);
    expect(result.current).toEqual({ estimate: null, status: "idle" });
  });

  it("terminates a stale worker and ignores its result when the selected target changes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const state = upgradeState();
    const choiceFor = (reel: 0 | 1): UpgradeChoice => ({
      id: "tithe-box",
      action: "apply",
      target: { kind: "reel", reel }
    });
    const { result, rerender } = renderHook(
      ({ choice }: { readonly choice: UpgradeChoice }) => useUpgradePreviewEstimate(state, choice),
      { initialProps: { choice: choiceFor(0) } }
    );

    await act(() => vi.advanceTimersByTimeAsync(120));
    const staleWorker = FakeWorker.instances[0]!;
    const staleRequest = staleWorker.postMessage.mock.calls[0]![0] as EstimateWorkerRequest;
    rerender({ choice: choiceFor(1) });
    expect(staleWorker.terminate).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(120));
    const currentWorker = FakeWorker.instances[1]!;
    const currentRequest = currentWorker.postMessage.mock.calls[0]![0] as EstimateWorkerRequest;

    await act(async () => staleWorker.onmessage?.({
      data: { type: "ESTIMATE_RESULT", requestId: staleRequest.requestId, estimate: CURRENT_ESTIMATE }
    } as MessageEvent));
    expect(result.current.estimate).toBeNull();

    await act(async () => currentWorker.onmessage?.({
      data: { type: "ESTIMATE_RESULT", requestId: currentRequest.requestId, estimate: PROJECTED_ESTIMATE }
    } as MessageEvent));
    expect(result.current).toEqual({ estimate: PROJECTED_ESTIMATE, status: "ready" });
  });
});
