import type {
  AttributionSource,
  ExpenseSource,
  PartInstance,
  ReelSet,
  SymbolId,
  UpgradeId
} from "@/core/types";

export interface EstimateRequest {
  readonly reels: ReelSet;
  readonly parts: readonly PartInstance[];
  readonly toolLevel: 0 | 1 | 2 | 3;
  readonly bankroll: number;
  readonly bet: number;
  readonly horizonSpins: number;
  readonly sampleCount: number;
  readonly simulationSeed: number;
}

export interface MachineEstimate {
  readonly band: "danger" | "near-break-even" | "favorable";
  readonly symbolProbabilities: readonly Record<SymbolId, number>[] | null;
  readonly rtpMean: number | null;
  readonly rtp95: readonly [number, number] | null;
  /** Sample standard deviation of per-trajectory RTP observations. */
  readonly payoutStandardDeviation: number | null;
  readonly ruinProbability: number | null;
  readonly expectedAffordableSpins: number | null;
}

export interface RunSummaryData {
  readonly rtpTrajectory: readonly MachineEstimate[];
  readonly largestIncomeSource: AttributionSource;
  readonly largestExpenseSource: ExpenseSource;
  readonly incompleteSynergy: UpgradeId | null;
  readonly explanation: string;
}

export interface EstimateWorkerRequest {
  readonly type: "ESTIMATE";
  readonly requestId: string;
  readonly request: EstimateRequest;
}

export interface EstimateWorkerResult {
  readonly type: "ESTIMATE_RESULT";
  readonly requestId: string;
  readonly estimate: MachineEstimate;
}

export interface EstimateWorkerError {
  readonly type: "ESTIMATE_ERROR";
  readonly requestId: string;
  readonly error: {
    readonly name: string;
    readonly message: string;
  };
}

export type EstimateWorkerResponse = EstimateWorkerResult | EstimateWorkerError;
