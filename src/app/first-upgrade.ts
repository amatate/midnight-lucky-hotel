import { describeUpgrade } from "@/app/player-copy";
import { SYMBOL_LABELS } from "@/app/labels";
import { UPGRADES } from "@/content/upgrades";
import type { RunState, UpgradeId } from "@/core/types";
import { translate } from "@/i18n/translate";
import type { ActionEntry } from "@/persistence/archives";
import { counterSnapshot } from "@/presentation/part-feedback";

export function isFirstTicket(state: RunState) {
  return state.stay !== undefined && state.phase === "CHOOSING_UPGRADE" && state.shift === 1 && state.afterHoursLevel === 0;
}
type Pair = readonly [string, string];
const hooks: Partial<Record<UpgradeId, Pair>> = {
  "cherry-pitter": ["让樱桃更常出现", "See cherries more often"],
  "cherry-press": ["樱桃中了，多拿奖金", "Earn more on a cherry win"],
  "pruning-shears": ["剪掉不想摇到的图案", "Cut a symbol you don't want"],
  "lemon-crate": ["让柠檬更常出现", "See lemons more often"],
  "seven-purification": ["把水果换成幸运7", "Trade fruit for sevens"],
  "tithe-box": ["花 ¥10，加幸运7和恶兆", "Spend ¥10 for a seven and an omen"],
  "artificial-crack": ["留下裂纹，换下回合干预", "Add a crack for more control next round"],
  "carbon-copy": ["多放两个喜欢的图案", "Add two copies of a symbol"],
  "triple-blessing": ["幸运7中了，再领基础奖", "Collect the first seven line again"],
  "shock-absorber": ["遇到裂纹，保护部件并领钱", "Turn cracks into protection and coins"],
  "harvest-vat": ["攒三次水果奖，再开桶", "Bank three fruit wins to open the vat"],
  "votive-candle": ["点烛，把恶兆换成钱", "Light a candle to cash in omens"],
  "lemon-infection": ["中了柠檬，就种更多柠檬", "A lemon win grows more lemons"],
  "fruit-salad": ["樱桃、柠檬、铃铛也能凑奖", "Win with cherry, lemon and bell in one line"],
  "intervention-relay": ["动过轮再中奖，多拿一份", "Win after moving a reel for a bonus"],
  "blank-dividend": ["露出两个空白，也能拿钱", "Two blanks can earn a bonus"],
};

export function firstTicketCopy(state: RunState, id: UpgradeId, en: boolean) {
  const copy = describeUpgrade(state, id);
  const l2 = state.partSlots.some(part => part?.id === id && part.level === 1);
  const rule = l2 && copy.levelTwoEffect ? copy.levelTwoEffect : copy.decisionEffect;
  const hook = hooks[id]?.[en ? 1 : 0];
  const l2Hook: Partial<Record<UpgradeId, Pair>> = {
    "harvest-vat": ["开桶奖金：12倍 → 18倍", "Vat bonus: 12× → 18×"],
    "votive-candle": ["每层恶兆：2倍 → 4倍", "Each omen: 2× → 4×"],
    "shock-absorber": ["最多护两个部件，每个裂纹奖4倍", "Guard two parts; pay 4× per crack"],
    "cherry-press": ["每颗额外樱桃：半注 → 一注", "Each extra cherry: ½ bet → 1 bet"]
  };
  return { title: (l2 && l2Hook[id]?.[en ? 1 : 0]) || hook || translate(copy.name), line: hook ? translate(copy.name) + (l2 ? " · L1 → L2" : "") : (l2 ? "L1 → L2 · " : "") + translate(rule), rule,
    kind: UPGRADES[id].kind === "reel-mod" ? (en ? "CHANGE THE REEL" : "现在改轮带") : (en ? "WHEN TRIGGERED" : "满足条件才生效") };
}

/** A past observation, never a promise about the next spin or a retroactive payment. */
export function cherryExample(state: RunState, en: boolean): string | null {
  const recent = state.spinHistory.findLast(r => r.shift === state.shift && r.afterHoursLevel === 0 &&
    r.awards.some(a => a.kind === "line" && a.symbol === "cherry"));
  if (!recent) return null;
  const count = recent.finalGrid.flat().filter(s => s === "cherry").length;
  if (count < 3) return null;
  return en ? `Spin #${recent.ordinal}: a cherry line and ${count} cherries on the board. On a board like that, the press pays extra from cherry #3.`
    : `回看第 ${recent.ordinal} 转：樱桃连线中奖，盘上有 ${count} 颗樱桃。以后再遇到这样的盘面，压榨机从第 3 颗起另发奖金。`;
}

export interface UpgradeNote { readonly id: UpgradeId; readonly stamp: string; readonly body: string; readonly through: number; readonly key: string }
/** Project an existing journal, never write a teaching flag or re-run an old spin. */
export function firstUpgradeNote(entries: readonly ActionEntry[], visibleSpin: number, en: boolean): UpgradeNote | null {
  const install = entries.find(e => e.ok && e.shift === 1 && e.afterHoursLevel === 0 && e.command.type === "CHOOSE_UPGRADE");
  if (!install || install.command.type !== "CHOOSE_UPGRADE" || install.command.choice.action === "decline") return null;
  const id = install.command.choice.id;
  const note = (stamp: Pair, body: string, through: number, key: string) =>
    ({ id, stamp: stamp[en ? 1 : 0], body, through, key: id + ":" + key });
  const delta = install.changes.reels;
  if (UPGRADES[id].kind === "reel-mod" && Array.isArray(delta?.before) && Array.isArray(delta.after)) {
    const rows: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a: unknown = delta.before[i], b: unknown = delta.after[i];
      if (!Array.isArray(a) || !Array.isArray(b)) continue;
      const edits = Object.entries(SYMBOL_LABELS).flatMap(([symbol, label]) => {
        const prev = a.filter(s => s === symbol).length, next = b.filter(s => s === symbol).length;
        return prev === next ? [] : [translate(label) + " " + prev + "→" + next];
      });
      if (edits.length) rows.push((en ? "Reel " + (i + 1) : "第" + (i + 1) + "轮") + " · " + edits.join(" / "));
    }
    if (rows.length) return note(["轮带已改", "Reel changed"], rows.join("；"), install.spin, "strip");
  }
  let slots: unknown = install.changes.partSlots?.after;
  for (const e of entries) {
    if (e.ordinal <= install.ordinal || !e.ok) continue;
    const spin = e.command.type === "PRESENTATION_COMPLETE" ? e.spin - 1 : e.spin;
    if (spin > visibleSpin) break;
    const trigger = e.events.some(v => v.type === "PART_TRIGGERED" && v.partId === id);
    const cash = e.events.reduce((sum, v) => sum + (((v.type === "PAYOUT_ADDED" && v.source === "part") || v.type === "PATTERN_LINE_WIN") && v.partId === id ? v.amount : 0), 0);
    const spring = id === "loose-spring" && e.command.type === "KICK_REEL" && Array.isArray(slots) && slots.find(p => p?.id === id);
    if (cash > 0 || trigger || spring) {
      const counter = id === "harvest-vat" ? "harvestCharge" : id === "blank-capacitor" ? "blankCharge" : null;
      const before = counterSnapshot(e.changes.counters?.before), after = counterSnapshot(e.changes.counters?.after);
      const detail = cash > 0 ? (en ? "Part bonus " : "部件实发 ") + "+¥" + Number(cash.toFixed(2))
        : spring ? (en ? "Kick moved " + (spring.level + 1) + " stops" : "踹击前进了 " + (spring.level + 1) + " 格")
        : id === "blank-capacitor" && e.events.some(v => v.type === "RESOURCE_CHANGED" && v.resource === "freeSpins" && v.delta > 0) ? (en ? "Charged up: earned a free spin" : "蓄能够了，拿到免费转")
        : counter && before && after ? (en ? "Charge " : "蓄能 ") + (before[counter] ?? 0) + "→" + (after[counter] ?? 0)
        : id === "lemon-infection" && e.events.some(v => v.type === "SYMBOL_CHANGED" && v.to === "lemon") ? (en ? "Changed a symbol to lemon; not a cash bonus" : "把图案变成了柠檬，不是直接发钱")
        : id === "midnight-bell" && e.events.some(v => v.type === "SYMBOL_CHANGED" && v.to === "wild") ? (en ? "Turned a bell wild and checked the lines again" : "把铃铛变成了百搭，重新检查连线")
        : en ? "Triggered · no direct bonus" : "效果已触发 · 没有直接发钱";
      return note(["首次生效", "First effect"], (en ? "Spin #" + spin : "第 " + spin + " 转") + " · " + detail, spin, String(e.ordinal));
    }
    if (e.changes.partSlots) slots = e.changes.partSlots.after;
  }
  return note(["已装上", "Installed"], en ? "Watch for its first trigger. Installation itself pays nothing." : "装好不会立刻发钱。第一次生效时，这里会记下结果。", install.spin - 1, "installed");
}
