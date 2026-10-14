import { useMemo } from "react";
import type { ClassicSpin } from "./engine";
import { POOL_SEED, POOL_STEP, WHEEL_PRIZES, isFeatureSpin, isFeatureState, machineMath, machinePaytable, type FeatureMachine, type MachineState } from "./machines";
import { ClassicIcon } from "./symbols";

const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
export function awardDescription(spin: ClassicSpin, english: boolean): string {
  if (!isFeatureSpin(spin)) return (english ? "Payout " : "赔付 ") + fmt(spin.payout);
  const base = fmt(spin.basePayout), bonus = fmt(spin.bonusPayout), total = fmt(spin.payout);
  if (spin.feature === "multiply") return english ? `Line ${base} × ${spin.multiplier} = ${total}` : `三连基础 ${base} × ${spin.multiplier} = ${total}`;
  if (spin.feature === "diamond-jackpot") return english ? `Three diamonds · ${spin.bet} × 100 = ${total}` : `三颗钻石 · ${spin.bet} × 100 = ${total}`;
  if (spin.feature === "wheel") return english ? `Base ${base} + wheel ${bonus} (×${WHEEL_PRIZES[spin.wheelIndex!]}) = ${total}` : `基础 ${base} + 轮盘 ${bonus}（×${WHEEL_PRIZES[spin.wheelIndex!]}）= ${total}`;
  if (spin.feature === "mini") return english ? `Base ${base} + two-7s mini ${bonus} = ${total}` : `基础 ${base} + 双 7 小奖 ${bonus} = ${total}`;
  if (spin.feature === "jackpot") return english ? `Triple 7 · bet ${spin.bet} × pool ${fmt((spin.poolBefore + POOL_STEP) / 100)} = ${total}` : `三红 7 · 下注 ${spin.bet} × 奖池 ${fmt((spin.poolBefore + POOL_STEP) / 100)} = ${total}`;
  return english ? `Base payout ${base} · includes stake` : `基础赔付 ${base} · 含本转下注`;
}

export function MachineRules({ machine, state, english }: { readonly machine: FeatureMachine; readonly state: MachineState | undefined; readonly english: boolean }): React.JSX.Element {
  const t = (zh: string, en: string) => english ? en : zh;
  const pool = state && isFeatureState(state) ? state.pool : POOL_SEED;
  const math = useMemo(() => machineMath(machine, pool), [machine, pool]);
  return <>
    <p>{t("选下注 → 拉动拉杆或按「转一转」。只计中间一行，上下行和斜线不计奖。所有赔付都包含本转下注，净赚 = 赔付 − 下注。", "Choose a bet → pull the lever or press Spin. Only the center row pays, not the upper/lower rows or diagonals. All payouts include the stake; net profit = payout − bet.")}</p>
    <div className="family-rule-feature">
      {machine === "diamond" && <><h3>{t("钻石怎么翻倍？", "How diamonds multiply")}</h3><p>{t("钻石可替代水果、BAR、铃铛或红 7，补成三个相同符号。1 颗钻石参与三连，三连奖金 ×2；2 颗参与，×4；3 颗钻石单独赔付下注 ×100。", "A diamond substitutes for fruit, BAR, bell or red 7 to complete three matching symbols. One participating diamond doubles that line award; two quadruple it. Three diamonds pay 100× the bet.")}</p><p>{t("例如下注 10：BAR · 钻石 · BAR = 基础 30 ×2 = 60。钻石不会代替空格，也不会把一个散落樱桃的回本奖翻倍。若有多种解释，只取最高一档。", "At bet 10: BAR · diamond · BAR pays base 30 ×2 = 60. Diamonds never substitute for blanks or multiply partial-cherry awards. Only the highest eligible award is paid.")}</p></>}
      {machine === "wheel" && <><h3>{t("轮盘什么时候启动？", "When does the wheel start?")}</h3><p>{t("第三轮中央出现轮盘符号，就获得一次奖金轮盘。按「启动轮盘」，无需再下注；不必凑齐三个轮盘符号。基础中奖与轮盘奖金相加。", "A wheel symbol in the center of reel three awards one bonus wheel. Press Bonus without another bet; three wheel symbols are not required. The base payout and wheel prize add together.")}</p><p>{t("8 格均为 1/8 概率，分别为下注 ×1、×2、×3、×2、×10、×2、×3、×1。结果提前保存，按钮时机不影响停位。平均每 20 转触发一次，但不是 20 转保底。", "All eight sectors have equal 1/8 probability: bet ×1, ×2, ×3, ×2, ×10, ×2, ×3, ×1. The result is saved in advance; button timing cannot change it. The trigger averages once in 20 spins, not a 20-spin guarantee.")}</p></>}
      {machine === "vault" && <><h3>{t("小奖与累积金库", "Mini and progressive vault")}</h3><p>{t("中央恰好 2 个红 7：额外赔付下注 ×10，可与樱桃基础奖相加。3 个红 7：领取当前累积奖池，不再另加固定三 7 奖。", "Exactly two red 7s on the center line pay an extra 10× bet, alongside any base cherry award. Three red 7s collect the current pool instead of a separate fixed triple-7 award.")}</p><p>{t("奖池从下注 ×200 起步，每转累积 ×0.04；本转新增也计入大奖。每台金库存的是倍率：例如 ×200.04，下注 10 显示 2,000.4，下注 25 显示 5,001。改下注会同比换算，不会凭空增加累积进度。", "The pool starts at 200× bet and grows by 0.04× each paid spin, including the winning spin. It stores a multiplier: at ×200.04, bet 10 displays 2,000.4 and bet 25 displays 5,001. Changing bet scales the display, not the accumulated progress.")}</p><p>{t("换台或退出保留奖池。命中大奖重置到 ×200；设置中的「重新开台」也会清空累积，需确认。三 7 概率始终是 1/8,000，池子大不代表快要必出。这不是联网现金奖池。", "Switching or leaving preserves the pool. Winning resets it to ×200; an explicitly confirmed machine reset also clears it. Triple 7 always has probability 1/8,000: a larger pool does not mean a win is due. This is not a linked cash jackpot.")}</p></>}
    </div>
    <h3>{t("基础赔付 · 注额倍数", "Base payouts · bet multipliers")}</h3>
    <div className="classic-paytable">{machinePaytable(machine).map((row) => <div key={row.symbol + row.count}><span className="classic-pay-icons">{Array.from({ length: row.count }, (_, i) => <ClassicIcon symbol={row.symbol} key={i} />)}</span><span>{row.symbol === "cherry" && row.count < 3 ? t("中央线 " + row.count + " 个", row.count + " on center line") : t("三个相同", "Three matching")}</span><strong>×{row.multiplier}</strong></div>)}</div>
    <p>{t("普通组合只取一档，不叠加。1 个樱桃退还下注，属于回本；无中奖组合则赔付 0。", "Ordinary line awards do not stack. One cherry returns the stake: break-even, not profit. Other unmatched lines pay zero.")}</p>
    <details><summary>{t("概率与模拟边界", "Odds & simulation limits")}</summary>
      <p>{t("三个转轮各有 20 个等概率停点，共 8,000 种中央组合。下注大小不改变停点概率。", "Each of three reels has 20 equally likely stops: 8,000 center combinations. Bet size does not change stop probabilities.")}</p>
      <p>{machine === "vault" ? t(`当前奖池下下一转理论返还率 ${(math.rtp * 100).toFixed(2)}%；固定下注、跨完整奖池周期的长期模型为 ${(math.longRunRtp * 100).toFixed(2)}%。`, `Next-spin theoretical return at the current pool: ${(math.rtp * 100).toFixed(2)}%. The long-run fixed-bet renewal model across jackpot cycles is ${(math.longRunRtp * 100).toFixed(2)}%.`)
        : t(`合计理论返还率 ${(math.rtp * 100).toFixed(2)}%，已经包含本机奖励。`, `Combined theoretical return ${(math.rtp * 100).toFixed(2)}%, including this machine's features.`)} {t(`有赔付 ${(math.hitRate * 100).toFixed(2)}%（含回本），净盈利 ${(math.profitRate * 100).toFixed(2)}%。`, `Payout probability ${(math.hitRate * 100).toFixed(2)}% (including break-even); profit probability ${(math.profitRate * 100).toFixed(2)}%.`)}</p>
      <p>{t("长期数学均值不保证本次收益。机台没有升级、不随输赢改变概率。所有结果在动画前保存，刷新会补结算一次，包含已触发的轮盘奖金，不会重抽。仅为虚拟筹码模拟，非认证赌场设备。", "Long-run averages do not promise session returns. No upgrades or adaptive odds. All outcomes are saved before animation; refresh settles that same spin and any earned wheel prize exactly once, without rerolling. Virtual-credit simulation, not certified casino equipment.")}</p>
    </details>
  </>;
}
