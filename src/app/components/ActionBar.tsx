import { useState } from "react";
import { SYMBOL_LABELS } from "@/app/labels";
import { previewKick } from "@/content/services/security";
import type { GameCommand } from "@/core/commands";
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

function ReelButtons({ label, onSelect }: { readonly label: string; readonly onSelect: (reel: ReelIndex) => void }): React.JSX.Element {
  return (
    <div className="reel-actions">
      {([0, 1, 2] as const).map((reel) => (
        <button type="button" key={reel} onClick={() => onSelect(reel)}>{label.replace("{n}", String(reel + 1))}</button>
      ))}
    </div>
  );
}

export function ActionBar({ state, onCommand }: ActionBarProps): React.JSX.Element {
  const [serviceReel, setServiceReel] = useState<ReelIndex>(0);
  const [prayerSymbol, setPrayerSymbol] = useState<BaseSymbolId>("cherry");
  const securityPreview = state.phase === "AWAITING_INTERVENTION" && state.service === "security" &&
    !state.interventionUsedThisSpin && !state.shiftFlags.kickUsed && state.pendingSpin !== null
    ? previewKick(state, serviceReel)
    : null;
  const boundary = state.phase === "CHOOSING_UPGRADE" || state.phase === "SHIFT_COMPLETE" || state.phase === "AFTER_HOURS";

  return (
    <section className="action-bar" aria-label="操作区">
      {state.phase === "READY_TO_SPIN" && (
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
      )}

      <div className="action-section" aria-label="服务行动">
        <h2>服务</h2>
        {state.phase === "READY_TO_SPIN" && state.service === "kitchen" && !state.shiftFlags.foodBought && state.baseSpinsInShift === 0 && (
          <div className="field-row">
            <label>食物转轮<select value={serviceReel} onChange={(event) => setServiceReel(Number(event.target.value) as ReelIndex)}>
              <option value={0}>第1轮</option><option value={1}>第2轮</option><option value={2}>第3轮</option>
            </select></label>
            <button type="button" onClick={() => onCommand({ type: "BUY_FOOD", reelIndex: serviceReel })}>购买食物（¥10）</button>
          </div>
        )}
        {state.phase === "READY_TO_SPIN" && state.service === "chapel" && !state.shiftFlags.prayerUsed && (
          <div className="field-row">
            <label>祈祷符号<select value={prayerSymbol} onChange={(event) => setPrayerSymbol(event.target.value as BaseSymbolId)}>
              <option value="cherry">樱桃</option><option value="lemon">柠檬</option>
              <option value="bell">铃铛</option><option value="seven">幸运7</option>
            </select></label>
            <button type="button" disabled={state.interventionPoints <= 0} onClick={() => onCommand({ type: "PRAY", symbol: prayerSymbol })}>祈祷下一转</button>
          </div>
        )}
        {state.phase === "READY_TO_SPIN" && state.partSlots.some((part) => part?.id === "martyr-coin") && !state.shiftFlags.martyrEnabled && state.baseSpinsInShift === 0 && (
          <button type="button" onClick={() => onCommand({ type: "ENABLE_MARTYR" })}>启用殉道者硬币</button>
        )}
        {state.phase === "AWAITING_INTERVENTION" && state.service === "repair" && !state.interventionUsedThisSpin && !state.shiftFlags.repairLockUsed && state.interventionPoints > 0 && (
          <ReelButtons label="锁住第{n}轮并重转其他轮" onSelect={(lockedReelIndex) => onCommand({ type: "LOCK_AND_RESPIN_OTHERS", lockedReelIndex })} />
        )}
        {securityPreview !== null && (
          <div className="security-action">
            <label>踢击转轮<select value={serviceReel} onChange={(event) => setServiceReel(Number(event.target.value) as ReelIndex)}>
              <option value={0}>第1轮</option><option value={1}>第2轮</option><option value={2}>第3轮</option>
            </select></label>
            <p aria-live="polite">预览：{securityPreview.map((symbol) => SYMBOL_LABELS[symbol]).join(" · ")}</p>
            <button type="button" onClick={() => onCommand({ type: "KICK_REEL", reelIndex: serviceReel })}>踢第{serviceReel + 1}轮</button>
          </div>
        )}
        {boundary && state.service === "repair" && state.tips > 0 && state.reels.some((reel) => reel.includes("crack")) && (
          <div className="reel-actions">
            {state.reels.map((strip, reel) => strip.includes("crack") ? (
              <button type="button" key={reel} onClick={() => onCommand({ type: "REMOVE_CRACKS", reelIndex: reel as ReelIndex })}>
                修复第{reel + 1}轮裂纹（1 小费）
              </button>
            ) : null)}
          </div>
        )}
        {((state.phase === "READY_TO_SPIN" && state.service !== "kitchen" && state.service !== "chapel" && !state.partSlots.some((part) => part?.id === "martyr-coin")) ||
          (state.phase === "AWAITING_INTERVENTION" && state.service !== "repair" && securityPreview === null)) && <p className="muted">当前没有可用服务行动</p>}
      </div>

      <div className="action-section" aria-label="干预行动">
        <h2>干预</h2>
        {state.phase === "SPINNING" && <button className="primary-button" type="button" onClick={() => onCommand({ type: "REELS_STOPPED" })}>停轮</button>}
        {state.phase === "AWAITING_INTERVENTION" && (
          <>
            {!state.interventionUsedThisSpin && state.interventionPoints > 0 && (
              <ReelButtons label="重转第{n}轮" onSelect={(reelIndex) => onCommand({ type: "RESPIN_REEL", reelIndex })} />
            )}
            <button className="primary-button" type="button" onClick={() => onCommand({ type: "ACCEPT_OUTCOME" })}>接受结果</button>
          </>
        )}
        {state.phase === "RESOLVING_EFFECTS" && (
          <button className="primary-button" type="button" onClick={() => onCommand({ type: "PRESENTATION_COMPLETE" })}>播放结算/继续</button>
        )}
        {state.phase === "READY_TO_SPIN" && <p className="muted">拉动后可在停轮时干预</p>}
      </div>
    </section>
  );
}
