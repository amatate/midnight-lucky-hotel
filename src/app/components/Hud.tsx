import { SYMBOL_LABELS } from "@/app/labels";
import { getCurrentBet } from "@/core/progression";
import type { RunState, SymbolId } from "@/core/types";
import type { MachineEstimate } from "@/sim/types";
import type { EstimateStatus } from "@/app/useEstimate";

const BAND_LABELS = {
  danger: "凶险",
  "near-break-even": "接近持平",
  favorable: "有利"
} as const;

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface HudProps {
  readonly state: RunState;
  readonly estimate: MachineEstimate | null;
  readonly estimateStatus: EstimateStatus;
  readonly payoutAmount?: number;
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
  state,
  estimate,
  estimateStatus,
  payoutAmount = 0,
  presentedThroughSequence
}: HudProps): React.JSX.Element {
  const isWaiting = state.toolLevel >= 1 && (estimateStatus === "pending" || estimateStatus === "unavailable");
  const foodBuffs = visibleFoodBuffs(state, presentedThroughSequence);
  return (
    <section className="hud" aria-label="本局状态">
      <dl className="room-counters" role="group" aria-label="酒店房号计数窗" data-payout-active={payoutAmount > 0 ? "true" : undefined}>
        <div className="room-counter room-counter-bankroll">
          <dt className="sr-only">余额</dt>
          <dd
            className={payoutAmount > 0 ? "is-payout-destination" : undefined}
            data-counter="bankroll"
            data-coin-destination="true"
          >余额 ¥{state.bankroll}</dd>
        </div>
        <div className="room-counter">
          <dt className="sr-only">目标</dt>
          <dd data-counter="target">目标 ¥{state.checkoutTarget}</dd>
        </div>
        <div className="room-counter">
          <dt className="sr-only">下注</dt>
          <dd data-counter="bet">下注 ¥{getCurrentBet(state)}</dd>
        </div>
      </dl>
      {payoutAmount > 0 && <span className="sr-only" aria-live="polite">本转到账 +¥{payoutAmount}</span>}
      <div className="hud-resources">
        <span>专注 {state.interventionPoints}/{state.maxInterventionPoints}</span>
        <span>小费 {state.tips}</span>
        <span>躁动 {state.agitation}</span>
      </div>
      <section className="food-buff-status" aria-label="食物加成">
        <strong>食物加成 {foodBuffs.length} 层</strong>
        <div className="food-buff-stacks">
          {foodBuffs.map((buff, index) => {
            const remaining = Math.max(0, Math.min(3, Math.trunc(buff.spinsRemaining)));
            return (
              <div
                className="food-buff-stack"
                data-testid="food-buff-stack"
                role="group"
                aria-label={`第 ${index + 1} 层 +25%，剩余 ${remaining}/3 次转动`}
                key={index}
              >
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
        {state.toolLevel === 0 && <p>尚未购入计算器；不会显示概率、回报估算或风险带。</p>}
        {isWaiting && <p>{estimateStatus === "unavailable" ? "会计估算暂不可用" : "会计仍在计算"}</p>}
        {state.toolLevel >= 1 && estimate?.symbolProbabilities !== null && estimate?.symbolProbabilities !== undefined && (
          <div className="tool-readout">
            <strong>计算器 · 每轮符号概率</strong>
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
    </section>
  );
}
