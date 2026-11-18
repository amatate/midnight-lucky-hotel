import { expect, it } from "vitest";
import { createRun } from "@/core/run";
import { openingDisplay } from "@/app/hotel-opening";
import { firstUpgradeNote, firstTicketCopy } from "@/app/first-upgrade";
import type { ActionEntry } from "@/persistence/archives";

it("varies the idle window without advancing the seed, taking a wager or inventing symbols", () => {
  const states = [0,1,2,3,4,5].map(seed => createRun(seed, true));
  expect(new Set(states.map(s => JSON.stringify(openingDisplay(s)))).size).toBeGreaterThan(3);
  for (const s of states) {
    const original = structuredClone(s);
    const board = openingDisplay(s);
    expect(openingDisplay(s)).toEqual(board);
    board.forEach((window,i) => expect(s.reels[i]!.some((_,start) => window.every((symbol,j) =>
      s.reels[i]![(start+j)%s.reels[i]!.length] === symbol))).toBe(true));
    expect(s).toEqual(original);
  }
});

function entry(overrides: Partial<ActionEntry>): ActionEntry {
  return { ordinal: 10, at:"", actor:"player", command:{type:"CHOOSE_UPGRADE", choice:{id:"cherry-press",action:"apply"}},
    ok:true, error:null, shift:1, afterHoursLevel:0, spin:4, changes:{}, events:[], ...overrides };
}
it("teaches the installed part only from the first visible post-install trigger and only its direct award", () => {
  const install = entry({});
  const hit = entry({ordinal:13, shift:2, spin:5, command:{type:"ACCEPT_OUTCOME"}, events:[
    {type:"PART_TRIGGERED", sequence:1, level:1, partId:"cherry-press"},
    {type:"PAYOUT_ADDED", sequence:2, source:"part", partId:"cherry-press", amount:5, preMultiplierAmount:5, appliedMultiplier:1},
    {type:"PAYOUT_ADDED", sequence:3, source:"part", partId:"harvest-vat", amount:120, preMultiplierAmount:120, appliedMultiplier:1}
  ]});
  const journal = [{...hit,ordinal:9,spin:2},install,hit,{...hit,ordinal:18,spin:7}];
  expect(firstUpgradeNote(journal,4,false)?.stamp).toBe("已装上");
  expect(firstUpgradeNote(journal,7,false)?.body).toBe("第 5 转 · 部件实发 +¥5");
  expect(firstUpgradeNote([{...install,ok:false},hit],7,false)).toBeNull();
});
it("records actual before/after symbol counts on the chosen reel; a strip edit is not a payout", () => {
  const r = entry({command:{type:"CHOOSE_UPGRADE",choice:{id:"cherry-pitter",action:"apply"}},changes:{
    reels:{before:[["cherry","bell"],["blank","cherry"],["bell"]],after:[["cherry","bell"],["cherry","cherry"],["bell"]]}
  }});
  const proof = firstUpgradeNote([r],3,false)!;
  expect(proof.stamp).toBe("轮带已改");
  expect(proof.body).toContain("第2轮"); expect(proof.body).toContain("樱桃 1→2"); expect(proof.body).toContain("空白 1→0");
  expect(proof.body).not.toContain("¥");
  const state = createRun(8,true);
  expect(firstTicketCopy({...state, partSlots:[{id:"harvest-vat",level:1},null,null,null,null]},"harvest-vat",false).title).toContain("12倍 → 18倍");
});
