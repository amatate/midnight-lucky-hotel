import { expect, it } from "vitest";
import { createRun } from "@/core/run";
import type { RunState, SpinReceipt } from "@/core/types";
import { MIO_BIO, MIO_CHAT, MIO_KEYCARD_NOTES, mioSpinReaction } from "@/story/mio-character";
import { mioBrief, STAY_ROOMS } from "@/story/stay-copy";

const receipt: SpinReceipt = { ordinal: 1, shift: 1, afterHoursLevel: 0, isFree: false, baseSpinIndex: 1,
  bankrollBefore: 100, wager: 10, totalPayout: 100, bankrollAfter: 190, awards: [],
  finalGrid: [["cherry", "cherry", "cherry"], ["cherry", "cherry", "cherry"], ["cherry", "cherry", "cherry"]] };
const ready = (): RunState => ({ ...createRun(81, true), service: "repair", phase: "READY_TO_SPIN", nextSpinOrdinal: 2, spinHistory: [receipt] });

it("gives the adult receptionist a consistent voice and distinct collected-card notes", () => {
  expect(MIO_BIO[0]).toContain("23 岁");
  for (const line of [...MIO_CHAT.map(line => line.text), ...MIO_KEYCARD_NOTES, ...STAY_ROOMS.map(room => room.note)]) {
    expect(line[0]).toContain("客人"); expect(line[1]).not.toMatch(/[\u4e00-\u9fff]/);
  }
  expect(new Set(MIO_KEYCARD_NOTES.map(line => line[0])).size).toBe(7);
  expect(STAY_ROOMS[6].note[0]).not.toContain("房卡也归你了");
});
it("celebrates settled net gain, never gross returns or an unfinished payout", () => {
  const state = ready(), before = JSON.stringify(state);
  expect(mioSpinReaction(state, false)).toMatchObject({ expression: "delighted" });
  expect(mioSpinReaction(state, false)?.text).toContain("净增 ¥90");
  expect(mioSpinReaction({ ...state, phase: "RESOLVING_EFFECTS" }, false)).toBeNull();
  expect(mioSpinReaction({ ...state, phase: "SPINNING" }, false)).toBeNull();
  expect(mioSpinReaction({ ...state, spinHistory: [{ ...receipt, bankrollAfter: 100 }] }, false)).toBeNull();
  expect(mioSpinReaction({ ...state, spinHistory: [{ ...receipt, isFree: true, wager: 0 }] }, false)).toBeNull();
  expect(mioBrief(state).text).toContain("净增 ¥90");
  expect(JSON.stringify(state)).toBe(before);
});
it("keeps losses welcoming and prioritizes task/fee instructions over celebrations", () => {
  expect(mioBrief({ ...ready(), phase: "RUN_LOST" }).text).toMatch(/客人.*房卡.*休息/);
  expect(mioBrief({ ...ready(), phase: "SHIFT_COMPLETE", shift: 3, baseSpinsInShift: 3, exitUnlocked: true, bankroll: 200 }).text).toContain("房费 ¥50");
  const miss = { ...ready(), spinHistory: [{ ...receipt, totalPayout: 0, bankrollAfter: 90 }] };
  expect(mioBrief(miss).expression).toBe("concerned");
  expect(mioBrief(miss, true).text).toContain("rest");
});
