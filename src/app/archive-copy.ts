import { SYMBOL_LABELS } from "@/app/labels";
import { SERVICE_PRESENTATIONS } from "@/content/player-copy";
import { UPGRADES } from "@/content/upgrades";
import { HOTEL_ROOMS } from "@/content/hotel";
import type { GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import type { ActionEntry } from "@/persistence/archives";

export const FIELD_LABELS: Readonly<Record<string, string>> = {
  hotel: "客房挑战与通关进度",
  blockReelAdditions: "本班临时空白（换班清除）",
  freeAfterHoursLevel: "自由加班等级", blockStartBankroll: "本段起始钱包", workshop: "金币整备", expenses: "累计支出明细",
  phase: "阶段", shift: "班次", afterHoursLevel: "加班段数", baseSpinsInShift: "本班已转", bankroll: "余额",
  shiftWager: "本班下注合计", shiftPayout: "本班赔付合计", betMode: "下注档位", rng: "随机数状态",
  tips: "小费", interventionPoints: "专注", agitation: "躁动", omen: "恶兆", reels: "永久转轮",
  temporaryReelAdditions: "临时符号", pendingSpin: "本转结果", pendingPrayer: "祈祷目标", freeSpinQueue: "免费转队列",
  service: "服务", serviceCandidates: "服务候选", currentCandidates: "升级候选", partSlots: "部件槽",
  acquiredUpgrades: "获得的升级", toolLevel: "工具等级", buffs: "食物加成", counters: "部件计数",
  shiftFlags: "本班使用标记", contract: "合同", exitUnlocked: "结账资格"
};
const LINE: Readonly<Record<string, string>> = { top: "顶线", middle: "中线", bottom: "底线", "diagonal-down": "下斜线", "diagonal-up": "上斜线" };
const RESOURCE: Readonly<Record<string, string>> = { tips: "小费", focus: "专注", omen: "恶兆", agitation: "躁动", freeSpins: "免费转" };
export const money = (value: number): string => "¥" + value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

export function commandLabel(command: GameCommand): string {
  switch (command.type) {
    case "SELECT_SERVICE": return "选择服务 · " + SERVICE_PRESENTATIONS[command.serviceId].name;
    case "SET_BET_MODE": return "下注改为" + ({ conservative: "保守", normal: "标准", aggressive: "激进" })[command.mode];
    case "BUY_FOOD": return "买食物 · 第 " + (command.reelIndex + 1) + " 轮";
    case "UPGRADE_PART": return "花 3 小费精修第 " + (command.slot + 1) + " 槽部件至 L2";
    case "ENTER_ROOM": return "入住下一间挑战客房／原房重试";
    case "OPEN_WORKSHOP": return "查看本次金币整备（三选一，确认购买才扣费）";
    case "PRAY": return "祈祷 · " + SYMBOL_LABELS[command.symbol];
    case "ENABLE_MARTYR": return "启用殉道者硬币";
    case "SPIN": return "拉动老虎机";
    case "REELS_STOPPED": return "停轮完成";
    case "RESPIN_REEL": return "重转第 " + (command.reelIndex + 1) + " 轮";
    case "LOCK_AND_RESPIN_OTHERS": return "锁住第 " + (command.lockedReelIndex + 1) + " 轮并重转其他轮";
    case "KICK_REEL": return "踹动第 " + (command.reelIndex + 1) + " 轮";
    case "ACCEPT_OUTCOME": return "确认结果并入账";
    case "PRESENTATION_COMPLETE": return "演出完成／推进阶段";
    case "CHOOSE_UPGRADE": return (command.choice.action === "decline" ? "放弃" : "选择升级 · ") + UPGRADES[command.choice.id].name;
    case "DECLINE_UPGRADE": return "放弃本次选项（金币整备不返小费）";
    case "REMOVE_CRACKS": return "维修第 " + (command.reelIndex + 1) + " 轮";
    case "REROLL_CANDIDATES": return "花小费重抽升级";
    case "CASH_OUT": return "结账离开";
    case "CONTINUE": return "继续加班";
  }
}

export function eventLabel(event: GameEvent): string {
  const formula = (value: { preMultiplierAmount: number; appliedMultiplier: number; amount: number }): string =>
    money(value.preMultiplierAmount) + " × " + value.appliedMultiplier + " = " + money(value.amount);
  switch (event.type) {
    case "WORKSHOP_PURCHASED": return "金币整备购买 · 花费 " + money(event.cost);
    case "MEAL_SERVED": return "餐点已送达：接下来 " + event.spins + " 转赔付 +" + event.additivePayout * 100 + "%（免费转也消耗次数）";
    case "PART_UPGRADED": return UPGRADES[event.partId].name + " 升至 L2 · 花费 " + event.cost + " 小费";
    case "ROOM_ENTERED": return "入住" + HOTEL_ROOMS[event.tier].name + "：固定下注 " + money(event.bet) + " · 3 转赔付目标 " + money(event.target) + " · 专注 " + event.focus;
    case "ROOM_COMPLETED": return HOTEL_ROOMS[event.tier].name + (event.cleared ? "挑战成功" : "挑战未达标") + "：本段赔付 " + money(event.payout) + " / " + money(event.target);
    case "BET_PLACED": return "扣除下注 " + money(event.amount);
    case "REELS_DRAWN": return "抽取转轮结果（原始数据含停点与盘面）";
    case "LINE_WIN": return SYMBOL_LABELS[event.symbol] + " · " + LINE[event.lineId] + "：" + formula(event);
    case "PATTERN_LINE_WIN": return "水果沙拉 · " + LINE[event.lineId] + "：" + formula(event);
    case "PAYOUT_ADDED": return ("partId" in event ? UPGRADES[event.partId].name : "额外赔付") + "：" + formula(event);
    case "PAYOUT_COMPLETE": return "本转总赔付 " + money(event.total);
    case "PART_TRIGGERED": return "触发 " + UPGRADES[event.partId].name + " L" + event.level;
    case "PART_DISABLED": return "暂时失效 · " + UPGRADES[event.partId].name;
    case "FOOD_CONSUMED": return "第 " + (event.reel + 1) + " 轮吃到食物：之后 3 转赔付 +25%（每层）";
    case "SYMBOL_CHANGED": return "第 " + (event.reel + 1) + " 轮第 " + (event.row + 1) + " 格：" + SYMBOL_LABELS[event.from] + " → " + SYMBOL_LABELS[event.to];
    case "RESOURCE_CHANGED": return RESOURCE[event.resource] + " " + (event.delta > 0 ? "+" : "") + event.delta;
    case "SERVICE_USED": return SERVICE_PRESENTATIONS[event.serviceId].name + " · 花费 " + money(event.cost);
    case "INTERVENTION_USED": return "使用干预 · " + event.kind + " · 目标 " + event.target;
    case "CONTRACT_PROGRESS": return "合同进度 " + event.progress + (event.completed ? " · 已完成" : "");
    case "SHIFT_CHANGED": return "进入第 " + event.shift + " 班";
    case "BLOCK_COMPLETED": return "本段结束，余额 " + money(event.bankroll);
    case "RUN_ENDED": return "本局结束 · " + ({ won: "胜利", lost: "失败", "cashed-out": "结账" })[event.outcome];
    case "SPIN_COMMITTED": return "本转已提交";
    case "OVERLOAD": return "过载赔付：" + formula(event);
  }
}

export function readableValue(value: unknown): string {
  return JSON.stringify(value, (_key: string, item: unknown) => {
    if (typeof item !== "string") return item;
    if (Object.hasOwn(SYMBOL_LABELS, item)) return SYMBOL_LABELS[item as keyof typeof SYMBOL_LABELS];
    if (Object.hasOwn(UPGRADES, item)) return UPGRADES[item as keyof typeof UPGRADES].name;
    if (Object.hasOwn(SERVICE_PRESENTATIONS, item)) return SERVICE_PRESENTATIONS[item as keyof typeof SERVICE_PRESENTATIONS].name;
    return item;
  }, 2);
}

export function entryBlock(entry: ActionEntry): string {
  return entry.afterHoursLevel > 0 ? "加班第 " + entry.afterHoursLevel + " 段" : "第 " + entry.shift + " 班";
}

export function downloadText(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
