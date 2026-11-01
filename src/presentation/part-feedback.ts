import type { GameEvent } from "@/core/events";
import type { PartCounters, PartId, PartInstance, RunState, SpinReceipt } from "@/core/types";
import type { ActionEntry } from "@/persistence/archives";

const COUNTERS = { "harvest-vat": "harvestCharge", "votive-candle": "votiveCharge", "blank-capacitor": "blankCharge" } as const;

/** Recover the same receipt's evidence, never a later spin or an inferred outcome. */
export function settlementEntry(entries: readonly ActionEntry[], receipt: SpinReceipt | undefined): ActionEntry | undefined {
  return receipt === undefined ? undefined : entries.findLast(entry => entry.ok && entry.spin === receipt.ordinal
    && entry.command.type === "ACCEPT_OUTCOME");
}

export function counterSnapshot(value: unknown): PartCounters | null {
  if (value === null || typeof value !== "object") return null;
  const counters = value as PartCounters;
  return [counters.blankCharge, counters.cherryWinsThisShift, counters.harvestCharge ?? 0, counters.votiveCharge ?? 0]
    .every(v => Number.isFinite(v) && v >= 0) ? counters : null;
}

/** Pre-settlement counters stay visible until their own trigger is presented.
 * Old/incomplete checkpoints show an unknown state instead of future values. */
export function presentedCounters(state: RunState, through: number | null, before: PartCounters | null): Partial<PartCounters> {
  const result: Partial<Record<keyof PartCounters, number>> = { ...before };
  for (const [id, counter] of Object.entries(COUNTERS) as [keyof typeof COUNTERS, typeof COUNTERS[keyof typeof COUNTERS]][]) {
    const triggers = state.pendingEvents.filter(event => event.type === "PART_TRIGGERED" && event.partId === id);
    if (triggers.length === 0) continue;
    const last = triggers.at(-1)!;
    if (through !== null && through >= last.sequence) {
      const payout = state.pendingEvents.find(event => event.type === "PAYOUT_ADDED" && event.source === "part" && event.partId === id);
      // Let the full vat glow during ignition, then drain when its coins are counted.
      if (payout && through < payout.sequence) {
        if (id === "harvest-vat") result[counter] = 3;
      } else result[counter] = state.counters[counter] ?? 0;
    }
  }
  return result;
}

export function chargeValue(part: PartInstance, counters: Partial<PartCounters>): number | undefined {
  if (part.id === "shock-absorber") return part.level;
  const counter = COUNTERS[part.id as keyof typeof COUNTERS];
  return counter === undefined ? undefined : counters[counter];
}

export function eventPart(event: GameEvent | null): PartId | null {
  return event && "partId" in event ? event.partId : null;
}

export function changedPart(before: RunState, after: RunState): { part: PartInstance; slot: number; upgraded: boolean } | null {
  if (before.initialSeed !== after.initialSeed || before.commandHistory === after.commandHistory) return null;
  const slot = after.partSlots.findIndex((part, i) => part !== null && (before.partSlots[i]?.id !== part.id || before.partSlots[i]?.level !== part.level));
  if (slot < 0) return null;
  const part = after.partSlots[slot]!;
  return { part, slot, upgraded: before.partSlots[slot]?.id === part.id };
}

export function receiptPartAwards(receipt: SpinReceipt): readonly { id: PartId; amount: number }[] {
  const amounts = new Map<PartId, number>();
  for (const award of receipt.awards) if ("partId" in award) {
    amounts.set(award.partId, Math.round(((amounts.get(award.partId) ?? 0) + award.amount) * 100) / 100);
  }
  return [...amounts].map(([id, amount]) => ({ id, amount }));
}
