import { getCurrentBet } from "@/core/progression";
import { getDominantRoute } from "@/core/candidates";
import type { PartId, RunState } from "@/core/types";

/** Uses only committed state. Never estimates a hidden draw or peeks at the RNG. */
export function routeReadiness(state: RunState): { badge: string; next: string; loop: string; detail: string } {
  const part = (id: PartId) => state.partSlots.find((item) => item?.id === id);
  const route = getDominantRoute(state);
  const bet = getCurrentBet(state);
  if (route === "fruit") {
    const vat = part("harvest-vat");
    if (vat) {
      const charge = state.counters.harvestCharge ?? 0;
      return { badge: `果桶 ${charge}/3`,
        next: charge === 2 ? `再一次付费水果命中，开桶额外 +¥${(vat.level === 1 ? 12 : 18) * bet}（未计餐效）。` : `还差 ${3 - charge} 次付费水果命中；空转不倒扣，跨回合保留。`,
        loop: "增加水果 → 付费转水果中奖攒进度 → 攒够3次开桶。食物也能增加开桶奖金。",
        detail: "樱桃线、柠檬线或水果沙拉中奖都算。一次付费转最多攒1格，免费转不算；还差1格也不代表下一转一定能开桶。" };
    }
    return { badge: part("lemon-infection") ? "柠檬越变越多" : "樱桃 / 沙拉",
      next: part("lemon-infection") ? "先给转轮加柠檬；樱桃和铃铛变少后，再换掉依赖它们的部件。" : "先增加想要的图案，再加奖金。连不出中奖线，奖金再高也没用。",
      loop: "樱桃、沙拉、柠檬是三种玩法，不必把所有水果部件都装上。",
      detail: "压榨机要先中樱桃线，盘面还得有至少3颗真正的樱桃。果酱罐的进度换班清零；感染变出的柠檬会一直保留。" };
  }
  if (route === "chapel") {
    const candle = part("votive-candle");
    const charge = state.counters.votiveCharge ?? 0;
    return { badge: charge > 0 ? `烛台已存 ${charge}` : `恶兆 ${state.omen} · 小费 ${state.tips}`,
      next: charge > 0 ? `烛台正常工作时额外 +¥${charge * (candle?.level === 2 ? 4 : 2) * bet}（未计餐效）；不必幸运7中奖。`
        : candle && state.omen > 0 && state.tips > 0 ? "可以花1枚小费点烛，把恶兆换成奖金；也可留给收集器，等幸运7中奖。两者不能重复用同一份恶兆。"
          : candle && state.omen > 0 ? "有恶兆，但还缺小费。完成委托或放弃一次免费升级，可以得到小费。"
            : state.service === "chapel" ? "先祈祷：想要的图案没连成线，就攒1层恶兆。烛台或收集器能把恶兆换成钱。"
              : "当前服务不能祈祷。可以先改造转轮，增加幸运7，再装给幸运7加奖金的部件。",
      loop: state.service === "chapel" ? "转前祈祷 → 没中目标连线就攒恶兆 → 用烛台或收集器换钱。"
        : "增加幸运7 → 用三重祝福或殉道者硬币加奖金。恶兆要有烛台或收集器才能换钱。",
      detail: `每轮永久幸运7：${state.reels.map((strip) => strip.filter((symbol) => symbol === "seven").length).join(" / ")}。祈祷副本只持续一转，并占本转干预；裂纹可能让烛台延后兑现。` };
  }
  if (route === "violent") {
    const cracks = state.reels.flat().filter((symbol) => symbol === "crack").length;
    const protection = part("shock-absorber")?.level ?? 0;
    return { badge: `裂纹 ${cracks} · 保护 ${protection}`,
      next: state.service !== "security" ? "当前服务不能踹击。可以靠转轮改造增减裂纹；飞轮只奖励这次盘面上出现的裂纹。"
        : cracks === 0 ? "先看踹击预览，有帮助再踹。踹过会留下裂纹，以后转出裂纹时飞轮能发奖金。" : "先看踹击预览。飞轮能挡住一些裂纹造成的停工，但不会清掉转轮里的裂纹。",
      loop: "少量裂纹配飞轮赚钱；裂纹多了，用磁铁、修枝剪或维修清理。",
      detail: `永久裂纹分布：${state.reels.map((strip) => strip.filter((symbol) => symbol === "crack").length).join(" / ")}。保护额度按本转可见裂纹计算，不是按全机裂纹总数；超额仍可能停工。` };
  }
  return { badge: "稳定改造", next: "先选一种喜欢的图案，多加一些。停轮后差一点就中奖时，再考虑花干预点。",
    loop: state.service === "repair" ? "看清连线 → 锁住好轮再重转 → 精简不需要的图案。"
      : "看清连线 → 用一次重转挽救盘面 → 精简不需要的图案。",
    detail: "维修间每回合多一点干预，但重转依然随机；信息工具不增加中奖概率。" };
}
