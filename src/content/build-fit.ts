import type { PartId, RunState, SymbolId, UpgradeId } from "@/core/types";
import { getReserveParts } from "@/core/workbench";

export interface BuildFit { readonly kind: "fits" | "setup" | "conflict" | "neutral"; readonly text: string }
/** Qualitative compatibility, not an EV estimate or a promise of the next win. */
export function getBuildFit(state: RunState, id: UpgradeId): BuildFit {
  const owns = (part: PartId) => state.partSlots.some((item) => item?.id === part);
  const everyReelHas = (symbol: SymbolId) => state.reels.some((strip) => strip.includes(symbol))
    && state.reels.every((strip) => strip.includes(symbol) || strip.includes("wild"));
  const physicalCount = (symbol: SymbolId) => state.reels.flat().filter((entry) => entry === symbol).length;
  const lemons = state.reels.every((strip) => strip.filter((symbol) => symbol === "lemon").length / strip.length >= 0.55);
  const infection = owns("lemon-infection");
  if ((infection || lemons) && ["jam-jar", "cherry-press", "cherry-pitter", "fruit-salad", "salad-dressing"].includes(id))
    return { kind: "conflict", text: "路线冲突：柠檬提纯会减少樱桃与混合沙拉的机会。" };
  if (id === "lemon-infection" && ["jam-jar", "cherry-press", "fruit-salad", "salad-dressing"].some((part) => owns(part as PartId)))
    return { kind: "conflict", text: "转型选择：感染会吃掉樱桃、铃铛，削弱现有樱桃或沙拉部件。" };
  if (["omen-collector", "triple-blessing", "martyr-coin"].includes(id) && !everyReelHas("seven"))
    return { kind: "setup", text: "先补图案：有转轮没有幸运7或百搭，暂时无法形成幸运7连线。" };
  if (id === "salad-dressing" && !owns("fruit-salad")) return { kind: "setup", text: "先装水果沙拉，沙拉酱才有奖金可放大。" };
  if (id === "fruit-salad" && !canMakeSalad(state)) return { kind: "setup", text: "先补齐沙拉：需要三个不同转轮分别提供樱桃、柠檬、铃铛；百搭不能代替。" };
  if (["jam-jar", "cherry-press"].includes(id) && !everyReelHas("cherry"))
    return { kind: "setup", text: "还缺樱桃线：有转轮没有樱桃或百搭，先补图案再装樱桃部件。" };
  if (id === "lemon-infection" && !everyReelHas("lemon")) return { kind: "setup", text: "感染也要先中奖：先让三个转轮都能接上柠檬线。" };
  if (id === "midnight-bell" && !everyReelHas("bell")) return { kind: "setup", text: "先补铃铛线：钟声需要铃铛中奖，而且线上要有真正的铃铛。" };
  if (id === "scrap-magnet" && !state.reels.every((strip) => strip.includes("crack")))
    return { kind: "setup", text: "尚缺裂纹：三条转轮都要有实际裂纹，才可能组成回收连线。" };
  if (id === "votive-candle" && state.omen === 0 && state.service !== "chapel")
    return { kind: "setup", text: "先获得恶兆；只有烛台，还不能点烛兑现。" };
  if (id === "artificial-crack" && state.reels.flat().filter((s) => s === "crack").length >= 3 && !owns("scrap-magnet"))
    return { kind: "conflict", text: "已有多处裂纹：继续加伤可能超出飞轮保护，先考虑保护或回收。" };
  if (owns(id as PartId)) return { kind: "fits", text: "强化已装核心：升到 L2，原有蓄能保留。" };
  if (getReserveParts(state).some((part) => part?.id === id))
    return { kind: "fits", text: "升级备用部件：仍放在备用槽，换上机器后才生效。" };
  if (id === "salad-dressing") return { kind: "fits", text: "放大现有沙拉奖金：保留樱桃、柠檬、铃铛，不必追求三图相同。" };
  if (id === "blank-capacitor" || id === "blank-dividend") return physicalCount("blank") >= (id === "blank-dividend" ? 2 : 1) || owns("triple-blessing")
    ? { kind: "fits", text: "接住空白：现有空白或祝福副作用，可以转成额外收益。免费转不再给本部件收益。" }
    : { kind: "setup", text: "空白来源还不够；先保留空白或搭配三重祝福。" };
  if (id === "intervention-relay") return { kind: "fits", text: "把操作接上奖金：付费转重转、锁轮或踹击后中奖，再奖一笔；单独祈祷不算。" };
  if (id === "overload-motor") return state.partSlots.some((part) => part && ["lemon-infection", "midnight-bell", "fruit-salad", "scrap-magnet"].includes(part.id))
    ? { kind: "fits", text: "接在连锁后面：现有转换、沙拉或回收可增加结算效果；长连锁仍会新增裂纹。" }
    : { kind: "setup", text: "先找连锁来源：只有基础中奖不够，马达从第2个核心效果开始奖励。" };
  if (id === "fruit-salad") return { kind: "fits", text: "保留三种图案：现有转轮能凑沙拉，可搭配铃铛或干预玩法。" };
  if (["seven-purification", "tithe-box"].includes(id) && (state.service === "chapel" || owns("triple-blessing") || owns("omen-collector")))
    return { kind: "fits", text: "补启动：增加幸运7，让祈祷和幸运7部件更容易接上。" };
  if (id === "lemon-crate" && (infection || owns("harvest-vat"))) return { kind: "fits", text: "补命中：增加柠檬，为感染或果桶提供启动机会。" };
  if (["cherry-pitter", "jam-jar", "cherry-press"].includes(id) && (owns("harvest-vat") || owns("jam-jar") || owns("cherry-press")))
    return { kind: "fits", text: "补樱桃引擎：提高命中密度或连续中奖时的额外收入。" };
  if (id === "harvest-vat" && (state.service === "kitchen" || owns("lemon-infection") || owns("jam-jar") || owns("fruit-salad")))
    return { kind: "fits", text: "补爆发：把多次水果命中存成一次开桶奖金。" };
  if (id === "shock-absorber" && (state.service === "security" || state.reels.some((strip) => strip.includes("crack"))))
    return { kind: "fits", text: "补保护：抵消部分裂纹停工，同时让可见裂纹赚钱。" };
  if (id === "carbon-copy" || id === "pruning-shears") return { kind: "fits", text: "调整概率：选对复制或删除的图案；这不是中奖保证。" };
  return { kind: "neutral", text: "这是另一种收益方式；没有确认的配合时，不因同路线就算更强。" };
}

/** A salad needs literal symbols in three distinct reels; density alone cannot prove this. */
export function canMakeSalad(state: Pick<RunState, "reels">): boolean {
  return (["cherry", "lemon", "bell"] as const).some((first) =>
    (["cherry", "lemon", "bell"] as const).some((second) => first !== second
      && state.reels[0].includes(first) && state.reels[1].includes(second)
      && state.reels[2].some((third) => ["cherry", "lemon", "bell"].includes(third) && third !== first && third !== second)));
}
