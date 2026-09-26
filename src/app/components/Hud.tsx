import { SYMBOL_LABELS } from "@/app/labels";
import { HelpButton, HelpFacts } from "@/app/components/HelpWindow";
import { activeRoom, getPaidSpinLimit, getRoomProgress } from "@/content/hotel";
import { roomGoalCopy, roomObjectiveLabel, roomProgressCopy } from "@/app/room-copy";
import { AnimatedMoney } from "@/app/components/AnimatedMoney";
import { RoomGoalInstrument } from "@/app/components/RoomGoalInstrument";
import type { SettlementPresentationState } from "@/app/useSettlementPresentation";
import { getCurrentBet } from "@/core/progression";
import type { RunState, SymbolId } from "@/core/types";
import type { MachineEstimate } from "@/sim/types";
import type { EstimateStatus } from "@/app/useEstimate";
import type { ReactNode } from "react";

const BAND_LABELS = {
  danger: "凶险",
  "near-break-even": "接近持平",
  favorable: "有利"
} as const;

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface HudProps {
  readonly compact?: boolean;
  readonly state: RunState;
  readonly estimate: MachineEstimate | null;
  readonly estimateStatus: EstimateStatus;
  readonly payoutAmount?: number;
  readonly settlementPresentation?: SettlementPresentationState | null;
  readonly reducedMotion?: boolean;
  readonly presentedThroughSequence?: number | null | undefined;
}

function visibleFoodBuffs(state: RunState, presentedThroughSequence: number | null | undefined) {
  if (state.phase !== "RESOLVING_EFFECTS" || presentedThroughSequence === undefined) return state.buffs;
  const grantedEvents = state.pendingEvents
    .filter((event) => event.type === "FOOD_CONSUMED")
    .sort((left, right) => left.sequence - right.sequence);
  const grantedCount = Math.min(grantedEvents.length, state.buffs.length);
  const existingCount = state.buffs.length - grantedCount;
  const revealedCount = presentedThroughSequence === null
    ? 0
    : grantedEvents.filter((event) => event.sequence <= presentedThroughSequence).length;
  return state.buffs.slice(0, existingCount + Math.min(grantedCount, revealedCount));
}

export function Hud({
  compact = false,
  state,
  estimate,
  estimateStatus,
  payoutAmount = 0,
  settlementPresentation = null,
  reducedMotion = false,
  presentedThroughSequence
}: HudProps): React.JSX.Element {
  const isWaiting = state.toolLevel >= 1 && (estimateStatus === "pending" || estimateStatus === "unavailable");
  const foodBuffs = visibleFoodBuffs(state, presentedThroughSequence);
  const blockBlanks = (state.blockReelAdditions ?? []).reduce((total, strip) => total + strip.length, 0);
  const activePayout = settlementPresentation?.awardDelta ?? payoutAmount;
  const room = activeRoom(state);
  const visibleBankroll = settlementPresentation?.visibleBankrollTarget ?? state.bankroll;
  const roomProgress = room === null ? null : getRoomProgress(state,
    settlementPresentation?.visiblePayoutTarget ?? (state.phase === "RESOLVING_EFFECTS" ? 0 : undefined));
  const target = roomProgress?.required ?? state.checkoutTarget;
  const progress = Math.max(0, Math.min(target, roomProgress?.value ?? visibleBankroll));
  return (
    <section className="hud" aria-label="本局状态" data-has-room={room !== null}>
      <dl className="room-counters" role="group" aria-label="酒店房号计数窗" data-payout-active={activePayout > 0 ? "true" : undefined}>
        <div className="room-counter room-counter-bankroll">
          <dt className="sr-only">余额</dt>
          <dd
            className={activePayout > 0 ? "is-payout-destination" : undefined}
            data-counter="bankroll"
            data-coin-destination="true"
          >
            <span aria-hidden="true" className="bankroll-visual">
              <span className="bankroll-caption">余额 </span>¥{settlementPresentation === null
                ? state.bankroll
                : <AnimatedMoney
                    target={settlementPresentation.visibleBankrollTarget}
                    durationMs={settlementPresentation.moneyDurationMs}
                    resetKey={settlementPresentation.moneyResetKey}
                    animationKey={settlementPresentation.moneyAnimationKey}
                    reducedMotion={reducedMotion}
                  />}
            </span>
            <span className="sr-only bankroll-value">
              ¥{settlementPresentation?.visibleBankrollTarget ?? state.bankroll}
            </span>
          </dd>
        </div>
        <div className="room-counter room-counter-target">
          <dt className="sr-only">目标</dt>
          <dd data-counter="target">{roomProgress === null ? `目标 ¥${state.checkoutTarget}` : compact
            ? roomProgress.objective.kind === "scoring-spins" ? `达标 ${roomProgress.value} / ${roomProgress.required} 转`
              : `${roomProgress.objective.kind === "best-spin" ? "峰值" : "本段"} ¥${roomProgress.value} / ${roomProgress.required}`
            : roomGoalCopy(roomProgress.objective, roomProgress.target)}</dd>
          <dd className={`target-meter meter-${roomProgress?.objective.kind ?? "total-payout"}`} role="progressbar" aria-label={roomProgress === null ? "余额目标" : `${roomObjectiveLabel(roomProgress.objective)}目标`}
            aria-valuemin={0} aria-valuemax={target} aria-valuenow={progress}
            aria-valuetext={roomProgress === null ? `余额 ¥${visibleBankroll} / ¥${target}` : roomProgressCopy(roomProgress)}>
            <RoomGoalInstrument objective={roomProgress?.objective ?? null} value={progress} target={target} />
          </dd>
        </div>
        <div className="room-counter room-counter-bet">
          <dt className="sr-only">下注</dt>
          <dd data-counter="bet">下注 ¥{getCurrentBet(state)}</dd>
        </div>
      </dl>
      {room !== null && roomProgress !== null && <section className="room-progress" aria-label="客房进度">
        <strong className="sr-only">{room.name} · {getPaidSpinLimit(state)} 次付费转</strong>
        <p>{roomProgressCopy(roomProgress)} · 干预点上限 {room.focusCap}</p>
        <HelpButton title="本房目标"><p>{roomProgressCopy(roomProgress)}</p><p>{roomProgress.objective.kind === "scoring-spins" ? "每转单独判断，不要求连续；" : "旧余额不抵目标；"}免费转也计入。全部转完再判定通关。</p><p>{room.hint}</p></HelpButton>
        <div className="room-turn-ticks" aria-label={`已用 ${state.baseSpinsInShift}/${getPaidSpinLimit(state)} 次付费转`}>
          {Array.from({ length: getPaidSpinLimit(state) }, (_, index) => <i key={index} data-used={index < state.baseSpinsInShift} aria-hidden="true" />)}
        </div>
      </section>}
      <div className="hud-resources">
        <span>干预点 {state.interventionPoints}/{state.maxInterventionPoints}<HelpButton title="干预点"><HelpFacts cost="每次重转、锁轮或祈祷花 1 点。" effect="用来改变盘面的点数，旧版叫“专注”。留着不会自动提高中奖率。"
          limit="普通每班 2 点，维修间 3 点；新班重置，不累计。每转最多干预一次，客房另有上限。" current={"剩余 " + state.interventionPoints + " 点；本段上限 " + state.maxInterventionPoints + "。"} /></HelpButton></span>
        <span>小费 {state.tips}<HelpButton title="小费"><HelpFacts cost="重抽升级 1 枚；维修裂纹 1 枚；还愿点烛 1 枚；精修 L1 → L2 部件 3 枚。" effect="合同完成或放弃升级可得 1 枚；重抽至少换入一个不同选项，精修定向强化核心。"
          limit="精修只在每段首转前；维修裂纹需要维修间且处于班末。小费不是下注金。" current={"持有 " + state.tips + " 枚。"} /></HelpButton></span>
        <HudSupplement compact={compact} badge={<span className="hud-status-badges">
            {foodBuffs.length > 0 && `餐 +${Math.round(foodBuffs.reduce((sum, buff) => sum + buff.additivePayout, 0) * 100)}%`}
            {blockBlanks > 0 && ` · 空白 ${blockBlanks}`}
          </span>}>
          <div className="hud-status-content">
        {blockBlanks > 0 && <span>本班空白 {blockBlanks}<HelpButton title="本班临时空白"><HelpFacts cost="三重祝福本班首次触发时，向最长轮加入 1 个；本班不再追加。" effect="降低本班后续中奖概率；付费转抽到时可给空白电容充能。" limit="下一班／下一段自动清除，不是永久改轮。原有永久空白不会一起消失。" /></HelpButton></span>}
        <span>躁动 {state.agitation}<HelpButton title="躁动"><HelpFacts cost="无需主动花费；零赔付的一转自动 +1 层。" effect="下次有奖时，每层额外支付 0.5 倍下注，再清空。"
          limit="最多 5 层；不是踹击或祈祷消耗的资源。" /></HelpButton></span>
        <span>裂纹 {state.reels.reduce((n, strip) => n + strip.filter((symbol) => symbol === "crack").length, 0)}<HelpButton title="裂纹"><HelpFacts cost="坏符号会一直留在转轮里，直到被清理；不直接扣钱。" effect="盘面每出现1个裂纹，让1个可受损部件本转停工。先影响最右边的部件，空槽不能挡伤。"
          limit="磁铁、保修欺诈、减震飞轮免疫裂纹；飞轮还抵消 1 / 2 个裂纹停工。其他部件下一转重新判定。这里是永久裂纹总数，不是本转失效数。"
          current="可用磁铁的裂纹三连消除、修枝剪，或维修间班末花 1 小费移除一轮最多 2 个。" /></HelpButton></span>
        {(state.service === "chapel" || state.omen > 0) && <span>恶兆 {state.omen}<HelpButton title="恶兆"><HelpFacts cost="祈祷目标没中线时攒1层；什一税箱也能增加。" effect="收集器等幸运7中奖，每层付 0.5 / 1 倍下注；还愿烛台花 1 小费存入最多 3 层，正常工作时每层付 2 / 4 倍下注，不必中奖。"
          limit="恶兆本身不加钱；已存入烛台的部分不能再被收集器领取。未兑现的可跨班保留。" /></HelpButton></span>}
      </div>
      <section className="food-buff-status" aria-label="食物加成">
        <strong>食物加成 {foodBuffs.length} 层</strong><HelpButton title="食物加成"><HelpFacts cost="每次实际转动扣一次剩余次数，免费转也扣。" effect="买餐立即 +50% 持续 3 转；盘面吃到食物后，再给之后 3 转 +25%。多层百分比相加。"
          limit="抽到的食物不追补本转；过载保护与保险丝救援不享受倍率。例：+50% 与 +25% 合计为 ×1.75，不是 ×1.875。" /></HelpButton>
        {foodBuffs.length > 0 && <p>当前合计 +{Math.round(foodBuffs.reduce((total, buff) => total + buff.additivePayout, 0) * 100)}% · 各层剩余次数如下</p>}
        <div className="food-buff-stacks">
          {foodBuffs.map((buff, index) => {
            const remaining = Math.max(0, Math.min(3, Math.trunc(buff.spinsRemaining)));
            return (
              <div
                className="food-buff-stack"
                data-testid="food-buff-stack"
                role="group"
                aria-label={`第 ${index + 1} 层 +${buff.additivePayout * 100}%，剩余 ${remaining}/3 次转动`}
                key={index}
              >
                <span className="food-buff-label">+{buff.additivePayout * 100}% · {remaining} 转</span>
                {[0, 1, 2].map((ticket) => (
                  <span
                    className={`food-ticket${ticket < remaining ? " is-active" : " is-torn"}`}
                    data-testid="food-ticket"
                    data-active={ticket < remaining ? "true" : undefined}
                    aria-hidden="true"
                    key={ticket}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </section>
      <details className="tool-panel">
        <summary>会计工具</summary>
        <HelpButton title="会计估算"><HelpFacts cost="只读估算，不消耗真实随机数。" effect="RTP 是赔付 ÷ 下注，不扣服务费；符号概率是每轮占比，不是连线中奖率。"
          limit="当前是简化自动拉动基线，不含当前食物、恶兆、献祭或干预策略，也未按三转重置全部计数。不能当成实时胜率；95% 区间不是下转奖金范围。" /></HelpButton>
        {state.toolLevel >= 2 && <p className="muted">以下为简化自动拉动基线，非本局实时胜率；点 ? 查看未纳入的因素。</p>}
        {state.toolLevel === 0 && <p>尚未购入计算器；不会显示概率、回报估算或风险带。</p>}
        {isWaiting && <p>{estimateStatus === "unavailable" ? "会计估算暂不可用" : "会计仍在计算"}</p>}
        {state.toolLevel >= 1 && estimate?.symbolProbabilities !== null && estimate?.symbolProbabilities !== undefined && (
          <div className="tool-readout">
            <strong>计算器 · 长期转轮符号概率</strong>
            <p className="muted">不含祈祷副本和本班临时空白；不是下一转的连线中奖率。</p>
            {estimate.symbolProbabilities.map((reel, index) => (
              <p key={index}>第{index + 1}轮：{Object.entries(reel)
                .filter(([, value]) => value > 0)
                .map(([symbol, value]) => `${SYMBOL_LABELS[symbol as SymbolId]} ${percent(value)}`)
                .join(" · ")}</p>
            ))}
          </div>
        )}
        {state.toolLevel >= 2 && estimate?.rtpMean !== null && estimate?.rtpMean !== undefined && (
          <div className="tool-readout">
            <p className={`risk-band risk-${estimate.band}`}>估算风险带：{BAND_LABELS[estimate.band]}</p>
            <p>估算 RTP {percent(estimate.rtpMean)}</p>
            {estimate.rtp95 !== null && <p>估算 95% 区间 {percent(estimate.rtp95[0])}–{percent(estimate.rtp95[1])}</p>}
          </div>
        )}
        {state.toolLevel >= 3 && estimate?.ruinProbability !== null && estimate?.ruinProbability !== undefined && (
          <div className="tool-readout">
            <p>观察期破产概率 {percent(estimate.ruinProbability)}</p>
            <p>估算赔付波动 {estimate.payoutStandardDeviation?.toFixed(2)}</p>
            <p>预计可承受 {estimate.expectedAffordableSpins?.toFixed(1)} 次</p>
          </div>
        )}
      </details>
        </HudSupplement>
      </div>
    </section>
  );
}

function HudSupplement({ compact, badge, children }: { readonly compact: boolean; readonly badge: ReactNode; readonly children: ReactNode }): React.JSX.Element {
  return compact
    ? <HelpButton title="状态与加成" className="console-status-key" trigger={<><span>状态</span>{badge}</>}>{children}</HelpButton>
    : <details className="hud-supplement"><summary><span>状态与加成</span>{badge}</summary>{children}</details>;
}
