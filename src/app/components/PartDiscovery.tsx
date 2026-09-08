import { useEffect, useRef, useState } from "react";
import { describeEquippedPart } from "@/content/player-copy";
import { UPGRADES } from "@/content/upgrades";
import { safeMoney } from "@/core/money";
import type { GameEvent } from "@/core/events";
import type { PartId, RunState } from "@/core/types";

const SEEN_KEY = "midnight-lucky-hotel.discovered-parts-v1";
const EMPTY_EVENTS: readonly GameEvent[] = [];
const REASONS: Readonly<Record<PartId, string>> = {
  "cherry-press": "樱桃线中奖，盘面至少有 3 颗字面樱桃；多出的樱桃被压成果汁奖金。",
  "jam-jar": "樱桃线给果酱罐充能。第一条只充能，后面的樱桃线才享受累计奖励。",
  "fruit-salad": "同一条支付线凑齐了樱桃、柠檬、铃铛，混搭也能中奖。",
  "salad-dressing": "水果沙拉刚刚中奖，沙拉酱再追加一份奖金。",
  "lemon-infection": "柠檬线启动感染：能改造线外图案时改造，成熟且无可感染目标时改为收成。",
  leftovers: "吃到转轮中的食物后，剩菜打包把食物送回转轮；这是补给，不是直接奖金。",
  "omen-collector": "幸运7线中奖，储存的恶兆被兑现并清空。",
  "triple-blessing": "本转第一条幸运7线中奖，祝福复制这条线的基础奖金。",
  "midnight-bell": "铃铛线中奖，把线上的字面铃铛永久改造为百搭，再检查新连线。",
  "martyr-coin": "本班已经主动献祭，现在用复制幸运7线兑现这笔投入。",
  "scrap-magnet": "一条线出现三个字面裂纹，磁铁发放回收奖金并清理裂纹。",
  "loose-spring": "使用了踹击，弹簧提供更远的位移；能否救出中奖仍取决于盘面。",
  "blank-capacitor": "付费转抽到了空白，电容积累蓄能；达到阈值才赠免费转，免费转不再充能。",
  "warranty-fraud": "其他部件因裂纹失效，保修欺诈支付本班一次的保险赔款。",
  "overload-motor": "结算中的核心效果接连发生，马达从第 2 个效果开始追加奖金。",
  "safety-fuse": "余额低于最低下注，保险丝提供一次救援，随后被消耗。"
};

function readSeen(): Set<PartId> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((id): id is PartId => typeof id === "string" && Object.hasOwn(REASONS, id)) : []);
  } catch { return new Set(); }
}
interface Discovery { readonly id: PartId; readonly level: 1 | 2; readonly ordinal: number; readonly amount: number; readonly complete: boolean }

export function PartDiscovery({ state, presentedThroughSequence, observedEvents = EMPTY_EVENTS }: {
  readonly state: RunState; readonly presentedThroughSequence?: number | null | undefined;
  readonly observedEvents?: readonly GameEvent[] | undefined;
}): React.JSX.Element | null {
  const seen = useRef<Set<PartId> | null>(null);
  if (seen.current === null) seen.current = readSeen();
  const [notes, setNotes] = useState<readonly Discovery[]>([]);
  const ordinal = state.spinHistory.at(-1)?.ordinal ?? state.nextSpinOrdinal - 1;
  useEffect(() => {
    // Some post-settlement effects (notably fuse rescue) only live in the
    // controller result. Merge by sequence so shared events are never counted twice.
    const events = [...new Map([...state.pendingEvents, ...observedEvents].map((event) => [event.sequence, event])).values()].filter((event) => presentedThroughSequence === undefined
      || (presentedThroughSequence !== null && event.sequence <= presentedThroughSequence));
    const next = [...notes];
    for (const event of events) {
      const part = event.type === "PART_TRIGGERED" ? { id: event.partId, level: event.level }
        : event.type === "INTERVENTION_USED" && event.kind === "kick"
          ? state.partSlots.find((slot) => slot?.id === "loose-spring") : undefined;
      if (!part || seen.current!.has(part.id) || next.some((note) => note.id === part.id)) continue;
      next.push({ id: part.id, level: part.level, ordinal, amount: 0, complete: false });
    }
    const updated = next.map((candidate) => {
      if (candidate.ordinal !== ordinal) return candidate;
      const eventAmount = safeMoney(events.reduce((sum, event) => sum + (
        ((event.type === "PAYOUT_ADDED" && event.source === "part") || event.type === "PATTERN_LINE_WIN") && event.partId === candidate.id ? event.amount : 0
      ), 0));
      const receipt = state.spinHistory.at(-1);
      const receiptVisible = state.phase !== "RESOLVING_EFFECTS" && receipt?.ordinal === candidate.ordinal;
      const receiptAmount = receiptVisible ? safeMoney(receipt.awards.reduce((sum, award) => sum + (
        (award.kind === "part-bonus" || award.kind === "pattern-line") && award.partId === candidate.id ? award.amount : 0
      ), 0)) : 0;
      // Fuse rescue occurs after receipt finalization. Neither that older receipt nor
      // a cleared event buffer may erase an already observed, attributed award.
      const amount = Math.max(candidate.amount, eventAmount, receiptAmount);
      const complete = candidate.complete || receiptVisible || events.some((event) => event.type === "PAYOUT_COMPLETE");
      return candidate.amount === amount && candidate.complete === complete ? candidate : { ...candidate, amount, complete };
    });
    if (updated.length !== notes.length || updated.some((note, index) => note !== notes[index])) setNotes(updated);
  }, [state, observedEvents, presentedThroughSequence, ordinal, notes]);
  const note = notes[0];
  useEffect(() => {
    // Queued explanations are not learned until they have actually been shown.
    if (note === undefined || seen.current!.has(note.id)) return;
    seen.current!.add(note.id);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.current!])); } catch { /* Session-only teaching still works if preferences cannot be saved. */ }
  }, [note]);
  if (note === undefined) return null;
  const details = describeEquippedPart(state, { id: note.id, level: note.level });
  return <section className="part-discovery" aria-label="初次发现">
    <header><h3>{UPGRADES[note.id].name} · 初次发现</h3><span className="discovery-caption">{note.id === "safety-fuse" ? "余额救援" : `第 ${note.ordinal} 转`}</span></header>
    <p>{REASONS[note.id]}</p>
    <p><strong>{note.amount > 0 ? `本次已入账的直接奖励 +¥${note.amount}` : note.complete ? "本次没有直接加钱，收益体现在充能或改造。" : "直接奖励随结算入账后显示。"}</strong></p>
    <p className="discovery-caption">只统计这个部件明确记名的奖励，不把后续基础中奖都算给它。提示不暂停游戏。</p>
    <details><summary>再看效果与代价</summary><p>{details.effect}</p><p>{details.risk}</p></details>
    {notes.length > 1 && <p className="discovery-caption">还有 {notes.length - 1} 个首次发现等你查看。</p>}
    <button type="button" onClick={() => setNotes((current) => current.slice(1))}>明白了</button>
  </section>;
}
