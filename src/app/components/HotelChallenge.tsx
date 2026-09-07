import { canOpenWorkshop, getWorkshopCost, HOTEL_ROOMS, nextRoomTier } from "@/content/hotel";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";

export function RoomResult({ state }: { readonly state: RunState }): React.JSX.Element | null {
  const challenge = state.hotel?.challenge;
  if (challenge == null || challenge.status === "playing") return null;
  const room = HOTEL_ROOMS[challenge.tier];
  return <section className="room-challenge-card" aria-label="客房挑战结果">
    <h3>{room.name} · {challenge.status === "cleared" ? "挑战成功" : "未达标"}</h3>
    <p>本段奖金 ¥{state.shiftPayout} / ¥{challenge.target ?? room.target} · 已通关 {state.hotel?.cleared}/3 间</p>
    {challenge.target !== undefined && challenge.target !== room.target && <p>以上是旧规则成绩；下次挑战使用新版目标 ¥{room.target}，不追溯修改上次结果。</p>}
    <p>{challenge.status === "cleared"
      ? state.currentCandidates !== null && state.workshop?.status !== "shopping" ? "获得一次免费升级，处理后可选择下一步。" : "本房免费升级已处理，可选择下一步。"
      : "挑战未通过，不等于亏钱。已得奖金保留；没有免费通关奖励，但可用金币整备补强，再原房重试。"}</p>
  </section>;
}

export function WorkshopChoice({ state, onCommand }: {
  readonly state: RunState; readonly onCommand: (command: GameCommand) => void;
}): React.JSX.Element | null {
  if (canOpenWorkshop(state)) return <section className="room-challenge-card" aria-label="金币整备">
    <h3>先把赚到的钱变成战力</h3>
    <p>本次整备 ¥{getWorkshopCost(state)}：三选一买部件或改造。查看不扣钱，确认后才支付；本次结算限一次，重试结束后补货。</p>
    <button className="primary-button" type="button" onClick={() => onCommand({ type: "OPEN_WORKSHOP" })}>查看金币整备 · ¥{getWorkshopCost(state)}</button>
  </section>;
  return state.phase === "AFTER_HOURS" && state.workshop?.status === "finished"
    ? <p>本次整备已处理；完成下一次房间挑战后补货。</p> : null;
}

export function RoomChoices({ state, onCommand }: {
  readonly state: RunState; readonly onCommand: (command: GameCommand) => void;
}): React.JSX.Element | null {
  if (!state.exitUnlocked || state.shift !== 5 || state.currentCandidates !== null || !["SHIFT_COMPLETE", "AFTER_HOURS"].includes(state.phase)) return null;
  const next = nextRoomTier(state);
  const room = next === null ? null : HOTEL_ROOMS[next];
  return <section className="room-challenge-card" aria-label="升房挑战">
    <p className="eyebrow">下一晚，由你决定</p>
    <h3>自由加班，或升房挑战</h3>
    <p>自由加班每完成一段，下段下注 ×1.25；房间挑战与重试不增加这个等级。升房用固定下注挑战本段奖金，旧余额不抵目标。</p>
    <ol className="room-itinerary">{([1, 2, 3] as const).map((tier) => {
      const item = HOTEL_ROOMS[tier];
      return <li key={tier} data-current={tier === next ? "true" : undefined}>
        <strong>{item.name}{(state.hotel?.cleared ?? 0) >= tier ? " · 已通关" : ""}</strong>
        <span>下注 ¥{item.bet} · 赔付目标 ¥{item.target} · 专注上限 {item.focusCap}</span>
      </li>;
    })}</ol>
    <p>每房 3 次付费转，连带免费转的赔付也计入目标。目标不扣款，没有门票；入房需备好 3 次下注，餐费另算。</p>
    {room === null ? <p>三间客房已全部通关！可以继续自由加班或结账留档。</p> : <>
      <button className="primary-button" type="button" disabled={state.bankroll < room.bet * 3} onClick={() => onCommand({ type: "ENTER_ROOM" })}>
        {state.hotel?.challenge?.status === "failed" ? "重试" : "升房挑战 · "}{room.name}
      </button>
      {state.bankroll < room.bet * 3 && <p role="status">需要至少 ¥{room.bet * 3} 备付金，当前不足。</p>}
    </>}
  </section>;
}
