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
        loop: "补水果图案 → 水果中奖存酿 → 第三次开桶；餐效可放大开桶奖金。",
        detail: "樱桃、柠檬连线或水果沙拉均可存酿；每次付费转最多一格，免费转不存。开桶仍需命中，不是下一转保证中奖。" };
    }
    return { badge: part("lemon-infection") ? "柠檬提纯" : "樱桃 / 沙拉",
      next: part("lemon-infection") ? "先增加柠檬命中；提纯后换掉依赖樱桃或混合图案的部件。" : "先补命中，再拿放大奖金的部件；不要只堆倍率。",
      loop: "樱桃连击、混合沙拉、柠檬提纯是不同分支，不必全部安装。",
      detail: "樱桃压榨机需要樱桃中奖线和至少三颗实际樱桃；果酱罐换回合清零，感染则永久改变图案。" };
  }
  if (route === "chapel") {
    const candle = part("votive-candle");
    const charge = state.counters.votiveCharge ?? 0;
    return { badge: charge > 0 ? `烛台已存 ${charge}` : `恶兆 ${state.omen} · 小费 ${state.tips}`,
      next: charge > 0 ? `烛台正常工作时额外 +¥${charge * (candle?.level === 2 ? 4 : 2) * bet}（未计餐效）；不必幸运7中奖。`
        : candle && state.omen > 0 && state.tips > 0 ? "可以点烛兑现；也可保留恶兆等幸运7收集器，不能重复领取。"
          : candle && state.omen > 0 ? "恶兆已有，点烛还缺小费；完成委托或放弃一次免费升级可得小费。"
            : state.service === "chapel" ? "先祈祷：目标没中线会积累恶兆；装备烛台或收集器后才能兑现。"
              : "当前服务不能祈祷；先靠改轮增加幸运7，再让幸运7部件放大奖金。",
      loop: state.service === "chapel" ? "转前祈祷 → 失败积恶兆 → 用烛台或收集器兑现；不要只堆倍率。"
        : "补永久幸运7 → 三重祝福或硬币放大连线；恶兆需要对应部件才能兑现。",
      detail: `每轮永久幸运7：${state.reels.map((strip) => strip.filter((symbol) => symbol === "seven").length).join(" / ")}。祈祷副本只持续一转，并占本转干预；裂纹可能让烛台延后兑现。` };
  }
  if (route === "violent") {
    const cracks = state.reels.flat().filter((symbol) => symbol === "crack").length;
    const protection = part("shock-absorber")?.level ?? 0;
    return { badge: `裂纹 ${cracks} · 保护 ${protection}`,
      next: state.service !== "security" ? "当前服务不能踹击；通过改轮管理裂纹，飞轮只对可见裂纹发奖。"
        : cracks === 0 ? "先用踹击改善盘面并留下裂纹；飞轮需要可见裂纹才发奖。" : "先看踹击预览。保护只抵消可见裂纹停工，不会把永久裂纹修掉。",
      loop: "控制裂纹分布 → 飞轮赚钱并保护 → 磁铁回收或修枝，控制过多损伤。",
      detail: `永久裂纹分布：${state.reels.map((strip) => strip.filter((symbol) => symbol === "crack").length).join(" / ")}。保护额度按本转可见裂纹计算，不是按全机裂纹总数；超额仍可能停工。` };
  }
  return { badge: "稳定改造", next: "先围绕一种图案补命中，把干预点留给值得挽救的盘面。",
    loop: state.service === "repair" ? "看清连线 → 锁住好轮再重转 → 精简不需要的图案。"
      : "看清连线 → 用一次重转挽救盘面 → 精简不需要的图案。",
    detail: "维修间每回合多一点干预，但重转依然随机；信息工具不增加中奖概率。" };
}
