import { useEffect, useRef } from "react";
import type { ClassicSpin } from "./engine";
import { MioPortrait } from "@/meta/MioPortrait";

export type TutorialStep = "offer" | "bet" | "spin" | "result" | "auto";
export const TUTORIAL_KEY = "midnight-lucky-hotel.classic.tutorial.v1";
export function tutorialSeen(): boolean { try { return localStorage.getItem(TUTORIAL_KEY) !== null; } catch { return true; } }
export function rememberTutorial(): void { try { localStorage.setItem(TUTORIAL_KEY, "seen"); } catch { /* Optional preference must never block a game save. */ } }

export function TutorialBubble({ step, english, bet, award, onNext, onSkip, onAuto }: {
  readonly step: TutorialStep; readonly english: boolean; readonly bet: number; readonly award: ClassicSpin | null;
  readonly onNext: () => void; readonly onSkip: () => void; readonly onAuto: () => void;
}): React.JSX.Element {
  const node = useRef<HTMLElement>(null);
  const t = (zh: string, en: string) => english ? en : zh;
  useEffect(() => {
    if (step === "offer") return;
    const element = node.current; if (!element) return;
    element.focus({ preventScroll: true });
    const bounds = element.getBoundingClientRect();
    const controls = step === "bet" || step === "spin" ? element.nextElementSibling?.getBoundingClientRect() : undefined;
    const bottom = controls?.bottom ?? bounds.bottom;
    // Keep the instruction AND the requested action in view on short phones.
    if (bottom > window.innerHeight - 16 && window.scrollBy) window.scrollBy({ top: Math.min(bottom - window.innerHeight + 16, bounds.top - 8), behavior: "instant" });
    else if (bounds.top < 8) element.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [step]);
  const result = award ? t(
    `刚才下注 ${award.bet}，赔付 ${award.payout}，净变化 ${award.payout - award.bet > 0 ? "+" : ""}${award.payout - award.bet}。` + (award.payout === award.bet ? "这是回本，不是净赚。" : award.payout === 0 ? "这次没有中奖，也一样完成教学。" : "赔付包含本转本金，减去下注才是净赚。"),
    `You bet ${award.bet}, received ${award.payout}, and your net change was ${award.payout - award.bet > 0 ? "+" : ""}${award.payout - award.bet}. ` + (award.payout === award.bet ? "That is break-even, not a profit." : award.payout === 0 ? "No win this time — you still complete the lesson." : "Payout includes the stake. Subtract the bet to find your profit.")
  ) : "";
  const copy: Record<TutorialStep, readonly [string, string]> = {
    offer: [t("第一次来？我带你转一轮。", "First visit? Let me show you one spin."), t("我是前台的澪。只教四件事：下注、拉杆、看账、自动转。用当前虚拟筹码正常游玩，不保底中奖。", "I am Mio from reception. Four small steps: bet, pull, read the payout, and automatic play. This uses your current virtual credits and normal odds — no guaranteed win.")],
    bet: [t("先选这一转愿意花多少。", "Choose what to spend on one spin."), t(`下方四个金属键就是注额。现在是 ${bet}，点任意一个确认；每拉一次就扣这个数。`, `The four metal keys choose your bet. It is ${bet} now. Press any key to confirm; each spin spends that amount.`)],
    spin: [t("拉下拉杆，盯住中间那条线。", "Pull the lever. Watch the center line."), t("也可以按「转一转」。只有中间一行计奖，上下排和斜线都不算。中央线有 1 个樱桃就能回本；拉杆力度不改变概率。", "Or press Spin. Only the middle row pays, not the top, bottom or diagonals. Even one cherry on that line returns the bet. Pull strength cannot change the odds.")],
    result: [t("看这里：赔付不等于净赚。", "A payout is not the same as a profit."), result],
    auto: [t("会玩了。想让我替你拉吗？", "Got it. Want me to keep the reels moving?"), t("自动模式只省下重复点击，中奖概率不变。先选转数和亏损上限，再按开始；可以随时停，切到后台也会停。", "Automatic play saves repeated taps; it does not change the odds. Choose a spin count and loss limit, then start. Stop anytime; leaving the page also stops it.")]
  };
  const index = step === "offer" ? 0 : ["bet", "spin", "result", "auto"].indexOf(step) + 1;
  return <aside ref={node} className="classic-tutorial" data-step={step} tabIndex={-1} aria-label={t("澪的新手教学", "Mio's first-spin tutorial")}>
    <header><MioPortrait framing="avatar" expression={step === "result" ? award && award.payout > award.bet ? "delighted" : "thinking" : step === "auto" ? "smile" : "welcome"} eager /><span>{t("澪 · 夜班前台", "MIO · RECEPTION")}<small>{index === 0 ? t("新手教学", "FIRST SPIN") : t(`教学 ${index}/4`, `LESSON ${index}/4`)}</small></span><button type="button" onClick={onSkip}>{t("跳过", "Skip")}</button></header>
    <h2>{copy[step][0]}</h2><p>{copy[step][1]}</p>
    <div className="classic-tutorial-actions">
      {step === "offer" && <button type="button" onClick={onNext}>{t("带我转一轮", "Show me a spin")} →</button>}
      {step === "bet" && <span>{t("↓ 点下方任意注额", "↓ Press a bet key below")}</span>}
      {step === "spin" && <span>{t("↓ 按「转一转」，或拖动右侧拉杆", "↓ Press Spin, or drag the lever on the right")}</span>}
      {step === "result" && <button type="button" onClick={onNext}>{t("明白了，看看自动模式", "Got it. Show me automatic play")} →</button>}
      {step === "auto" && <><button type="button" onClick={onAuto}>{t("选择自动转数", "Choose automatic spins")} →</button><button type="button" onClick={onSkip}>{t("完成，继续手动", "Done — keep playing manually")}</button></>}
    </div>
  </aside>;
}
