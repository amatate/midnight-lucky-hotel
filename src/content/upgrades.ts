import type { RunState, UpgradeDefinition, UpgradeId } from "@/core/types";

export const UPGRADE_IDS = [
  "lemon-crate",
  "cherry-pitter",
  "lemon-infection",
  "jam-jar",
  "fruit-salad",
  "leftovers",
  "seven-purification",
  "tithe-box",
  "omen-collector",
  "triple-blessing",
  "midnight-bell",
  "martyr-coin",
  "artificial-crack",
  "scrap-magnet",
  "loose-spring",
  "blank-capacitor",
  "warranty-fraud",
  "overload-motor",
  "pruning-shears",
  "carbon-copy",
  "safety-fuse",
  "calculator",
  "ledger",
  "statistics-terminal"
] as const satisfies readonly UpgradeId[];

function always(): boolean {
  return true;
}

function hasSymbolToPit(state: RunState): boolean {
  return state.reels.some((strip) => strip.some((symbol) => symbol !== "cherry" && symbol !== "wild"));
}

function hasFruitToPurify(state: RunState): boolean {
  return state.reels.some((strip) => strip.some((symbol) => symbol === "cherry" || symbol === "lemon"));
}

function hasPrunableReel(state: RunState): boolean {
  return state.reels.some((strip) => strip.length > 6 && strip.some((symbol) => symbol !== "wild"));
}

function hasCrackSource(state: RunState): boolean {
  return (
    state.service === "security" ||
    state.reels.some((strip) => strip.includes("crack")) ||
    state.partSlots.some((part) => part?.id === "loose-spring" || part?.id === "overload-motor")
  );
}

export const UPGRADES = {
  "lemon-crate": {
    id: "lemon-crate",
    name: "柠檬木箱",
    kind: "reel-mod",
    route: "fruit",
    tags: ["fruit", "lemon", "reel-growth"],
    candidateRoles: ["synergy"],
    requires: always
  },
  "cherry-pitter": {
    id: "cherry-pitter",
    name: "樱桃去核器",
    kind: "reel-mod",
    route: "fruit",
    tags: ["fruit", "cherry", "reel-control"],
    candidateRoles: ["synergy", "pivot"],
    requires: hasSymbolToPit
  },
  "lemon-infection": {
    id: "lemon-infection",
    name: "柠檬感染",
    kind: "part",
    route: "fruit",
    tags: ["fruit", "lemon", "transform", "reevaluate"],
    candidateRoles: ["synergy", "wildcard"],
    requires: always
  },
  "jam-jar": {
    id: "jam-jar",
    name: "果酱罐",
    kind: "part",
    route: "fruit",
    tags: ["fruit", "cherry", "shift-scaling"],
    candidateRoles: ["synergy"],
    requires: always
  },
  "fruit-salad": {
    id: "fruit-salad",
    name: "水果沙拉",
    kind: "part",
    route: "fruit",
    tags: ["fruit", "cherry", "lemon", "bell", "literal-symbols"],
    candidateRoles: ["synergy", "pivot"],
    requires: always
  },
  leftovers: {
    id: "leftovers",
    name: "剩菜打包",
    kind: "part",
    route: "fruit",
    tags: ["fruit", "food", "reel-growth"],
    candidateRoles: ["synergy", "wildcard"],
    requires: (state) => state.service === "kitchen"
  },
  "seven-purification": {
    id: "seven-purification",
    name: "七之净化",
    kind: "reel-mod",
    route: "chapel",
    tags: ["chapel", "seven", "reel-control"],
    candidateRoles: ["synergy", "pivot"],
    requires: hasFruitToPurify
  },
  "tithe-box": {
    id: "tithe-box",
    name: "什一税箱",
    kind: "reel-mod",
    route: "chapel",
    tags: ["chapel", "seven", "omen", "bankroll-cost"],
    candidateRoles: ["synergy", "wildcard"],
    requires: (state) => state.bankroll >= 10
  },
  "omen-collector": {
    id: "omen-collector",
    name: "恶兆收集器",
    kind: "part",
    route: "chapel",
    tags: ["chapel", "seven", "omen", "prayer"],
    candidateRoles: ["synergy"],
    requires: (state) => state.service === "chapel"
  },
  "triple-blessing": {
    id: "triple-blessing",
    name: "三重祝福",
    kind: "part",
    route: "chapel",
    tags: ["chapel", "seven", "repeat-payout", "blank"],
    candidateRoles: ["synergy", "wildcard"],
    requires: always
  },
  "midnight-bell": {
    id: "midnight-bell",
    name: "午夜钟声",
    kind: "part",
    route: "chapel",
    tags: ["chapel", "bell", "wild", "transform", "reevaluate"],
    candidateRoles: ["synergy", "pivot"],
    requires: always
  },
  "martyr-coin": {
    id: "martyr-coin",
    name: "殉道者硬币",
    kind: "part",
    route: "chapel",
    tags: ["chapel", "seven", "bankroll-cost", "shift-multiplier"],
    candidateRoles: ["synergy", "wildcard"],
    requires: always
  },
  "artificial-crack": {
    id: "artificial-crack",
    name: "人为裂纹",
    kind: "reel-mod",
    route: "violent",
    tags: ["violent", "crack", "focus"],
    candidateRoles: ["synergy", "pivot", "wildcard"],
    requires: always
  },
  "scrap-magnet": {
    id: "scrap-magnet",
    name: "废料磁铁",
    kind: "part",
    route: "violent",
    tags: ["violent", "crack", "consume-crack", "line-payout"],
    candidateRoles: ["synergy"],
    requires: hasCrackSource
  },
  "loose-spring": {
    id: "loose-spring",
    name: "松动弹簧",
    kind: "part",
    route: "violent",
    tags: ["violent", "kick", "crack", "intervention"],
    candidateRoles: ["synergy", "wildcard"],
    requires: (state) => state.service === "security"
  },
  "blank-capacitor": {
    id: "blank-capacitor",
    name: "空白电容",
    kind: "part",
    route: "violent",
    tags: ["violent", "blank", "free-spin"],
    candidateRoles: ["synergy", "pivot"],
    requires: always
  },
  "warranty-fraud": {
    id: "warranty-fraud",
    name: "骗保单",
    kind: "part",
    route: "violent",
    tags: ["violent", "crack", "disabled-part", "payout"],
    candidateRoles: ["synergy"],
    requires: hasCrackSource
  },
  "overload-motor": {
    id: "overload-motor",
    name: "过载马达",
    kind: "part",
    route: "violent",
    tags: ["violent", "effect-chain", "overload", "crack-source"],
    candidateRoles: ["synergy", "wildcard"],
    requires: always
  },
  "pruning-shears": {
    id: "pruning-shears",
    name: "修枝剪",
    kind: "reel-mod",
    route: "neutral",
    tags: ["neutral", "reel-control", "reel-thinning"],
    candidateRoles: ["pivot", "wildcard"],
    requires: hasPrunableReel
  },
  "carbon-copy": {
    id: "carbon-copy",
    name: "复写纸",
    kind: "reel-mod",
    route: "neutral",
    tags: ["neutral", "base-symbol", "reel-growth"],
    candidateRoles: ["synergy", "wildcard"],
    requires: always
  },
  "safety-fuse": {
    id: "safety-fuse",
    name: "安全保险丝",
    kind: "part",
    route: "neutral",
    tags: ["neutral", "bankroll-protection", "consumable"],
    candidateRoles: ["synergy", "pivot"],
    requires: always
  },
  calculator: {
    id: "calculator",
    name: "计算器",
    kind: "tool",
    route: "information",
    tags: ["information", "probability"],
    candidateRoles: ["wildcard"],
    requires: (state) => state.toolLevel === 0
  },
  ledger: {
    id: "ledger",
    name: "会计账本",
    kind: "tool",
    route: "information",
    tags: ["information", "probability", "expected-return"],
    candidateRoles: ["wildcard"],
    requires: (state) => state.toolLevel === 1
  },
  "statistics-terminal": {
    id: "statistics-terminal",
    name: "统计终端",
    kind: "tool",
    route: "information",
    tags: ["information", "volatility", "survival", "bankruptcy-risk"],
    candidateRoles: ["wildcard"],
    requires: (state) => state.toolLevel === 2
  }
} as const satisfies Readonly<Record<UpgradeId, UpgradeDefinition>>;
