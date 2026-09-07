import { UPGRADES } from "@/content/upgrades";
import { RoomChoices, RoomResult, WorkshopChoice } from "@/app/components/HotelChallenge";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";
import { buildRunSummary } from "@/sim/run-summary";
import { getNextOvertimeBet } from "@/core/progression";
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
        ? state.hotel?.challenge != null ? "客房结算" : "加班边界"
        : "本班完成";
  const ended = state.phase === "RUN_LOST" || state.phase === "RUN_WON";
  const nextBet = getNextOvertimeBet(state);
  const block = summary.block;

  return (
    <section className="run-summary" aria-label="本局总结">
      <p className="eyebrow">运行报告</p>
      <h2>{title}</h2>
      <RoomResult state={state} />
      <strong>{ended ? "最终余额" : "当前钱包"} {money(state.bankroll)}</strong>
      {block !== null ? <section aria-label="本次挑战收支">
        <dl>
          <div><dt>本段奖金</dt><dd>{money(block.payout)}</dd></div>
          <div><dt>本段下注</dt><dd>−{money(block.wager)}</dd></div>
          <div><dt>本段服务／献祭</dt><dd>−{money(block.otherCosts)}</dd></div>
          <div><dt>本段净收益</dt><dd>{signedMoney(block.net)}</dd></div>
        </dl>
        <p>本段钱包：{money(block.start)} → {money(block.end)}</p>
        {block.afterBlockCosts > 0 && <p>结算后改造／整备另支出 {money(block.afterBlockCosts)}；当前钱包 {money(state.bankroll)}。</p>}
      </section> : <p>旧记录缺少完整的本段起止钱包，仅显示可核实的累计流水。</p>}
      <details><summary>整局累计账本（从开局至今）</summary>
        <p>累计奖金 {money(summary.totalPayout)} · 累计下注 −{money(summary.totalWager)}</p>
        <p>餐费 −{money(state.expenses.kitchen)} · 献祭／奉献 −{money(state.expenses.chapel)} · 维修 −{money(state.expenses.repair)} · 金币整备 −{money(summary.workshopExpenses)}</p>
        <p>相对开局 ¥100，余额变化 {signedMoney(summary.bankrollDelta)}</p>
        <p>{summary.largestIncome === null
        ? "最大收入：暂无"
        : `最大收入：${INCOME_LABELS[summary.largestIncome.source]} +${money(summary.largestIncome.amount)}`}</p>
      </details>
      {summary.partContributions.length > 0 && <section aria-label="部件收入贡献"><h3>机器靠什么赚钱</h3>
        {summary.partContributions.slice(0, 3).map((part) => <p key={part.id}>{UPGRADES[part.id].name}：+{money(part.amount)} · {part.payingSpins} 转产生收入</p>)}
        <p className="fine-print">按留存转账统计直接赔付；改轮、重转与倍率的间接贡献不在此重复归因。</p>
      </section>}
      {!ended && summary.buildSuggestion !== null && <p>补强方向：{UPGRADES[summary.buildSuggestion].name}。可在整备或后续升级中寻找，不保证本次出现。</p>}
      <WorkshopChoice state={state} onCommand={onCommand} />
      {summary.currentRtp !== null && <p>当前模拟 RTP {(summary.currentRtp * 100).toFixed(0)}% · 仅为估算</p>}
      {state.phase === "SHIFT_COMPLETE" && state.exitUnlocked && (
        <div className="summary-actions">
          <button className="primary-button" type="button" onClick={() => onCommand({ type: "CASH_OUT" })}>结账离开</button>
          <button type="button" aria-description={`下一转下注 ${money(nextBet)}；完成三转后有一次免费升级`} onClick={() => onCommand({ type: "CONTINUE" })}>继续加班</button>
        </div>
      )}
      {state.phase === "AFTER_HOURS" && state.currentCandidates === null && (
        <div className="summary-actions">
          {state.exitUnlocked && <button className="primary-button" type="button" onClick={() => onCommand({ type: "CASH_OUT" })}>结账离开</button>}
          <button type="button" aria-description={`下一转下注 ${money(nextBet)}；完成三转后有一次免费升级`} onClick={() => onCommand({ type: "CONTINUE" })}>继续加班</button>
        </div>
      )}
      {!ended && state.exitUnlocked && <p>自由加班下一转：{money(nextBet)}（当前档位）；完成三次付费转后有一次免费升级。房间重试不涨加班价。</p>}
      <RoomChoices state={state} onCommand={onCommand} />
      {ended && (
        <div className="summary-actions">
          <button className="primary-button" type="button" onClick={onRestartSameSeed}>同种子重开</button>
          <button type="button" onClick={onRestartNextSeed}>下一种子重开</button>
        </div>
      )}
    </section>
  );
}
