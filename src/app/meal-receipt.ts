import { safeMoney } from "@/core/money";
import type { SpinReceipt } from "@/core/types";
import type { GameEvent } from "@/core/events";

/** Timed meals are the settlement multiplier. Read the receipt, never the next spin's buff stack. */
export function mealExtra(receipt: SpinReceipt): number | null {
  let cents = 0;
  for (const award of receipt.awards) {
    if (award.formula.kind !== "known") return null;
    if (award.formula.appliedMultiplier > 1) cents += Math.round(award.amount * 100) - Math.round(safeMoney(award.formula.preMultiplierAmount) * 100);
  }
  return cents / 100;
}

export const mealPlacement = (en: boolean) => en
  ? "The dish isn't wild. Lines through it can't match; other lines still pay. Eating it buffs later spins, not the symbols that slide in."
  : "餐盘不是百搭。穿过它的线不能凑奖，其他线照算。吃掉后给后续转加成，补位不另算奖。";

export function refilledReels(events: readonly GameEvent[]) {
  return [...new Set(events.flatMap(event => event.type === "FOOD_CONSUMED" ? [event.reel] : []))];
}
