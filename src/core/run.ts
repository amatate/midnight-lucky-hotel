import { BASE_REELS } from "@/content/base-machine";
import { BASE_PAYTABLE } from "@/content/base-machine";
import { consumeSafetyFuse } from "@/content/effects/neutral";
import { enableMartyr, pray } from "@/content/services/chapel";
import { buyFood } from "@/content/services/kitchen";
import { lockAndRespinOthers, removeCracks } from "@/content/services/repair";
import { kickReel } from "@/content/services/security";
import { generateCandidates } from "@/core/candidates";
import { generateContract, updateContract } from "@/core/contracts";
import type { DispatchResult, GameCommand } from "@/core/commands";
import type { GameEvent, GameEventDraft } from "@/core/events";
import { getCurrentBet, getMinimumBet, roundMoney } from "@/core/progression";
import { evaluateBaseWins } from "@/core/paylines";
import { nextInt } from "@/core/random";
import { advanceReel, drawReels, normalizeDrawIdentity } from "@/core/reels";
import { resolveSpin } from "@/core/settlement";
import type { ReelIndex, ReelSet, RngState, RunPhase, RunState, ServiceId } from "@/core/types";
import { applyUpgrade, declineUpgrade } from "@/core/upgrades";

const SERVICES: readonly ServiceId[] = ["repair", "kitchen", "chapel", "security"];

function cloneReels(reels: ReelSet): ReelSet {
  return [[...reels[0]], [...reels[1]], [...reels[2]]];
}

function reelsForNextDraw(state: RunState): ReelSet {
  return [
    [...state.reels[0], ...state.temporaryReelAdditions[0]],
    [...state.reels[1], ...state.temporaryReelAdditions[1]],
    [...state.reels[2], ...state.temporaryReelAdditions[2]]
  ];
}

function chooseServiceCandidates(rng: RngState): {
  readonly candidates: readonly [ServiceId, ServiceId, ServiceId];
  readonly rng: RngState;
} {
  const remaining = [...SERVICES];
  const selected: ServiceId[] = [];
  let nextRng = rng;

  for (let index = 0; index < 3; index += 1) {
    const result = nextInt(nextRng, remaining.length);
    selected.push(remaining.splice(result.value, 1)[0]!);
    nextRng = result.rng;
  }

  return {
    candidates: selected as [ServiceId, ServiceId, ServiceId],
    rng: nextRng
  };
}

function sequenceEvents(state: RunState, drafts: readonly GameEventDraft[]): readonly GameEvent[] {
  const start = state.pendingEvents.length + 1;
  return drafts.map((event, index) => ({ ...event, sequence: start + index }) as GameEvent);
}

function accepted(state: RunState, command: GameCommand, events: readonly GameEvent[], patch: Partial<RunState>): DispatchResult {
  return {
    ok: true,
    events,
    state: {
      ...state,
      ...patch,
      pendingEvents: [...state.pendingEvents, ...events],
      commandHistory: [...state.commandHistory, command]
    }
  };
}

function rejected(
  state: RunState,
  code: "INVALID_PHASE" | "INSUFFICIENT_FUNDS" | "INVALID_TARGET" | "RESOURCE_EXHAUSTED",
  message: string
): DispatchResult {
  return { ok: false, state, error: { code, message } };
}

function invalidPhase(state: RunState, command: GameCommand): DispatchResult {
  return rejected(state, "INVALID_PHASE", `${command.type} is invalid during ${state.phase}`);
}

function supportsPhase(state: RunState, phase: RunPhase): boolean {
  return state.phase === phase;
}

function safetyFuseRescue(state: RunState): {
  readonly state: RunState;
  readonly events: readonly GameEvent[];
} | null {
  const fuse = state.partSlots.find((part) => part?.id === "safety-fuse");
  if (fuse === undefined || fuse === null) return null;
  const result = consumeSafetyFuse(state);
  if (!result.consumed) return null;
  const events = sequenceEvents(state, [
    { type: "PART_TRIGGERED", partId: "safety-fuse", level: fuse.level },
    { type: "PAYOUT_ADDED", amount: result.payout, source: "part" }
  ]);
  return { state: result.state, events };
}

export function createRun(seed: number): RunState {
  const serviceChoice = chooseServiceCandidates({ value: seed });

  return {
    schemaVersion: 1,
    initialSeed: seed,
    rng: serviceChoice.rng,
    phase: "CHOOSING_SERVICE",
    bankroll: 100,
    checkoutTarget: 200,
    shift: 1,
    baseSpinsInShift: 0,
    shiftWager: 0,
    shiftPayout: 0,
    baseBet: 10,
    betMode: "normal",
    interventionPoints: 2,
    maxInterventionPoints: 2,
    nextShiftFocusBonus: 0,
    interventionUsedThisSpin: false,
    reels: cloneReels(BASE_REELS),
    temporaryReelAdditions: [[], [], []],
    pendingPrayer: null,
    pendingSpin: null,
    freeSpinQueue: 0,
    service: null,
    serviceCandidates: serviceChoice.candidates,
    tips: 0,
    agitation: 0,
    omen: 0,
    counters: { blankCharge: 0, cherryWinsThisShift: 0 },
    shiftFlags: {
      foodBought: false,
      prayerUsed: false,
      kickUsed: false,
      repairLockUsed: false,
      martyrEnabled: false,
      warrantyPaid: false,
      returnedFoodCount: 0
    },
    partSlots: [null, null, null, null, null],
    toolLevel: 0,
    buffs: [],
    contract: null,
    afterHoursLevel: 0,
    exitUnlocked: false,
    currentCandidates: null,
    acquiredUpgrades: [],
    pendingEvents: [],
    attribution: { base: 0, part: 0, intervention: 0, service: 0, agitation: 0, overload: 0 },
    expenses: { wagers: 0, kitchen: 0, chapel: 0, repair: 0 },
    shiftHistory: [],
    commandHistory: []
  };
}

function selectService(state: RunState, command: Extract<GameCommand, { type: "SELECT_SERVICE" }>): DispatchResult {
  if (!supportsPhase(state, "CHOOSING_SERVICE")) return invalidPhase(state, command);
  if (!state.serviceCandidates.includes(command.serviceId)) {
    return rejected(state, "INVALID_TARGET", "service is not an offered candidate");
  }
  const baseMaximum = command.serviceId === "repair" ? 3 : 2;
  const selectedState: RunState = {
    ...state,
    phase: "READY_TO_SPIN",
    service: command.serviceId,
    interventionPoints: baseMaximum,
    maxInterventionPoints: baseMaximum
  };
  const contractResult = generateContract(selectedState);
  return accepted(state, command, [], {
    phase: "READY_TO_SPIN",
    service: command.serviceId,
    interventionPoints: baseMaximum,
    maxInterventionPoints: baseMaximum,
    contract: contractResult.contract,
    rng: contractResult.rng
  });
}

function setBetMode(state: RunState, command: Extract<GameCommand, { type: "SET_BET_MODE" }>): DispatchResult {
  if (!supportsPhase(state, "READY_TO_SPIN")) return invalidPhase(state, command);
  return accepted(state, command, [], { betMode: command.mode });
}

function spin(state: RunState, command: Extract<GameCommand, { type: "SPIN" }>): DispatchResult {
  if (!supportsPhase(state, "READY_TO_SPIN")) return invalidPhase(state, command);

  const isFree = state.freeSpinQueue > 0;
  const bet = getCurrentBet(state);
  if (!isFree && state.bankroll < getMinimumBet(state)) {
    const rescue = safetyFuseRescue(state);
    if (rescue !== null) {
      return accepted(rescue.state, command, rescue.events, { phase: "READY_TO_SPIN" });
    }
    const events = sequenceEvents(state, [{ type: "RUN_ENDED", outcome: "lost" }]);
    return accepted(state, command, events, { phase: "RUN_LOST" });
  }
  if (!isFree && state.bankroll < bet) {
    return rejected(state, "INSUFFICIENT_FUNDS", "bankroll is below the current bet");
  }

  const draw = drawReels(reelsForNextDraw(state), state.rng);
  const drafts: GameEventDraft[] = isFree
    ? [
        { type: "RESOURCE_CHANGED", resource: "freeSpins", delta: -1 },
        { type: "REELS_DRAWN", draw }
      ]
    : [
        { type: "BET_PLACED", amount: bet },
        { type: "REELS_DRAWN", draw }
      ];
  const events = sequenceEvents(state, drafts);

  return accepted(state, command, events, {
    phase: "SPINNING",
    bankroll: isFree ? state.bankroll : roundMoney(state.bankroll - bet),
    rng: draw.rng,
    shiftWager: isFree ? state.shiftWager : roundMoney(state.shiftWager + bet),
    freeSpinQueue: isFree ? state.freeSpinQueue - 1 : state.freeSpinQueue,
    pendingSpin: { draw, isFree },
    interventionUsedThisSpin: state.interventionUsedThisSpin,
    expenses: isFree ? state.expenses : { ...state.expenses, wagers: roundMoney(state.expenses.wagers + bet) }
  });
}

function reelsStopped(state: RunState, command: Extract<GameCommand, { type: "REELS_STOPPED" }>): DispatchResult {
  if (!supportsPhase(state, "SPINNING")) return invalidPhase(state, command);
  if (state.pendingSpin === null) return rejected(state, "INVALID_TARGET", "there is no pending spin");
  const draw = state.pendingSpin.draw.preInterventionPaying === undefined
    ? {
        ...state.pendingSpin.draw,
        preInterventionPaying: evaluateBaseWins(state.pendingSpin.draw.grid, BASE_PAYTABLE).length > 0
      }
    : state.pendingSpin.draw;
  return accepted(state, command, [], {
    phase: "AWAITING_INTERVENTION",
    pendingSpin: { ...state.pendingSpin, draw }
  });
}

function isReelIndex(value: number): value is ReelIndex {
  return value === 0 || value === 1 || value === 2;
}

function respinReel(state: RunState, command: Extract<GameCommand, { type: "RESPIN_REEL" }>): DispatchResult {
  if (!supportsPhase(state, "AWAITING_INTERVENTION")) return invalidPhase(state, command);
  if (!isReelIndex(command.reelIndex)) return rejected(state, "INVALID_TARGET", "reel index must be 0, 1, or 2");
  if (state.interventionUsedThisSpin) {
    return rejected(state, "RESOURCE_EXHAUSTED", "an intervention was already used this spin");
  }
  if (state.interventionPoints <= 0) {
    return rejected(state, "RESOURCE_EXHAUSTED", "no intervention points remain");
  }
  if (state.pendingSpin === null) return rejected(state, "INVALID_TARGET", "there is no pending spin");

  const normalizedDraw = normalizeDrawIdentity(state.pendingSpin.draw);
  const stripLength = normalizedDraw.strips[command.reelIndex].length;
  if (stripLength <= 1) return rejected(state, "INVALID_TARGET", "selected reel cannot move to a different stop");

  const randomOffset = nextInt(state.rng, stripLength - 1);
  const advanced = advanceReel(normalizedDraw, command.reelIndex, randomOffset.value + 1);
  const draw = { ...advanced, rng: randomOffset.rng };
  const events = sequenceEvents(state, [
    { type: "INTERVENTION_USED", kind: "respin", target: command.reelIndex },
    { type: "REELS_DRAWN", draw }
  ]);

  return accepted(state, command, events, {
    phase: "SPINNING",
    rng: randomOffset.rng,
    pendingSpin: { ...state.pendingSpin, draw },
    interventionPoints: state.interventionPoints - 1,
    interventionUsedThisSpin: true
  });
}

function acceptOutcome(state: RunState, command: Extract<GameCommand, { type: "ACCEPT_OUTCOME" }>): DispatchResult {
  if (!supportsPhase(state, "AWAITING_INTERVENTION")) return invalidPhase(state, command);
  if (state.pendingSpin === null) return rejected(state, "INVALID_TARGET", "there is no pending spin");

  const settlement = resolveSpin(state, state.pendingSpin.draw);
  return accepted(settlement.state, command, settlement.events, {
    phase: "RESOLVING_EFFECTS",
  });
}

function presentationComplete(
  state: RunState,
  command: Extract<GameCommand, { type: "PRESENTATION_COMPLETE" }>
): DispatchResult {
  if (!supportsPhase(state, "RESOLVING_EFFECTS")) return invalidPhase(state, command);
  if (state.pendingSpin === null) return rejected(state, "INVALID_TARGET", "there is no pending spin");

  const baseSpinsInShift = state.pendingSpin.isFree ? state.baseSpinsInShift : state.baseSpinsInShift + 1;
  const completedPaidBlock = state.freeSpinQueue === 0 && baseSpinsInShift >= 3;
  const belowMinimum = state.bankroll < getMinimumBet(state) && state.freeSpinQueue === 0;
  const rescue = belowMinimum ? safetyFuseRescue(state) : null;
  const transitionState = rescue?.state ?? state;
  const blockBankroll = transitionState.bankroll;
  const finalPayout = state.pendingEvents.reduce(
    (total, event) => event.type === "LINE_WIN" && event.source === "base" ? roundMoney(total + event.amount) : total,
    0
  );
  const evidenceDrafts: GameEventDraft[] = [{
    type: "SPIN_COMMITTED",
    interventionUsed: state.interventionUsedThisSpin,
    preInterventionPaying: state.pendingSpin.draw.preInterventionPaying ?? false,
    finalPayout
  }];
  if (completedPaidBlock) evidenceDrafts.push({ type: "BLOCK_COMPLETED", bankroll: blockBankroll });
  const evidence = evidenceDrafts.map((event, index) => ({ ...event, sequence: index + 1 }) as GameEvent);
  const updatedContract = transitionState.contract === null
    ? null
    : updateContract(transitionState.contract, [...state.pendingEvents, ...evidence]);
  const contractChanged = updatedContract !== null && transitionState.contract !== null && (
    updatedContract.progress !== transitionState.contract.progress ||
    updatedContract.completed !== transitionState.contract.completed ||
    updatedContract.interventionsUsed !== transitionState.contract.interventionsUsed
  );
  const rewardTip = updatedContract?.completed === true && !updatedContract.rewardClaimed;
  const contract = rewardTip ? { ...updatedContract, rewardClaimed: true } : updatedContract;
  const exitUnlocked = transitionState.exitUnlocked || (completedPaidBlock && blockBankroll >= transitionState.checkoutTarget);
  const isFifthLoss = completedPaidBlock && transitionState.afterHoursLevel === 0 &&
    transitionState.shift >= 5 && blockBankroll < transitionState.checkoutTarget;
  const unactionableLoss = !completedPaidBlock && belowMinimum && rescue === null;
  const nextPhase: RunPhase = state.freeSpinQueue > 0
    ? "READY_TO_SPIN"
    : completedPaidBlock
      ? transitionState.afterHoursLevel > 0
        ? "AFTER_HOURS"
        : transitionState.shift < 5
          ? "CHOOSING_UPGRADE"
          : isFifthLoss
            ? "RUN_LOST"
            : "SHIFT_COMPLETE"
      : unactionableLoss
        ? "RUN_LOST"
        : "READY_TO_SPIN";
  const boundaryOffersUpgrade = nextPhase === "CHOOSING_UPGRADE" || nextPhase === "AFTER_HOURS";
  const candidateResult = boundaryOffersUpgrade
    ? generateCandidates({ ...transitionState, baseSpinsInShift })
    : null;
  const snapshot = completedPaidBlock
    ? {
        shift: transitionState.shift,
        ...(transitionState.afterHoursLevel > 0 ? { afterHoursLevel: transitionState.afterHoursLevel } : {}),
        bankroll: blockBankroll,
        reels: cloneReels(transitionState.reels),
        parts: transitionState.partSlots.filter((part) => part !== null),
        totalWager: transitionState.shiftWager,
        totalPayout: transitionState.shiftPayout
      }
    : null;
  const hasSnapshot = snapshot !== null && transitionState.shiftHistory.at(-1)?.shift === snapshot.shift &&
    (transitionState.shiftHistory.at(-1)?.afterHoursLevel ?? 0) === (snapshot.afterHoursLevel ?? 0);
  const drafts: GameEventDraft[] = [];
  if (contractChanged && contract !== null) {
    drafts.push({ type: "CONTRACT_PROGRESS", contractId: contract.id, progress: contract.progress, completed: contract.completed });
  }
  if (rewardTip) drafts.push({ type: "RESOURCE_CHANGED", resource: "tips", delta: 1 });
  if (rescue !== null) drafts.push(...rescue.events.map(({ sequence: _sequence, ...event }) => event));
  if (nextPhase === "RUN_LOST") drafts.push({ type: "RUN_ENDED", outcome: "lost" });
  const events = drafts.map((event, index) => ({ ...event, sequence: index + 1 }) as GameEvent);

  return {
    ok: true,
    events,
    state: {
      ...transitionState,
      phase: nextPhase,
      baseSpinsInShift,
      rng: candidateResult?.rng ?? transitionState.rng,
      currentCandidates: candidateResult?.candidates ?? null,
      contract,
      tips: transitionState.tips + (rewardTip ? 1 : 0),
      exitUnlocked,
      shiftHistory: snapshot !== null && !hasSnapshot
        ? [...transitionState.shiftHistory, snapshot]
        : transitionState.shiftHistory,
      pendingSpin: null,
      interventionUsedThisSpin: false,
      pendingEvents: [],
      commandHistory: [...transitionState.commandHistory, command]
    }
  };
}

function rerollCandidates(state: RunState, command: Extract<GameCommand, { type: "REROLL_CANDIDATES" }>): DispatchResult {
  if (state.phase !== "CHOOSING_UPGRADE" && state.phase !== "AFTER_HOURS") return invalidPhase(state, command);
  if (state.currentCandidates === null) return rejected(state, "INVALID_TARGET", "there are no current upgrade candidates");
  if (state.tips < 1) return rejected(state, "RESOURCE_EXHAUSTED", "no tips remain");
  const result = generateCandidates(state);
  const event = sequenceEvents(state, [{ type: "RESOURCE_CHANGED", resource: "tips", delta: -1 }]);
  return accepted(state, command, event, { tips: state.tips - 1, rng: result.rng, currentCandidates: result.candidates });
}

function cashOut(state: RunState, command: Extract<GameCommand, { type: "CASH_OUT" }>): DispatchResult {
  const boundary = state.phase === "CHOOSING_UPGRADE" || state.phase === "SHIFT_COMPLETE" || state.phase === "AFTER_HOURS";
  if (!boundary) return invalidPhase(state, command);
  if (!state.exitUnlocked) return rejected(state, "INVALID_TARGET", "checkout target has not been reached");
  const events = sequenceEvents(state, [{ type: "RUN_ENDED", outcome: "won" }]);
  return accepted(state, command, events, { phase: "RUN_WON" });
}

function resetForAfterHoursBlock(state: RunState, level: number): RunState {
  const baseMaximum = state.service === "repair" ? 3 : 2;
  const nextMaximum = baseMaximum + state.nextShiftFocusBonus;
  const reset: RunState = {
    ...state,
    phase: "READY_TO_SPIN",
    afterHoursLevel: level,
    baseSpinsInShift: 0,
    shiftWager: 0,
    shiftPayout: 0,
    interventionPoints: nextMaximum,
    maxInterventionPoints: nextMaximum,
    nextShiftFocusBonus: 0,
    interventionUsedThisSpin: false,
    temporaryReelAdditions: [[], [], []],
    pendingPrayer: null,
    pendingSpin: null,
    currentCandidates: null,
    counters: { ...state.counters, cherryWinsThisShift: 0 },
    shiftFlags: {
      foodBought: false,
      prayerUsed: false,
      kickUsed: false,
      repairLockUsed: false,
      martyrEnabled: false,
      warrantyPaid: false,
      returnedFoodCount: 0
    }
  };
  const generated = generateContract(reset);
  return { ...reset, contract: generated.contract, rng: generated.rng };
}

function continueRun(state: RunState, command: Extract<GameCommand, { type: "CONTINUE" }>): DispatchResult {
  if (state.phase === "SHIFT_COMPLETE") {
    if (!state.exitUnlocked) return rejected(state, "INVALID_TARGET", "checkout target has not been reached");
    const next = resetForAfterHoursBlock(state, 1);
    return accepted(state, command, [], next);
  }
  if (state.phase === "AFTER_HOURS") {
    if (state.currentCandidates !== null) {
      return rejected(state, "INVALID_TARGET", "choose or decline the after-hours upgrade first");
    }
    const next = resetForAfterHoursBlock(state, state.afterHoursLevel + 1);
    return accepted(state, command, [], next);
  }
  return invalidPhase(state, command);
}

export function dispatchCommand(state: RunState, command: GameCommand): DispatchResult {
  switch (command.type) {
    case "SELECT_SERVICE":
      return selectService(state, command);
    case "SET_BET_MODE":
      return setBetMode(state, command);
    case "BUY_FOOD":
      return buyFood(state, command.reelIndex);
    case "PRAY":
      return pray(state, command.symbol);
    case "ENABLE_MARTYR":
      return enableMartyr(state);
    case "SPIN":
      return spin(state, command);
    case "REELS_STOPPED":
      return reelsStopped(state, command);
    case "RESPIN_REEL":
      return respinReel(state, command);
    case "LOCK_AND_RESPIN_OTHERS":
      return lockAndRespinOthers(state, command.lockedReelIndex);
    case "KICK_REEL":
      return kickReel(state, command.reelIndex);
    case "ACCEPT_OUTCOME":
      return acceptOutcome(state, command);
    case "PRESENTATION_COMPLETE":
      return presentationComplete(state, command);
    case "CHOOSE_UPGRADE":
      return applyUpgrade(state, command.choice);
    case "DECLINE_UPGRADE":
      return declineUpgrade(state);
    case "REMOVE_CRACKS":
      return removeCracks(state, command.reelIndex);
    case "REROLL_CANDIDATES":
      return rerollCandidates(state, command);
    case "CASH_OUT":
      return cashOut(state, command);
    case "CONTINUE":
      return continueRun(state, command);
  }
}
