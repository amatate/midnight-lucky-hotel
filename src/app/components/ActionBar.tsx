import { useState } from "react";
import { availableInterventions } from "@/app/intervention-options";
import { SYMBOL_LABELS } from "@/app/labels";
import { previewKick } from "@/content/services/security";
import type { GameCommand } from "@/core/commands";
import { dispatchCommand } from "@/core/run";
import type { BaseSymbolId, BetMode, ReelIndex, RunState } from "@/core/types";

const BET_LABELS: Readonly<Record<BetMode, string>> = {
  conservative: "保守",
  normal: "正常",
  aggressive: "激进"
};

interface ActionBarProps {
  readonly state: RunState;
  readonly onCommand: (command: GameCommand) => void;
}

function ReelButtons({ reels, label, onSelect }: {
  readonly reels: readonly ReelIndex[];
  readonly label: string;
  readonly onSelect: (reel: ReelIndex) => void;
}): React.JSX.Element {
  return (
    <div className="reel-actions">
      {reels.map((reel) => (
        <button type="button" key={reel} onClick={() => onSelect(reel)}>{label.replace("{n}", String(reel + 1))}</button>
      ))}
    </div>
  );
}

export function ActionBar({ state, onCommand }: ActionBarProps): React.JSX.Element | null {
  const [serviceReel, setServiceReel] = useState<ReelIndex>(0);
  const [prayerSymbol, setPrayerSymbol] = useState<BaseSymbolId>("cherry");
  const interventions = availableInterventions(state);
  const respinReels = interventions.flatMap((command) => command.type === "RESPIN_REEL" ? [command.reelIndex] : []);
  const repairLockReels = interventions.flatMap((command) => command.type === "LOCK_AND_RESPIN_OTHERS" ? [command.lockedReelIndex] : []);
  const kickReels = interventions.flatMap((command) => command.type === "KICK_REEL" ? [command.reelIndex] : []);
  const selectedKickReel = kickReels.includes(serviceReel) ? serviceReel : kickReels[0];
  const securityAction = selectedKickReel === undefined ? null : {
    reel: selectedKickReel,
    preview: previewKick(state, selectedKickReel)
  };
  const boundary = state.phase === "CHOOSING_UPGRADE" || state.phase === "SHIFT_COMPLETE" || state.phase === "AFTER_HOURS";

  if (state.phase === "SPINNING") {
    return (
      <section className="action-bar action-status" aria-label="本转状态">
        <p className="tray-kicker">客房机器正在运转</p>
        <h2>转轮正在自动停下</h2>
        <p role="status">三个转轮会依次亮出结果。</p>
      </section>
    );
  }

  if (state.phase === "READY_TO_SPIN") {
    const showBuyFood = state.service === "kitchen" && !state.shiftFlags.foodBought && state.baseSpinsInShift === 0;
    const showPrayer = state.service === "chapel" && !state.shiftFlags.prayerUsed;
    const showMartyr = state.partSlots.some((part) => part?.id === "martyr-coin") &&
      !state.shiftFlags.martyrEnabled && state.baseSpinsInShift === 0;
    const foodCommand: GameCommand = { type: "BUY_FOOD", reelIndex: serviceReel };
    const prayerCommand: GameCommand = { type: "PRAY", symbol: prayerSymbol };
    const martyrCommand: GameCommand = { type: "ENABLE_MARTYR" };
    const foodIsLegal = showBuyFood && dispatchCommand(state, foodCommand).ok;
    const prayerIsLegal = showPrayer && dispatchCommand(state, prayerCommand).ok;
    const martyrIsLegal = showMartyr && dispatchCommand(state, martyrCommand).ok;
    const martyrCost = Number.isFinite(state.bankroll) && state.bankroll > 0
      ? Math.ceil(state.bankroll * 0.1)
      : 1;
    return (
      <section className="action-bar ready-actions" aria-label="本转准备">
        <div className="tray-heading">
          <p className="tray-kicker">房客决定</p>
          <h2>准备这一转</h2>
        </div>
        <fieldset className="bet-selector">
          <legend>下注模式</legend>
          {(Object.keys(BET_LABELS) as BetMode[]).map((mode) => (
            <button
              type="button"
              aria-pressed={state.betMode === mode}
              className={state.betMode === mode ? "is-active" : ""}
              key={mode}
              onClick={() => onCommand({ type: "SET_BET_MODE", mode })}
            >{BET_LABELS[mode]}</button>
          ))}
        </fieldset>
        <div className="action-section" role="group" aria-label="当前服务行动">
          {showBuyFood && (
            <div className="field-row">
              <label>食物转轮<select value={serviceReel} onChange={(event) => setServiceReel(Number(event.target.value) as ReelIndex)}>
                <option value={0}>第1轮</option><option value={1}>第2轮</option><option value={2}>第3轮</option>
              </select></label>
              <button type="button" disabled={!foodIsLegal} onClick={() => onCommand(foodCommand)}>购买食物（¥10）</button>
              {!foodIsLegal && <p className="muted">余额不足：厨房服务需要 ¥10。</p>}
            </div>
          )}
          {showPrayer && (
            <div className="field-row">
              <label>祈祷符号<select value={prayerSymbol} onChange={(event) => setPrayerSymbol(event.target.value as BaseSymbolId)}>
                <option value="cherry">樱桃</option><option value="lemon">柠檬</option>
                <option value="bell">铃铛</option><option value="seven">幸运7</option>
              </select></label>
              <button type="button" disabled={!prayerIsLegal} onClick={() => onCommand(prayerCommand)}>祈祷下一转</button>
              {!prayerIsLegal && <p className="muted">祈祷需要至少 1 点专注。</p>}
            </div>
          )}
          {showMartyr && (
            <div className="field-row">
              <button type="button" disabled={!martyrIsLegal} onClick={() => onCommand(martyrCommand)}>启用殉道者硬币（献祭 ¥{martyrCost}）</button>
              {!martyrIsLegal && <p className="muted">余额不足：殉道者硬币需要 ¥{martyrCost}。</p>}
            </div>
          )}
          {!showBuyFood && !showPrayer && !showMartyr && <p className="muted">本转没有额外的准备行动，直接拉动拉杆。</p>}
        </div>
      </section>
    );
  }

  if (state.phase === "AWAITING_INTERVENTION") {
    return (
      <section className="action-bar intervention-actions" aria-label="停轮决定">
        <div className="tray-heading">
          <p className="tray-kicker">结果已停</p>
          <h2>收下，还是动手？</h2>
        </div>
        {respinReels.length > 0 && (
          <ReelButtons reels={respinReels} label="重转第{n}轮" onSelect={(reelIndex) => onCommand({ type: "RESPIN_REEL", reelIndex })} />
        )}
        {repairLockReels.length > 0 && (
          <ReelButtons reels={repairLockReels} label="锁住第{n}轮并重转其他轮" onSelect={(lockedReelIndex) => onCommand({ type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex })} />
        )}
        {securityAction !== null && (
          <div className="security-action">
            <label>踢击转轮<select value={securityAction.reel} onChange={(event) => setServiceReel(Number(event.target.value) as ReelIndex)}>
              {kickReels.map((reel) => <option value={reel} key={reel}>第{reel + 1}轮</option>)}
            </select></label>
            <p aria-live="polite">预览：{securityAction.preview.map((symbol) => SYMBOL_LABELS[symbol]).join(" · ")}</p>
            <button type="button" onClick={() => onCommand({ type: "KICK_REEL", reelIndex: securityAction.reel })}>踢第{securityAction.reel + 1}轮</button>
          </div>
        )}
        {interventions.length > 0
          ? <button className="primary-button accept-outcome" type="button" onClick={() => onCommand({ type: "ACCEPT_OUTCOME" })}>收下这把</button>
          : <p className="muted" role="status">没有可用干预，正在确认结果</p>}
      </section>
    );
  }

  if (boundary && state.service === "repair" && state.tips > 0 && state.reels.some((reel) => reel.includes("crack"))) {
    return (
      <section className="action-bar boundary-repairs" aria-label="边界维修">
        <div className="tray-heading">
          <p className="tray-kicker">维修间夜班服务</p>
          <h2>处理永久裂纹</h2>
        </div>
        <div className="reel-actions">
          {state.reels.map((strip, reel) => strip.includes("crack") ? (
            <button type="button" key={reel} onClick={() => onCommand({ type: "REMOVE_CRACKS", reelIndex: reel as ReelIndex })}>
              修复第{reel + 1}轮裂纹（1 小费）
            </button>
          ) : null)}
        </div>
      </section>
    );
  }

  return null;
}
