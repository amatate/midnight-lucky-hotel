import { useEffect, useRef, useState } from "react";
import { ActionBar } from "@/app/components/ActionBar";
import { CoinBurst } from "@/app/components/CoinBurst";
import { Hud } from "@/app/components/Hud";
import { PartsBar } from "@/app/components/PartsBar";
import { PullLever } from "@/app/components/PullLever";
import { RunSummary } from "@/app/components/RunSummary";
import { SlotMachine } from "@/app/components/SlotMachine";
import { UpgradePicker } from "@/app/components/UpgradePicker";
import { WinPresentation } from "@/app/components/WinPresentation";
import { useEstimate } from "@/app/useEstimate";
import { useGame } from "@/app/useGame";
import { useAutomaticSpinFlow } from "@/app/useAutomaticSpinFlow";
import { useSettlementPresentation } from "@/app/useSettlementPresentation";
import { SERVICE_PRESENTATIONS } from "@/content/player-copy";
import { UPGRADES } from "@/content/upgrades";
import type { RunState } from "@/core/types";
import { unlockAudio } from "@/presentation/audio";
import { feedbackPlan } from "@/presentation/feedback";
import type { MachineEstimate } from "@/sim/types";

const PHASE_LABELS = {
  CHOOSING_SERVICE: "选择服务",
  READY_TO_SPIN: "准备拉动",
  SPINNING: "转轮旋转中",
  AWAITING_INTERVENTION: "等待干预",
  RESOLVING_EFFECTS: "结算演出",
  CHOOSING_UPGRADE: "选择升级",
  SHIFT_COMPLETE: "班次完成",
  RUN_WON: "本局胜利",
  RUN_LOST: "本局失败",
  AFTER_HOURS: "加班时间"
} as const;

const REDUCE_FLASH_KEY = "midnight-lucky-hotel.reduce-flash";

function storedReduceFlash(): boolean {
  try {
    return localStorage.getItem(REDUCE_FLASH_KEY) === "1";
  } catch {
    return false;
  }
}

function systemReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface GameScreenProps {
  readonly seed: number;
  readonly initialState?: RunState;
}

export function GameScreen({ seed, initialState }: GameScreenProps): React.JSX.Element {
  const game = useGame(seed, initialState);
  const { estimate, status: estimateStatus } = useEstimate(game.state);
  const [trajectory, setTrajectory] = useState<readonly MachineEstimate[]>([]);
  const lastEstimate = useRef<MachineEstimate | null>(null);
  const [documentHidden, setDocumentHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [recoveryOpen, setRecoveryOpen] = useState(game.wasRecovered);
  const [reduceFlash, setReduceFlash] = useState(storedReduceFlash);
  const [osReducedMotion, setOsReducedMotion] = useState(systemReducedMotion);
  const effectiveReducedMotion = reduceFlash || osReducedMotion;

  const motionPlan = useAutomaticSpinFlow({
    state: game.state,
    paused: documentHidden || recoveryOpen,
    reducedMotion: effectiveReducedMotion,
    onCommand: game.send
  });
  const visibleMotionPlan = documentHidden || recoveryOpen ? null : motionPlan;
  const settlementPresentation = useSettlementPresentation({
    state: game.state,
    paused: documentHidden || recoveryOpen,
    reducedMotion: effectiveReducedMotion,
    onCommand: game.send
  });
  const settlementFeedback = settlementPresentation === null
    ? null
    : feedbackPlan(settlementPresentation.summary.tier, effectiveReducedMotion);
  const presentedThroughSequence = settlementPresentation === null
    ? undefined
    : settlementPresentation.done
      ? Math.max(0, ...game.state.pendingEvents.map((event) => event.sequence))
      : settlementPresentation.currentEvent?.sequence ?? null;

  useEffect(() => {
    if (estimate === null || estimate === lastEstimate.current) return;
    lastEstimate.current = estimate;
    setTrajectory((current) => [...current, estimate]);
  }, [estimate]);

  useEffect(() => {
    const onVisibility = () => setDocumentHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setOsReducedMotion(event.matches);
    setOsReducedMotion(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  const restartSameSeed = () => {
    setRecoveryOpen(false);
    setTrajectory([]);
    lastEstimate.current = null;
    game.restartSameSeed();
  };
  const restartNextSeed = () => {
    setRecoveryOpen(false);
    setTrajectory([]);
    lastEstimate.current = null;
    game.restartNextSeed();
  };
  const isRunSummary = game.state.phase === "SHIFT_COMPLETE" || game.state.phase === "RUN_WON" ||
    game.state.phase === "RUN_LOST" || (game.state.phase === "AFTER_HOURS" && game.state.currentCandidates === null);

  return (
    <div
      className={`game-screen${effectiveReducedMotion ? " reduce-motion" : ""}`}
      data-reduced-motion={effectiveReducedMotion}
      data-coin-cabinet="true"
    >
      <header className="game-header">
        <div>
          <p className="eyebrow">功能原型</p>
          <h1>午夜好运酒店</h1>
        </div>
        <span className="phase-badge">{PHASE_LABELS[game.state.phase]}</span>
      </header>
      <Hud
        state={game.state}
        estimate={estimate}
        estimateStatus={estimateStatus}
        payoutAmount={settlementPresentation?.summary.total ?? 0}
        presentedThroughSequence={presentedThroughSequence}
      />

      {game.state.phase === "CHOOSING_SERVICE" && (
        <section className="service-chooser" aria-label="选择服务">
          <h2>今夜与谁合作？</h2>
          {game.state.serviceCandidates.map((serviceId) => (
            <button type="button" className="service-choice" key={serviceId} onClick={() => game.send({ type: "SELECT_SERVICE", serviceId })}>
              <strong>{SERVICE_PRESENTATIONS[serviceId].name}</strong>
              <span><b>定位</b> {SERVICE_PRESENTATIONS[serviceId].identity}</span>
              <span><b>行动</b> {SERVICE_PRESENTATIONS[serviceId].action}</span>
              <span><b>协同</b> {SERVICE_PRESENTATIONS[serviceId].synergies}</span>
              <span><b>代价／风险</b> {SERVICE_PRESENTATIONS[serviceId].risk}</span>
            </button>
          ))}
        </section>
      )}

      <SlotMachine
        state={game.state}
        motionPlan={visibleMotionPlan}
        reducedMotion={effectiveReducedMotion}
        displayGrid={settlementPresentation?.displayGrid ?? null}
        highlightedLineIds={settlementPresentation?.activeLineIds ?? []}
        changedCells={settlementPresentation?.changedCells ?? []}
        highlightedReels={settlementPresentation?.currentEvent?.type === "FOOD_CONSUMED"
          ? [settlementPresentation.currentEvent.reel]
          : []}
        shakePx={settlementFeedback?.shakePx ?? 0}
      />
      {!documentHidden && !recoveryOpen && (settlementFeedback?.coinCount ?? 0) > 0 && (
        <CoinBurst count={settlementFeedback!.coinCount} />
      )}
      <PartsBar
        state={game.state}
        activePartId={settlementPresentation?.activePartId ?? null}
        presentedThroughSequence={settlementPresentation?.currentEvent?.sequence ?? null}
      />
      {game.state.acquiredUpgrades.length > 0 && (
        <section className="acquired-upgrades" aria-label="已获得升级">
          <h2>已获得升级</h2>
          <ul>{game.state.acquiredUpgrades.map((id, index) => <li key={`${id}-${index}`}>{UPGRADES[id].name}</li>)}</ul>
        </section>
      )}

      {game.state.phase === "RESOLVING_EFFECTS" && settlementPresentation !== null && (
        <WinPresentation
          state={game.state}
          presentation={settlementPresentation}
          reducedMotion={effectiveReducedMotion}
        />
      )}

      {game.state.phase !== "CHOOSING_SERVICE" && (!isRunSummary || game.state.phase === "SHIFT_COMPLETE") && (
        <ActionBar state={game.state} onCommand={game.send} />
      )}
      {(game.state.phase === "CHOOSING_UPGRADE" || (game.state.phase === "AFTER_HOURS" && game.state.currentCandidates !== null)) && (
        <>
          <UpgradePicker state={game.state} onCommand={game.send} currentEstimate={estimate} />
          {game.state.exitUnlocked && <button type="button" onClick={() => game.send({ type: "CASH_OUT" })}>结账离开</button>}
        </>
      )}
      {isRunSummary && (
        <RunSummary
          state={game.state}
          trajectory={trajectory}
          onCommand={game.send}
          onRestartSameSeed={restartSameSeed}
          onRestartNextSeed={restartNextSeed}
        />
      )}
      {(game.state.phase === "READY_TO_SPIN" || game.state.phase === "SPINNING") && (
        <PullLever
          disabled={game.state.phase !== "READY_TO_SPIN"}
          reducedMotion={effectiveReducedMotion}
          onPull={() => game.send({ type: "SPIN" })}
        />
      )}

      <label className="reduce-flash-setting">
        <input type="checkbox" checked={reduceFlash} onChange={(event) => {
          const checked = event.target.checked;
          setReduceFlash(checked);
          try { localStorage.setItem(REDUCE_FLASH_KEY, checked ? "1" : "0"); } catch { /* optional setting */ }
        }} />
        减少闪烁
      </label>

      <div className="game-feedback" aria-live="assertive">
        {game.error !== null ? `${game.error.code}: ${game.error.message}` : ""}
      </div>
      {game.events.length > 0 && <p className="event-status" aria-live="polite">已记录 {game.events.length} 个新事件</p>}
      {recoveryOpen && (
        <div className="recovery-backdrop">
          <section className="recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
            <h2 id="recovery-title">恢复上次进度</h2>
            <p>规则状态已经保存。请选择如何继续当前阶段。</p>
            <div className="summary-actions">
              <button type="button" onClick={() => {
                unlockAudio();
                setRecoveryOpen(false);
              }}>{
                game.state.phase === "RESOLVING_EFFECTS" ? "继续演出"
                  : game.state.phase === "SPINNING" ? "继续停轮"
                    : game.state.phase === "AWAITING_INTERVENTION" ? "继续干预"
                      : "继续游戏"
              }</button>
              {game.state.phase === "RESOLVING_EFFECTS" && (
                <button className="primary-button" type="button" onClick={() => {
                  setRecoveryOpen(false);
                  settlementPresentation?.skip();
                }}>直接结算</button>
              )}
              {game.state.phase === "AWAITING_INTERVENTION" && (
                <button className="primary-button" type="button" onClick={() => {
                  unlockAudio();
                  setRecoveryOpen(false);
                  game.send({ type: "ACCEPT_OUTCOME" });
                }}>接受结果</button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
