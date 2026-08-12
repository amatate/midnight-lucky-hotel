import { getCurrentBet } from "@/core/progression";
import type { RunState, SymbolId } from "@/core/types";
import type { MachineEstimate } from "@/sim/types";
import type { EstimateStatus } from "@/app/useEstimate";

const BAND_LABELS = {
  danger: "凶险",
  "near-break-even": "接近持平",
  favorable: "有利"
} as const;

const SYMBOL_LABELS: Readonly<Record<SymbolId, string>> = {
  cherry: "樱桃",
  lemon: "柠檬",
  bell: "铃铛",
  seven: "幸运7",
  wild: "百搭",
  blank: "空白",
  food: "食物",
  crack: "裂纹"
};

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface HudProps {
  readonly state: RunState;
  readonly estimate: MachineEstimate | null;
  readonly estimateStatus: EstimateStatus;
}

export function Hud({ state, estimate, estimateStatus }: HudProps): React.JSX.Element {
  const isWaiting = estimateStatus === "pending" || estimateStatus === "unavailable";
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
        <summary>胜率区间</summary>
        {isWaiting && <p>会计仍在计算</p>}
        {estimate !== null && <p className={`risk-band risk-${estimate.band}`}>{BAND_LABELS[estimate.band]}</p>}
        {state.toolLevel >= 1 && estimate?.symbolProbabilities !== null && estimate?.symbolProbabilities !== undefined && (
          <div className="tool-readout">
            <strong>计算器 · 符号概率</strong>
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
            <p>RTP {percent(estimate.rtpMean)}</p>
            {estimate.rtp95 !== null && <p>95% 区间 {percent(estimate.rtp95[0])}–{percent(estimate.rtp95[1])}</p>}
          </div>
        )}
        {state.toolLevel >= 3 && estimate?.ruinProbability !== null && estimate?.ruinProbability !== undefined && (
          <div className="tool-readout">
            <p>破产风险 {percent(estimate.ruinProbability)}</p>
            <p>赔付波动 {estimate.payoutStandardDeviation?.toFixed(2)}</p>
            <p>预计可承受 {estimate.expectedAffordableSpins?.toFixed(1)} 次</p>
          </div>
        )}
      </details>
    </section>
  );
}
