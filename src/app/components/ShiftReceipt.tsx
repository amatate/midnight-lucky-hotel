import type { RunState } from "@/core/types";
import { RoomResult } from "@/app/components/HotelChallenge";
import { safeMoney } from "@/core/money";
import { HOTEL_ROOMS } from "@/content/hotel";

function money(value: number): string {
  return `¥${Object.is(value, -0) ? 0 : value}`;
}

function signedMoney(value: number): string {
  const safe = safeMoney(value);
  if (safe > 0) return `+${money(safe)}`;
  if (safe < 0) return `-${money(Math.abs(safe))}`;
  return money(0);
}

export function ShiftReceipt({ state }: { readonly state: RunState }): React.JSX.Element | null {
  const snapshot = state.shiftHistory.at(-1);
  if (snapshot === undefined) return null;
  const heading = state.hotel?.challenge?.rounds
    ? `${HOTEL_ROOMS[state.hotel.challenge.tier].name} · 第 ${state.hotel.challenge.rounds.current} 回合收工`
    : (snapshot.afterHoursLevel ?? 0) > 0
    ? `加班第 ${snapshot.afterHoursLevel} 段收工`
    : `第 ${snapshot.shift} 班收工`;

  return (
    <section className="shift-receipt" role="status" aria-label="班次小票">
      <p className="eyebrow">NIGHT AUDIT · SHIFT RECEIPT</p>
      <h2>{heading}</h2>
      <strong>本班转轮盈亏 {signedMoney(snapshot.totalPayout - snapshot.totalWager)}</strong>
      <p>以上只扣下注，未扣餐费、献祭或整备；钱包净收益请看结算账本。</p>
      {state.exitUnlocked ? <p>结算时钱包 {money(snapshot.bankroll)} · 已获得结账资格</p>
        : <p>余额 {money(snapshot.bankroll)} / 目标 {money(state.checkoutTarget)}</p>}
      <p>下注 {money(snapshot.totalWager)} · 赔付 {money(snapshot.totalPayout)}</p>
      <RoomResult state={state} />
    </section>
  );
}
