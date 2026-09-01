import { safeMoney } from "@/core/money";
import { getCurrentBet } from "@/core/progression";
import type { GameEvent } from "@/core/events";
import type { PartId, ReceiptAward, RunState, SpinReceipt } from "@/core/types";
import { isGameEventV2 } from "@/persistence/codec-shared";
import type { GameEventV1, RunStateV1 } from "@/persistence/schema-v1";
import { decodeRunStateV2 } from "@/persistence/schema-v2";

interface MigratedEvents {
  readonly events: readonly GameEvent[];
  readonly opaqueSequences: ReadonlySet<number>;
}

function migrateEvents(events: readonly GameEventV1[]): MigratedEvents | null {
  const migrated: GameEvent[] = [];
  const opaqueSequences = new Set<number>();
  let lastTriggeredPart: PartId | null = null;

  for (const event of events) {
    if (event.type === "PART_TRIGGERED") lastTriggeredPart = event.partId;
    let next: unknown = event;
    if (event.type === "LINE_WIN" && !("preMultiplierAmount" in event)) {
      next = { ...event, preMultiplierAmount: event.amount, appliedMultiplier: 1 };
    } else if (event.type === "PAYOUT_ADDED" && !("preMultiplierAmount" in event)) {
      if (event.source === "overload") return null;
      if (event.source === "part") {
        if (lastTriggeredPart === null) return null;
        next = { ...event, preMultiplierAmount: event.amount, appliedMultiplier: 1, partId: lastTriggeredPart };
        if (lastTriggeredPart === "fruit-salad") opaqueSequences.add(event.sequence);
      } else {
        next = { ...event, preMultiplierAmount: event.amount, appliedMultiplier: 1 };
      }
    } else if (event.type === "OVERLOAD" && !("preMultiplierAmount" in event)) {
      next = { ...event, preMultiplierAmount: event.amount, appliedMultiplier: 1 };
    }
    if (!isGameEventV2(next)) return null;
    migrated.push(next);
  }
  return { events: migrated, opaqueSequences };
}

function legacyAward(event: GameEvent, opaqueSequences: ReadonlySet<number>): ReceiptAward | null {
  const formula = { kind: "legacy-unavailable" } as const;
  if (opaqueSequences.has(event.sequence) && event.type === "PAYOUT_ADDED") {
    return { sequence: event.sequence, kind: "opaque", formula, amount: event.amount };
  }
  switch (event.type) {
    case "LINE_WIN":
      return {
        sequence: event.sequence,
        kind: "line",
        lineId: event.lineId,
        symbol: event.symbol,
        source: event.source,
        formula,
        amount: event.amount
      };
    case "PATTERN_LINE_WIN":
      return {
        sequence: event.sequence,
        kind: "pattern-line",
        patternId: "fruit-salad",
        partId: "fruit-salad",
        lineId: event.lineId,
        formula,
        amount: event.amount
      };
    case "PAYOUT_ADDED":
      return event.source === "part"
        ? { sequence: event.sequence, kind: "part-bonus", source: "part", partId: event.partId, formula, amount: event.amount }
        : { sequence: event.sequence, kind: "bonus", source: event.source, formula, amount: event.amount };
    case "OVERLOAD":
      return { sequence: event.sequence, kind: "overload", source: "overload", formula, amount: event.amount };
    default:
      return null;
  }
}

function resolvingReceipt(
  state: RunStateV1,
  pendingSpin: NonNullable<RunState["pendingSpin"]>,
  migrated: MigratedEvents,
  wager: number
): SpinReceipt | null {
  const lastDrawIndex = migrated.events.findLastIndex((event) => event.type === "REELS_DRAWN");
  if (lastDrawIndex < 0) return null;
  const afterDraw = migrated.events.slice(lastDrawIndex + 1);
  const completionIndex = afterDraw.findIndex((event) => event.type === "PAYOUT_COMPLETE");
  if (completionIndex < 0 || afterDraw.slice(completionIndex + 1).some((event) => event.type === "PAYOUT_COMPLETE")) return null;
  const segment = afterDraw.slice(0, completionIndex + 1);
  const completion = segment.at(-1);
  if (completion?.type !== "PAYOUT_COMPLETE") return null;
  const awards = segment.flatMap((event) => {
    const award = legacyAward(event, migrated.opaqueSequences);
    return award === null ? [] : [award];
  });
  const totalPayout = awards.reduce((total, award) => safeMoney(total + award.amount), 0);
  if (totalPayout !== completion.total) return null;
  const bankrollAfter = state.bankroll;
  const bankrollBefore = safeMoney(bankrollAfter - totalPayout + wager);
  return {
    ordinal: 1,
    shift: state.shift,
    afterHoursLevel: state.afterHoursLevel,
    isFree: pendingSpin.isFree,
    baseSpinIndex: pendingSpin.isFree ? null : (state.baseSpinsInShift + 1) as 1 | 2 | 3,
    bankrollBefore,
    wager,
    finalGrid: pendingSpin.draw.grid,
    awards,
    totalPayout,
    bankrollAfter
  };
}

export function migrateRunStateV1(state: RunStateV1): RunState | null {
  try {
    const migratedEvents = migrateEvents(state.pendingEvents);
    if (migratedEvents === null) return null;
    const wager = state.pendingSpin?.isFree === true ? 0 : state.pendingSpin === null ? 0 : getCurrentBet(state);
    let pendingSpin = state.pendingSpin === null ? null : {
      ...state.pendingSpin,
      bankrollBefore: safeMoney(state.bankroll + wager),
      wager
    };
    let spinHistory: readonly SpinReceipt[] = [];
    let nextSpinOrdinal = 1;
    if (state.phase === "RESOLVING_EFFECTS") {
      if (pendingSpin === null) return null;
      const receipt = resolvingReceipt(state, pendingSpin, migratedEvents, wager);
      if (receipt === null) return null;
      pendingSpin = { ...pendingSpin, bankrollBefore: receipt.bankrollBefore };
      spinHistory = [receipt];
      nextSpinOrdinal = 2;
    }
    const {
      schemaVersion: _schemaVersion,
      pendingSpin: _pendingSpin,
      pendingEvents: _pendingEvents,
      ...rest
    } = state;
    const migrated: RunState = {
      ...rest,
      schemaVersion: 2,
      pendingSpin,
      pendingEvents: migratedEvents.events,
      spinHistory,
      nextSpinOrdinal
    };
    return decodeRunStateV2(migrated);
  } catch {
    return null;
  }
}
