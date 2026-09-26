import { useCallback, useEffect, useRef, useState } from "react";
import { ActionBar, selectedPaidBetIsUnaffordable } from "@/app/components/ActionBar";
import { CoinBurst } from "@/app/components/CoinBurst";
import { Hud } from "@/app/components/Hud";
import { HelpButton, HelpPauseContext } from "@/app/components/HelpWindow";
import { GameGuide } from "@/app/components/GameGuide";
import { getPaidSpinLimit, HOTEL_ROOMS } from "@/content/hotel";
import { LedgerDrawer } from "@/app/components/LedgerDrawer";
import { PartsBar } from "@/app/components/PartsBar";
import { RoomBackdrop, RoomCrown } from "@/app/components/CabinetArtwork";
import { PartDiscovery } from "@/app/components/PartDiscovery";
import { FeedbackButton } from "@/app/components/FeedbackButton";
import { PullLever } from "@/app/components/PullLever";
import { PreparationConsole } from "@/app/components/PreparationConsole";
import { RunSummary } from "@/app/components/RunSummary";
import { ShiftReceipt } from "@/app/components/ShiftReceipt";
import { SlotMachine } from "@/app/components/SlotMachine";
import { SpinPayoutPlaque } from "@/app/components/SpinPayoutPlaque";
import { BoardInterventionControls } from "@/app/components/BoardIntervention";
import { useBoardIntervention } from "@/app/useBoardIntervention";
import { getCurrentBet } from "@/core/progression";
import { UpgradePicker } from "@/app/components/UpgradePicker";
import { WinPresentation } from "@/app/components/WinPresentation";
import { useEstimate } from "@/app/useEstimate";
import { useGame } from "@/app/useGame";
import { useAutomaticSpinFlow } from "@/app/useAutomaticSpinFlow";
import { useSettlementPresentation } from "@/app/useSettlementPresentation";
import { SERVICE_PRESENTATIONS } from "@/app/player-copy";
import { UPGRADES } from "@/content/upgrades";
import type { CommandError, CommandErrorCode, ReelIndex, RunState } from "@/core/types";
import { unlockAudio } from "@/presentation/audio";
import { ArchiveViewer } from "@/app/components/ArchiveViewer";
import { downloadText } from "@/app/archive-copy";
import { exportArchive } from "@/persistence/archives";
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

const COMMAND_ERROR_COPY: Readonly<Record<CommandErrorCode, string>> = {
  INVALID_PHASE: "当前阶段不能执行这项操作。",
  INSUFFICIENT_FUNDS: "余额不足，无法完成这项操作。",
  INVALID_TARGET: "当前选择不可用，请重新选择。",
  RESOURCE_EXHAUSTED: "所需资源已经用完，请选择其他行动。"
};

export function playerFacingCommandError(error: CommandError): string {
  return COMMAND_ERROR_COPY[error.code];
}

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
  readonly onHome?: () => void;
}

export function GameScreen({ seed, initialState, onHome }: GameScreenProps): React.JSX.Element {
  const game = useGame(seed, initialState);
  const { estimate, status: estimateStatus } = useEstimate(game.state);
  const [trajectory, setTrajectory] = useState<readonly MachineEstimate[]>([]);
  const lastEstimate = useRef<MachineEstimate | null>(null);
  const [documentHidden, setDocumentHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [recoveryOpen, setRecoveryOpen] = useState(game.wasRecovered);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [helpCount, setHelpCount] = useState(0);
  const setHelpOpen = useCallback((open: boolean) => setHelpCount((count) => Math.max(0, count + (open ? 1 : -1))), []);
  const [foodReel, setFoodReel] = useState<ReelIndex | null>(null);
  const activeFoodReel = game.state.phase === "READY_TO_SPIN" && !game.state.shiftFlags.foodBought ? foodReel : null;
  const [backupName, setBackupName] = useState("手动备份");
  const [archiveNotice, setArchiveNotice] = useState("");
  const [reduceFlash, setReduceFlash] = useState(storedReduceFlash);
  const [osReducedMotion, setOsReducedMotion] = useState(systemReducedMotion);
  const effectiveReducedMotion = reduceFlash || osReducedMotion;
  const paused = documentHidden || recoveryOpen || archiveOpen || helpCount > 0 || game.storageWarning !== null;
  const boardIntervention = useBoardIntervention(game.state, paused, game.send);

  const motionPlan = useAutomaticSpinFlow({
    state: game.state,
    paused,
    reducedMotion: effectiveReducedMotion,
    onCommand: game.sendAutomatic
  });
  const visibleMotionPlan = paused ? null : motionPlan;
  const settlementPresentation = useSettlementPresentation({
    state: game.state,
    paused,
    reducedMotion: effectiveReducedMotion,
    onCommand: game.sendAutomatic
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
  const isUpgradeScene = game.state.phase === "CHOOSING_UPGRADE" ||
    (game.state.phase === "AFTER_HOURS" && game.state.currentCandidates !== null);
  const showCabinet = !isUpgradeScene && !isRunSummary && game.state.phase !== "CHOOSING_SERVICE";
  const roomTier = game.state.hotel?.challenge?.tier;

  if (archiveOpen && game.archive !== null) {
    return <ArchiveViewer record={game.archive} onClose={() => setArchiveOpen(false)} />;
  }

  return (
    <HelpPauseContext.Provider value={setHelpOpen}>
    <div
      className={`game-page fixed-console${effectiveReducedMotion ? " reduce-motion" : ""}`}
      data-reduced-motion={effectiveReducedMotion}
      data-cabinet-visible={showCabinet}
      data-playfield={showCabinet && game.storageWarning === null}
      data-paused={paused}
      data-room-tier={roomTier ?? "house"}
    >
      {roomTier !== undefined && <RoomBackdrop tier={roomTier} />}
      <header className="hotel-header">
        <div>
          <p className="hotel-sign">MIDNIGHT LUCK · HOTEL</p>
          <h1>午夜好运酒店</h1>
        </div>
        <div className="deco-room-mark" aria-label={roomTier === undefined ? "房号 1313" : HOTEL_ROOMS[roomTier].name}>
          <svg aria-hidden="true" viewBox="0 0 120 48" fill="none">
            <path d="M1 47h10V36h10V29h78v7h10v11h10M6 47V41h10V31h10v-7h68v7h10v10h10v6M25 47V29h70v18M60 19V1M52 20 46 4M45 22 34 10M39 23 23 17M68 20 74 4M75 22 86 10M81 23 97 17" />
          </svg>
          <span>{roomTier === undefined ? "ROOM 1313" : HOTEL_ROOMS[roomTier].name}</span>
        </div>
      </header>
        <div className="shift-plaque">
          <strong>{game.state.hotel?.challenge != null ? HOTEL_ROOMS[game.state.hotel.challenge.tier].name : game.state.afterHoursLevel > 0 ? `加班 ${game.state.afterHoursLevel}` : `第 ${game.state.shift} 班`} · 剩余 {Math.max(0, getPaidSpinLimit(game.state) - game.state.baseSpinsInShift)} 转</strong>
          <span>{game.state.phase === "AFTER_HOURS" && game.state.hotel?.challenge != null ? "客房结算" : PHASE_LABELS[game.state.phase]}</span>
        </div>
      {game.storageWarning !== null && <section className="archive-warning" role="alert"><p>{game.storageWarning}</p><p>自动推进已暂停。请先导出本局，避免关闭页面后丢失未保存进度。</p><button type="button" onClick={game.retrySave}>重试保存</button></section>}

      {showCabinet && (
        <section
          className={`game-screen cabinet-shell${effectiveReducedMotion ? " reduce-motion" : ""}`}
          aria-label="午夜好运老虎机"
          data-reduced-motion={effectiveReducedMotion}
          data-coin-cabinet="true"
          data-phase={game.state.phase}
          data-preparing-food={activeFoodReel !== null}
          data-room-tier={roomTier ?? "house"}
        >
          {roomTier !== undefined && <RoomCrown tier={roomTier} />}
          <div className="cabinet-marquee" aria-hidden="true">{roomTier === undefined ? <>MIDNIGHT LUCK <span>1313</span></> : HOTEL_ROOMS[roomTier].name}</div>
          <Hud
            compact
            state={game.state}
            estimate={estimate}
            estimateStatus={estimateStatus}
            payoutAmount={settlementPresentation?.awardDelta ?? 0}
            settlementPresentation={settlementPresentation}
            reducedMotion={effectiveReducedMotion}
            presentedThroughSequence={presentedThroughSequence}
          />
          <SpinPayoutPlaque state={game.state} presentation={settlementPresentation} reducedMotion={effectiveReducedMotion} />
          <div className="cabinet-stage">
            <SlotMachine
              state={game.state}
              motionPlan={visibleMotionPlan}
              reducedMotion={effectiveReducedMotion}
              displayGrid={settlementPresentation?.displayGrid ?? null}
              idleGrid={game.state.spinHistory.at(-1)?.finalGrid ?? null}
              highlightedLineIds={settlementPresentation?.activeLineIds ?? []}
              changedCells={settlementPresentation?.changedCells ?? []}
              highlightedReels={settlementPresentation?.currentEvent?.type === "FOOD_CONSUMED"
                ? [settlementPresentation.currentEvent.reel]
                : []}
              shakePx={settlementFeedback?.shakePx ?? 0}
              intervention={boardIntervention}
              foodSelection={activeFoodReel === null ? undefined : { reel: activeFoodReel, onSelect: setFoodReel }}
            />
            <div className="console-reel-keys" role="group" aria-label="转轮列键">
              {([0, 1, 2] as const).map((reel) => <button type="button" key={reel}
                aria-label={`第${reel + 1}轮键`}
                aria-pressed={activeFoodReel === reel || (game.state.phase === "AWAITING_INTERVENTION" && boardIntervention.selectedReel === reel)}
                disabled={paused || (activeFoodReel === null && (!boardIntervention.enabled || !boardIntervention.selectableReels.includes(reel)))}
                onClick={() => activeFoodReel !== null ? setFoodReel(reel) : boardIntervention.selectReel(reel)}
              ><i aria-hidden="true" />第{reel + 1}轮</button>)}
            </div>
          </div>
          {game.state.phase === "AWAITING_INTERVENTION" && <BoardInterventionControls
            compact controller={boardIntervention} paused={paused} onAccept={() => game.send({ type: "ACCEPT_OUTCOME" })}
          />}
          {game.state.phase === "RESOLVING_EFFECTS" && settlementPresentation !== null && (
            <section className="context-tray cabinet-settlement" aria-label="当前决策" data-phase={game.state.phase}>
              <WinPresentation compact state={game.state} presentation={settlementPresentation} reducedMotion={effectiveReducedMotion} />
            </section>
          )}
          <PartsBar
            state={game.state}
            activePartId={settlementPresentation?.activePartId ?? null}
            presentedThroughSequence={presentedThroughSequence}
          />
          {(game.state.phase === "READY_TO_SPIN" || game.state.phase === "SPINNING") && <PreparationConsole
            state={game.state} foodReel={activeFoodReel} onFoodReel={setFoodReel} onCommand={game.send} />}
          <PullLever
            disabled={paused || activeFoodReel !== null || game.state.phase !== "READY_TO_SPIN" || selectedPaidBetIsUnaffordable(game.state)}
            reducedMotion={effectiveReducedMotion}
            costLabel={game.state.phase === "READY_TO_SPIN"
              ? game.state.freeSpinQueue > 0 ? "免费转 · 不扣下注" : `花费 ¥${getCurrentBet(game.state)}`
              : ""}
            statusLabel={game.storageWarning !== null ? "请先处理保存提示"
              : game.state.phase === "READY_TO_SPIN" ? "余额不足 · 可调整下注"
                : game.state.phase === "SPINNING" ? "转动中…"
                    : game.state.phase === "AWAITING_INTERVENTION" ? "选择是否重转"
                      : "奖金结算中…"}
            onPull={() => game.send({ type: "SPIN" })}
          />
          {!documentHidden && !recoveryOpen && (settlementFeedback?.coinCount ?? 0) > 0 && (
            <CoinBurst count={settlementFeedback!.coinCount} />
          )}
        </section>
      )}

      <PartDiscovery compact={showCabinet} key={game.archive?.id ?? game.state.initialSeed} state={game.state} presentedThroughSequence={presentedThroughSequence} observedEvents={settlementPresentation === null ? game.events : undefined} />
      {!showCabinet && (
        <div className="page-ledger">
          <LedgerDrawer receipts={game.state.spinHistory} />
        </div>
      )}

      {game.state.phase !== "READY_TO_SPIN" && game.state.phase !== "SPINNING" && game.state.phase !== "AWAITING_INTERVENTION" && game.state.phase !== "RESOLVING_EFFECTS" && <section className="context-tray" aria-label="当前决策" data-phase={game.state.phase}>
        {game.state.phase === "CHOOSING_SERVICE" && (
          <div className="service-chooser" role="group" aria-label="选择服务">
            <h2>今夜与谁合作？</h2>
            <p>每位值夜伙伴会改变你准备和干预老虎机的方式。</p>
            <div className="service-list">
              {game.state.serviceCandidates.map((serviceId) => (
                <button type="button" className="service-choice" data-service={serviceId} key={serviceId} onClick={() => game.send({ type: "SELECT_SERVICE", serviceId })}>
                  <span className="service-seal" aria-hidden="true">{{ kitchen: "餐", chapel: "祈", repair: "修", security: "卫" }[serviceId]}</span>
                  <strong>{SERVICE_PRESENTATIONS[serviceId].name}</strong>
                  <span><b>定位</b> {SERVICE_PRESENTATIONS[serviceId].identity}</span>
                  <span><b>行动</b> {SERVICE_PRESENTATIONS[serviceId].action}</span>
                  <span><b>协同</b> {SERVICE_PRESENTATIONS[serviceId].synergies}</span>
                  <span><b>代价／风险</b> {SERVICE_PRESENTATIONS[serviceId].risk}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {isUpgradeScene && (
          <>
            <ActionBar state={game.state} onCommand={game.send} />
            <HelpButton title="本班小票" trigger="查看本班收支" className="console-receipt-key"><ShiftReceipt state={game.state} /></HelpButton>
            <UpgradePicker compact state={game.state} onCommand={game.send} currentEstimate={estimate} />
            {game.state.exitUnlocked && <button className="cash-out-button" type="button" onClick={() => game.send({ type: "CASH_OUT" })}>结账离开</button>}
          </>
        )}
        {isRunSummary && (
          <>
            {(game.state.phase === "SHIFT_COMPLETE" || game.state.phase === "AFTER_HOURS") && (
              <ActionBar state={game.state} onCommand={game.send} />
            )}
            <RunSummary
              state={game.state}
              trajectory={trajectory}
              onCommand={game.send}
              onRestartSameSeed={restartSameSeed}
              onRestartNextSeed={restartNextSeed}
            />
          </>
        )}
      </section>}

      <HelpButton title="酒店菜单" trigger="菜单" className="console-menu-key" interactive>
      <footer className="game-utilities">
        {game.state.acquiredUpgrades.length > 0 && <details className="acquired-upgrades"><summary>已获得升级 · {game.state.acquiredUpgrades.length}</summary>
          <ul>{game.state.acquiredUpgrades.map((id, index) => <li key={`${id}-${index}`}>{UPGRADES[id].name}</li>)}</ul>
        </details>}
        <nav className="game-guide-entry" aria-label="游戏工具"><HelpButton title="游戏介绍" trigger="玩法与术语" className="guide-open-button"><GameGuide /></HelpButton><FeedbackButton seed={game.state.initialSeed} />
          {onHome !== undefined && <button type="button" disabled={game.storageWarning !== null} onClick={() => { if (game.retrySave()) onHome(); }}>返回前台</button>}
        </nav>
        {game.archive !== null && <section className="game-archive-bar" aria-label="档案工具">
          <div className="frontdesk-actions">
            <button type="button" onClick={() => setArchiveOpen(true)}>完整日志</button>
            <button type="button" onClick={() => downloadText("night-" + game.state.initialSeed + ".json", exportArchive(game.archive!))}>导出本局</button>
          </div>
          <details><summary>存档与种子 · {game.state.initialSeed}</summary><form className="backup-form" onSubmit={(event) => { event.preventDefault(); setArchiveNotice(game.backup(backupName) ? "备份已保存，可在前台的历史与存档中恢复。" : "备份未写入，请查看保存提示并导出本局。"); }}>
            <label>备份名称<input maxLength={80} value={backupName} onChange={(event) => setBackupName(event.target.value)} /></label><button type="submit" disabled={game.storageWarning !== null}>保存手动备份</button></form>
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(String(game.state.initialSeed)); setArchiveNotice("种子已复制。"); } catch { setArchiveNotice("请手动复制种子：" + game.state.initialSeed); } }}>复制种子</button><p role="status">{archiveNotice}</p>
          </details>
        </section>}
        <label className="reduce-flash-setting">
        <input type="checkbox" aria-label="减少闪烁" checked={reduceFlash} onChange={(event) => {
          const checked = event.target.checked;
          setReduceFlash(checked);
          try { localStorage.setItem(REDUCE_FLASH_KEY, checked ? "1" : "0"); } catch { /* optional setting */ }
        }} />
        减弱动态与闪烁
        </label>
      </footer>
      </HelpButton>

      <div className="game-feedback" aria-live="assertive">
        {game.error !== null ? playerFacingCommandError(game.error) : ""}
      </div>
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
    </HelpPauseContext.Provider>
  );
}
