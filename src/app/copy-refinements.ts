import type { UpgradePresentation } from "@/content/player-copy";
import type { UpgradeId } from "@/core/types";

// Player-facing wording only: never imported by rules, saves or simulations.
// Keep costs, triggers and exceptions in the detail view, even when cards are short.
type CopyFields = Pick<UpgradePresentation, "decisionEffect" | "triggerCondition" | "immediateCost" | "effect" | "levelTwoEffect" | "synergy" | "risk">;
export const UPGRADE_COPY_REFINEMENTS: Partial<Record<UpgradeId, Partial<CopyFields>>> = {
  "harvest-vat": {
    "decisionEffect": "付费转水果中奖攒3次，额外奖励12倍下注",
    "triggerCondition": "只计付费转，每转最多攒1次；换班保留进度",
    "synergy": "先增加樱桃或柠檬。已经攒了2次时，可以考虑买餐，放大下一次开桶的奖金。"
  },
  "votive-candle": {
    "decisionEffect": "花1枚小费，把最多3层恶兆换成奖金",
    "triggerCondition": "转动前点烛；每层奖励2倍下注，不用连线中奖",
    "risk": "点烛时就扣掉小费和恶兆，这些恶兆不能再给收集器用。如果烛台被裂纹弄坏，等它恢复后再发钱；换班不会丢，换掉烛台会丢。"
  },
  "shock-absorber": {
    "decisionEffect": "盘面有裂纹时，保护1个部件并奖励2倍下注",
    "triggerCondition": "只看这次停轮后出现的裂纹；不会清除裂纹"
  },
  "lemon-infection": {
    "decisionEffect": "柠檬中奖后，把其他图案也变成柠檬",
    "triggerCondition": "每转最多一次；没图案可换且盘面有6颗柠檬时，改奖2倍下注",
    "effect": "每转第一次柠檬连线中奖后，把这条线外的1个樱桃、铃铛或幸运7变成柠檬，再检查有没有新中奖线。如果没有可换的图案，且盘面至少有6颗真正的柠檬，改发2倍下注的奖金。",
    "levelTwoEffect": "L2：一次最多变2个图案；不能再变、且满足6颗柠檬条件时，改奖5倍下注。每转仍只触发一次。",
    "synergy": "柠檬木箱让柠檬更容易连线。厨房的食物可以增加奖金；但感染会减少樱桃和铃铛，不适合继续靠沙拉赚钱。"
  },
  "jam-jar": {
    "decisionEffect": "这一班樱桃中奖越多，后面的樱桃奖越高",
    "triggerCondition": "第一条只攒进度，不加钱；换班重新开始",
    "effect": "本班第一条樱桃线不加钱，第二条多奖0.5倍下注，第三条多奖1倍，依次增加，最高每条多奖3倍。同一转中多条樱桃线，也会依次增加。",
    "levelTwoEffect": "L2：每多中过一条樱桃线，下一条多奖1倍下注，最高多奖6倍。第一条仍不加钱，换班重新开始。"
  },
  "leftovers": {
    "decisionEffect": "把本班第一份吃掉的食物放回转轮",
    "triggerCondition": "需要先有食物；放回图案最少的转轮"
  },
  "omen-collector": {
    "triggerCondition": "每转第一条幸运7线触发；每层恶兆奖励0.5倍下注",
    "synergy": "祈祷没中目标连线会攒恶兆，奉献箱也能增加恶兆。先增加转轮上的幸运7，才更有机会把恶兆换成钱。"
  },
  "midnight-bell": {
    "decisionEffect": "铃铛中奖后，把其中1个铃铛变成百搭",
    "triggerCondition": "每转第一条铃铛线触发；变完再检查中奖"
  },
  "martyr-coin": {
    "decisionEffect": "先花钱献祭，本班每条幸运7线多领一份奖金",
    "triggerCondition": "本班第一次付费转之前启用；装上不会自动扣钱"
  },
  "artificial-crack": {
    "decisionEffect": "留下1个永久裂纹，换下一班多1点干预点",
    "triggerCondition": "额外点数只限下一班，不能超过客房上限"
  },
  "warranty-fraud": {
    "decisionEffect": "本班首次有其他部件被裂纹弄坏，奖励3倍下注",
    "triggerCondition": "每班只赔一次；只装这个部件不会触发"
  },
  "blank-capacitor": {
    "risk": "免费转不攒空白。一次付费转最多送一次免费转，多攒的整组不留。例如L1从0开始，一次出现7个空白：送1次免费转，剩1个留到以后。"
  },
  "overload-motor": {
    "immediateCost": "结算到第6个核心连锁效果时，才留下1个永久裂纹"
  },
  "pruning-shears": {
    "decisionEffect": "永久剪掉1个不要的图案，百搭除外",
    "triggerCondition": "剪完每个转轮至少要剩6个图案"
  },
  "carbon-copy": {
    "decisionEffect": "选一种已有的普通图案，在这轮再加2个"
  },
  "calculator": {
    "decisionEffect": "查看每个转轮抽到各图案的概率",
    "triggerCondition": "只提供信息，不提高中奖率"
  },
  "ledger": {
    "decisionEffect": "估算长期投入和奖金的比例（RTP）",
    "triggerCondition": "模拟结果仅供参考，不能预测下一转",
    "effect": "在图案概率之外，再显示估算回报率（RTP）和估算范围。例如RTP为90%，表示模拟中每下注100元，平均拿回90元奖金；餐费等支出另算。"
  },
  "statistics-terminal": {
    "decisionEffect": "估算还够转多久，以及中途没钱的风险",
    "triggerCondition": "按简化玩法模拟，不是保证能玩的转数"
  }
};
