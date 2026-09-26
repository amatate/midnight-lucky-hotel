import { AnimatedMoney } from "@/app/components/AnimatedMoney";
import { LedgerDrawer } from "@/app/components/LedgerDrawer";
import type { SettlementPresentationState } from "@/app/useSettlementPresentation";
import type { RunState } from "@/core/types";

/** The plaque follows the presentation cursor; the engine's final total is not a preview. */
export function SpinPayoutPlaque({ state, presentation, reducedMotion }: {
  readonly state: RunState;
  readonly presentation: SettlementPresentationState | null;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const resolving = state.phase === "RESOLVING_EFFECTS";
  const receipts = resolving && !presentation?.done ? state.spinHistory.slice(0, -1) : state.spinHistory;
  const last = receipts.at(-1);
  return <section className="spin-payout-plaque" aria-label="转动到账">
    <div>
      <span>{resolving ? "本转到账" : last ? "上一转到账" : "等待第一转"}</span>
      {(resolving || last) && <strong>
        +¥{presentation ? <AnimatedMoney target={presentation.visiblePayoutTarget}
          durationMs={presentation.moneyDurationMs} resetKey={presentation.moneyResetKey}
          animationKey={presentation.moneyAnimationKey} reducedMotion={reducedMotion} /> : resolving ? 0 : last!.totalPayout}
      </strong>}
    </div>
    <LedgerDrawer receipts={receipts} />
  </section>;
}
