import { BASE_PAYTABLE } from "@/content/base-machine";
import { consumeSafetyFuse } from "@/content/effects/neutral";
import { UPGRADES } from "@/content/upgrades";
import { evaluateBaseWins } from "@/core/paylines";
import { roundMoney } from "@/core/progression";
import { nextInt } from "@/core/random";
import { drawReels } from "@/core/reels";
import { createRun } from "@/core/run";
import { resolveSpin } from "@/core/settlement";
import type { PartInstance, ReelSet, RngState, RunState, SymbolId, UpgradeId } from "@/core/types";
import { confidenceInterval95, mean, sampleVariance } from "@/sim/statistics";
import type { EstimateRequest, MachineEstimate } from "@/sim/types";

const SYMBOL_IDS = ["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"] as const;
const MAX_HORIZON_SPINS = 10_000;
const MAX_SAMPLE_COUNT = 100_000;
const MAX_SIMULATED_SPINS = 1_000_000;
const MAX_MONEY = Number.MAX_SAFE_INTEGER / 100;

interface ValidatedRequest extends Omit<EstimateRequest, "reels" | "parts"> {
  readonly reels: ReelSet;
  readonly parts: readonly PartInstance[];
}

interface TrajectoryResult {
  readonly rtp: number;
  readonly ruined: boolean;
  readonly completedSpins: number;
}

function validatePositiveInteger(name: string, value: number, maximum: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(`${name} must be a positive integer no greater than ${maximum}`);
  }
}

function normalizeRequestReels(value: unknown): ReelSet {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new RangeError("reels must contain exactly three nonempty symbol strips");
  }
  value.forEach((candidate) => {
    if (!Array.isArray(candidate) || candidate.length === 0) {
      throw new RangeError("reels must contain exactly three nonempty symbol strips");
    }
  });
  return drawReels(value as unknown as ReelSet, { value: 0 }).strips;
}

function validateParts(parts: readonly PartInstance[]): readonly PartInstance[] {
  if (!Array.isArray(parts) || parts.length > 5) throw new RangeError("parts must contain at most five parts");
  const seen = new Set<string>();
  return parts.map((part) => {
    if (
      part === null ||
      typeof part !== "object" ||
      typeof part.id !== "string" ||
      !Object.hasOwn(UPGRADES, part.id) ||
      UPGRADES[part.id as UpgradeId].kind !== "part" ||
      (part.level !== 1 && part.level !== 2) ||
      seen.has(part.id)
    ) {
      throw new RangeError("parts must contain unique valid part instances");
    }
    seen.add(part.id);
    return { ...part };
  });
}

function validateRequest(request: EstimateRequest): ValidatedRequest {
  if (!Number.isFinite(request.bankroll) || request.bankroll < 0 || request.bankroll > MAX_MONEY) {
    throw new RangeError("bankroll must be finite and nonnegative within the supported money range");
  }
  if (
    !Number.isFinite(request.bet) ||
    request.bet <= 0 ||
    request.bet > MAX_MONEY ||
    roundMoney(request.bet) <= 0
  ) {
    throw new RangeError("bet must be finite and positive");
  }
  validatePositiveInteger("horizonSpins", request.horizonSpins, MAX_HORIZON_SPINS);
  validatePositiveInteger("sampleCount", request.sampleCount, MAX_SAMPLE_COUNT);
  if (request.horizonSpins * request.sampleCount > MAX_SIMULATED_SPINS) {
    throw new RangeError(`simulation work must not exceed ${MAX_SIMULATED_SPINS} spins`);
  }
  if (!Number.isFinite(request.simulationSeed)) throw new RangeError("simulationSeed must be finite");
  if (request.toolLevel !== 0 && request.toolLevel !== 1 && request.toolLevel !== 2 && request.toolLevel !== 3) {
    throw new RangeError("toolLevel must be 0, 1, 2, or 3");
  }
  return {
    ...request,
    bankroll: roundMoney(request.bankroll),
    bet: roundMoney(request.bet),
    reels: normalizeRequestReels(request.reels),
    parts: validateParts(request.parts)
  };
}

function sampleRng(seed: number, sampleIndex: number): RngState {
  let rng: RngState = { value: seed >>> 0 };
  const mixedIndex = nextInt({ value: (sampleIndex ^ 0x9e37_79b9) >>> 0 }, 0x1_0000_0000);
  rng = nextInt(rng, 0x1_0000_0000).rng;
  return { value: (rng.value ^ mixedIndex.value) >>> 0 };
}

function partSlots(parts: readonly PartInstance[]): RunState["partSlots"] {
  return Array.from({ length: 5 }, (_unused, slot) => parts[slot] === undefined ? null : { ...parts[slot]! }) as unknown as RunState["partSlots"];
}

function initialState(request: ValidatedRequest, rng: RngState): RunState {
  const base = createRun(0);
  return {
    ...base,
    initialSeed: request.simulationSeed >>> 0,
    rng,
    phase: "READY_TO_SPIN",
    bankroll: roundMoney(request.bankroll),
    baseBet: roundMoney(request.bet),
    betMode: "normal",
    reels: request.reels.map((strip) => [...strip]) as unknown as ReelSet,
    partSlots: partSlots(request.parts),
    service: null,
    serviceCandidates: ["repair", "kitchen", "chapel"],
    interventionPoints: 0,
    maxInterventionPoints: 0,
    afterHoursLevel: 0,
    toolLevel: request.toolLevel
  };
}

function attemptFuse(state: RunState, bet: number): {
  readonly state: RunState;
  readonly payout: number;
} {
  if (state.bankroll >= bet || state.freeSpinQueue > 0) return { state, payout: 0 };
  const rescue = consumeSafetyFuse(state);
  return rescue.consumed ? { state: rescue.state, payout: rescue.payout } : { state, payout: 0 };
}

function simulateGeneral(request: ValidatedRequest, sampleIndex: number): TrajectoryResult {
  let state = initialState(request, sampleRng(request.simulationSeed, sampleIndex));
  let totalWager = 0;
  let totalPayout = 0;
  let completedSpins = 0;
  let ruined = false;

  while (completedSpins < request.horizonSpins) {
    const rescue = attemptFuse(state, request.bet);
    state = rescue.state;
    totalPayout = roundMoney(totalPayout + rescue.payout);
    const isFree = state.freeSpinQueue > 0;
    if (!isFree && state.bankroll < request.bet) {
      ruined = true;
      break;
    }

    const bankroll = isFree ? state.bankroll : roundMoney(state.bankroll - request.bet);
    if (!isFree) totalWager = roundMoney(totalWager + request.bet);
    const draw = drawReels(state.reels, state.rng);
    const settlementState: RunState = {
      ...state,
      phase: "AWAITING_INTERVENTION",
      bankroll,
      rng: draw.rng,
      freeSpinQueue: isFree ? state.freeSpinQueue - 1 : state.freeSpinQueue,
      shiftWager: isFree ? state.shiftWager : roundMoney(state.shiftWager + request.bet),
      expenses: isFree
        ? state.expenses
        : { ...state.expenses, wagers: roundMoney(state.expenses.wagers + request.bet) },
      pendingSpin: { draw, isFree }
    };
    const settlement = resolveSpin(settlementState, draw);
    totalPayout = roundMoney(totalPayout + settlement.payout);
    state = { ...settlement.state, phase: "READY_TO_SPIN", pendingSpin: null };
    completedSpins += 1;
  }

  return { rtp: totalWager === 0 ? 0 : totalPayout / totalWager, ruined, completedSpins };
}

function simulateBase(request: ValidatedRequest, sampleIndex: number): TrajectoryResult {
  let rng = sampleRng(request.simulationSeed, sampleIndex);
  let bankroll = roundMoney(request.bankroll);
  let totalWager = 0;
  let totalPayout = 0;
  let completedSpins = 0;

  while (completedSpins < request.horizonSpins && bankroll >= request.bet) {
    bankroll = roundMoney(bankroll - request.bet);
    totalWager = roundMoney(totalWager + request.bet);
    const draw = drawReels(request.reels, rng);
    rng = draw.rng;
    const payout = evaluateBaseWins(draw.grid, BASE_PAYTABLE).reduce(
      (total, win) => roundMoney(total + win.multiplier * request.bet),
      0
    );
    bankroll = roundMoney(bankroll + payout);
    totalPayout = roundMoney(totalPayout + payout);
    completedSpins += 1;
  }

  return {
    rtp: totalWager === 0 ? 0 : totalPayout / totalWager,
    ruined: completedSpins < request.horizonSpins,
    completedSpins
  };
}

function symbolProbabilities(reels: ReelSet): readonly Record<SymbolId, number>[] {
  return reels.map((strip) => Object.fromEntries(SYMBOL_IDS.map((symbol) => [
    symbol,
    strip.filter((candidate) => candidate === symbol).length / strip.length
  ])) as Record<SymbolId, number>);
}

function bandForRtp(rtp: number): MachineEstimate["band"] {
  return rtp < 0.9 ? "danger" : rtp <= 1.05 ? "near-break-even" : "favorable";
}

export function estimateMachine(rawRequest: EstimateRequest): MachineEstimate {
  const request = validateRequest(rawRequest);
  const containsFood = request.reels.some((strip) => strip.includes("food"));
  const simulate = request.parts.length === 0 && !containsFood ? simulateBase : simulateGeneral;
  const results = Array.from({ length: request.sampleCount }, (_unused, sampleIndex) => simulate(request, sampleIndex));
  const rtps = results.map(({ rtp }) => rtp);
  const rtpMean = mean(rtps);
  const probabilities = symbolProbabilities(request.reels);
  const rtp95 = confidenceInterval95(rtps);
  const standardDeviation = Math.sqrt(sampleVariance(rtps));
  const ruinProbability = results.filter(({ ruined }) => ruined).length / results.length;
  const expectedAffordableSpins = mean(results.map(({ completedSpins }) => completedSpins));

  return {
    band: bandForRtp(rtpMean),
    symbolProbabilities: request.toolLevel >= 1 ? probabilities : null,
    rtpMean: request.toolLevel >= 2 ? rtpMean : null,
    rtp95: request.toolLevel >= 2 ? rtp95 : null,
    payoutStandardDeviation: request.toolLevel >= 3 ? standardDeviation : null,
    ruinProbability: request.toolLevel >= 3 ? ruinProbability : null,
    expectedAffordableSpins: request.toolLevel >= 3
      ? Math.min(request.horizonSpins, expectedAffordableSpins)
      : null
  };
}
