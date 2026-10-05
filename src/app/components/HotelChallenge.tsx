import { canOpenWorkshop, getRoomProgress, getWorkshopCost, HOTEL_ROOMS, HOTEL_ROOM_TIERS, isRoomIntermission, nextRoomTier } from "@/content/hotel";
import { roomGoalCopy, roomProgressCopy } from "@/app/room-copy";
import type { GameCommand } from "@/core/commands";
import type { RunState } from "@/core/types";
import { getIntroShiftLimit } from "@/core/progression";

export function RoomIntermission({ state, onCommand }: {
  readonly state: RunState; readonly onCommand: (command: GameCommand) => void;
}): React.JSX.Element | null {
  if (!isRoomIntermission(state)) return null;
  const rounds = state.hotel!.challenge!.rounds!;
  const room = HOTEL_ROOMS[state.hotel!.challenge!.tier];
  return <section className="room-rest-stop" aria-label="客房回合休息">
    <p className="tray-kicker">{`${room.name} · 回合 ${rounds.current} / ${rounds.total}`}</p>
    <h2>稍作整备，再来三转</h2>
    <p>本回合 +¥{state.shiftPayout} · {roomProgressCopy(getRoomProgress(state)!)}</p>
    <p>还剩 {rounds.total - rounds.current} 回合。下一回合恢复干预点与服务次数；部件、改轮和剩余餐效保留。</p>
    {state.currentCandidates !== null
      ? <p>选一项免费强化，确认后直接进入第 {rounds.current + 1} 回合。</p>
      : <><p>这处休息点的免费强化已在本局领取，重试不重复赠送。</p>
        <button className="primary-button" type="button" onClick={() => onCommand({ type: "NEXT_ROOM_ROUND" })}>
          {state.bankroll < room.bet ? "余额不足 · 结束本局" : `继续第 ${rounds.current + 1} 回合`}
        </button></>}
  </section>;
}

export function RoomResult({ state }: { readonly state: RunState }): React.JSX.Element | null {
  const challenge = state.hotel?.challenge;
  if (challenge == null || challenge.status === "playing") return null;
  const room = HOTEL_ROOMS[challenge.tier];
  const progress = getRoomProgress(state)!;
  return <section className="room-challenge-card" aria-label="客房挑战结果">
    <h3>{room.name} · {challenge.status === "cleared" ? "挑战成功" : "未达标"}</h3>
    <p>{roomProgressCopy(progress)} · 已通关 {state.hotel?.cleared}/{HOTEL_ROOM_TIERS.length} 间</p>
    {progress.objective.kind !== "total-payout" && <p>本段奖金共 ¥{state.shiftPayout}，已计入余额；通关看上方房间目标。</p>}
    {(challenge.target !== undefined && challenge.target !== room.target || room.rounds && !challenge.rounds) && <p>以上是旧规则成绩；下次挑战使用新版目标：{room.rounds ? `本房累计奖金 ¥${room.target}` : roomGoalCopy(room.objective, room.target)}，不追溯修改上次结果。</p>}
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
  if (!state.exitUnlocked || state.shift !== getIntroShiftLimit(state) || state.currentCandidates !== null || isRoomIntermission(state) || !["SHIFT_COMPLETE", "AFTER_HOURS"].includes(state.phase)) return null;
  const next = nextRoomTier(state);
  const room = next === null ? null : HOTEL_ROOMS[next];
  return <section className="room-challenge-card" aria-label="升房挑战">
    <p className="eyebrow">下一晚，由你决定</p>
    <h3>自由加班，或升房挑战</h3>
    <p>自由加班每完成一段，下段下注 ×1.25；房间挑战与重试不增加这个等级。升房用固定下注挑战不同目标，旧余额不抵目标。</p>
    <ol className="room-itinerary">{HOTEL_ROOM_TIERS.map((tier) => {
      const item = HOTEL_ROOMS[tier];
      return <li key={tier} data-current={tier === next ? "true" : undefined}>
        <strong>{item.name}{(state.hotel?.cleared ?? 0) >= tier ? " · 已通关" : ""}</strong>
        <span>{item.rounds ? `${item.rounds} 回合 × ` : ""}{item.paidSpins} 次付费转 · 每转 ¥{item.bet} · 干预点上限 {item.focusCap}</span>
        <span>{item.rounds ? `本房累计奖金 ¥${item.target}` : roomGoalCopy(item.objective, item.target)}{item.objective.kind === "scoring-spins" ? "，不要求连续" : ""}</span>
        {tier === next && <span>{item.hint}</span>}
      </li>;
    })}</ol>
    <p>前三房各有三回合，前两回合后各送一次强化；同一局重试不重复赠送。免费转计入目标但不占次数，最后一回合结束才判通关。入房不收门票，只检查首回合备付金，餐费另算。</p>
    {room === null ? <p>{HOTEL_ROOM_TIERS.length} 间客房已全部通关！可以继续自由加班或结账留档。</p> : <>
      <p>{room.rounds ? "首回合" : "下一房"}备付金 ¥{room.bet * room.paidSpins}（{room.paidSpins} 次 × ¥{room.bet}）。</p>
      <button className="primary-button" type="button" disabled={state.bankroll < room.bet * room.paidSpins} onClick={() => onCommand({ type: "ENTER_ROOM" })}>
        {state.hotel?.challenge?.status === "failed" ? "重试" : "升房挑战 · "}{room.name}
      </button>
      {state.bankroll < room.bet * room.paidSpins && <p role="status">需要至少 ¥{room.bet * room.paidSpins} 备付金，当前不足。</p>}
    </>}
  </section>;
}
