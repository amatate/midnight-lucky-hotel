import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GameMenu } from "@/app/components/GameMenu";
import { ActionBar, selectedPaidBetIsUnaffordable } from "@/app/components/ActionBar";
import { PresentedCoins } from "@/app/components/CoinBurst";
import { Hud } from "@/app/components/Hud";
import { HelpButton, HelpWindow, HelpPauseContext } from "@/app/components/HelpWindow";
import { getPaidSpinLimit, HOTEL_ROOMS, isRoomIntermission } from "@/content/hotel";
import { RoomIntermission, RoomResult } from "@/app/components/HotelChallenge";
import { LedgerDrawer } from "@/app/components/LedgerDrawer";
import { PartsBar } from "@/app/components/PartsBar";
import { RoomBackdrop, RoomCrown } from "@/app/components/CabinetArtwork";
import { PartDiscovery } from "@/app/components/PartDiscovery";
import { PullLever } from "@/app/components/PullLever";
import { PreparationConsole } from "@/app/components/PreparationConsole";
import { RunSummary } from "@/app/components/RunSummary";
import { ShiftReceipt } from "@/app/components/ShiftReceipt";
import { SlotMachine } from "@/app/components/SlotMachine";
import { SpinPayoutPlaque } from "@/app/components/SpinPayoutPlaque";
import { BoardInterventionControls } from "@/app/components/BoardIntervention";
import { useBoardIntervention } from "@/app/useBoardIntervention";
import { stoppedBoardBasis } from "@/app/board-intervention";
import { getCurrentBet } from "@/core/progression";
import { UpgradePicker } from "@/app/components/UpgradePicker";
import { BuildWorkshopButton } from "@/app/components/BuildWorkshop";
import { WinPresentation } from "@/app/components/WinPresentation";
import { useEstimate } from "@/app/useEstimate";
import { useGame } from "@/app/useGame";
import { useAutomaticSpinFlow } from "@/app/useAutomaticSpinFlow";
import { useSettlementPresentation } from "@/app/useSettlementPresentation";
import { ServiceChoices } from "@/app/components/ServiceChoices";
import type { CommandError, CommandErrorCode, ReelIndex, RunState } from "@/core/types";
import { unlockAudio } from "@/presentation/audio";
import { ArchiveViewer } from "@/app/components/ArchiveViewer";
import { feedbackPlan } from "@/presentation/feedback";
import { payoutTier } from "@/presentation/summary";
import { counterSnapshot, presentedCounters, settlementEntry } from "@/presentation/part-feedback";
import { PartInstallFeedback, captureInstallOrigin, type InstallOrigin } from "@/app/components/PartInstallFeedback";
import type { MachineEstimate } from "@/sim/types";
import { StayPanel } from "@/story/StayPanel";
import { stayLocation, stayPhaseLabel } from "@/story/stay-copy";
import { getLanguage } from "@/i18n/language";
import { firstUpgradeNote, isFirstTicket } from "@/app/first-upgrade";
import { FirstUpgradeStamp } from "@/app/components/FirstUpgradeStamp";
import { refilledReels } from "@/app/meal-receipt";

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
  readonly entry?: "new" | "resume";
}

export function GameScreen({ seed, initialState, onHome, entry = "resume" }: GameScreenProps): React.JSX.Element {
  const game = useGame(seed, initialState);
  const { estimate, status: estimateStatus } = useEstimate(game.state);
  const installOrigin = useRef<InstallOrigin | null>(null);
  const [trajectory, setTrajectory] = useState<readonly MachineEstimate[]>([]);
  const lastEstimate = useRef<MachineEstimate | null>(null);
  const [documentHidden, setDocumentHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [recoveryOpen, setRecoveryOpen] = useState(game.wasRecovered && entry !== "new");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [helpCount, setHelpCount] = useState(0);
  const setHelpOpen = useCallback((open: boolean) => setHelpCount((count) => Math.max(0, count + (open ? 1 : -1))), []);
  const [foodReel, setFoodReel] = useState<ReelIndex | null>(null);
  const activeFoodReel = game.state.phase === "READY_TO_SPIN" && !game.state.shiftFlags.foodBought ? foodReel : null;
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
    : feedbackPlan(payoutTier(settlementPresentation.visiblePayoutTarget,
      game.state.spinHistory.at(-1)?.wager ?? game.state.pendingSpin?.wager ?? getCurrentBet(game.state),
      getCurrentBet(game.state)), effectiveReducedMotion);
  const presentedThroughSequence = settlementPresentation === null
    ? undefined
    : settlementPresentation.done
      ? Math.max(0, ...game.state.pendingEvents.map((event) => event.sequence))
      : settlementPresentation.currentEvent?.sequence ?? null;
  const currentEntry = settlementEntry(game.archive?.entries ?? [], game.state.spinHistory.at(-1));
  const receipt = game.state.spinHistory.at(-1);
  const refilled = game.state.phase === "READY_TO_SPIN" && receipt?.afterHoursLevel === game.state.afterHoursLevel && receipt.shift === game.state.shift
    ? refilledReels(currentEntry?.events ?? []) : [];
  const beforeCounters = game.settlementBefore?.counters ?? counterSnapshot(currentEntry?.changes.counters?.before);
  const visibleCounters = settlementPresentation === null ? undefined : presentedCounters(game.state, presentedThroughSequence ?? null, beforeCounters);

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
  const isRoomRest = isRoomIntermission(game.state);
  const roomRounds = game.state.hotel?.challenge?.rounds;
  const isRunSummary = game.state.phase === "SHIFT_COMPLETE" || game.state.phase === "RUN_WON" ||
    game.state.phase === "RUN_LOST" || (!isRoomRest && game.state.phase === "AFTER_HOURS" && game.state.currentCandidates === null);
  const isUpgradeScene = game.state.phase === "CHOOSING_UPGRADE" ||
    (game.state.phase === "AFTER_HOURS" && game.state.currentCandidates !== null);
  const showCabinet = !isRoomRest && !isUpgradeScene && !isRunSummary && game.state.phase !== "CHOOSING_SERVICE";
  useLayoutEffect(() => {
    // A selected upgrade can be far down a long page; the next round starts at the HUD.
    // Ordinary spins and help drawers do not reset the player's scroll position.
    if (showCabinet && (window.scrollX || window.scrollY)) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [showCabinet]);
  const roomTier = game.state.hotel?.challenge?.tier;
  const english = getLanguage() === "en";
  const visibleReceipt = (game.state.phase === "RESOLVING_EFFECTS" && !settlementPresentation?.done
    ? game.state.spinHistory.at(-2) : game.state.spinHistory.at(-1))?.ordinal ?? 0;
  const entries = game.archive?.entries;
  const note = useMemo(() => entries && game.state.stay ? firstUpgradeNote(entries, visibleReceipt, english) : null,
    [entries, visibleReceipt, english, game.state.stay]);
  const firstTicket = isFirstTicket(game.state);
  const remainingSpins = Math.max(0, getPaidSpinLimit(game.state) - game.state.baseSpinsInShift);
  const navigationTitle = `${game.state.stay ? stayLocation(game.state, english) : roomTier !== undefined ? HOTEL_ROOMS[roomTier].name : game.state.afterHoursLevel > 0 ? `加班 ${game.state.afterHoursLevel}` : `第 ${game.state.shift} 班`}${roomRounds ? ` · 回合 ${roomRounds.current}/${roomRounds.total}` : game.state.stay && game.state.afterHoursLevel === 0 ? ` · 回合 ${game.state.shift}/3` : ` · 剩余 ${remainingSpins} 转`}`;
  const navigationStatus = game.state.stay ? stayPhaseLabel(game.state, english) : isRoomRest ? "中途整备" : game.state.phase === "AFTER_HOURS" && roomTier !== undefined ? "客房结算" : PHASE_LABELS[game.state.phase];
  const returnHome = () => {
    // Every command is journaled first. Leaving never draws, accepts, or settles a spin.
    if (initialState !== undefined || game.retrySave()) onHome?.();
    else setArchiveOpen(false);
  };

  if (archiveOpen && game.archive !== null) {
    return <ArchiveViewer record={game.archive} onClose={() => setArchiveOpen(false)} onHome={onHome ? returnHome : undefined} />;
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
          <span>{game.state.stay ? stayLocation(game.state, getLanguage() === "en") : roomTier === undefined ? "ROOM 1313" : HOTEL_ROOMS[roomTier].name}</span>
        </div>
      </header>
      <nav className="console-navigation" aria-label="机台导航">
        {onHome && <button type="button" className="console-home-key" aria-label="返回前台" onClick={returnHome}>‹ 前台</button>}
        <div className="shift-plaque">
          {game.state.stay ? <HelpButton title={english ? "Ask Mio" : "问问澪"} label={english ? "Mio · room task ›" : "澪 · 看入住任务 ›"}
            trigger={<><strong>{navigationTitle}</strong><span>{showCabinet ? english ? `${remainingSpins} paid spins left` : `余 ${remainingSpins} 次付费转` : navigationStatus} · {english ? "Mio ›" : "问澪 ›"}</span></>} className="stay-mio-help"><StayPanel state={game.state} /></HelpButton>
            : <strong>{navigationTitle}</strong>}
          <span className={game.state.stay || showCabinet && !roomRounds ? "sr-only" : undefined}>{showCabinet && roomRounds ? `余 ${remainingSpins} 转` : navigationStatus}</span>
        </div>
        <GameMenu game={game} onHome={onHome ? returnHome : undefined} onArchive={() => setArchiveOpen(true)} reduceFlash={reduceFlash} onReduceFlash={(checked) => {
          setReduceFlash(checked);
          try { localStorage.setItem(REDUCE_FLASH_KEY, checked ? "1" : "0"); } catch { /* optional setting */ }
        }} />
      </nav>
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
          <div className="cabinet-marquee" aria-hidden="true">{game.state.stay ? stayLocation(game.state, getLanguage() === "en") : roomTier === undefined ? <>MIDNIGHT LUCK <span>1313</span></> : HOTEL_ROOMS[roomTier].name}</div>
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
          <SpinPayoutPlaque state={game.state} presentation={settlementPresentation} reducedMotion={effectiveReducedMotion} previewing={boardIntervention.preview?.grid != null} entries={game.archive?.entries} firstNote={note} />
          <div className="cabinet-stage">
            <SlotMachine
              state={game.state}
              motionPlan={visibleMotionPlan}
              reducedMotion={effectiveReducedMotion}
              displayGrid={settlementPresentation?.displayGrid ?? null}
              idleGrid={game.state.spinHistory.at(-1)?.finalGrid ?? null}
              highlightedLineIds={settlementPresentation?.activeLineIds ?? (boardIntervention.preview?.grid ? [] : stoppedBoardBasis(game.state)?.lineIds ?? [])}
              changedCells={settlementPresentation?.changedCells ?? []}
              highlightedReels={settlementPresentation?.currentEvent?.type === "FOOD_CONSUMED"
                ? [settlementPresentation.currentEvent.reel]
                : []}
              shakePx={!paused && (settlementPresentation?.awardDelta ?? 0) > 0 ? settlementFeedback?.shakePx ?? 0 : 0}
              intervention={boardIntervention}
              foodSelection={activeFoodReel === null ? undefined : { reel: activeFoodReel, onSelect: setFoodReel }}
            />
            <div className="console-reel-keys" role="group" aria-label="转轮列键">
              {([0, 1, 2] as const).map((reel) => <button type="button" key={reel}
                aria-label={`第${reel + 1}轮键`}
                aria-pressed={activeFoodReel === reel || (game.state.phase === "AWAITING_INTERVENTION" && boardIntervention.selectedReel === reel)}
                disabled={paused || (activeFoodReel === null && (!boardIntervention.enabled || !boardIntervention.selectableReels.includes(reel)))}
                onClick={() => activeFoodReel !== null ? setFoodReel(reel) : boardIntervention.selectReel(reel)}
              ><i aria-hidden="true" />{activeFoodReel === null && refilled.includes(reel)
                ? <small className="meal-refill-label">{getLanguage() === "en" ? "Refill · no win" : "补位 · 不判奖"}</small>
                : <>第{reel + 1}轮</>}</button>)}
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
            visibleCounters={visibleCounters}
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
              : paused ? "已暂停"
              : game.state.phase === "READY_TO_SPIN" ? "余额不足 · 可调整下注"
                : game.state.phase === "SPINNING" ? "转动中…"
                    : game.state.phase === "AWAITING_INTERVENTION" ? "选择是否重转"
                      : "奖金结算中…"}
            onPull={() => game.send({ type: "SPIN" })}
          />
          <PresentedCoins animationKey={settlementPresentation?.moneyAnimationKey ?? "idle"}
            paying={(settlementPresentation?.awardDelta ?? 0) > 0} count={settlementFeedback?.coinCount ?? 0}
            sourcePartId={settlementPresentation?.activePartId ?? null}
            cancel={paused || effectiveReducedMotion || settlementPresentation?.done === true || game.state.phase === "SPINNING"} />
        </section>
      )}
      <PartInstallFeedback state={game.state} origin={installOrigin} reducedMotion={effectiveReducedMotion} paused={paused} />

      <PartDiscovery compact key={game.archive?.id ?? game.state.initialSeed} state={game.state} presentedThroughSequence={presentedThroughSequence} observedEvents={settlementPresentation === null ? game.events : undefined} />
      {note && visibleReceipt <= note.through && game.state.phase !== "SPINNING" && game.state.phase !== "RESOLVING_EFFECTS" && game.state.phase !== "AWAITING_INTERVENTION" &&
        <FirstUpgradeStamp key={(game.archive?.id ?? game.state.initialSeed) + note.key} note={note} />}
      {!showCabinet && !isUpgradeScene && game.state.phase !== "CHOOSING_SERVICE" && (
        <div className="page-ledger">
          <LedgerDrawer receipts={game.state.spinHistory} entries={game.archive?.entries} firstNote={note} state={game.state} />
        </div>
      )}

      {game.state.phase !== "READY_TO_SPIN" && game.state.phase !== "SPINNING" && game.state.phase !== "AWAITING_INTERVENTION" && game.state.phase !== "RESOLVING_EFFECTS" && <section className="context-tray" aria-label="当前决策" data-phase={game.state.phase}>
        {game.state.phase !== "CHOOSING_SERVICE" && !firstTicket && <BuildWorkshopButton state={game.state} onCommand={game.send} />}
        {!firstTicket && (game.state.phase === "CHOOSING_SERVICE" || isUpgradeScene || isRoomRest) && <StayPanel state={game.state} guidanceOnly />}
        {game.state.phase === "CHOOSING_SERVICE" && (
          <ServiceChoices state={game.state} onCommand={game.send} />
        )}
        {isRoomRest && <RoomIntermission state={game.state} onCommand={game.send} />}
        {isUpgradeScene && (
          <>
            {!isRoomRest && <RoomResult state={game.state} />}
            <UpgradePicker compact state={game.state} onCommand={(command) => {
              if (command.type === "CHOOSE_UPGRADE") installOrigin.current = captureInstallOrigin();
              game.send(command);
            }} currentEstimate={estimate} />
            {firstTicket && <BuildWorkshopButton state={game.state} onCommand={game.send} />}
            <HelpButton title="本班小票" trigger="查看本班收支" className="console-receipt-key"><ShiftReceipt state={game.state} /></HelpButton>
            <HelpButton title="整备工具" trigger="整备工具" interactive><ActionBar state={game.state} onCommand={game.send} /></HelpButton>
            {game.state.exitUnlocked && !isRoomRest && <button className="cash-out-button" type="button" onClick={() => game.send({ type: "CASH_OUT" })}>结账看报告</button>}
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
              onHome={onHome ? returnHome : undefined}
            />
          </>
        )}
      </section>}

      <div className="game-feedback" aria-live="assertive">
        {game.error !== null ? playerFacingCommandError(game.error) : ""}
      </div>
      {recoveryOpen && (
        <HelpWindow title="恢复上次进度" interactive onClose={onHome ? returnHome : () => setRecoveryOpen(false)}
          closeLabel={onHome ? "返回前台" : "关闭说明"} footnote="尚未执行任何新操作。返回前台仍保留此进度。">
            <p>规则状态已经保存。请选择如何继续当前阶段。</p>
            {game.storageWarning && <p role="alert">{game.storageWarning}</p>}
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
              {onHome && <button type="button" onClick={returnHome}>返回前台并保留进度</button>}
            </div>
        </HelpWindow>
      )}
    </div>
    </HelpPauseContext.Provider>
  );
}
