import { useState } from "react";
import { AUTO_COUNTS, AUTO_LIMITS, type AutoOptions, type AutoReason, type AutoRun } from "./autoplay";

const reasons: Record<AutoReason, readonly [string, string]> = {
  complete: ["本次转数已完成", "Session complete"], manual: ["已停止自动游玩", "Automatic play stopped"],
  background: ["离开页面，自动游玩已停止", "Stopped when you left the page"], funds: ["筹码不足，已停止", "Stopped: not enough credits"],
  limit: ["下一转可能超过亏损上限，已停止", "Stopped before the next bet could exceed your loss limit"],
  "big-win": ["收下大奖，先歇一会儿", "Big win — taking a break"], error: ["保存异常，已停止；请重新读取机台", "Save error — reload the machine before continuing"]
};
const number = (n: number) => n.toLocaleString("en-US");
const net = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + number(Math.abs(n));

export function AutoPlaySetup({ english, bet, onStart }: { readonly english: boolean; readonly bet: number; readonly onStart: (options: AutoOptions) => void }): React.JSX.Element {
  const [count, setCount] = useState(25); const [lossLimit, setLimit] = useState(100); const [stopOnBig, setStopOnBig] = useState(true);
  const t = (zh: string, en: string) => english ? en : zh;
  return <form className="classic-auto-setup" onSubmit={event => { event.preventDefault(); onStart({ count, lossLimit, stopOnBig }); }}>
    <p>{t(`每转下注 ${bet}。自动模式照常扣除虚拟筹码，概率与手动相同。`, `Bet ${bet} per spin. Automatic play spends virtual credits with exactly the same odds as manual play.`)}</p>
    <fieldset><legend>{t("连续转几次？", "How many spins?")}</legend><div className="classic-auto-choices">{AUTO_COUNTS.map(value => <button key={value} type="button" aria-pressed={count === value} onClick={() => setCount(value)}>{value}</button>)}</div></fieldset>
    <fieldset><legend>{t("本次净亏损上限（筹码）", "Session net-loss limit (credits)")}</legend><div className="classic-auto-choices">{AUTO_LIMITS.map(value => <button key={value} type="button" aria-pressed={lossLimit === value} onClick={() => setLimit(value)}>{value}</button>)}</div></fieldset>
    <p className="classic-auto-help">{t("下一转可能超过上限时就停。不自动加注，不补币。", "Stops before a bet could exceed the limit. No automatic bet increases or refills.")}</p>
    <label><input type="checkbox" checked={stopOnBig} onChange={event => setStopOnBig(event.target.checked)} />{t("单次赔付达到下注 12 倍时停止", "Stop when a payout reaches 12× the bet")}</label>
    <p className="classic-auto-help">{t("停止后会结清正在转的这一转。切到后台会停止；回来或刷新后不会自行续转。", "Stop finishes an already reserved spin. Leaving the page stops the session; returning or reloading never restarts it.")}</p>
    <button className="classic-auto-start" type="submit">{t(`开始自动 · 最多 ${count} 转`, `Start automatic play · up to ${count} spins`)}</button>
  </form>;
}

export function AutoPlayControls({ run, english, disabled, busy, onOpen, onStop }: {
  readonly run: AutoRun | null; readonly english: boolean; readonly disabled: boolean; readonly busy: boolean;
  readonly onOpen: () => void; readonly onStop: () => void;
}): React.JSX.Element {
  const t = (zh: string, en: string) => english ? en : zh;
  const active = run !== null && run.status !== "stopped";
  return <section className="classic-auto" aria-label={t("自动游玩控制", "Automatic play controls")}>
    <div className="classic-auto-bar">
      <span><i className={active ? "is-on" : ""} aria-hidden="true" />{active ? t(`自动 · ${run.completed}/${run.count}`, `AUTO · ${run.completed}/${run.count}`) : t("自动游玩", "AUTOMATIC PLAY")}</span>
      {active ? <button type="button" className="classic-auto-stop" disabled={run.status === "stopping"} onClick={onStop}>{run.status === "stopping" ? t("本转结清后停止", "FINISHING THIS SPIN") : t("停止", "STOP")}</button>
        : <button type="button" disabled={disabled} onClick={onOpen}>{t("选择转数", "CHOOSE SPINS")} ›</button>}
    </div>
    {run && <div className="classic-auto-report" data-testid="auto-report">
      <p aria-live="polite">{run.status === "stopped" && run.reason ? reasons[run.reason][english ? 1 : 0] : t("每转结清后继续 · 随时可停", "Continues after each payout · stop anytime")}</p>
      <span>{t("已结清 ", "Settled ")}{run.completed}{t(" 转 · 净变化 ", " spins · net ")}<strong>{net(run.paid - run.wagered)}</strong></span>
      {!active && !busy && <details><summary>{t("查看本次小结", "Session summary")}</summary><dl>
        <div><dt>{t("总下注", "Total bet")}</dt><dd>{number(run.wagered)}</dd></div>
        <div><dt>{t("总赔付（含本金）", "Total paid (includes stake)")}</dt><dd>{number(run.paid)}</dd></div>
        <div><dt>{t("最大单次赔付", "Largest payout")}</dt><dd>{number(run.largest)}</dd></div>
      </dl><p>{t("这里只显示本次已成功入账的转动；逐笔记录在机台账本。", "Only successfully settled spins appear here. Individual results are in the machine ledger.")}</p></details>}
    </div>}
  </section>;
}
