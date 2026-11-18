import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/i18n/language";
import { MioPortrait, MIO_EXPRESSIONS, type MioExpression } from "./MioPortrait";
import { QUESTS, questProgress, type Guestbook, type GuestQuest } from "./guestbook";
import { KeepsakeArt } from "@/app/components/UiArtwork";
import type { RunState } from "@/core/types";
import { mioBrief } from "@/story/stay-copy";
import { RoomCardCollection } from "@/story/StayPanel";
import { MIO_BIO, MIO_CHAT } from "@/story/mio-character";

export function ConciergeDesk({ book, onTasks, onMeet, hasRun, state }: { readonly book: Guestbook; readonly onTasks: () => void; readonly onMeet: () => void; readonly hasRun: boolean; readonly state?: RunState | undefined }): React.JSX.Element {
  const english = useLanguage() === "en"; const t = (zh: string, en: string) => english ? en : zh;
  const [topic, setTopic] = useState(0);
  const ready = QUESTS.filter(q => !book.claimed.includes(q.id) && questProgress(q, book) >= q.target).length;
  const lines = [
    state?.stay ? mioBrief(state, english).text : ready ? t(`客人，有 ${ready} 枚纪念章等你领取。我把印章都摆好了，就差你来伸手啦。`, `Dear guest, ${ready} keepsakes are ready! I have the stamps lined up; just hold out your hand.`)
      : hasRun ? t("客人回来啦！房间还留着。今晚想继续改造，还是来听我讲讲楼上的好房间？我保证只介绍，不乱收钱。", "Welcome back, dear guest! Your room is waiting. More tinkering, or a little talk about the finer rooms upstairs? An introduction is free, I promise.")
      : book.played.length > 0 ? t("客人，又见面啦。换台机器，还是试试酒店旅程？房卡经过我手时，可都是擦亮了的。", "Back again, dear guest! Another cabinet, or a hotel adventure? Every keycard that passes through my hands gets a polish.")
      : t("客人，欢迎！我是前台澪，房卡和账本都归我管。带着 ¥100 从标准房开始，完成任务、交好房费就能领房卡。皇家套房的水晶灯可漂亮了——咳，先看今晚的任务。", "Welcome, dear guest! I am Mio; keycards and accounts are my department. Start with ¥100 in the Standard Room, complete the task and pay the fee for its card. The Royal Suite has lovely chandeliers—ahem. Tonight's task first."),
    ...MIO_CHAT.map(line => line.text[english ? 1 : 0])
  ];
  const expression: MioExpression = topic === 0 && state?.stay ? mioBrief(state, english).expression : topic > 0 ? MIO_CHAT[topic - 1]!.expression : ready ? "delighted" : "welcome";
  return <section className="concierge-scene" aria-label={t("与前台澪交谈", "Talk to Mio at reception")}>
    <div className="concierge-stage">
      <div className="concierge-scene-copy"><p>AFTER HOURS · 1313</p><h2>{t("深夜好。", "Good evening.")}<br />{t("这里总有一盏灯。", "The light is still on.")}</h2><span>{t("澪 · 夜班接待员", "MIO · NIGHT RECEPTION")}</span></div>
      <MioPortrait expression={expression} eager />
      <span className="concierge-counter" aria-hidden="true" />
    </div>
    <div className="concierge-dialogue">
      <div className="concierge-speaker"><span>{t("澪", "Mio")}</span><small>{t("夜班前台", "RECEPTION")}</small><span aria-hidden="true">☾</span></div>
      <p aria-live="polite">{lines[topic]}</p>
      <div className="concierge-dialogue-actions"><button type="button" onClick={onTasks}>{ready ? t("领取纪念章", "Collect keepsakes") : t("今晚做什么？", "What can I do tonight?")} <span aria-hidden="true">↗</span></button>
        <button type="button" onClick={() => { onMeet(); setTopic((topic + 1) % lines.length); }}>{t("和澪聊聊", "Talk to Mio")} <span aria-hidden="true">…</span></button></div>
    </div>
  </section>;
}

export function GuestbookPage({ book, onClaim, onGo, error }: {
  readonly book: Guestbook; readonly onClaim: (quest: GuestQuest) => void; readonly onGo: (quest: GuestQuest) => void; readonly error: string;
}): React.JSX.Element {
  const english = useLanguage() === "en"; const n = english ? 1 : 0;
  const t = (zh: string, en: string) => english ? en : zh;
  const [view, setView] = useState<"short" | "long" | "keepsakes">("short");
  const [expression, setExpression] = useState<MioExpression>("welcome");
  const [selected, setSelected] = useState<GuestQuest | null>(null);
  return <section className="guestbook-page" aria-label={t("住客手册", "Guestbook")}>
    <header className="guestbook-heading"><p>THE MIDNIGHT GUESTBOOK</p><h2 tabIndex={-1}>{t("把今晚，留成一页故事。", "A little story to take home.")}</h2><span>{t("已珍藏", "Collected")} {book.claimed.length} / {QUESTS.length}</span></header>
    <p className="guestbook-principle">{t("没有每日打卡，没有连胜要求。进度跨局保留，奖励只作纪念，不增加中奖概率。", "No daily streaks. No winning streaks. Progress carries across runs; keepsakes never change the odds.")}</p>
    <RoomCardCollection cards={book.roomCards ?? []} />
    <div className="guestbook-segments" role="group" aria-label={t("手册分类", "Guestbook sections")}>
      {(["short", "long", "keepsakes"] as const).map(key => <button type="button" key={key} aria-pressed={view === key} onClick={() => { setView(key); setSelected(null); }}>{key === "short" ? t("今夜小目标", "Tonight") : key === "long" ? t("长住心愿", "Long stay") : t("纪念收藏", "Keepsakes")}</button>)}
    </div>
    {error && <p className="archive-warning" role="alert">{error}</p>}
    {view !== "keepsakes" ? <ol className="guestbook-quests">{QUESTS.filter(q => q.kind === view).map(quest => {
      const progress = questProgress(quest, book); const claimed = book.claimed.includes(quest.id); const ready = progress >= quest.target;
      return <li key={quest.id} className="guestbook-quest" data-complete={claimed || undefined}>
        <span className="guestbook-stamp" aria-hidden="true"><KeepsakeArt id={quest.id} />{claimed && <span className="keepsake-check">✓</span>}</span><div><div className="guestbook-quest-title"><h3>{quest.title[n]}</h3><span>{progress}/{quest.target}</span></div>
          <p>{quest.description[n]}</p><progress value={progress} max={quest.target} aria-label={quest.title[n]} /><small>{t("纪念奖励：", "Keepsake: ")}{quest.reward[n]}</small>
          {claimed ? <span className="guestbook-claimed">{t("已收入收藏", "In your collection")}</span> : <button type="button" className={ready ? "guestbook-claim" : "guestbook-go"} disabled={ready && !!error} onClick={() => ready ? onClaim(quest) : onGo(quest)}>{ready ? t("请澪盖章", "Collect from Mio") : quest.action === "collection" ? t("查看图鉴", "Open collection") : t("去完成", "Go explore")} <span aria-hidden="true">→</span></button>}
        </div>
      </li>;
    })}</ol> : <>
      {book.claimed.length === 0 && <p className="guestbook-empty">{t("你的第一枚印章还在等你。完成一个小目标，回前台请澪盖章。", "Your first stamp is waiting. Complete a small goal, then collect it from Mio.")}</p>}
      <div className="guestbook-keepsakes">{QUESTS.map(q => {
        const collected = book.claimed.includes(q.id);
        return <button className="keepsake-card" key={q.id} type="button" data-collected={collected || undefined} aria-pressed={selected?.id === q.id} onClick={() => setSelected(q)}>
          <span className="keepsake-display"><KeepsakeArt id={q.id} />{collected && <span className="keepsake-check" aria-hidden="true">✓</span>}</span>
          <strong>{q.reward[n]}</strong><small>{collected ? t("查看澪的留言", "Read Mio's note") : t("尚未获得", "Not yet collected")}</small>
        </button>;
      })}</div>
      {selected && <div className="guestbook-selected" aria-live="polite">
        <h3>{selected.reward[n]}</h3>
        {book.claimed.includes(selected.id) ? <blockquote className="guestbook-memory">{selected.memory[n]}</blockquote>
          : <><p>{selected.description[n]}</p><p>{questProgress(selected, book)}/{selected.target}</p><button type="button" onClick={() => {
            if (questProgress(selected, book) >= selected.target) setView(selected.kind); else onGo(selected);
          }}>{questProgress(selected, book) >= selected.target ? t("领取纪念章", "Collect keepsakes") : t("去完成", "Go explore")}</button></>}
      </div>}
      <details className="mio-gallery"><summary>{t("认识澪 · 六种表情立绘", "Meet Mio · six expression portraits")}</summary>
        <div className="mio-gallery-stage"><MioPortrait expression={expression} framing="full" /></div>
        <div className="mio-gallery-options" role="group" aria-label={t("表情", "Expression")}>{MIO_EXPRESSIONS.map((value, i) => <button key={value} type="button" aria-pressed={expression === value} onClick={() => setExpression(value)}>{(english ? ["Welcome", "Smile", "Thinking", "Delighted", "Concerned", "Proud"] : ["迎宾", "微笑", "思考", "惊喜", "关切", "欣慰"])[i]}</button>)}</div>
        <p>{MIO_BIO[n]}</p>
      </details>
    </>}
  </section>;
}

export function GuestReward({ quest, onClose }: { readonly quest: GuestQuest; readonly onClose: () => void }): React.JSX.Element {
  const english = useLanguage() === "en"; const n = english ? 1 : 0;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement; const overflow = document.body.style.overflow;
    dialog.current?.showModal(); document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      const target = previous instanceof HTMLElement && previous.isConnected ? previous : document.querySelector<HTMLElement>(".guestbook-heading h2");
      target?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="guest-reward" aria-label={english ? "Keepsake collected" : "已领取纪念章"} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="guest-reward-inner"><div className="guest-reward-portrait"><MioPortrait expression="delighted" eager /><span className="guest-reward-stamp" aria-hidden="true"><KeepsakeArt id={quest.id} /></span></div>
      <p className="guest-reward-eyebrow">{english ? "A MEMORY, NOT A MULTIPLIER" : "把这一刻，收入收藏"}</p><h2>{quest.reward[n]}</h2><p>{quest.memory[n]}</p>
      <button type="button" onClick={onClose}>{english ? "Keep this memory" : "收好这份纪念"}</button><small>{english ? "Saved in Guestbook → Keepsakes. No effect on credits or odds." : "已存入住客手册 → 纪念收藏，不影响筹码或赔率。"}</small>
    </div>
  </dialog>, document.body);
}
