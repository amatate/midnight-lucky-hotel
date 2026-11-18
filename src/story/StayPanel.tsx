import { useState } from "react";
import { MioPortrait } from "@/meta/MioPortrait";
import { getLanguage } from "@/i18n/language";
import { ROOM_RENT, rentDue, type StayTier } from "@/core/stay";
import type { RunState } from "@/core/types";
import type { GameCommand } from "@/core/commands";
import { RoomCrown } from "@/app/components/CabinetArtwork";
import { STAY_ROOMS, currentStayTier, mioBrief, stayLocation, stayName, stayTask } from "./stay-copy";
import "./stay.css";
import { MIO_KEYCARD_NOTES } from "./mio-character";

export function RoomKeycard({ tier, locked = false }: { readonly tier: StayTier; readonly locked?: boolean }): React.JSX.Element {
  const english = getLanguage() === "en";
  return <span className="room-keycard" data-tier={tier} data-locked={locked} aria-label={`${stayName(tier, english)} ${english ? "keycard" : "房卡"}`}>
    <span className="keycard-band">MIDNIGHT HOTEL</span>
    {tier > 0 ? <RoomCrown tier={tier as Exclude<StayTier, 0>} /> : <span className="keycard-moon" aria-hidden="true">☾</span>}
    <strong>{stayName(tier, english)}</strong><span className="keycard-number">{String(tier + 1).padStart(3, "0")} · {locked ? english ? "NOT COLLECTED" : "尚未收藏" : english ? "GUEST KEY" : "住客珍藏"}</span>
  </span>;
}
export function StayPanel({ state, onCommand, guidanceOnly = false }: { readonly state: RunState; readonly onCommand?: ((command: GameCommand) => void) | undefined; readonly guidanceOnly?: boolean }): React.JSX.Element | null {
  if (!state.stay) return null;
  const english = getLanguage() === "en", t = (zh: string, en: string) => english ? en : zh;
  const brief = mioBrief(state, english), bill = rentDue(state), tier = currentStayTier(state);
  const lounge = state.afterHoursLevel > 0 && !state.hotel?.challenge;
  const collected = state.stay.paid.includes(tier), ended = ["RUN_LOST", "RUN_WON"].includes(state.phase);
  return <section className="stay-panel" aria-label={t("澪的入住任务", "Mio's room assignment")}>
    <div className="stay-mio-dialogue"><MioPortrait expression={brief.expression} framing="avatar" eager /><div><small>{t("澪 · 前台", "MIO · RECEPTION")}</small><h2>{brief.title}</h2><p>{brief.text}</p></div></div>
    {!guidanceOnly && <>
      <div className="stay-task-slip"><strong>{stayLocation(state, english)} · {STAY_ROOMS[tier].machine[english ? 1 : 0]}</strong>
        <p>{stayTask(state, english)}</p><p>{lounge ? t("大堂不另收房费，下注仍需支付。", "No additional room fee in the lounge; bets still cost credits.") : <>{t("房费", "Room fee")} ¥{ROOM_RENT[tier]} · {collected ? t("已支付 · 房卡已收藏", "Paid · keycard collected") : ended ? t("未收取 · 本次入住已结束", "Not charged · this stay has ended") : t("完成任务后确认扣款", "Charged only after the task, with confirmation")}</>}</p>
        <small>{t("长住目标：长夜皇家套房", "Long-stay goal: Royal Midnight Suite")} · {state.stay.paid.length}/7 {t("张房卡", "keycards")}</small>
      </div>
      {bill && !ended && <div className="stay-bill"><p>{t("钱包", "Wallet")} ¥{state.bankroll}{state.bankroll >= bill.amount && <> → {t("支付后", "After payment")} ¥{state.bankroll - bill.amount}</>}</p>
        {state.bankroll < bill.amount && <p role="status">{t(`还差 ¥${bill.amount - state.bankroll}。可重新申请本房，或回大堂；不发卡也不扣款。`, `You need ¥${bill.amount - state.bankroll} more. Retry this room or return to the lounge; nothing is charged or awarded.`)}</p>}
        {onCommand && <button type="button" className="primary-button" disabled={state.bankroll < bill.amount} onClick={() => onCommand({ type: "PAY_ROOM_RENT" })}>{t(`向澪交房费 ¥${bill.amount} · 领房卡`, `Pay Mio ¥${bill.amount} · collect keycard`)}</button>}
      </div>}
      {collected && !lounge && <RoomKeycard tier={tier} />}
    </>}
  </section>;
}

export function RoomCardCollection({ cards }: { readonly cards: readonly StayTier[] }): React.JSX.Element {
  const english = getLanguage() === "en", [selected, setSelected] = useState<StayTier | null>(null);
  return <section className="room-card-collection" aria-label={english ? "Room keycard collection" : "房卡收藏"}>
    <h2>{english ? "The rooms you stayed in" : "把住过的房间，留在手心"}</h2>
    <p>{english ? `${cards.length}/7 keycards. Complete a room task and pay Mio to collect its card. Cards are keepsakes, not permanent stat boosts.` : `${cards.length}/7 张房卡。完成任务并向澪交房费后收藏；房卡只作纪念，不增加中奖率。`}</p>
    <div className="room-card-grid">{STAY_ROOMS.map((_, index) => { const tier = index as StayTier; return <button type="button" key={tier} aria-pressed={selected === tier} onClick={() => setSelected(tier)}><RoomKeycard tier={tier} locked={!cards.includes(tier)} /></button>; })}</div>
    {selected !== null && <div className="keycard-memory"><MioPortrait expression={cards.includes(selected) ? "smile" : "thinking"} framing="avatar" /><p>{cards.includes(selected) ? MIO_KEYCARD_NOTES[selected][english ? 1 : 0]
      : english ? `Mio: Dear guest, complete the ${stayName(selected, true)} task, then pay its ¥${ROOM_RENT[selected]} room fee. I will have this card polished and ready.` : `澪：客人，完成${stayName(selected)}任务，再交 ¥${ROOM_RENT[selected]} 房费。这张卡我会擦亮了等你来领。`}</p></div>}
  </section>;
}
