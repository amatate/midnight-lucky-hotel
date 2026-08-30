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
}

export function Hud({ state, estimate, estimateStatus }: HudProps): React.JSX.Element {
  const isWaiting = state.toolLevel >= 1 && (estimateStatus === "pending" || estimateStatus === "unavailable");
  return (
    <section className="hud" aria-label="本局状态">
      <div className="hud-primary">
        <strong>余额 ¥{state.bankroll}</strong>
        <span>目标 ¥{state.checkoutTarget}</span>
        <span>第 {state.shift} 班 · {state.baseSpinsInShift}/3</span>
        <span>下注 ¥{getCurrentBet(state)}</span>
      </div>
      <div className="hud-resources">
        <span>专注 {state.interventionPoints}/{state.maxInterventionPoints}</span>
        <span>小费 {state.tips}</span>
        <span>躁动 {state.agitation}</span>
      </div>
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
