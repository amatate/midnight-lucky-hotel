import type { PartId, RunState, ServiceId } from "@/core/types";

/** New-run loadouts, never retroactively granted to a migrated machine. */
export const ROUTE_KITS: Readonly<Record<ServiceId, { part: PartId; tips: number; omen: number; cracks: number; summary: string }>> = {
  kitchen: { part: "harvest-vat", tips: 0, omen: 0, cracks: 0, summary: "附送陈酿果桶：水果中奖存酿，第三次开桶。先补水果命中，再安排点餐。" },
  chapel: { part: "votive-candle", tips: 2, omen: 2, cracks: 0, summary: "附送烛台、2 恶兆和 2 小费；每轮 3 颗樱桃换成幸运7。点烛稳兑，祈祷追大奖，水果机会减少。" },
  security: { part: "shock-absorber", tips: 0, omen: 0, cracks: 3, summary: "附送减震飞轮，每轮加入 1 个永久裂纹：裂纹可赚钱，也可能让其他部件停工。" },
  repair: { part: "cherry-press", tips: 0, omen: 0, cracks: 0, summary: "附送樱桃压榨机，每轮 2 颗柠檬换成樱桃。用额外干预点补樱桃连线，减少柠檬机会。" }
};

export function applyRouteKit(state: RunState, service: ServiceId): RunState {
  if (!state.routeKits) return state;
  const kit = ROUTE_KITS[service];
  if (state.partSlots.some((part) => part !== null) || state.acquiredUpgrades.length > 0) return state;
  const reels = state.reels.map((strip) => {
    let replaced = 0;
    const converted = strip.map((symbol) => {
      if (service === "chapel" && symbol === "cherry" && replaced++ < 3) return "seven";
      if (service === "repair" && symbol === "lemon" && replaced++ < 2) return "cherry";
      return symbol;
    });
    return kit.cracks > 0 ? [...converted, "crack"] : converted;
  }) as unknown as RunState["reels"];
  return { ...state, partSlots: [{ id: kit.part, level: 1 }, null, null, null, null],
    acquiredUpgrades: [kit.part], tips: state.tips + kit.tips, omen: state.omen + kit.omen,
    reels };
}
