import { useContext, useEffect, useId, useRef, useState } from "react";
import { HelpPauseContext } from "@/app/components/HelpWindow";
import { createPortal } from "react-dom";
import { SYMBOL_LABELS } from "@/app/labels";
import { UPGRADES } from "@/content/upgrades";
import { safeMoney } from "@/core/money";
import { isSpinReceipt } from "@/core/receipts";
import type { LineWin, ReceiptAward, RoomTier, RunState, SpinReceipt } from "@/core/types";
import { stayName } from "@/story/stay-copy";
import type { ActionEntry } from "@/persistence/archives";
import { ReceiptPartStory } from "@/app/components/ReceiptPartStory";
import type { UpgradeNote } from "@/app/first-upgrade";
import { getLanguage } from "@/i18n/language";
import { mealExtra, refilledReels } from "@/app/meal-receipt";
import { settlementEntry } from "@/presentation/part-feedback";

interface LedgerDrawerProps {
  readonly state?: RunState;
  readonly firstNote?: UpgradeNote | null | undefined;
  readonly receipts: readonly SpinReceipt[];
  readonly entries?: readonly ActionEntry[] | undefined;
}

const LINE_LABELS: Readonly<Record<LineWin["lineId"], string>> = {
  top: "顶线",
  middle: "中线",
  bottom: "底线",
  "diagonal-down": "下斜线",
  "diagonal-up": "上斜线"
};

const BONUS_LABELS = {
  base: "基础赔付",
  intervention: "干预追加",
  service: "服务追加",
  agitation: "躁动追加"
} as const;

function money(value: number): string {
  return `¥${Object.is(value, -0) ? 0 : value}`;
}

function positiveMoney(value: number): string {
  return `+${money(value)}`;
}

function wagerMoney(value: number): string {
  return value === 0 ? money(0) : `-${money(value)}`;
}

function signedMoney(value: number): string {
  if (value > 0) return positiveMoney(value);
  if (value < 0) return `-${money(Math.abs(value))}`;
  return money(0);
}

function roomBlocks(entries: readonly ActionEntry[], state?: RunState) {
  const rooms = new Map<number, RoomTier>();
  for (const entry of entries) {
    if (!entry.ok) continue;
    for (const event of entry.events) {
      if (event.type === 'ROOM_ENTERED') rooms.set(entry.afterHoursLevel + 1, event.tier);
      if (event.type === 'ROOM_ROUND_STARTED') {
        const tier = rooms.get(entry.afterHoursLevel);
        if (tier) rooms.set(entry.afterHoursLevel + 1, tier);
      }
    }
  }
  if (state?.hotel?.challenge) rooms.set(state.afterHoursLevel, state.hotel.challenge.tier);
  return rooms;
}

function receiptLabel(receipt: SpinReceipt, tier?: RoomTier): string {
  if (tier) {
    const en = getLanguage() === 'en';
    return `${stayName(tier, en)} · ${receipt.isFree ? (en ? 'Free spin' : '免费转') + ` #${receipt.ordinal}` : en ? `Spin ${receipt.baseSpinIndex}` : `第 ${receipt.baseSpinIndex} 转`}`;
  }
  if (receipt.isFree) return `免费转 · 小票 #${receipt.ordinal}`;
  if (receipt.afterHoursLevel > 0) return `加班第 ${receipt.afterHoursLevel} 段 · 第 ${receipt.baseSpinIndex} 转`;
  return `第 ${receipt.shift} 班 · 第 ${receipt.baseSpinIndex} 转`;
}

function awardLabel(award: ReceiptAward): string {
  switch (award.kind) {
    case "line": return `${SYMBOL_LABELS[award.symbol]} · ${LINE_LABELS[award.lineId]}`;
    case "pattern-line": return `水果沙拉 · ${LINE_LABELS[award.lineId]}`;
    case "part-bonus": return UPGRADES[award.partId].name;
    case "bonus": return BONUS_LABELS[award.source];
    case "overload": return "机器过载";
    case "opaque": return "本转合计（明细不可用）";
  }
}

function ReceiptDetails({ receipt, entries }: { readonly receipt: SpinReceipt; readonly entries: readonly ActionEntry[] }): React.JSX.Element {
  const extra = mealExtra(receipt);
  const reels = refilledReels(settlementEntry(entries, receipt)?.events ?? []).map(reel => reel + 1).join(" / ");
  return (
    <dl className="ledger-receipt-details">
      <dt>转前余额</dt>
      <dd>{money(receipt.bankrollBefore)}</dd>
      <dt>下注</dt>
      <dd>{wagerMoney(receipt.wager)}</dd>
      {receipt.awards.map((award) => (
        <div className="ledger-award" key={`${award.sequence}-${award.kind}`}>
          <dt>{awardLabel(award)}</dt>
          <dd>
            <strong>{positiveMoney(award.amount)}</strong>
            {award.formula.kind === "known" && (
              <span className="ledger-formula">
                {money(award.formula.preMultiplierAmount)} × {award.formula.appliedMultiplier} = {money(award.amount)}
              </span>
            )}
          </dd>
        </div>
      ))}
      <dt className="ledger-total">总赔付</dt>
      <dd className="ledger-total">{positiveMoney(receipt.totalPayout)}</dd>
      {extra !== null && extra > 0 && <><dt>{getLanguage() === "en" ? "Of which: meal bonus" : "其中：餐点多赚"}</dt><dd>{positiveMoney(extra)}</dd></>}
      {reels && <div className="ledger-refill-note"><dt>{getLanguage() === "en" ? "Dish collected" : "收走餐盘"}</dt><dd>{getLanguage() === "en" ? `Reel ${reels} refilled after scoring. No second payout.` : `第 ${reels} 轮在算奖后补位；新图案不再判奖。`}</dd></div>}
      <dt>转后余额</dt>
      <dd>{money(receipt.bankrollAfter)}</dd>
    </dl>
  );
}

function focusableElements(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

export function LedgerDrawer({ receipts, entries, firstNote, state }: LedgerDrawerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const onOpenChange = useContext(HelpPauseContext);
  const [expandedOrdinal, setExpandedOrdinal] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const trustedReceipts = receipts.filter(isSpinReceipt).toReversed();
  const rooms = open ? roomBlocks(entries ?? [], state) : null;

  useEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    const overflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    onOpenChange(true);
    closeRef.current?.focus();
    return () => {
      if (root) root.inert = wasInert;
      document.body.style.overflow = overflow;
      onOpenChange(false);
      triggerRef.current?.focus();
    };
  }, [open, onOpenChange]);

  const closeDrawer = () => {
    setOpen(false);
    setExpandedOrdinal(null);
    triggerRef.current?.focus();
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== "Tab" || dialogRef.current === null) return;
    const focusable = focusableElements(dialogRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const overlay = open ? createPortal(
    <div className="ledger-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeDrawer();
    }}>
      <section
        className="ledger-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="ledger-heading">
          <div>
            <p className="eyebrow">FRONT DESK · NIGHT AUDIT</p>
            <h2 id={titleId}>前台账本</h2>
          </div>
          <button className="ledger-close" type="button" aria-label="关闭账本" ref={closeRef} onClick={closeDrawer}>关闭</button>
        </header>
        {firstNote && <aside className="first-ticket-record"><strong>{firstNote.stamp} · {UPGRADES[firstNote.id].name}</strong><p>{firstNote.body}</p></aside>}
        {trustedReceipts.length === 0 ? (
          <p className="ledger-empty">拉动一次后，前台会在这里留下结算小票</p>
        ) : (
          <div className="ledger-receipts">
            {trustedReceipts.map((receipt) => {
              const expanded = expandedOrdinal === receipt.ordinal;
              const detailsId = `${titleId}-receipt-${receipt.ordinal}`;
              return (
                <article className="ledger-receipt" key={receipt.ordinal}>
                  <button
                    className="ledger-receipt-toggle"
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    onClick={() => setExpandedOrdinal(expanded ? null : receipt.ordinal)}
                  >
                    <span>{receiptLabel(receipt, rooms?.get(receipt.afterHoursLevel))}</span>
                    <strong>{wagerMoney(receipt.wager)} → {positiveMoney(receipt.totalPayout)} · 净 {signedMoney(safeMoney(receipt.totalPayout - receipt.wager))}</strong>
                  </button>
                  {expanded && <div id={detailsId}><ReceiptPartStory receipt={receipt} entries={entries} /><ReceiptDetails receipt={receipt} entries={entries ?? []} /></div>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <div className="ledger-drawer">
      <button className="ledger-trigger" type="button" ref={triggerRef} onClick={() => setOpen(true)}>账本</button>
      {overlay}
    </div>
  );
}
