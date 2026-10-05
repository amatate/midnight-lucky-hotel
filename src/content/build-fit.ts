import { UPGRADES } from "@/content/upgrades";
import type { PartId, RunState, SymbolId, UpgradeId } from "@/core/types";

export interface BuildFit { readonly kind: "fits" | "setup" | "conflict" | "neutral"; readonly text: string }
/** Qualitative compatibility, not an EV estimate or a promise of the next win. */
export function getBuildFit(state: RunState, id: UpgradeId): BuildFit {
  const owns = (part: PartId) => state.partSlots.some((item) => item?.id === part);
  const everyReelHas = (symbol: SymbolId) => state.reels.every((strip) => strip.includes(symbol) || strip.includes("wild"));
  const lemons = state.reels.every((strip) => strip.filter((symbol) => symbol === "lemon").length / strip.length >= 0.55);
  const infection = owns("lemon-infection");
  if ((infection || lemons) && ["jam-jar", "cherry-press", "cherry-pitter", "fruit-salad", "salad-dressing"].includes(id))
    return { kind: "conflict", text: "路线冲突：柠檬提纯会减少樱桃与混合沙拉的机会。" };
  if (id === "lemon-infection" && ["jam-jar", "cherry-press", "fruit-salad", "salad-dressing"].some((part) => owns(part as PartId)))
    return { kind: "conflict", text: "转型选择：感染会吃掉樱桃、铃铛，削弱现有樱桃或沙拉部件。" };
  if (["omen-collector", "triple-blessing", "martyr-coin"].includes(id) && !everyReelHas("seven"))
    return { kind: "setup", text: "先补图案：有转轮没有幸运7或百搭，暂时无法形成幸运7连线。" };
  if (id === "salad-dressing" && !owns("fruit-salad")) return { kind: "setup", text: "先装水果沙拉，沙拉酱才有奖金可放大。" };
  if (id === "scrap-magnet" && !state.reels.every((strip) => strip.includes("crack")))
    return { kind: "setup", text: "尚缺裂纹：三条转轮都要有实际裂纹，才可能组成回收连线。" };
  if (id === "votive-candle" && state.omen === 0 && state.service !== "chapel")
    return { kind: "setup", text: "先获得恶兆；只有烛台，还不能点烛兑现。" };
  if (id === "artificial-crack" && state.reels.flat().filter((s) => s === "crack").length >= 3 && !owns("scrap-magnet"))
    return { kind: "conflict", text: "已有多处裂纹：继续加伤可能超出飞轮保护，先考虑保护或回收。" };
  if (owns(id as PartId)) return { kind: "fits", text: "强化已装核心：升到 L2，原有蓄能保留。" };
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
  const route = { kitchen: "fruit", chapel: "chapel", security: "violent", repair: "neutral" }[state.service ?? "repair"];
  const supportedRoutes = new Set([route, ...state.partSlots.flatMap((part) => part ? [UPGRADES[part.id].route] : []),
    ...state.acquiredUpgrades.filter((item) => UPGRADES[item].kind === "reel-mod").map((item) => UPGRADES[item].route)]);
  return supportedRoutes.has(UPGRADES[id].route)
    ? { kind: "fits", text: "同路线选择：先看触发条件，再决定是否占用部件槽。" }
    : { kind: "neutral", text: "跨路线选择：需要搭配新的图案或部件，不会自动增强当前核心。" };
}
