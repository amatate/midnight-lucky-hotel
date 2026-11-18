import { UPGRADES } from "@/content/upgrades";
import { RoomChoices, RoomResult, WorkshopChoice } from "@/app/components/HotelChallenge";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";
import { buildRunSummary } from "@/sim/run-summary";
import { getNextOvertimeBet } from "@/core/progression";
import type { MachineEstimate } from "@/sim/types";
import { StayPanel } from "@/story/StayPanel";
import { getLanguage } from "@/i18n/language";

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
  readonly onHome?: (() => void) | undefined;
}

export function RunSummary({ state, trajectory, onCommand, onRestartSameSeed, onRestartNextSeed, onHome }: RunSummaryProps): React.JSX.Element {
  const summary = buildRunSummary(state, trajectory);
  const en = getLanguage() === "en", t = (zh: string, english: string) => en ? english : zh;
  const title = state.stay ? state.phase === "RUN_LOST" ? t("本次入住结束", "Your stay has ended") : state.phase === "RUN_WON" ? t("退房报告", "Checkout receipt") : t("澪的入住结算", "Your room bill with Mio") : state.phase === "RUN_LOST"
    ? "本局失败"
    : state.phase === "RUN_WON"
      ? "本局胜利 · 已结账"
      : state.phase === "AFTER_HOURS"
        ? state.hotel?.challenge != null ? "客房结算" : "加班边界"
        : "本班完成";
  const ended = state.phase === "RUN_LOST" || state.phase === "RUN_WON";
  const canVisitLounge = !ended && state.exitUnlocked && (!state.stay || state.stay.paid.includes(0));
  const nextBet = getNextOvertimeBet(state);
  const block = summary.block;
  const rounds = state.hotel?.challenge?.rounds;
  const roundNumber = rounds?.current ?? (state.stay && state.afterHoursLevel === 0 ? state.shift : null);
  const blockLabel = roundNumber !== null ? `第 ${roundNumber} 回合` : "本段";

  return (
    <section className="run-summary" aria-label="本局总结">
      <p className="eyebrow">本局账单</p>
      <h2>{title}</h2>
      {state.stay ? <StayPanel state={state} onCommand={onCommand} /> : <RoomResult state={state} />}
      {!ended && state.stay && <RoomChoices state={state} onCommand={onCommand} />}
      <strong>{ended ? "最终余额" : "当前钱包"} {money(state.bankroll)}</strong>
      {block !== null ? <section aria-label={roundNumber !== null ? "当前回合收支" : "本次挑战收支"}>
        {rounds && <p>下方仅为第 {rounds.current} 回合收支；全房奖金见上方累计目标，钱包包含此前所有回合。</p>}
        {!rounds && roundNumber !== null && <p>{t(`下方仅为第 ${roundNumber} 回合收支，钱包包含整局所有收支。完整流水可展开下方累计账本。`, `Only round ${roundNumber} is listed below. Your wallet includes the whole stay; expand the cumulative ledger for the full totals.`)}</p>}
        <dl>
          <div><dt>{blockLabel}奖金</dt><dd>{money(block.payout)}</dd></div>
          <div><dt>{blockLabel}下注</dt><dd>−{money(block.wager)}</dd></div>
          <div><dt>{blockLabel}服务／献祭</dt><dd>−{money(block.otherCosts)}</dd></div>
          <div><dt>{blockLabel}净收益</dt><dd>{signedMoney(block.net)}</dd></div>
        </dl>
        <p>{blockLabel}钱包：{money(block.start)} → {money(block.end)}</p>
        {block.afterBlockCosts > 0 && <p>{t(`结算后改造、整备或房费另支出 ${money(block.afterBlockCosts)}；当前钱包 ${money(state.bankroll)}。`, `Post-round upgrades, workshop or room fees: ${money(block.afterBlockCosts)}. Current wallet ${money(state.bankroll)}.`)}</p>}
      </section> : <p>旧记录缺少完整的本段起止钱包，仅显示可核实的累计流水。</p>}
      <details><summary>整局累计账本（从开局至今）</summary>
        <p>累计奖金 {money(summary.totalPayout)} · 累计下注 −{money(summary.totalWager)}</p>
        <p>餐费 −{money(state.expenses.kitchen)} · 献祭／奉献 −{money(state.expenses.chapel)} · 维修 −{money(state.expenses.repair)} · 金币整备 −{money(summary.workshopExpenses)}</p>
        {state.stay && <p>{t("累计已付房费", "Room fees paid")} −{money(state.expenses.rent ?? 0)}</p>}
        <p>相对开局 ¥100，余额变化 {signedMoney(summary.bankrollDelta)}</p>
        <p>{summary.largestIncome === null
        ? "最大收入：暂无"
        : `最大收入：${INCOME_LABELS[summary.largestIncome.source]} +${money(summary.largestIncome.amount)}`}</p>
      </details>
      {summary.partContributions.length > 0 && <section aria-label="部件收入贡献"><h3>机器靠什么赚钱</h3>
        {summary.partContributions.slice(0, 3).map((part) => <p key={part.id}>{UPGRADES[part.id].name}：+{money(part.amount)} · {part.payingSpins} 转产生收入</p>)}
        <p className="fine-print">这里只列部件直接发的奖金。改图案、重转或加成间接带来的收益，不会重复算给部件。</p>
      </section>}
      {!ended && summary.buildSuggestion !== null && <p>补强方向：{UPGRADES[summary.buildSuggestion].name}。可在整备或后续升级中寻找，不保证本次出现。</p>}
      <WorkshopChoice state={state} onCommand={onCommand} />
      {summary.currentRtp !== null && <p>当前模拟 RTP {(summary.currentRtp * 100).toFixed(0)}% · 仅为估算</p>}
      {state.phase === "SHIFT_COMPLETE" && state.exitUnlocked && (
        <div className="summary-actions">
          <button type="button" onClick={() => onCommand({ type: "CASH_OUT" })}>{state.stay ? t("退房留档", "Check out") : "结账看报告"}</button>
          {(!state.stay || state.stay.paid.includes(0)) && <button type="button" aria-description={`下一转下注 ${money(nextBet)}；完成三转后有一次免费升级`} onClick={() => onCommand({ type: "CONTINUE" })}>{state.stay ? t("去大堂自由玩", "Play in the lounge") : "继续加班"}</button>}
        </div>
      )}
      {state.phase === "AFTER_HOURS" && state.currentCandidates === null && (
        <div className="summary-actions">
          {state.exitUnlocked && <button type="button" onClick={() => onCommand({ type: "CASH_OUT" })}>{state.stay ? t("退房留档", "Check out") : "结账看报告"}</button>}
          <button type="button" aria-description={`下一转下注 ${money(nextBet)}；完成三转后有一次免费升级`} onClick={() => onCommand({ type: "CONTINUE" })}>{state.stay ? t("去大堂自由玩", "Play in the lounge") : "继续加班"}</button>
        </div>
      )}
      {canVisitLounge && <p>{state.stay ? t(`大堂自由玩下一转 ${money(nextBet)}，三转后澪送一次强化。不计入客房任务；离开未付费房间会放弃该次任务成绩，重新申请需重做。大堂下注每段涨 25%，不保证赚钱。`, `Lounge bet: ${money(nextBet)}; Mio offers an upgrade after three spins. Lounge play does not count toward room tasks. Leaving an unpaid room discards that attempt. Lounge bets rise 25% per block; profit is not guaranteed.`) : `自由加班下一转：${money(nextBet)}（当前档位）；完成三次付费转后有一次免费升级。房间重试不涨加班价。`}</p>}
      {!state.stay && <RoomChoices state={state} onCommand={onCommand} />}
      {ended && (
        <div className="summary-actions">
          {onHome && <button className="primary-button" type="button" onClick={onHome}>返回前台</button>}
          <button type="button" onClick={onRestartSameSeed}>同种子重开</button>
          <button type="button" onClick={onRestartNextSeed}>下一种子重开</button>
        </div>
      )}
    </section>
  );
}
