import { CoinBurst } from "@/app/components/CoinBurst";
import { SYMBOL_LABELS } from "@/app/labels";
import type { SettlementPresentationState } from "@/app/useSettlementPresentation";
import { SERVICE_PRESENTATIONS } from "@/content/player-copy";
import { UPGRADES } from "@/content/upgrades";
import type { GameEvent } from "@/core/events";
import type { RunState } from "@/core/types";
import { feedbackPlan } from "@/presentation/feedback";

const LINE_LABELS: Readonly<Record<string, string>> = {
  top: "顶线",
  middle: "中线",
  bottom: "底线",
  "diagonal-down": "下斜线",
  "diagonal-up": "上斜线"
};

const PAYOUT_SOURCE_LABELS = {
  base: "基础",
  part: "部件",
  intervention: "干预",
  service: "服务",
  agitation: "躁动",
  overload: "过载"
} as const;

function currentTriggerNumber(state: RunState, event: Extract<GameEvent, { type: "PART_TRIGGERED" }>): number {
  return state.pendingEvents.filter((candidate) =>
    candidate.type === "PART_TRIGGERED" && candidate.partId === event.partId && candidate.sequence <= event.sequence
  ).length;
}

function totalTriggers(state: RunState, partId: Extract<GameEvent, { type: "PART_TRIGGERED" }>["partId"]): number {
  return state.pendingEvents.filter((event) => event.type === "PART_TRIGGERED" && event.partId === partId).length;
}

export function settlementEventLabel(state: RunState, event: GameEvent | null): string {
  if (event === null) return "没有结算事件";
  switch (event.type) {
    case "BET_PLACED": return `下注 ¥${event.amount}`;
    case "REELS_DRAWN": return "真实转轮结果已停稳";
    case "INTERVENTION_USED": return `干预生效：${event.kind === "respin" ? "重转" : event.kind === "repair-lock" ? "锁轮维修" : event.kind === "kick" ? "踹击" : "祈祷"}`;
    case "LINE_WIN": return `${SYMBOL_LABELS[event.symbol]}${LINE_LABELS[event.lineId] ?? event.lineId} +¥${event.amount}`;
    case "PART_TRIGGERED": {
      if (event.partId === "jam-jar") {
        const final = state.counters.cherryWinsThisShift;
        const before = Math.max(0, final - totalTriggers(state, event.partId) + currentTriggerNumber(state, event) - 1);
        return `果酱罐：樱桃刻度 ${before} → ${before + 1}`;
      }
      if (event.partId === "fruit-salad") return "水果沙拉：字面樱桃 + 柠檬 + 铃铛；百搭不能代替";
      if (event.partId === "leftovers") {
        const level = state.partSlots.find((part) => part?.id === "leftovers")?.level ?? event.level;
        const used = Math.max(0, state.shiftFlags.returnedFoodCount - totalTriggers(state, event.partId) + currentTriggerNumber(state, event));
        return `剩菜打包：本班返回食物额度 ${Math.min(level, used)}/${level}`;
      }
      if (event.partId === "lemon-infection") return `柠檬感染 L${event.level}：准备替换中奖线外的字面图案`;
      return `部件触发：${UPGRADES[event.partId].name} L${event.level}`;
    }
    case "PART_DISABLED": return `部件因裂纹失效：${UPGRADES[event.partId].name}`;
    case "FOOD_CONSUMED": return `第${event.reel + 1}轮食物已消耗：这份食物提供 1 层 +25%，接下来 3 次转动有效；多份食物的层数可叠加`;
    case "PAYOUT_ADDED": return `${PAYOUT_SOURCE_LABELS[event.source]}追加赔付 +¥${event.amount}`;
    case "SYMBOL_CHANGED": return `第${event.reel + 1}轮第${event.row + 1}格：${SYMBOL_LABELS[event.from]} → ${SYMBOL_LABELS[event.to]}`;
    case "RESOURCE_CHANGED": return `${event.resource === "tips" ? "小费" : event.resource === "focus" ? "专注" : event.resource === "omen" ? "恶兆" : event.resource === "agitation" ? "躁动" : "免费转动"} ${event.delta >= 0 ? "+" : ""}${event.delta}`;
    case "SERVICE_USED": return `${SERVICE_PRESENTATIONS[event.serviceId].name}行动，花费 ¥${event.cost}`;
    case "CONTRACT_PROGRESS": return `合同进度 ${event.progress}${event.completed ? "，已经完成" : ""}`;
    case "SPIN_COMMITTED": return `本转已确认，最终赔付 ¥${event.finalPayout}`;
    case "BLOCK_COMPLETED": return `本段完成，余额 ¥${event.bankroll}`;
    case "OVERLOAD": return `机器过载 +¥${event.amount}`;
    case "PAYOUT_COMPLETE": return `本次总赔付 ¥${event.total}`;
    case "SHIFT_CHANGED": return `进入第 ${event.shift} 班`;
    case "RUN_ENDED": return event.outcome === "won" ? "本局胜利" : event.outcome === "lost" ? "本局失败" : "已经结账离开";
  }
}

export interface WinPresentationProps {
  readonly state: RunState;
  readonly presentation: SettlementPresentationState;
  readonly reducedMotion: boolean;
}

export function WinPresentation({ state, presentation, reducedMotion }: WinPresentationProps): React.JSX.Element {
  const plan = feedbackPlan(presentation.summary.tier, reducedMotion);
  const lineCount = presentation.summary.lines.length;
  const partCount = presentation.summary.partTriggers.length;
  return (
    <section
      className={`presentation-panel win-presentation tone-${plan.tone}${reducedMotion ? " reduce-flash" : ""}`}
      aria-label="结算演出队列"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      style={{ "--cabinet-shake": `${plan.shakePx}px` } as React.CSSProperties}
    >
      <header>
        <strong>{presentation.summary.tier === "runaway" ? "机器失控" : presentation.summary.tier === "chain" ? "构筑连锁" : presentation.summary.tier === "win" ? "中奖" : "本转结果"}</strong>
        <span>事件 {presentation.eventIndex}/{presentation.eventTotal}</span>
      </header>
      <div className="payout-stage" aria-live="polite">
        <strong className="payout-amount">+¥{presentation.summary.total}</strong>
        <span className="payout-destination">飞向余额 ¥{state.bankroll}</span>
      </div>
      <p className="cause-summary">{lineCount} 条中奖线 · {partCount} 次部件触发 · 因果链 {presentation.summary.chainLength}</p>
      <div className="event-card" aria-live="polite">{settlementEventLabel(state, presentation.currentEvent)}</div>
      {plan.coinCount > 0 && <CoinBurst count={plan.coinCount} />}
      {!presentation.done && (
        <div className="presentation-actions">
          <button type="button" onClick={presentation.speedUp}>加速演出</button>
          <button className="primary-button" type="button" onClick={presentation.skip}>直接结算</button>
        </div>
      )}
    </section>
  );
}
