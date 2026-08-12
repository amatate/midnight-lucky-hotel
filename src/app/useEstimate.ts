import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentBet } from "@/core/progression";
import type { RunState } from "@/core/types";
import { estimateMachine } from "@/sim/monte-carlo";
import type { EstimateRequest, EstimateWorkerResponse, MachineEstimate } from "@/sim/types";

export type EstimateStatus = "idle" | "pending" | "ready" | "unavailable";

export interface EstimateResult {
  readonly estimate: MachineEstimate | null;
  readonly status: EstimateStatus;
}

export function useEstimate(state: RunState): EstimateResult {
  const requestSequence = useRef(0);
  const [estimate, setEstimate] = useState<MachineEstimate | null>(null);
  const [status, setStatus] = useState<EstimateStatus>("idle");
  const partsKey = state.partSlots.map((part) => part === null ? "-" : `${part.id}:${part.level}`).join("|");
  const reelsKey = state.reels.map((reel) => reel.join(",")).join("|");
  const bet = getCurrentBet(state);

  const request = useMemo<EstimateRequest>(() => ({
    reels: state.reels,
    parts: state.partSlots.filter((part) => part !== null),
    toolLevel: state.toolLevel,
    bankroll: state.bankroll,
    bet,
    horizonSpins: 12,
    sampleCount: 24,
    simulationSeed: state.initialSeed ^ state.rng.value
  }), [reelsKey, partsKey, state.toolLevel, state.bankroll, bet, state.initialSeed, state.rng.value]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    let worker: Worker | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    let unavailableTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    setEstimate(null);
    setStatus("idle");

    const clearDeadlines = () => {
      if (pendingTimer !== undefined) clearTimeout(pendingTimer);
      if (unavailableTimer !== undefined) clearTimeout(unavailableTimer);
    };
    const unavailable = () => {
      if (cancelled || sequence !== requestSequence.current) return;
      clearDeadlines();
      worker?.terminate();
      worker = null;
      setStatus("unavailable");
    };

    pendingTimer = setTimeout(() => {
      if (!cancelled && sequence === requestSequence.current) setStatus("pending");
    }, 250);
    unavailableTimer = setTimeout(unavailable, 1500);

    const debounceTimer = setTimeout(() => {
      if (cancelled || sequence !== requestSequence.current) return;

      const finish = (nextEstimate: MachineEstimate) => {
        if (cancelled || sequence !== requestSequence.current) return;
        clearDeadlines();
        worker?.terminate();
        worker = null;
        setEstimate(nextEstimate);
        setStatus("ready");
      };

      if (typeof Worker === "undefined") {
        try {
          finish(estimateMachine(request));
        } catch {
          unavailable();
        }
        return;
      }

      const requestId = `estimate-${sequence}`;
      try {
        worker = new Worker(new URL("../sim/worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<EstimateWorkerResponse>) => {
          const response = event.data;
          if (response.requestId !== requestId) return;
          if (response.type === "ESTIMATE_ERROR") {
            unavailable();
            return;
          }
          finish(response.estimate);
        };
        worker.onerror = () => {
          unavailable();
        };
        worker.postMessage({ type: "ESTIMATE", requestId, request });
      } catch {
        worker?.terminate();
        worker = null;
        try {
          finish(estimateMachine(request));
        } catch {
          unavailable();
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      clearDeadlines();
      worker?.terminate();
    };
  }, [request]);

  return { estimate, status };
}
