import { useCallback, useEffect, useRef, useState } from "react";
import { ActionBar } from "@/app/components/ActionBar";
import { Hud } from "@/app/components/Hud";
import { PartsBar } from "@/app/components/PartsBar";
import { RunSummary } from "@/app/components/RunSummary";
import { SlotMachine } from "@/app/components/SlotMachine";
import { UpgradePicker } from "@/app/components/UpgradePicker";
import { useEstimate } from "@/app/useEstimate";
import { useGame } from "@/app/useGame";
import { UPGRADES } from "@/content/upgrades";
import type { RunState, ServiceId } from "@/core/types";
import type { GameEvent } from "@/core/events";
import { createPresentationQueue, type PresentationQueue } from "@/presentation/queue";
import { playEventTone, unlockAudio } from "@/presentation/audio";
import { vibrate } from "@/presentation/haptics";
import type { MachineEstimate } from "@/sim/types";

const SERVICES: Readonly<Record<ServiceId, { readonly name: string; readonly description: string }>> = {
  repair: { name: "维修间", description: "更多专注；锁住一轮重转另外两轮，班次边界可修裂纹。" },
  kitchen: { name: "深夜厨房", description: "首转前花 ¥10，向选定转轮加入食物。" },
  chapel: { name: "小教堂", description: "消耗专注祈祷，让基础符号更易在下一转出现。" },
  security: { name: "保安室", description: "预览并踢动一轮，但会留下永久裂纹。" }
};

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

function eventLabel(event: GameEvent): string {
  switch (event.type) {
    case "BET_PLACED": return `下注 ¥${event.amount}`;
    case "LINE_WIN": return `${event.symbol} 连线 +¥${event.amount}`;
    case "PAYOUT_ADDED": return `赔付增加 ¥${event.amount}`;
    case "PAYOUT_COMPLETE": return `本次总赔付 ¥${event.total}`;
    case "PART_TRIGGERED": return `部件触发：${event.partId}`;
    case "RESOURCE_CHANGED": return `${event.resource} ${event.delta >= 0 ? "+" : ""}${event.delta}`;
    default: return event.type.replaceAll("_", " ");
  }
}

function PullControl({ onPull }: { readonly onPull: () => void }): React.JSX.Element {
  const pointer = useRef<{ readonly id: number; readonly y: number } | null>(null);
  return (
    <section className="pull-control" aria-label="拉杆控制">
      <div
        className="lever-track"
        data-testid="pull-gesture"
        aria-label="向下拉动区域"
        onPointerDown={(event) => {
          pointer.current = { id: event.pointerId, y: event.clientY };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerUp={(event) => {
          const start = pointer.current;
          pointer.current = null;
          if (start?.id === event.pointerId && event.clientY - start.y >= 48) onPull();
        }}
        onPointerCancel={() => { pointer.current = null; }}
      >
        <span aria-hidden="true" className="lever-knob">↓</span>
        <small>下拉 48px</small>
      </div>
      <button className="pull-button" type="button" aria-label="拉动老虎机" data-thumb-control="true" onClick={onPull}>
        拉动老虎机
      </button>
    </section>
  );
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
  const queueRef = useRef<PresentationQueue | null>(null);
  const completionSent = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [presentation, setPresentation] = useState<{ event: GameEvent; index: number; total: number; done: boolean } | null>(null);
  const [accelerated, setAccelerated] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [recoveryOpen, setRecoveryOpen] = useState(game.wasRecovered);
  const [reduceFlash, setReduceFlash] = useState(storedReduceFlash);
  const [osReducedMotion, setOsReducedMotion] = useState(systemReducedMotion);
  const effectiveReducedMotion = reduceFlash || osReducedMotion;

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

  useEffect(() => {
    if (game.state.phase !== "RESOLVING_EFFECTS") {
      queueRef.current = null;
      completionSent.current = false;
      setPresentation(null);
      return;
    }
    const source = game.events.length > 0 ? game.events : game.state.pendingEvents;
    const queue = createPresentationQueue(source);
    queueRef.current = queue;
    completionSent.current = false;
    setAccelerated(false);
    const first = queue.next();
    setPresentation(first === null ? null : { event: first, index: 1, total: source.length, done: queue.done });
    return () => { queueRef.current = null; };
  }, [game.state.phase, game.events]);

  useEffect(() => {
    if (presentation === null || presentation.done || recoveryOpen || documentHidden) return;
    const timer = setTimeout(() => {
      const queue = queueRef.current;
      const next = queue?.next() ?? null;
      if (next === null || queue === null) {
        setPresentation((current) => current === null ? null : { ...current, done: true });
        return;
      }
      playEventTone(next);
      if (!effectiveReducedMotion) vibrate(12);
      setPresentation((current) => current === null ? null : {
        event: next,
        index: current.index + 1,
        total: current.total,
        done: queue.done
      });
    }, effectiveReducedMotion ? 0 : accelerated ? 50 : 350);
    return () => clearTimeout(timer);
  }, [accelerated, documentHidden, effectiveReducedMotion, presentation, recoveryOpen]);

  useEffect(() => () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
  }, []);

  const completePresentation = useCallback(() => {
    if (completionSent.current || game.state.phase !== "RESOLVING_EFFECTS") return;
    completionSent.current = true;
    game.send({ type: "PRESENTATION_COMPLETE" });
  }, [game]);

  const speedUp = () => {
    unlockAudio();
    queueRef.current?.speedUp();
    setAccelerated(true);
  };

  const skipPresentation = () => {
    unlockAudio();
    queueRef.current?.skip();
    setPresentation((current) => current === null ? null : { ...current, index: current.total, done: true });
    completePresentation();
  };

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
    <div className={`game-screen${effectiveReducedMotion ? " reduce-motion" : ""}`} data-reduced-motion={effectiveReducedMotion}>
      <header className="game-header">
        <div>
          <p className="eyebrow">功能原型</p>
          <h1>午夜好运酒店</h1>
        </div>
        <span className="phase-badge">{PHASE_LABELS[game.state.phase]}</span>
      </header>
      <Hud state={game.state} estimate={estimate} estimateStatus={estimateStatus} />

      {game.state.phase === "CHOOSING_SERVICE" && (
        <section className="service-chooser" aria-label="选择服务">
          <h2>今夜与谁合作？</h2>
          {game.state.serviceCandidates.map((serviceId) => (
            <button type="button" className="service-choice" key={serviceId} onClick={() => game.send({ type: "SELECT_SERVICE", serviceId })}>
              <strong>{SERVICES[serviceId].name}</strong>
              <span>{SERVICES[serviceId].description}</span>
            </button>
          ))}
        </section>
      )}

      <SlotMachine state={game.state} />
      <PartsBar state={game.state} />
      {game.state.acquiredUpgrades.length > 0 && (
        <section className="acquired-upgrades" aria-label="已获得升级">
          <h2>已获得升级</h2>
          <ul>{game.state.acquiredUpgrades.map((id, index) => <li key={`${id}-${index}`}>{UPGRADES[id].name}</li>)}</ul>
        </section>
      )}

      {game.state.phase === "RESOLVING_EFFECTS" && presentation !== null && (
        <section className={`presentation-panel${effectiveReducedMotion ? " reduce-flash" : ""}`} aria-label="结算演出队列">
          <header><strong>结算事件</strong><span>事件 {presentation.index}/{presentation.total}</span></header>
          <div className="event-card" aria-live="polite">{eventLabel(presentation.event)}</div>
          <div className="presentation-actions">
            {!presentation.done && <button
              type="button"
              onClick={speedUp}
              onPointerDown={() => {
                holdTimer.current = setTimeout(speedUp, 400);
              }}
              onPointerUp={() => {
                if (holdTimer.current !== null) clearTimeout(holdTimer.current);
                holdTimer.current = null;
              }}
              onPointerCancel={() => {
                if (holdTimer.current !== null) clearTimeout(holdTimer.current);
                holdTimer.current = null;
              }}
            >加速演出</button>}
            {!presentation.done
              ? <button className="primary-button" type="button" onClick={skipPresentation}>直接结算</button>
              : <button className="primary-button" type="button" onClick={completePresentation}>完成结算</button>}
          </div>
        </section>
      )}

      {game.state.phase !== "CHOOSING_SERVICE" && (!isRunSummary || game.state.phase === "SHIFT_COMPLETE") && (
        <ActionBar state={game.state} onCommand={game.send} />
      )}
      {(game.state.phase === "CHOOSING_UPGRADE" || (game.state.phase === "AFTER_HOURS" && game.state.currentCandidates !== null)) && (
        <>
          <UpgradePicker state={game.state} onCommand={game.send} />
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
      {game.state.phase === "READY_TO_SPIN" && <PullControl onPull={() => game.send({ type: "SPIN" })} />}

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
              <button type="button" onClick={() => setRecoveryOpen(false)}>{
                game.state.phase === "RESOLVING_EFFECTS" ? "继续演出"
                  : game.state.phase === "SPINNING" ? "继续停轮"
                    : game.state.phase === "AWAITING_INTERVENTION" ? "继续干预"
                      : "继续游戏"
              }</button>
              {game.state.phase === "RESOLVING_EFFECTS" && (
                <button className="primary-button" type="button" onClick={() => {
                  setRecoveryOpen(false);
                  skipPresentation();
                }}>直接结算</button>
              )}
              {game.state.phase === "AWAITING_INTERVENTION" && (
                <button className="primary-button" type="button" onClick={() => {
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
