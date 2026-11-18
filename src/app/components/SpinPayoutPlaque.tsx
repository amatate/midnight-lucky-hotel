import { AnimatedMoney } from "@/app/components/AnimatedMoney";
import { LedgerDrawer } from "@/app/components/LedgerDrawer";
import type { SettlementPresentationState } from "@/app/useSettlementPresentation";
import type { RunState } from "@/core/types";
import { stoppedBoardBasis } from "@/app/board-intervention";
import type { ActionEntry } from "@/persistence/archives";
import { getLanguage } from "@/i18n/language";
import type { UpgradeNote } from "@/app/first-upgrade";
import { mealExtra } from "@/app/meal-receipt";

/** The plaque follows the presentation cursor; the engine's final total is not a preview. */
export function SpinPayoutPlaque({ state, presentation, reducedMotion, previewing = false, entries, firstNote }: {
  readonly state: RunState;
  readonly presentation: SettlementPresentationState | null;
  readonly reducedMotion: boolean;
  readonly previewing?: boolean;
  readonly entries?: readonly ActionEntry[] | undefined;
  readonly firstNote?: UpgradeNote | null | undefined;
}): React.JSX.Element {
  const resolving = state.phase === "RESOLVING_EFFECTS";
  const receipts = resolving && !presentation?.done ? state.spinHistory.slice(0, -1) : state.spinHistory;
  const last = receipts.at(-1);
  const basis = stoppedBoardBasis(state);
  const en = getLanguage() === "en";
  const priorBlock = !!last && (last.shift !== state.shift || last.afterHoursLevel !== state.afterHoursLevel);
  const extra = last ? mealExtra(last) : null;
  const net = last ? Math.round((last.totalPayout - last.wager) * 100) / 100 : 0;
  return <section className="spin-payout-plaque" aria-label="转动到账">
    <div>
      <span>{basis ? previewing ? "原盘面基础 · 未结算" : "盘面基础 · 未结算" : state.phase === "SPINNING" ? "转动中…" : resolving ? "本转到账" : priorBlock ? en ? "Last round’s payout" : "上回合末转到账" : last ? "上一转到账" : "等待第一转"}</span>
      {basis ? <strong>¥{basis.amount}</strong> : (resolving || last) && <strong>
        +¥{presentation ? <AnimatedMoney target={presentation.visiblePayoutTarget}
          durationMs={presentation.moneyDurationMs} resetKey={presentation.moneyResetKey}
          animationKey={presentation.moneyAnimationKey} reducedMotion={reducedMotion} /> : resolving ? 0 : last!.totalPayout}
      </strong>}
      {basis && <small>{basis.lineIds.length} 条线 · 部件另算</small>}
      {!basis && !resolving && state.phase !== "SPINNING" && last && <small data-net={net > 0 ? "profit" : net < 0 ? "loss" : "even"}>{priorBlock ? (en ? "Then bet " : "当时下注 ") + `¥${last.wager}` : extra !== null && extra > 0 ? (en ? "Meal incl. " : "含餐点 ") + `+¥${extra}` : <>{en ? "After bet " : "扣下注后 "}{net > 0 ? "+" : net < 0 ? "−" : ""}¥{Math.abs(net)}</>}</small>}
    </div>
    <LedgerDrawer receipts={receipts} entries={entries} firstNote={firstNote} state={state} />
  </section>;
}
