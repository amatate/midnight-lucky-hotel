import { BASE_PAYTABLE, BASE_REELS } from "@/content/base-machine";
import type { DispatchResult, GameCommand } from "@/core/commands";
import type { GameEvent, GameEventDraft } from "@/core/events";
import { evaluateBaseWins } from "@/core/paylines";
import { getCurrentBet, roundMoney } from "@/core/progression";
import { nextInt } from "@/core/random";
import { advanceReel, drawReels } from "@/core/reels";
import type { ReelIndex, ReelSet, RngState, RunPhase, RunState, ServiceId } from "@/core/types";

const SERVICES: readonly ServiceId[] = ["repair", "kitchen", "chapel", "security"];

function cloneReels(reels: ReelSet): ReelSet {
  return [[...reels[0]], [...reels[1]], [...reels[2]]];
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

function getMinimumBet(state: RunState): number {
  return roundMoney(state.baseBet * 0.5 * 1.25 ** state.afterHoursLevel);
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
  return accepted(state, command, [], { phase: "READY_TO_SPIN", service: command.serviceId });
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
    const events = sequenceEvents(state, [{ type: "RUN_ENDED", outcome: "lost" }]);
    return accepted(state, command, events, { phase: "RUN_LOST" });
  }
  if (!isFree && state.bankroll < bet) {
    return rejected(state, "INSUFFICIENT_FUNDS", "bankroll is below the current bet");
  }

  const draw = drawReels(state.reels, state.rng);
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
    interventionUsedThisSpin: false,
    expenses: isFree ? state.expenses : { ...state.expenses, wagers: roundMoney(state.expenses.wagers + bet) }
  });
}

function reelsStopped(state: RunState, command: Extract<GameCommand, { type: "REELS_STOPPED" }>): DispatchResult {
  if (!supportsPhase(state, "SPINNING")) return invalidPhase(state, command);
  if (state.pendingSpin === null) return rejected(state, "INVALID_TARGET", "there is no pending spin");
  return accepted(state, command, [], { phase: "AWAITING_INTERVENTION" });
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

  const stripLength = state.pendingSpin.draw.strips[command.reelIndex].length;
  if (stripLength <= 1) return rejected(state, "INVALID_TARGET", "selected reel cannot move to a different stop");

  const randomOffset = nextInt(state.rng, stripLength - 1);
  const advanced = advanceReel(state.pendingSpin.draw, command.reelIndex, randomOffset.value + 1);
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

  const bet = getCurrentBet(state);
  const wins = evaluateBaseWins(state.pendingSpin.draw.grid, BASE_PAYTABLE);
  const lineEvents: GameEventDraft[] = wins.map((win) => ({
    type: "LINE_WIN",
    lineId: win.lineId,
    symbol: win.symbol,
    amount: roundMoney(win.multiplier * bet),
    source: "base"
  }));
  const total = roundMoney(
    lineEvents.reduce((sum, event) => sum + (event.type === "LINE_WIN" ? event.amount : 0), 0)
  );
  const events = sequenceEvents(state, [...lineEvents, { type: "PAYOUT_COMPLETE", total }]);

  return accepted(state, command, events, {
    phase: "RESOLVING_EFFECTS",
    bankroll: roundMoney(state.bankroll + total),
    shiftPayout: roundMoney(state.shiftPayout + total),
    attribution: { ...state.attribution, base: roundMoney(state.attribution.base + total) }
  });
}

function presentationComplete(
  state: RunState,
  command: Extract<GameCommand, { type: "PRESENTATION_COMPLETE" }>
): DispatchResult {
  if (!supportsPhase(state, "RESOLVING_EFFECTS")) return invalidPhase(state, command);
  if (state.pendingSpin === null) return rejected(state, "INVALID_TARGET", "there is no pending spin");

  const baseSpinsInShift = state.pendingSpin.isFree ? state.baseSpinsInShift : state.baseSpinsInShift + 1;
  const isLost = state.bankroll < getMinimumBet(state) && state.freeSpinQueue === 0;
  const nextPhase: RunPhase = isLost
    ? "RUN_LOST"
    : state.freeSpinQueue > 0
      ? "READY_TO_SPIN"
    : baseSpinsInShift >= 3
      ? state.shift < 5
        ? "CHOOSING_UPGRADE"
        : "SHIFT_COMPLETE"
      : "READY_TO_SPIN";
  const events = isLost
    ? ([{ sequence: 1, type: "RUN_ENDED", outcome: "lost" }] as const satisfies readonly GameEvent[])
    : [];

  return {
    ok: true,
    events,
    state: {
      ...state,
      phase: nextPhase,
      baseSpinsInShift,
      pendingSpin: null,
      interventionUsedThisSpin: false,
      pendingEvents: events,
      commandHistory: [...state.commandHistory, command]
    }
  };
}

export function dispatchCommand(state: RunState, command: GameCommand): DispatchResult {
  switch (command.type) {
    case "SELECT_SERVICE":
      return selectService(state, command);
    case "SET_BET_MODE":
      return setBetMode(state, command);
    case "SPIN":
      return spin(state, command);
    case "REELS_STOPPED":
      return reelsStopped(state, command);
    case "RESPIN_REEL":
      return respinReel(state, command);
    case "ACCEPT_OUTCOME":
      return acceptOutcome(state, command);
    case "PRESENTATION_COMPLETE":
      return presentationComplete(state, command);
    case "CASH_OUT":
    case "CONTINUE":
      return invalidPhase(state, command);
  }
}
