import { useState } from "react";
import { HelpButton, HelpFacts } from "@/app/components/HelpWindow";
import { availableInterventions } from "@/app/intervention-options";
import { SYMBOL_LABELS } from "@/app/labels";
import { activeRoom } from "@/content/hotel";
import { UPGRADES } from "@/content/upgrades";
import { describeUpgrade } from "@/content/player-copy";
import { previewKick } from "@/content/services/security";
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
    const martyrCost = getMartyrCost(state);
    const mealCost = getMealCost(state);
    const selectedBetUnaffordable = selectedPaidBetIsUnaffordable(state);
    return (
      <section className="action-bar ready-actions" aria-label="本转准备">
        <div className="tray-heading">
          <p className="tray-kicker">房客决定</p>
          <h2>准备这一转</h2>
        </div>
        <fieldset className="bet-selector">
          <legend>下注模式 <HelpButton title="下注"><HelpFacts cost={state.freeSpinQueue > 0 ? "下一转是免费转，不扣下注。" : "下一次付费拉动扣 ¥" + getCurrentBet(state) + "。"}
            effect="保守 / 正常 / 激进对应标准下注的 0.5 / 1 / 2 倍，赔付随下注同比变化，不改变中奖概率。"
            limit="一笔下注覆盖 5 条支付线；客房下注固定。餐费和献祭封顶按标准下注计价，不随切档变化。" /></HelpButton></legend>
          {activeRoom(state) !== null && <p>客房固定下注 ¥{getCurrentBet(state)}，本段不可切档。</p>}
          {(Object.keys(BET_LABELS) as BetMode[]).map((mode) => (
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
            <div className="field-row">
              <label>食物转轮<select value={serviceReel} onChange={(event) => setServiceReel(Number(event.target.value) as ReelIndex)}>
                <option value={0}>第1轮</option><option value={1}>第2轮</option><option value={2}>第3轮</option>
              </select></label>
              <button type="button" disabled={!foodIsLegal} onClick={() => onCommand(foodCommand)}>购买食物（¥{mealCost}）</button>
              <HelpButton title="购买食物"><HelpFacts cost={"立即支付 ¥" + mealCost + "（本关标准下注 ×0.75）。"}
                effect={"接下来 3 转适用赔付 +50%；另向第" + (serviceReel + 1) + "轮加入食物，抽中后追加之后 3 转 +25%。"}
                limit="每段第一转前限买一次；免费转也消耗加成次数。食物会暂时稀释原有图案；空转也扣次数，不退餐费。"
                current={"余额 ¥" + state.bankroll + (foodIsLegal ? "，可购买。" : "，不足以支付餐费。")} /></HelpButton>
              <p className="action-hint">接下来 3 转 +50% · 点 ? 查看餐费与叠加规则</p>
              {!foodIsLegal && <p className="muted">余额不足：厨房服务需要 ¥{mealCost}。</p>}
            </div>
          )}
          {showPrayer && (
            <div className="field-row">
              <label>祈祷符号<select value={prayerSymbol} onChange={(event) => setPrayerSymbol(event.target.value as BaseSymbolId)}>
                <option value="cherry">樱桃</option><option value="lemon">柠檬</option>
                <option value="bell">铃铛</option><option value="seven">幸运7</option>
              </select></label>
              <button type="button" disabled={!prayerIsLegal} onClick={() => onCommand(prayerCommand)}>祈祷下一转</button>
              <HelpButton title="祈祷"><HelpFacts cost="1 点专注，并占用下一转唯一一次干预。" effect={"下一转三个转轮各临时加入 2 个" + SYMBOL_LABELS[prayerSymbol] + "；目标没中线时获得 1 层恶兆。"}
                limit="小教堂每班一次，不保证中奖。祈祷后不能再对该转重转或踹击；恶兆需要收集器才能兑现。" current={"剩余专注 " + state.interventionPoints + " 点。"} /></HelpButton>
              <p className="action-hint">1 专注 · 下一转目标图案增多 · 不能再重转</p>
              {!prayerIsLegal && <p className="muted">祈祷需要至少 1 点专注。</p>}
            </div>
          )}
          {showMartyr && (
            <div className="field-row">
              <button type="button" disabled={!martyrIsLegal} onClick={() => onCommand(martyrCommand)}>启用殉道者硬币（献祭 ¥{martyrCost}）</button>
              <HelpButton title="殉道者献祭"><HelpFacts cost={"立即支付 ¥" + martyrCost + "：余额 10% 向上取整，最多标准下注 ×2。"}
                effect={"本班每条幸运7中奖线额外复制 " + (state.partSlots.find((part) => part?.id === "martyr-coin")?.level ?? 1) + " 次，不是整转总奖金翻倍。"}
                limit="仅首转前启用一次，持续整班；未中幸运7不退钱。不消耗专注，可搭配祈祷。" current={martyrIsLegal ? "可以启用。" : "余额不足。"} /></HelpButton>
              {!martyrIsLegal && <p className="muted">余额不足：殉道者硬币需要 ¥{martyrCost}。</p>}
            </div>
          )}
          {!showBuyFood && !showPrayer && !showMartyr && <p className="muted">本转没有额外的准备行动，直接拉动拉杆。</p>}
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

  if (state.phase === "AWAITING_INTERVENTION") {
    return (
      <section className="action-bar intervention-actions" aria-label="停轮决定">
        <div className="tray-heading">
          <p className="tray-kicker">结果已停</p>
          <h2>收下，还是动手？</h2>
        </div>
        <div className="intervention-help">
          <span>重转 <HelpButton title="重转"><HelpFacts cost="1 专注，不再扣下注。" effect="随机改变选中转轮的停点，其他两轮保持。"
            limit="每转只能干预一次；结果可能变差，也可能看起来一样。专注不足或已祈祷就不能重转。" current={"剩余专注 " + state.interventionPoints + " 点。"} /></HelpButton></span>
          {state.service === "repair" && <span>锁轮 <HelpButton title="锁轮"><HelpFacts cost="1 专注，不再扣下注。" effect="锁住选中的整列，另外两轮随机重转。"
            limit="仅维修间，每班一次；与普通重转共用本转唯一干预机会。" /></HelpButton></span>}
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
            <HelpButton title="踹击"><HelpFacts cost="0 金钱、0 专注，占用本转干预。" effect="按旁边的预览确定性推进选定转轮，不随机重抽。"
              limit="每班一次；向该轮加入 1 个永久裂纹，装备弹簧也不增加损伤。之后可见时会让非免疫部件失效。" /></HelpButton>
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
