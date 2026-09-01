import { describe, expect, it } from "vitest";
import {
  appendSpinReceipt,
  buildSpinReceipt,
  finalizeSpinReceipt,
  isSpinReceipt,
  MAX_RECEIPT_AWARDS,
  MAX_SPIN_HISTORY,
  SpinReceiptInvariantError,
  type SpinReceiptBuildInput
} from "@/core/receipts";
import { safeMoney } from "@/core/money";
import type { GameEvent } from "@/core/events";
import type { Grid, SpinReceipt } from "@/core/types";

const finalGrid: Grid = [
  ["cherry", "lemon", "bell"],
  ["wild", "seven", "blank"],
  ["food", "crack", "cherry"]
];

const mixedSettlementEvents = [
  { sequence: 10, type: "LINE_WIN", lineId: "middle", symbol: "cherry", source: "base", preMultiplierAmount: 10, appliedMultiplier: 1, amount: 10 },
  { sequence: 11, type: "PATTERN_LINE_WIN", patternId: "fruit-salad", partId: "fruit-salad", lineId: "top", preMultiplierAmount: 5, appliedMultiplier: 1, amount: 5 },
  { sequence: 12, type: "PAYOUT_ADDED", source: "part", partId: "jam-jar", preMultiplierAmount: 7, appliedMultiplier: 1, amount: 7 },
  { sequence: 13, type: "PAYOUT_ADDED", source: "agitation", preMultiplierAmount: 4, appliedMultiplier: 2, amount: 8 },
  { sequence: 14, type: "OVERLOAD", preMultiplierAmount: 5, appliedMultiplier: 1, amount: 5 },
  { sequence: 15, type: "PAYOUT_COMPLETE", total: 35 }
] as const satisfies readonly GameEvent[];

function receiptInput(
  settlementEvents: readonly GameEvent[] = mixedSettlementEvents,
  patch: Partial<SpinReceiptBuildInput> = {}
): SpinReceiptBuildInput {
  return {
    ordinal: 4,
    shift: 2,
    afterHoursLevel: 0,
    isFree: false,
    baseSpinIndex: 2,
    bankrollBefore: 100,
    wager: 5,
    finalGrid,
    bankrollAfter: 130,
    settlementEvents,
    ...patch
  };
}

function receipt(input: SpinReceiptBuildInput = receiptInput()): SpinReceipt {
  const result = buildSpinReceipt(input);
  if (!result.ok) throw new Error(`receipt fixture failed: ${result.reason}`);
  return result.receipt;
}

describe("spin receipts", () => {
  it("maps each money event once and never maps PAYOUT_COMPLETE as an award", () => {
    const result = buildSpinReceipt(receiptInput());
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.receipt.awards.map((award) => award.kind)).toEqual([
      "line", "pattern-line", "part-bonus", "bonus", "overload"
    ]);
    expect(result.receipt.awards.map((award) => award.sequence)).toEqual([10, 11, 12, 13, 14]);
    expect(result.receipt.awards.map((award) => award.formula)).toEqual([
      { kind: "known", preMultiplierAmount: 10, appliedMultiplier: 1 },
      { kind: "known", preMultiplierAmount: 5, appliedMultiplier: 1 },
      { kind: "known", preMultiplierAmount: 7, appliedMultiplier: 1 },
      { kind: "known", preMultiplierAmount: 4, appliedMultiplier: 2 },
      { kind: "known", preMultiplierAmount: 5, appliedMultiplier: 1 }
    ]);
    expect(result.receipt.totalPayout).toBe(35);
    expect(result.receipt.awards.reduce((sum, award) => safeMoney(sum + award.amount), 0)).toBe(35);
  });

  it("conserves a paid bankroll and retains the exact resolved grid", () => {
    const result = buildSpinReceipt(receiptInput());
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.receipt).toMatchObject({
      ordinal: 4,
      shift: 2,
      afterHoursLevel: 0,
      isFree: false,
      baseSpinIndex: 2,
      bankrollBefore: 100,
      wager: 5,
      totalPayout: 35,
      bankrollAfter: 130,
      finalGrid
    });
  });

  it("conserves a free bankroll without charging a wager", () => {
    const result = buildSpinReceipt(receiptInput(mixedSettlementEvents, {
      isFree: true,
      baseSpinIndex: null,
      wager: 0,
      bankrollAfter: 135
    }));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.receipt.bankrollAfter).toBe(135);
  });

  it.each([
    ["missing completion", mixedSettlementEvents.slice(0, -1), "MISSING_PAYOUT_COMPLETE"],
    ["duplicate completion", [...mixedSettlementEvents, { sequence: 16, type: "PAYOUT_COMPLETE", total: 35 }] as const, "DUPLICATE_PAYOUT_COMPLETE"],
    ["completion before another settlement event", [mixedSettlementEvents[0], mixedSettlementEvents[5], mixedSettlementEvents[1]] as const, "INVALID_EVENT_SEQUENCE"]
  ])("rejects %s", (_label, settlementEvents, reason) => {
    expect(buildSpinReceipt(receiptInput(settlementEvents))).toEqual({ ok: false, reason });
  });

  it("rejects a completion total that does not match the folded awards", () => {
    const mismatched = [...mixedSettlementEvents.slice(0, -1), { sequence: 15, type: "PAYOUT_COMPLETE", total: 34 }] as const;
    expect(buildSpinReceipt(receiptInput(mismatched))).toEqual({ ok: false, reason: "PAYOUT_MISMATCH" });
  });

  it("rejects bankrolls that do not conserve the wager and payout", () => {
    expect(buildSpinReceipt(receiptInput(mixedSettlementEvents, { bankrollAfter: 129 })))
      .toEqual({ ok: false, reason: "BALANCE_MISMATCH" });
  });

  it("rejects more than the receipt award cap", () => {
    const awards = Array.from({ length: MAX_RECEIPT_AWARDS + 1 }, (_, index) => ({
      sequence: index + 1,
      type: "PAYOUT_ADDED" as const,
      source: "base" as const,
      preMultiplierAmount: 1,
      appliedMultiplier: 1,
      amount: 1
    }));
    const settlementEvents = [...awards, { sequence: awards.length + 1, type: "PAYOUT_COMPLETE" as const, total: awards.length }];
    expect(buildSpinReceipt(receiptInput(settlementEvents, { bankrollAfter: 100 - 5 + awards.length })))
      .toEqual({ ok: false, reason: "TOO_MANY_AWARDS" });
  });

  it("throws in strict mode and creates a single opaque fallback only for a conserved authoritative completion", () => {
    const legacyEvents = [
      { sequence: 1, type: "RESOURCE_CHANGED", resource: "tips", delta: 1 },
      { sequence: 2, type: "PAYOUT_COMPLETE", total: 35 }
    ] as const satisfies readonly GameEvent[];
    const input = receiptInput(legacyEvents);

    expect(() => finalizeSpinReceipt(input, "strict")).toThrow(SpinReceiptInvariantError);
    expect(finalizeSpinReceipt(input, "production-fallback")).toMatchObject({
      awards: [{ sequence: 2, kind: "opaque", formula: { kind: "legacy-unavailable" }, amount: 35 }],
      totalPayout: 35
    });
  });

  it("uses no opaque award for a zero-payout fallback and never falls back without a conserved completion", () => {
    const zero = receiptInput([
      { sequence: 1, type: "PAYOUT_COMPLETE", total: 0 }
    ], { bankrollAfter: 95 });
    expect(finalizeSpinReceipt(zero, "production-fallback").awards).toEqual([]);
    expect(() => finalizeSpinReceipt(receiptInput(mixedSettlementEvents.slice(0, -1)), "production-fallback"))
      .toThrow(SpinReceiptInvariantError);
    expect(() => finalizeSpinReceipt(receiptInput(mixedSettlementEvents, { bankrollAfter: 1 }), "production-fallback"))
      .toThrow(SpinReceiptInvariantError);
  });

  it("keeps the newest 100 receipts, evicts item 1 at item 101, and preserves ordinal order", () => {
    const history = Array.from({ length: MAX_SPIN_HISTORY }, (_, index) => receipt(receiptInput(mixedSettlementEvents, {
      ordinal: index + 1
    })));
    const next = receipt(receiptInput(mixedSettlementEvents, { ordinal: MAX_SPIN_HISTORY + 1 }));

    const appended = appendSpinReceipt(history, next);
    expect(appended).toHaveLength(MAX_SPIN_HISTORY);
    expect(appended[0]?.ordinal).toBe(2);
    expect(appended.at(-1)?.ordinal).toBe(101);
    expect(appended.map((entry) => entry.ordinal)).toEqual(Array.from({ length: MAX_SPIN_HISTORY }, (_, index) => index + 2));
  });

  it("rejects structurally malformed or unconserved receipts at the render-time validation boundary", () => {
    const valid = receipt();
    expect(isSpinReceipt(valid)).toBe(true);
    expect(isSpinReceipt({ ...valid, bankrollAfter: 129 })).toBe(false);
    expect(isSpinReceipt({ ...valid, finalGrid: [["cherry"], ["lemon"], ["bell"]] })).toBe(false);
    expect(isSpinReceipt({
      ...valid,
      awards: [{ ...valid.awards[0]!, formula: { kind: "known", preMultiplierAmount: 10, appliedMultiplier: 2 } }]
    })).toBe(false);
    expect(isSpinReceipt({ ...valid, awards: [...valid.awards].reverse() })).toBe(false);
  });
});
