import { useEffect, useRef, useState } from "react";
import { ActionBar } from "@/app/components/ActionBar";
import { Hud } from "@/app/components/Hud";
import { PartsBar } from "@/app/components/PartsBar";
import { RunSummary } from "@/app/components/RunSummary";
import { SlotMachine } from "@/app/components/SlotMachine";
import { UpgradePicker } from "@/app/components/UpgradePicker";
import { useEstimate } from "@/app/useEstimate";
import { useGame } from "@/app/useGame";
import type { ServiceId } from "@/core/types";
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

export function GameScreen({ seed }: { readonly seed: number }): React.JSX.Element {
  const game = useGame(seed);
  const { estimate, status: estimateStatus } = useEstimate(game.state);
  const [trajectory, setTrajectory] = useState<readonly MachineEstimate[]>([]);
  const lastEstimate = useRef<MachineEstimate | null>(null);

  useEffect(() => {
    if (estimate === null || estimate === lastEstimate.current) return;
    lastEstimate.current = estimate;
    setTrajectory((current) => [...current, estimate]);
  }, [estimate]);

  const restartSameSeed = () => {
    setTrajectory([]);
    lastEstimate.current = null;
    game.restartSameSeed();
  };
  const restartNextSeed = () => {
    setTrajectory([]);
    lastEstimate.current = null;
    game.restartNextSeed();
  };
  const isRunSummary = game.state.phase === "SHIFT_COMPLETE" || game.state.phase === "RUN_WON" ||
    game.state.phase === "RUN_LOST" || (game.state.phase === "AFTER_HOURS" && game.state.currentCandidates === null);

  return (
    <div className="game-screen">
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

      <div className="game-feedback" aria-live="assertive">
        {game.error !== null ? `${game.error.code}: ${game.error.message}` : ""}
      </div>
      {game.events.length > 0 && <p className="event-status" aria-live="polite">已记录 {game.events.length} 个新事件</p>}
    </div>
  );
}
