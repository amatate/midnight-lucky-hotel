import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/i18n/language";
import { LanguageSelector } from "@/app/components/LanguageSelector";
import { AudioSettings } from "@/app/components/AudioSettings";
import { playMechanicalBed, playSfx, unlockAudio } from "@/presentation/audio";
import { BETS, PAYTABLE, classicMath, type ClassicSpin } from "./engine";
import { MACHINE_IDS, MACHINE_INFO, POOL_STEP, beginMachineSpin, changeMachineBet, isFeatureSpin, isMachineId, machineSymbols, settleMachineSpin, type MachineId, type MachineState, type ReelSymbol } from "./machines";
import { machineKey, openMachine, resetMachine, saveMachine, type MachineSnapshot } from "./machine-storage";
import { MachineHead, DIAMOND_CREST } from "./MachineHead";
import { MachineRules, awardDescription } from "./MachineRules";
import { wheelDuration, type WheelMotion } from "./feature-motion";
import { spinDuration, stopTime, type ReelMotion } from "./motion";
import { ClassicIcon } from "./symbols";
import { Reels } from "./Reels";
import { renderClassicMotor } from "./motor";
import { CoinDemo } from "./CoinDemo";
import { PayoutTray } from "./PayoutTray";
import { payoutCoinCue, type CoinCue } from "./coin-plan";
import "./classic.css";
import "./family.css";

type Panel = "payouts" | "history" | "settings" | "reset" | "machines" | null;
const math = classicMath();
const format = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const signed = (value: number) => (value > 0 ? "+" : value < 0 ? "−" : "") + format(Math.abs(value));
const names: Record<ReelSymbol, readonly [string, string]> = {
  cherry: ["樱桃", "Cherry"], lemon: ["柠檬", "Lemon"], bar: ["BAR", "BAR"], bell: ["铃铛", "Bell"], seven: ["红 7", "Red 7"], blank: ["空格", "Blank"], diamond: ["钻石", "Diamond"], wheel: ["轮盘", "Wheel"]
};
const locked = async <T,>(machine: MachineId, action: () => T): Promise<T> => navigator.locks
  ? navigator.locks.request(machineKey(machine), action) : action();

function Sheet({ title, close, children }: { readonly title: string; readonly close: () => void; readonly children: ReactNode }): React.JSX.Element {
  const language = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    node?.showModal(); document.body.style.overflow = "hidden";
    return () => { node?.close(); document.body.style.overflow = overflow; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="classic-sheet" aria-label={title} onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="classic-sheet-inner"><header><h2>{title}</h2><button type="button" onClick={close} aria-label={language === "en" ? "Close" : "关闭"}>×</button></header>{children}</div>
  </dialog>, document.body);
}

export default function ClassicScreen({ onHome }: { readonly onHome: () => void }): React.JSX.Element {
  const [demo, setDemo] = useState(() => new URLSearchParams(location.search).get("demo") === "coins");
  const [machine, setMachine] = useState<MachineId>(() => {
    const id = new URLSearchParams(location.search).get("machine"); return isMachineId(id) ? id : "original";
  });
  const showDemo = (value: boolean) => {
    const url = new URL(location.href);
    if (value) url.searchParams.set("demo", "coins"); else url.searchParams.delete("demo");
    history.replaceState(history.state, "", url); setDemo(value);
  };
  if (demo) return <CoinDemo onBack={() => showDemo(false)} />;
  return <MachineScreen key={machine} machine={machine} onHome={onHome} onDemo={() => showDemo(true)} onChoose={(id) => {
    const url = new URL(location.href);
    if (id === "original") url.searchParams.delete("machine"); else url.searchParams.set("machine", id);
    history.replaceState(history.state, "", url); setMachine(id);
  }} />;
}

function MachineScreen({ machine, onHome, onChoose, onDemo }: { readonly machine: MachineId; readonly onHome: () => void; readonly onChoose: (id: MachineId) => void; readonly onDemo: () => void }): React.JSX.Element {
  const language = useLanguage();
  const t = (zh: string, en: string) => language === "en" ? en : zh;
  const symbolName = (symbol: ReelSymbol) => names[symbol][language === "en" ? 1 : 0];
  const [snapshot, setSnapshot] = useState<MachineSnapshot | null>(null);
  const source = useRef<MachineSnapshot | null>(null);
  const operation = useRef(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [motion, setMotion] = useState<ReelMotion | null>(null);
  const [wheelReady, setWheelReady] = useState(false);
  const [wheelMotion, setWheelMotion] = useState<WheelMotion | null>(null);
  const [stopped, setStopped] = useState(3);
  const [renderer, setRenderer] = useState<"3d" | "2d" | null>(null);
  const [pull, setPull] = useState(0);
  const drag = useRef<{ pointer: number; y: number; progress: number } | null>(null);
  const [reduced, setReduced] = useState(() => {
    try { return localStorage.getItem("midnight-lucky-hotel.reduce-flash") === "1" || (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false); }
    catch { return true; }
  });
  const [award, setAward] = useState<ClassicSpin | null>(null);
  const [count, setCount] = useState(0);
  const [counting, setCounting] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [coinCue, setCoinCue] = useState<CoinCue | null>(null);
  const [threeCoins, setThreeCoins] = useState(() => { try { return localStorage.getItem("midnight-lucky-hotel.classic.coins-3d") !== "0"; } catch { return false; } });
  const state = snapshot?.state;
  const busy = working || motion !== null || counting || (wheelReady && !error) || wheelMotion !== null;
  const canSpin = state !== undefined && state.credits >= state.bet && state.pending === null && !busy && !error && panel === null;

  const accept = useCallback((next: MachineSnapshot) => { source.current = next; setSnapshot(next); }, []);
  const fail = useCallback((cause: unknown) => {
    setError(cause instanceof Error && cause.message === "classic-conflict" ? "conflict" : cause instanceof Error && cause.message === "classic-invalid" ? "invalid" : "storage");
  }, []);
  useEffect(() => {
    let cancelled = false;
    setWorking(true); setError("");
    setWheelReady(false); setWheelMotion(null); setCoinCue(null);
    void locked(machine, () => openMachine(machine)).then((next) => {
      if (!cancelled) {
        accept(next); const last = next.state.history[0];
        setAward(last ?? null); setCount(last?.payout ?? 0);
      }
    }).catch((cause: unknown) => { if (!cancelled) fail(cause); }).finally(() => { if (!cancelled) setWorking(false); });
    return () => { cancelled = true; };
  }, [accept, fail, reload, machine]);

  const commit = useCallback(async (transform: (current: MachineState) => MachineState): Promise<MachineSnapshot | null> => {
    if (operation.current || source.current === null) return null;
    operation.current = true; setWorking(true);
    try {
      const next = await locked(machine, () => { const previous = source.current!; return saveMachine(machine, previous, transform(previous.state)); });
      accept(next); return next;
    } catch (cause) { fail(cause); return null; }
    finally { operation.current = false; setWorking(false); }
  }, [accept, fail, machine]);

  const finishSpin = useCallback(async () => {
    const next = await commit(settleMachineSpin);
    setMotion(null); setStopped(3); setWheelReady(false); setWheelMotion(null);
    const last = next?.state.history[0]; if (!last) return;
    setAward(last);
    setCoinCue(payoutCoinCue(last));
    if (last.payout > 0) { setCount(0); setCounting(true); }
    setCelebrating(last.payout > last.bet);
    if (!document.hidden) {
      if (last.payout >= last.bet * 12) playSfx("big-win");
      else if (last.payout > last.bet) playSfx("win");
      else if (last.payout > 0) playSfx("coin", .85);
    }
  }, [commit]);

  const spin = async () => {
    if (!canSpin || operation.current || state === undefined) return;
    unlockAudio();
    const next = await commit((current) => beginMachineSpin(current, Date.now()));
    if (!next?.state.pending) return;
    setAward(null); setCount(0); setCelebrating(false); setStopped(0); setCoinCue(null);
    setMotion({ from: next.state.stops, to: next.state.pending.stops, startedAt: performance.now(), reduced });
    playSfx("lever"); playSfx("spin", .86);
  };

  useEffect(() => {
    if (motion === null) return;
    const stopMotor = motion.reduced ? () => {} : playMechanicalBed(renderClassicMotor());
    const remaining = (ms: number) => Math.max(0, ms - (performance.now() - motion.startedAt));
    const timers = [0, 1, 2].map((reel) => window.setTimeout(() => {
      setStopped(reel + 1); if (!document.hidden) playSfx("stop", .87 + reel * .1);
    }, remaining(stopTime(reel, motion.reduced))));
    timers.push(window.setTimeout(() => {
      const pending = source.current?.state.pending;
      if (pending && isFeatureSpin(pending) && pending.feature === "wheel") {
        setMotion(null); setStopped(3); setWheelReady(true);
        if (!document.hidden) playSfx("upgrade");
      } else void finishSpin();
    }, remaining(spinDuration(motion.reduced))));
    return () => { timers.forEach(clearTimeout); stopMotor(); };
  }, [motion, finishSpin]);

  useEffect(() => {
    if (!wheelMotion) return;
    const timer = window.setTimeout(() => { void finishSpin(); }, Math.max(0, wheelDuration(wheelMotion.reduced) - (performance.now() - wheelMotion.startedAt)));
    return () => clearTimeout(timer);
  }, [wheelMotion, finishSpin]);
  const startWheel = () => {
    const pending = source.current?.state.pending;
    if (!wheelReady || wheelMotion || error || !pending || !isFeatureSpin(pending) || pending.wheelIndex === null) return;
    unlockAudio(); playSfx("lever");
    const previous = state?.history.find((spin) => isFeatureSpin(spin) && spin.feature === "wheel");
    setWheelReady(false); setWheelMotion({ index: pending.wheelIndex, from: previous && isFeatureSpin(previous) ? previous.wheelIndex ?? 0 : 0, startedAt: performance.now(), reduced });
  };

  useEffect(() => {
    if (!counting || award === null) return;
    const start = performance.now(); let frame = 0; let lastCoin = 0;
    const duration = reduced || award.payout <= award.bet ? 180 : award.payout >= award.bet * 12 ? 1_650 : 850;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const staged = !reduced && isFeatureSpin(award) && award.basePayout > 0 && award.bonusPayout > 0;
      const value = staged ? progress < .42 ? award.basePayout * (1 - (1 - progress / .42) ** 2)
        : progress < .57 ? award.basePayout : award.basePayout + award.bonusPayout * (1 - (1 - (progress - .57) / .43) ** 2)
        : award.payout * (1 - Math.pow(1 - progress, 2));
      setCount(progress === 1 ? award.payout : Math.round(value));
      if (!threeCoins && !reduced && award.payout > award.bet && now - lastCoin > 125 && !document.hidden) { playSfx("coin", .95 + progress * .2); lastCoin = now; }
      if (progress < 1) frame = requestAnimationFrame(tick); else setCounting(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [award, counting, reduced, threeCoins]);
  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => setCelebrating(false), 2_000);
    return () => clearTimeout(timer);
  }, [celebrating]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if ((event.key === machineKey(machine) || event.key === null) && source.current !== null && event.newValue !== source.current.raw) setError("conflict");
    };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, [machine]);

  const net = award === null ? 0 : award.payout - award.bet;
  const big = award !== null && award.payout >= award.bet * 12;
  const jackpot = award !== null && (isFeatureSpin(award) ? award.feature === "jackpot" || award.feature === "diamond-jackpot" : award.payout === award.bet * 150);
  const result = wheelReady ? t("奖励轮盘已解锁 · 按下方按钮启动", "BONUS UNLOCKED · PRESS THE BUTTON BELOW") : wheelMotion ? t("奖金轮盘运行中", "BONUS WHEEL IN MOTION") : motion !== null ? t("转鼓运行中", "REELS IN MOTION") : award === null ? t("选好注额，拉下这一转", "CHOOSE YOUR BET. PULL TO PLAY.")
    : net > 0 ? t(jackpot ? "头奖入袋" : big ? "大奖入袋" : "中奖入袋", jackpot ? "JACKPOT" : big ? "BIG WIN" : "WIN") + " · " + t("净赚 ", "NET +") + (language === "en" ? format(net) : signed(net))
    : net === 0 ? t("回本 · 本转不赚不亏", "BET RETURNED · BREAK EVEN") : t("未中奖 · 本转 ", "NO WIN · NET ") + signed(net);
  const reset = async () => {
    if (operation.current || busy) return;
    operation.current = true; setWorking(true);
    try {
      // Capture before entering the lock so an intervening change is detected, not overwritten.
      const previousRaw = source.current?.raw ?? localStorage.getItem(machineKey(machine));
      const next = await locked(machine, () => resetMachine(machine, previousRaw));
      accept(next); setError(""); setAward(null); setCount(0); setPanel(null); setCelebrating(false); setCoinCue(null);
    } catch (cause) { fail(cause); }
    finally { operation.current = false; setWorking(false); }
  };

  const info = MACHINE_INFO[machine];
  const visibleStops = motion === null && state?.pending ? state.pending.stops : state?.stops ?? [0, 0, 0];
  const lastWheel = state?.history.find((spin) => isFeatureSpin(spin) && spin.feature === "wheel");
  return <section className="classic-page" data-machine={machine} data-reduced={reduced} data-phase={motion ? "spinning" : wheelReady ? "wheel-ready" : wheelMotion ? "wheel-spinning" : counting ? "paying" : "idle"}>
    <nav className="classic-navigation" aria-label={t("经典模式菜单", "Classic mode menu")}>
      <button type="button" disabled={busy} onClick={onHome}>‹ {t("酒店前台", "LOBBY")}</button>
      <button type="button" className="family-choose" disabled={busy} onClick={() => setPanel("machines")}>{t("换机台", "MACHINES")} <span>· {info.number} ▾</span></button>
      <button type="button" disabled={busy} onClick={() => setPanel("settings")}>{t("设置", "SETTINGS")}</button>
    </nav>
    <div className={"classic-cabinet" + (celebrating && !reduced ? " is-winning" : "") + (big && celebrating ? " is-big-win" : "")}>
      <MachineHead machine={machine} state={state} english={language === "en"} multiplier={award && isFeatureSpin(award) ? award.multiplier : 1}
        wheelIndex={lastWheel && isFeatureSpin(lastWheel) ? lastWheel.wheelIndex ?? 0 : 0} wheelMotion={wheelMotion} wheelReady={wheelReady} jackpotLit={jackpot && celebrating}
        wonPool={award && isFeatureSpin(award) && award.feature === "jackpot" && celebrating ? { multiplier: award.poolBefore + POOL_STEP, amount: award.bonusPayout } : null} />
      <div className="classic-meters">
        <div><span>{t("筹码", "CREDITS")}</span><strong data-testid="classic-credits">{format(state ? state.credits - (counting ? (award?.payout ?? 0) - count : 0) : 0)}</strong></div>
        <div><span>{t("本转下注", "BET")}</span><strong>{state?.bet ?? "—"}</strong></div>
        <div className={celebrating ? "lit" : ""}><span>{t("本转赔付", "PAID")}</span><strong data-testid="classic-paid">{format(count)}</strong></div>
      </div>
      <div className="classic-line-label"><span>◈</span><span>{machine === "original" ? t("只有中间一条线计奖", "CENTER LINE PAYS") : info.hint[language === "en" ? 1 : 0]}</span><span>◈</span></div>
      <div className="classic-stage">
        <Reels stops={visibleStops} motion={motion} stopped={stopped} onRenderer={setRenderer} machine={machine} />
        <button type="button" className="classic-lever" data-own-sound disabled={!canSpin} aria-label={t("下拉拉杆，转一次", "Pull lever to spin")}
          style={{ "--pull": pull } as CSSProperties}
          onClick={(event) => { if (event.detail === 0) void spin(); }}
          onPointerDown={(event) => {
            if (!canSpin) return; event.preventDefault(); unlockAudio(); event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointer: event.pointerId, y: event.clientY, progress: 0 };
          }}
          onPointerMove={(event) => {
            if (drag.current?.pointer !== event.pointerId) return;
            const progress = Math.max(0, Math.min(1, (event.clientY - drag.current.y) / 85));
            drag.current.progress = progress; setPull(progress);
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointer !== event.pointerId) return;
            const activate = drag.current.progress >= .62;
            drag.current = null; setPull(0); event.currentTarget.releasePointerCapture(event.pointerId);
            if (activate) void spin();
          }}
          onPointerCancel={() => { drag.current = null; setPull(0); }}>
          <span className="classic-lever-rail" /><span className="classic-lever-arm" /><span className="classic-lever-knob" />
          <span className="classic-lever-legend">{t("下拉", "PULL")}<b>↓</b></span>
        </button>
      </div>
      <div className="classic-annunciator" role="status" aria-live="polite"><i className={motion ? "running" : net > 0 ? "paid" : ""} /><span>{error ? t("机台已暂停 · 请查看下方提示", "MACHINE PAUSED · SEE NOTICE BELOW") : result}</span></div>
      <p className="classic-sr-only" data-testid="classic-result">{motion ? t("正在转动", "Spinning") : state ? machineSymbols(machine, visibleStops).map(symbolName).join(" · ") : ""}</p>
      {machine !== "original" && <p className="family-breakdown" data-testid="feature-breakdown">{wheelReady && state?.pending && isFeatureSpin(state.pending)
        ? t("基础赔付 ", "Base ") + format(state.pending.basePayout) + t(" · 等待轮盘加奖", " · bonus wheel pending")
        : award ? awardDescription(award, language === "en") : t("只计中央线 · 赔付含本转下注", "CENTER LINE ONLY · PAYOUT INCLUDES STAKE")}</p>}
      <div className="classic-controls">
        <fieldset disabled={busy || !!error || !state}><legend>{t("注额 / 每转", "BET / SPIN")}</legend>
          <div>{BETS.map((bet) => <button type="button" key={bet} aria-pressed={state?.bet === bet} onClick={() => void commit((current) => changeMachineBet(current, bet))}>{bet}</button>)}</div>
        </fieldset>
        <button type="button" className={"classic-spin" + (wheelReady ? " is-bonus-ready" : "")} data-own-sound disabled={wheelReady ? !!error || working : !canSpin} onClick={() => wheelReady ? startWheel() : void spin()}>
          <strong>{wheelReady ? t("启动轮盘", "BONUS") : wheelMotion ? t("轮盘转动", "BONUS SPIN") : motion ? t("转动中", "SPINNING") : counting ? t("派奖中", "PAYING") : t("转一转", "SPIN")}</strong><span>{wheelReady || wheelMotion ? t("免费奖励转", "NO EXTRA BET") : state ? t("花费 ", "BET ") + state.bet : "…"}</span>
        </button>
      </div>
      <PayoutTray cue={coinCue} three={threeCoins} reduced={reduced} />
      <div className="classic-service-row"><button type="button" disabled={busy} onClick={() => setPanel("payouts")}>{t("赔付表 / 玩法", "PAYTABLE / RULES")}</button><span>✦</span><button type="button" disabled={busy} onClick={() => setPanel("history")}>{t("机台账本", "LEDGER")}{state && state.spins > 0 ? " · " + state.spins : ""}</button></div>
      <span className="classic-tray-serial" aria-hidden="true">MIDNIGHT · No. {info.number}</span>
    </div>
    {error && <div className="classic-notice" role="alert"><p>{error === "conflict" ? t("另一标签页修改了这台机的记录，已停止操作以免覆盖。请关闭另一页后重新读取。", "Another tab changed this machine. Close that tab and reload its latest record.")
      : error === "invalid" ? t("经典模式记录无法读取，原始记录没有被覆盖。可在设置中明确选择重新开台。", "Classic save cannot be read. Its original data was not overwritten. You may explicitly reset this machine in Settings.")
        : t("保存失败，已暂停操作。请允许浏览器本地存储，再重新读取；未能保存的操作没有生效。", "Storage failed. Play is paused. Allow local storage, then reload; unsaved actions were not applied.")}</p>
      <button type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}>{t("重新读取", "RELOAD SAVE")}</button></div>}
    {!error && state && state.credits < Math.min(...BETS) && !busy && <div className="classic-notice"><p>{t("本次筹码已不足最低下注。可以查看账本，或重新开台领取 1,000 虚拟筹码。", "Not enough credits for the minimum bet. Review the ledger or reset with 1,000 virtual credits.")}</p><button type="button" onClick={() => setPanel("reset")}>{t("重新开台", "RESET MACHINE")}</button></div>}
    {!error && state && state.credits >= Math.min(...BETS) && state.credits < state.bet && !busy && <p className="classic-fine">{t("筹码不足当前注额，请选择更低的下注。", "Choose a smaller bet to keep playing.")}</p>}
    <footer className="classic-caption"><span>{t("仅虚拟筹码 · 无充值、无提现", "VIRTUAL CREDITS · NO PURCHASES OR CASHOUT")}</span><small>{renderer === "3d" ? t("3D 机械转鼓", "3D MECHANICAL REELS") : renderer === "2d" ? t("兼容机台 · 规则相同", "COMPATIBILITY DISPLAY · SAME RULES") : t("机台准备中", "WARMING UP")}</small></footer>

    {panel !== null && <Sheet title={panel === "machines" ? t("机械机台俱乐部", "Mechanical Reel Club") : panel === "payouts" ? t("赔付表与玩法", "Paytable & rules") : panel === "history" ? t("机台账本", "Machine ledger") : panel === "reset" ? t("重新开台？", "Reset this machine?") : t("机台设置", "Machine settings")} close={() => setPanel(null)}>
      {panel === "machines" && <><p>{t("每台独立保存筹码与账本。换台不重开，随时回来继续。", "Each machine keeps its own credits and ledger. Switching never resets your progress.")}</p><div className="family-selector">{MACHINE_IDS.map((id) => <button type="button" key={id} aria-pressed={id === machine} onClick={() => { if (id !== machine) onChoose(id); else setPanel(null); }}>
        <span className={"family-selector-emblem " + id} aria-hidden="true">{id === "diamond" ? <img src={DIAMOND_CREST} alt="" /> : id === "wheel" ? "◉" : id === "vault" ? "777" : "7"}</span>
        <span><strong>{language === "en" ? MACHINE_INFO[id].en : MACHINE_INFO[id].zh}</strong><small>{MACHINE_INFO[id].hint[language === "en" ? 1 : 0]}</small></span><span>{id === machine ? "✓" : "›"}</span>
      </button>)}</div></>}
      {panel === "payouts" && machine !== "original" && <MachineRules machine={machine} state={state} english={language === "en"} />}
      {panel === "payouts" && machine === "original" && <>
        <p>{t("选下注 → 下拉拉杆（或按转一转）→ 三轮自动停下。只看中间一行；上下行不计奖。", "Choose a bet → pull the lever (or press Spin) → all three reels stop automatically. Only the center row pays.")}</p>
        <div className="classic-paytable">{PAYTABLE.map((row) => <div key={row.symbol + row.count}>
          <span className="classic-pay-icons">{Array.from({ length: row.count }, (_, i) => <ClassicIcon symbol={row.symbol} key={i} />)}</span>
          <span>{row.symbol === "cherry" && row.count < 3 ? t("中央线 " + row.count + " 个", row.count + " on center line") : symbolName(row.symbol) + " × 3"}</span><strong>×{row.multiplier}</strong>
        </div>)}</div>
        <p>{t("赔付 = 注额 × 倍数（含本金）；只取一档，不叠加。1 个樱桃退还本转下注，不是净赚。空格、其他混搭不中奖。", "Payout = bet × multiplier, including the stake. Awards do not stack. One cherry returns the bet: it is not a profit. Blanks and other mixed lines do not pay.")}</p>
        <p>{t("例如下注 10，三枚铃铛赔付 250，扣掉本转下注后净赚 240。", "Example: bet 10, land three bells, receive 250. Net profit after the bet is 240.")}</p>
        <details><summary>{t("概率与模拟边界", "Odds & simulation limits")}</summary>
          <p>{t("每轮 20 个等概率停点，共 8,000 种中央线组合。", "Each reel has 20 equally likely stops: 8,000 center-line combinations.")} {t("理论返还率 ", "Theoretical return ")}{(math.rtp * 100).toFixed(2)}%{t("，有赔付概率 ", "; payout probability ")}{(math.hitRate * 100).toFixed(2)}%{t("（包含回本），净盈利概率 ", " (including break-even), profit probability ")}{(math.profitRate * 100).toFixed(2)}%。</p>
          <p>{t("这是固定赔付表的长期数学均值，不保证你这次的收益。经典机台没有升级，也不随输赢改变概率；它是独立的虚拟筹码模拟，不是经过认证的赌场设备。", "These are long-run mathematical averages, not a promise for your session. There are no upgrades or adaptive odds. This is a virtual-credit simulation, not certified casino equipment.")}</p>
          <p>{t("结果在动画开始前保存。关闭或刷新会补结算这一次，不会重新抽取。拉杆力度、点击时机不改变结果。", "The outcome is saved before animation. Closing or refreshing settles that same spin, without rerolling. Pull force and click timing do not change the result.")}</p>
        </details>
      </>}
      {panel === "history" && state && <>
        <div className="classic-ledger-totals"><div>{t("累计下注", "TOTAL BET")}<strong>{format(state.wagered)}</strong></div><div>{t("累计赔付", "TOTAL PAID")}<strong>{format(state.paid)}</strong></div><div>{t("净变化", "NET CHANGE")}<strong>{signed(state.paid - state.wagered)}</strong></div></div>
        <p>{t("筹码 = 开台 1,000 − 累计下注 + 累计赔付。最近 80 转逐笔保留，总计不截断。", "Credits = starting 1,000 − total bets + total payouts. The last 80 spins are listed; totals cover the whole session.")}</p>
        {state.history.length === 0 && <p>{t("还没有转动记录。", "No spins yet.")}</p>}
        <ol className="classic-ledger">{state.history.map((entry) => <li key={entry.ordinal}><span>#{entry.ordinal}</span><div className="classic-ledger-symbols" aria-label={machineSymbols(machine, entry.stops).map(symbolName).join(" · ")}>{machineSymbols(machine, entry.stops).map((symbol, i) => <ClassicIcon symbol={symbol} key={i} />)}</div><div><strong>{signed(entry.payout - entry.bet)}</strong><small>{t("下注 ", "Bet ")}{entry.bet}{t(" · 赔付 ", " · paid ")}{format(entry.payout)}</small></div>{isFeatureSpin(entry) && <p className="family-ledger-detail">{awardDescription(entry, language === "en")}{entry.feature === "jackpot" && <span>{t(" · 奖池重置为 ×200", " · pool reset to ×200")}</span>}</p>}</li>)}</ol>
      </>}
      {panel === "settings" && <>
        <LanguageSelector /><AudioSettings />
        <label className="classic-reduce"><input type="checkbox" checked={reduced} onChange={(event) => {
          const value = event.target.checked; setReduced(value);
          try { localStorage.setItem("midnight-lucky-hotel.reduce-flash", value ? "1" : "0"); } catch { /* Keep the accessible session preference even if storage is blocked. */ }
        }} />{t("减少动态 / 关闭飞散金币", "Reduced motion / no flying coins")}</label>
        <label className="classic-coin-option"><input type="checkbox" checked={threeCoins} onChange={(event) => {
          const value = event.target.checked; setThreeCoins(value);
          try { localStorage.setItem("midnight-lucky-hotel.classic.coins-3d", value ? "1" : "0"); } catch { /* Session preference remains usable. */ }
        }} />{t("3D 金币接币盘（关闭使用简化动画）", "3D coin tray (off: lightweight animation)")}</label>
        <button type="button" className="coin-demo-link" onClick={onDemo}>{t("试试落币效果 · 不消耗筹码", "Try the coin demo · no credits spent")}</button>
        <p>{t("每台机器独立保存筹码和账本，与酒店闯关也完全分开。声音、语言与减少动态设置共用。", "Every machine has independent credits and a ledger, separate from hotel runs. Audio, language and reduced motion are shared.")}</p>
        <button type="button" onClick={() => setPanel("reset")}>{t("重新开台 · 1,000 虚拟筹码", "Reset machine · 1,000 virtual credits")}</button>
      </>}
      {panel === "reset" && <><p>{t("仅清除「" + info.zh + "」的筹码和账本，以 1,000 筹码重新开始。其他机台、酒店进度与收藏不受影响。", "Reset only " + info.en + " to 1,000 credits and clear its ledger. Other machines, hotel runs and collections are unaffected.")}</p>{machine === "vault" && <p>{t("注意：金库的累积奖池也会重置为 ×200。", "The Vault's accumulated pool will also reset to ×200.")}</p>}<div className="classic-reset-actions"><button type="button" onClick={() => setPanel(null)}>{t("保留当前机台", "Keep current machine")}</button><button type="button" disabled={busy} onClick={() => void reset()}>{t("确认重新开台", "Confirm reset")}</button></div></>}
    </Sheet>}
  </section>;
}
