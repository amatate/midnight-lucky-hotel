import { UPGRADES } from "@/content/upgrades";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";
import { buildRunSummary } from "@/sim/run-summary";
import type { MachineEstimate } from "@/sim/types";

const INCOME_LABELS = {
  base: "基础赔付", part: "机器部件", intervention: "干预", service: "服务",
  agitation: "躁动加成", overload: "过载"
} as const;

function money(value: number): string {
  return `¥${Object.is(value, -0) ? 0 : value}`;
}

function signedMoney(value: number): string {
  if (value > 0) return `+${money(value)}`;
  if (value < 0) return `-${money(Math.abs(value))}`;
  return money(0);
}

interface RunSummaryProps {
  readonly state: RunState;
  readonly trajectory: readonly MachineEstimate[];
  readonly onCommand: (command: GameCommand) => void;
  readonly onRestartSameSeed: () => void;
  readonly onRestartNextSeed: () => void;
}

export function RunSummary({ state, trajectory, onCommand, onRestartSameSeed, onRestartNextSeed }: RunSummaryProps): React.JSX.Element {
  const summary = buildRunSummary(state, trajectory);
  const title = state.phase === "RUN_LOST"
    ? "本局失败"
    : state.phase === "RUN_WON"
      ? "本局胜利 · 已结账"
      : state.phase === "AFTER_HOURS"
        ? "加班边界"
        : "本班完成";
  const ended = state.phase === "RUN_LOST" || state.phase === "RUN_WON";

  return (
    <section className="run-summary" aria-label="本局总结">
      <p className="eyebrow">运行报告</p>
      <h2>{title}</h2>
      <strong>最终余额 {money(state.bankroll)}</strong>
      <dl>
        <div><dt>余额变化</dt><dd>余额变化 {signedMoney(summary.bankrollDelta)}</dd></div>
        <div><dt>转轮流水</dt><dd>下注 {money(summary.totalWager)} · 赔付 {money(summary.totalPayout)}</dd></div>
      </dl>
      <p>{summary.largestIncome === null
        ? "最大收入：暂无"
        : `最大收入：${INCOME_LABELS[summary.largestIncome.source]} +${money(summary.largestIncome.amount)}`}</p>
      {summary.buildSuggestion !== null && <p>构筑提示：{UPGRADES[summary.buildSuggestion].name}</p>}
      {summary.currentRtp !== null && <p>当前模拟 RTP {(summary.currentRtp * 100).toFixed(0)}% · 仅为估算</p>}
      {state.phase === "SHIFT_COMPLETE" && state.exitUnlocked && (
        <div className="summary-actions">
          <button className="primary-button" type="button" onClick={() => onCommand({ type: "CASH_OUT" })}>结账离开</button>
          <button type="button" onClick={() => onCommand({ type: "CONTINUE" })}>继续加班</button>
        </div>
      )}
      {state.phase === "AFTER_HOURS" && state.currentCandidates === null && (
        <div className="summary-actions">
          {state.exitUnlocked && <button className="primary-button" type="button" onClick={() => onCommand({ type: "CASH_OUT" })}>结账离开</button>}
          <button type="button" onClick={() => onCommand({ type: "CONTINUE" })}>继续加班</button>
        </div>
      )}
      {ended && (
        <div className="summary-actions">
          <button className="primary-button" type="button" onClick={onRestartSameSeed}>同种子重开</button>
          <button type="button" onClick={onRestartNextSeed}>下一种子重开</button>
        </div>
      )}
    </section>
  );
}
