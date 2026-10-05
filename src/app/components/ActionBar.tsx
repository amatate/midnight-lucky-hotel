import { useState } from "react";
import { HelpButton, HelpFacts } from "@/app/components/HelpWindow";
import { CabinetPartArt } from "@/app/components/CabinetArtwork";
import { RouteBrief } from "@/app/components/RouteBrief";
import { SYMBOL_LABELS } from "@/app/labels";
import { activeRoom, getPaidSpinLimit } from "@/content/hotel";
import { UPGRADES } from "@/content/upgrades";
import { describeUpgrade } from "@/app/player-copy";
import type { GameCommand } from "@/core/commands";
import { getCurrentBet, getMinimumBet, getMealCost, getMartyrCost } from "@/core/progression";
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

export function selectedPaidBetIsUnaffordable(state: RunState): boolean {
  if (state.phase !== "READY_TO_SPIN" || state.freeSpinQueue > 0) return false;
  const minimumBet = getMinimumBet(state);
  return state.bankroll >= minimumBet && state.bankroll < getCurrentBet(state);
}

export function ActionBar({ state, onCommand }: ActionBarProps): React.JSX.Element | null {
  const [serviceReel, setServiceReel] = useState<ReelIndex>(0);
  const [prayerSymbol, setPrayerSymbol] = useState<BaseSymbolId>("seven");
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
    const showBuyFood = state.service === "kitchen" && !state.shiftFlags.foodBought;
    const candle = state.partSlots.find((part) => part?.id === "votive-candle");
    const fruitVat = state.partSlots.find((part) => part?.id === "harvest-vat");
    const candleIsLegal = candle != null && dispatchCommand(state, { type: "LIGHT_CANDLE" }).ok;
    const showPrayer = state.service === "chapel" && !state.shiftFlags.prayerUsed;
    const showMartyr = state.partSlots.some((part) => part?.id === "martyr-coin") &&
      !state.shiftFlags.martyrEnabled && state.baseSpinsInShift === 0;
    const foodCommand: GameCommand = { type: "BUY_FOOD", reelIndex: serviceReel };
    const prayerCommand: GameCommand = { type: "PRAY", symbol: prayerSymbol };
    const martyrCommand: GameCommand = { type: "ENABLE_MARTYR" };
    const foodIsLegal = showBuyFood && dispatchCommand(state, foodCommand).ok;
    const prayerIsLegal = showPrayer && dispatchCommand(state, prayerCommand).ok;
    const martyrIsLegal = showMartyr && dispatchCommand(state, martyrCommand).ok;
    const martyrCost = getMartyrCost(state);
    const mealCost = getMealCost(state);
    const selectedBetUnaffordable = selectedPaidBetIsUnaffordable(state);
    return (
      <section className="action-bar ready-actions" aria-label="本转准备">
        <div className="tray-heading">
          <p className="tray-kicker">房客决定</p>
          <h2>准备这一转</h2>
        </div>
        <RouteBrief state={state} />
        <fieldset className={`bet-selector${activeRoom(state) !== null ? " fixed-bet" : ""}`}>
          <legend>{activeRoom(state) !== null ? `本房固定下注 ¥${getCurrentBet(state)}` : "下注模式"} <HelpButton title="下注"><HelpFacts cost={state.freeSpinQueue > 0 ? "下一转是免费转，不扣下注。" : "下一次付费拉动扣 ¥" + getCurrentBet(state) + "。"}
            effect="保守 / 正常 / 激进对应标准下注的 0.5 / 1 / 2 倍，赔付随下注同比变化，不改变中奖概率。"
            limit="一笔下注覆盖 5 条支付线；客房下注固定。餐费和献祭封顶按标准下注计价，不随切档变化。" /></HelpButton></legend>
          {activeRoom(state) === null && (Object.keys(BET_LABELS) as BetMode[]).map((mode) => (
            <button
              type="button"
              aria-pressed={state.betMode === mode}
              className={state.betMode === mode ? "is-active" : ""}
              key={mode}
              disabled={activeRoom(state) !== null}
              onClick={() => onCommand({ type: "SET_BET_MODE", mode })}
            >{BET_LABELS[mode]}</button>
          ))}
        </fieldset>
        {selectedBetUnaffordable && (
          <p className="bet-warning" role="status">
            余额 ¥{state.bankroll} 不足以支付当前{BET_LABELS[state.betMode]}下注 ¥{getCurrentBet(state)}；可切换到保守下注 ¥{getMinimumBet(state)}。
          </p>
        )}
        <div className="action-section" role="group" aria-label="当前服务行动">
          {showBuyFood && (
            <div className="field-row service-fixture" data-service-fixture="kitchen">
              <CabinetPartArt id="room-service" />
              <div className="fixture-targets" role="group" aria-label="食物转轮">{([0, 1, 2] as const).map((reel) =>
                <button type="button" key={reel} aria-pressed={serviceReel === reel} onClick={() => setServiceReel(reel)}>第{reel + 1}轮</button>)}</div>
              <button type="button" disabled={!foodIsLegal} onClick={() => onCommand(foodCommand)}>购买食物（¥{mealCost}）</button>
              <HelpButton title="购买食物"><HelpFacts cost={"立即支付 ¥" + mealCost + "（本关标准下注 ×0.75）。"}
                effect={"接下来 3 转适用赔付 +50%；另向第" + (serviceReel + 1) + "轮加入食物，抽中后追加之后 3 转 +25%。"}
                limit="每段限买一次，可在任意转动前购买；免费转也消耗加成次数。食物会暂时稀释原有图案；空转也扣次数，不退餐费。"
                current={"余额 ¥" + state.bankroll + (foodIsLegal ? "，可购买。" : "，不足以支付餐费。")} /></HelpButton>
              <p className="action-hint">接下来 3 转 +50% · 本段还剩 {Math.max(0, getPaidSpinLimit(state) - state.baseSpinsInShift)} 次付费转。</p>
              {foodIsLegal && state.freeSpinQueue === 0 && state.bankroll - mealCost < getCurrentBet(state) && <p role="status">买餐后付不起当前下一注，请先留下注钱。</p>}
              {!foodIsLegal && <p className="muted">余额不足：厨房服务需要 ¥{mealCost}。</p>}
            </div>
          )}
          {showPrayer && (
            <div className="field-row service-fixture" data-service-fixture="chapel">
              <CabinetPartArt id="midnight-bell" />
              <div className="fixture-targets" role="group" aria-label="祈祷符号">{(["cherry", "lemon", "bell", "seven"] as const).map((symbol) =>
                <button type="button" key={symbol} aria-pressed={prayerSymbol === symbol} onClick={() => setPrayerSymbol(symbol)}>{SYMBOL_LABELS[symbol]}</button>)}</div>
              <button type="button" disabled={!prayerIsLegal} onClick={() => onCommand(prayerCommand)}>祈祷下一转</button>
              <HelpButton title="祈祷"><HelpFacts cost="1 点干预点，并占用下一转唯一一次干预。" effect={"下一转三个转轮各临时加入 2 个" + SYMBOL_LABELS[prayerSymbol] + "；目标没中线时获得 1 层恶兆。"}
                limit="小教堂每班一次，不保证中奖。祈祷后不能再对该转重转或踹击；恶兆可用收集器或还愿烛台兑现。" current={"剩余干预点 " + state.interventionPoints + " 点。"} /></HelpButton>
              <p className="action-hint">1 干预点 · 下一转目标图案增多 · 不能再重转</p>
              {!prayerIsLegal && <p className="muted">祈祷需要至少 1 点干预点。</p>}
            </div>
          )}
          {showMartyr && (
            <div className="field-row service-fixture" data-service-fixture="martyr">
              <CabinetPartArt id="martyr-coin" />
              <button type="button" disabled={!martyrIsLegal} onClick={() => onCommand(martyrCommand)}>启用殉道者硬币（献祭 ¥{martyrCost}）</button>
              <HelpButton title="殉道者献祭"><HelpFacts cost={"立即支付 ¥" + martyrCost + "：余额 10% 向上取整，最多标准下注 ×2。"}
                effect={"本班每条幸运7中奖线额外复制 " + (state.partSlots.find((part) => part?.id === "martyr-coin")?.level ?? 1) + " 次，不是整转总奖金翻倍。"}
                limit="仅首转前启用一次，持续整班；未中幸运7不退钱。不消耗干预点，可搭配祈祷。" current={martyrIsLegal ? "可以启用。" : "余额不足。"} /></HelpButton>
              {!martyrIsLegal && <p className="muted">余额不足：殉道者硬币需要 ¥{martyrCost}。</p>}
            </div>
          )}
          {candle != null && <div className="field-row service-fixture" data-service-fixture="candle">
            <CabinetPartArt id="votive-candle" />
            <button type="button" disabled={!candleIsLegal} onClick={() => onCommand({ type: "LIGHT_CANDLE" })}>点燃还愿烛台（1 小费）</button>
            <HelpButton title="点燃还愿烛台"><HelpFacts cost="1 枚小费，并立即存入最多 3 层恶兆。不花干预点。"
              effect={`下一次烛台正常工作时，每层发 ${candle.level === 1 ? 2 : 4} 倍下注奖金，不要求中奖；食物也能放大。`}
              limit="已点燃时不能重复存入；裂纹使它停工时存量保留，下一转再尝试。换班不丢失，替换部件会丢失。"
              current={`已存 ${state.counters.votiveCharge ?? 0} 层，尚有 ${state.omen} 恶兆、${state.tips} 小费。`} /></HelpButton>
            <p className="action-hint">{(state.counters.votiveCharge ?? 0) > 0
              ? `已存 ${state.counters.votiveCharge ?? 0} 层 · 正常工作时兑现。`
              : `可存 ${Math.min(3, state.omen)} 层 · 不占干预点。`}</p>
          </div>}
          {fruitVat != null && <p className="action-hint">陈酿果桶 · 存酿 {state.counters.harvestCharge ?? 0}/3。{(state.counters.harvestCharge ?? 0) === 2
            ? "再 1 次付费水果命中开桶。"
            : "付费水果命中存 1 格，免费转不计。"}</p>}
          {!showBuyFood && !showPrayer && !showMartyr && candle == null && <p className="muted">本转没有额外的准备行动，直接拉动拉杆。</p>}
        </div>
        {state.baseSpinsInShift === 0 && state.partSlots.some((part) => part?.level === 1) && <details className="tip-workshop">
          <summary>小费精修 · {state.tips} 枚小费</summary>
          <p>每个部件花 3 小费直接升到 L2，不占班末三选一。只在本段第一转前开放。</p>
          {state.partSlots.map((part, slot) => part?.level !== 1 ? null : <div className="field-row" key={slot}>
            <button type="button" disabled={state.tips < 3} onClick={() => onCommand({ type: "UPGRADE_PART", slot })}>{UPGRADES[part.id].name} → L2（3 小费）</button>
            <p>{describeUpgrade(state, part.id).levelTwoEffect}</p>
          </div>)}
        </details>}
      </section>
    );
  }

  if (boundary && state.service === "repair" && state.tips > 0 && state.reels.some((reel) => reel.includes("crack"))) {
    return (
      <section className="action-bar boundary-repairs" aria-label="边界维修">
        <div className="tray-heading">
          <p className="tray-kicker">维修间夜班服务</p>
          <h2>处理永久裂纹 <HelpButton title="维修裂纹"><HelpFacts cost="1 枚小费。" effect="从选中转轮永久移除最多 2 个裂纹。"
            limit="只在班次边界、维修间服务下可用。不会恢复已结算那一转的部件效果。" /></HelpButton></h2>
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
