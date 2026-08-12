/// <reference lib="webworker" />

import { estimateMachine } from "@/sim/monte-carlo";
import type { EstimateWorkerRequest, EstimateWorkerResponse } from "@/sim/types";

export function handleEstimateMessage(message: EstimateWorkerRequest): EstimateWorkerResponse {
  try {
    return {
      type: "ESTIMATE_RESULT",
      requestId: message.requestId,
      estimate: estimateMachine(message.request)
    };
  } catch (error) {
    return {
      type: "ESTIMATE_ERROR",
      requestId: message.requestId,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) {
  const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;
  workerScope.onmessage = (event: MessageEvent<EstimateWorkerRequest>) => {
    workerScope.postMessage(handleEstimateMessage(event.data));
  };
}
