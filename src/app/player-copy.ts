import {
  describeEquippedPart as describeRulePart,
  describeUpgrade as describeRuleUpgrade,
  SERVICE_PRESENTATIONS as RULE_SERVICES,
  type UpgradePresentation
} from "@/content/player-copy";

export type { UpgradePresentation } from "@/content/player-copy";

// Display language stays outside the rules fingerprint. No stored identifiers,
// amounts, availability checks or probability visibility rules are changed here.
function plainTerms<T extends object>(copy: T): T {
  return Object.fromEntries(Object.entries(copy).map(([key, value]) => [key,
    typeof value === "string" ? value.replaceAll("专注", "干预点").replaceAll("字面", "实际").replaceAll("赔付", "奖金") : value
  ])) as T;
}

function clarify(copy: UpgradePresentation): UpgradePresentation {
  const result = plainTerms(copy);
  if (copy.id !== "triple-blessing") return result;
  return {
    ...result,
    decisionEffect: "幸运7中奖，再领一份基础奖金",
    triggerCondition: "每转只奖励第一条幸运7线；本班首次触发后加1个临时空白",
    immediateCost: null,
    effect: "每转第一条幸运7中奖线，再发一次这条线的基础奖金。例：下注 ¥10，原奖 ¥35，祝福再加 ¥35；不含其他中奖线与加成。",
    levelTwoEffect: "L2：同一条线再发两次基础奖金。例：下注 ¥10，原奖 ¥35，祝福再加 ¥70；不含其他中奖线与加成。临时空白仍整班只加1个。",
    risk: "本班第一次触发后，最长的转轮加入1个临时空白，让本班后续更容易抽空。下一班或下一段自动清除，不是永久损坏。只奖励每转第一条幸运7线，不复制其他部件奖金。"
  };
}

export function describeUpgrade(...args: Parameters<typeof describeRuleUpgrade>): UpgradePresentation {
  return clarify(describeRuleUpgrade(...args));
}

export function describeEquippedPart(...args: Parameters<typeof describeRulePart>): UpgradePresentation {
  return clarify(describeRulePart(...args));
}

export const SERVICE_PRESENTATIONS = {
  repair: { ...plainTerms(RULE_SERVICES.repair),
    identity: "多一次干预机会，也能清理裂纹。",
    action: "每班有3点干预点。每班一次，可以花1点保留一列，重转另外两列。",
    risk: "重转不保证更好。班末可花1枚小费，从一轮移除最多2个裂纹。" },
  kitchen: { ...plainTerms(RULE_SERVICES.kitchen),
    identity: "先花餐费，让接下来几转的奖金更高。",
    action: "每班任选一转开始前点餐一次：花标准下注的75%，接下来3转适用奖金 +50%。同时往选定轮放入1份食物，抽中后再给之后3转 +25%。",
    risk: "没中奖也会消耗加成次数，免费转也算。买完要留下注钱；换下注档不能降低餐费。食物会加长转轮，救援和过载保护不享受加成。" },
  chapel: { ...plainTerms(RULE_SERVICES.chapel),
    identity: "转动前祈祷，让想要的图案更容易出现。",
    action: "每班一次，花1点干预点选一种基础图案。下一转三个转轮各临时多2个该图案；没中目标连线，获得1层恶兆。",
    risk: "祈祷不保证中奖，也会用掉这转的干预机会，停轮后不能再重转。恶兆可装收集器等幸运7兑现，或装还愿烛台花小费主动兑现。" },
  security: { ...plainTerms(RULE_SERVICES.security),
    identity: "停轮后看清预览，再决定要不要踹。",
    action: "每班一次免费踹击：让一列按预览前进1格，不花钱或干预点。装上弹簧后会挪得更远。",
    risk: "踹击用掉本转的干预机会，并在那一轮留下1个永久裂纹。以后抽到裂纹，可能让部件暂时停工。" }
};
