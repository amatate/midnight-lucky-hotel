/// <reference lib="webworker" />

import { estimateMachine } from "@/sim/monte-carlo";
import type { EstimateRequest, EstimateWorkerError, EstimateWorkerResponse } from "@/sim/types";

interface EstimatePostTarget {
  postMessage(message: EstimateWorkerResponse): void;
}

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function serializableError(error: unknown): EstimateWorkerError["error"] {
  let name = "Error";
  let message = "Unknown estimate error";
  try {
    if (error instanceof Error) {
      name = typeof error.name === "string" ? error.name : name;
      message = typeof error.message === "string" ? error.message : message;
    } else if (isRecord(error)) {
      name = typeof error.name === "string" ? error.name : name;
      message = typeof error.message === "string" ? error.message : message;
    } else {
      message = String(error);
    }
  } catch {
    // Keep the stable primitive fallback when hostile error accessors throw.
  }
  return { name, message };
}

function errorResponse(requestId: string, error: unknown): EstimateWorkerError {
  return {
    type: "ESTIMATE_ERROR",
    requestId,
    error: serializableError(error)
  };
}

export function handleEstimateMessage(message: unknown): EstimateWorkerResponse {
  let requestId = "";
  try {
    if (!isRecord(message)) throw new TypeError("estimate worker message must be an object");
    const candidateRequestId = message.requestId;
    if (typeof candidateRequestId !== "string") throw new TypeError("requestId must be a string");
    requestId = candidateRequestId;
    if (message.type !== "ESTIMATE") throw new TypeError("worker message type must be ESTIMATE");
    if (!isRecord(message.request)) throw new TypeError("request must be an object");
    return {
      type: "ESTIMATE_RESULT",
      requestId,
      estimate: estimateMachine(message.request as unknown as EstimateRequest)
    };
  } catch (error) {
    return errorResponse(requestId, error);
  }
}

export function postEstimateResponse(scope: EstimatePostTarget, message: unknown): void {
  const response = handleEstimateMessage(message);
  try {
    scope.postMessage(response);
  } catch (error) {
    try {
      scope.postMessage(errorResponse(response.requestId, error));
    } catch {
      // There is no remaining reporting channel if even the primitive fallback cannot be cloned.
    }
  }
}

if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) {
  const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;
  workerScope.onmessage = (event: MessageEvent<unknown>) => {
    postEstimateResponse(workerScope, event.data);
  };
}
