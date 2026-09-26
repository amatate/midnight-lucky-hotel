import { useCallback, useState } from "react";
import { ActionBar } from "@/app/components/ActionBar";
import { CabinetPartArt } from "@/app/components/CabinetArtwork";
import { HelpButton, HelpFacts, HelpWindow } from "@/app/components/HelpWindow";
import { getCurrentBet, getMealCost } from "@/core/progression";
import { dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { ReelIndex, RunState } from "@/core/types";

export function PreparationConsole({ state, foodReel, onFoodReel, onCommand }: {
  readonly state: RunState;
  readonly foodReel: ReelIndex | null;
  readonly onFoodReel: (reel: ReelIndex | null) => void;
  readonly onCommand: (command: GameCommand) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const spinning = state.phase === "SPINNING";
  const mealCost = getMealCost(state);
  const canOrder = state.service === "kitchen" && !state.shiftFlags.foodBought;
  const foodCommand: GameCommand = { type: "BUY_FOOD", reelIndex: foodReel ?? 0 };
  const legal = canOrder && dispatchCommand(state, foodCommand).ok;
  return <section className={`preparation-deck console-preparation${foodReel !== null ? " is-targeting-food" : ""}`} aria-label="当前决策" data-phase={state.phase}>
    {foodReel !== null ? <>
      <div className="console-food-copy"><strong>餐点送至第 {foodReel + 1} 轮</strong><span>点盘面或列键换位置 · 接下来 3 转 +50%</span></div>
      <HelpButton title="购买食物" className="console-food-help"><HelpFacts cost={`立即花费 ¥${mealCost}。`}
        effect="接下来 3 转适用赔付 +50%；选定转轮加入食物，抽到后再给之后 3 转 +25%。"
        limit="每段一次；免费转与空转也消耗加成次数，食物暂时稀释原有图案。"
        current={!legal ? "余额不足。" : state.freeSpinQueue === 0 && state.bankroll - mealCost < getCurrentBet(state) ? "买餐后付不起当前下一注，请留下注钱或调整下注。" : `余额 ¥${state.bankroll}。`} /></HelpButton>
      <div className="console-food-actions"><button type="button" onClick={() => onFoodReel(null)}>取消</button>
        <button type="button" className="primary-button" disabled={!legal} onClick={() => { onCommand(foodCommand); onFoodReel(null); }}>确认送餐<small>¥{mealCost} · 第{foodReel + 1}轮</small></button></div>
    </> : <div className="console-fixtures">
      {canOrder && <button type="button" className="console-service-key" disabled={spinning} onClick={() => onFoodReel(0)}>
        <CabinetPartArt id="room-service" /><span>点餐<small>¥{mealCost} · 选轮后确认</small></span></button>}
      {!canOrder && <p className="console-ready-copy">{spinning ? "转轮依次停下…" : state.service === "chapel" && !state.shiftFlags.prayerUsed ? "祈祷可增加目标图案" : "准备就绪 · 好运候场"}</p>}
      <button type="button" className="console-tools-key" disabled={spinning} onClick={() => setOpen(true)}>{state.service === "chapel" && !state.shiftFlags.prayerUsed ? "祈祷 / 准备" : "准备 / 调注"}<small>服务 · 部件 · 下注</small></button>
    </div>}
    {open && <HelpWindow title="本转准备" interactive onClose={close}><ActionBar state={state} onCommand={(command) => { onCommand(command); close(); }} /></HelpWindow>}
  </section>;
}
