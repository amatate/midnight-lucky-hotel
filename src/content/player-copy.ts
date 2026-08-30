import { getSafetyFuseRescuePayout } from "@/content/effects/neutral";
import { UPGRADES } from "@/content/upgrades";
import { getCurrentBet, getMinimumBet } from "@/core/progression";
import { dispatchCommand } from "@/core/run";
import type {
  PartId,
  PartInstance,
  ReelIndex,
  RunState,
  ServiceId,
  SymbolId,
  UpgradeId,
  UpgradeKind,
  UpgradeRoute,
  UpgradeTarget
} from "@/core/types";
import type { MachineEstimate } from "@/sim/types";

export interface ServicePresentation {
  readonly name: string;
  readonly identity: string;
  readonly action: string;
  readonly synergies: string;
  readonly risk: string;
}

export interface UpgradePresentation {
  readonly id: UpgradeId;
  readonly name: string;
  readonly kindLabel: string;
  readonly routeLabel: string;
  readonly effect: string;
  readonly levelTwoEffect: string | null;
  readonly currentImpact: string;
  readonly synergy: string;
  readonly risk: string;
  readonly targetHint: string | null;
  readonly available: boolean;
}

interface UpgradeCopy {
  readonly effect: string;
  readonly levelTwoEffect: string | null;
  readonly synergy: string;
  readonly risk: string;
  readonly targetHint: string | null;
}

const KIND_LABELS: Readonly<Record<UpgradeKind, string>> = {
  "reel-mod": "转轮改造",
  part: "机器部件",
  tool: "信息工具"
};

const ROUTE_LABELS: Readonly<Record<UpgradeRoute, string>> = {
  fruit: "水果自助餐",
  chapel: "小教堂",
  violent: "故障利用",
  neutral: "稳定维修",
  information: "会计工具"
};

const SYMBOL_LABELS: Readonly<Record<SymbolId, string>> = {
  cherry: "樱桃",
  lemon: "柠檬",
  bell: "铃铛",
  seven: "幸运7",
  wild: "百搭",
  blank: "空白",
  food: "食物",
  crack: "裂纹"
};

export const SERVICE_PRESENTATIONS = {
  repair: {
    name: "维修间",
    identity: "稳定型维修队：多一次专注，并把裂纹当作需要控制的长期损耗。",
    action: "每班 3 点专注；每班一次，消耗 1 点专注锁住 1 个转轮并重转另外 2 个。班次边界还能处理永久裂纹。",
    synergies: "修枝剪（缩短失控长轮）＋安全保险丝（低余额兜底）",
    risk: "重转结果仍然随机；班次边界修复一个转轮最多 2 个裂纹要花 1 枚小费。"
  },
  kitchen: {
    name: "深夜厨房",
    identity: "主动消费的水果路线：先买食物，再把短期加成滚成连续小奖。",
    action: "每班第一次基础转动前可支付 ¥10，把 1 份食物加入选定转轮，直到抽中后被消耗；随后让之后 3 次转动的全部赔付 +25%。",
    synergies: "剩菜打包（把食物送回最短轮）＋果酱罐（樱桃连线逐步加价）",
    risk: "¥10 立即从余额扣除；食物会加长转轮，而且本班不保证抽到。"
  },
  chapel: {
    name: "小教堂",
    identity: "高风险大奖路线：用祈祷临时堆叠符号，用失败积累恶兆。",
    action: "每班一次，转动前消耗 1 点专注；为指定基础符号在三个转轮各临时加入 2 个副本，只持续下一转。失败时获得 1 层恶兆。",
    synergies: "恶兆收集器（把恶兆兑现）＋三重祝福（放大幸运7并制造空白）",
    risk: "祈祷占用本转唯一一次干预；停轮后不能再重转或踹击，且成功祈祷不会积累恶兆。"
  },
  security: {
    name: "保安室",
    identity: "确定性救场路线：看清下一格再踹动机器，把损伤转成构筑资源。",
    action: "每班一次免费踹击：确定性地让选定转轮默认前进 1 格；不扣专注，但占用本转唯一一次干预，并留下 1 个永久裂纹。",
    synergies: "松动弹簧（踹得更远并制造更多裂纹）＋废料磁铁（裂纹连线变成赔付）",
    risk: "永久裂纹可能在可见时让部件本转失效；损伤会留到之后的转动。"
  }
} as const satisfies Readonly<Record<ServiceId, ServicePresentation>>;

const UPGRADE_COPY = {
  "lemon-crate": {
    effect: "选择两个不同转轮，各永久加入 2 个柠檬。",
    levelTwoEffect: null,
    synergy: "柠檬感染能把更多柠檬连线转成二次检查。",
    risk: "两个转轮都会变长，其他符号在这些转轮上的占比会降低。",
    targetHint: "选择两个不同的目标转轮。"
  },
  "cherry-pitter": {
    effect: "在选定转轮把 1 个非樱桃、非百搭符号替换为樱桃。",
    levelTwoEffect: null,
    synergy: "果酱罐会让不断增加的樱桃中奖线继续抬高奖金。",
    risk: "被替换符号的路线会变弱，转轮总长度不变。",
    targetHint: "选择一个转轮上的非樱桃、非百搭符号。"
  },
  "lemon-infection": {
    effect: "每转第一条柠檬中奖线触发：把 1 个符合条件的线外基础符号变成柠檬，再重新检查中奖线。",
    levelTwoEffect: "L2：改为变换 2 个符合条件的线外基础符号，再重新检查。",
    synergy: "柠檬木箱提高第一次触发的机会，水果沙拉可利用变换后的字面水果。",
    risk: "每转只由第一条柠檬中奖线触发；线外没有樱桃、铃铛或幸运7时不会变换。",
    targetHint: null
  },
  "jam-jar": {
    effect: "每条樱桃中奖线都会充能；额外奖金 = 本班此前樱桃中奖线数 × 0.5 × 当前下注。",
    levelTwoEffect: "L2：系数从 0.5 × 当前下注提高为 1 × 当前下注。",
    synergy: "樱桃去核器增加樱桃密度，厨房加成会同时放大这份部件赔付。",
    risk: "本班第一条樱桃中奖线此前计数为 0，因此只充能、不加钱。",
    targetHint: null
  },
  "fruit-salad": {
    effect: "同一支付线上出现字面樱桃＋柠檬＋铃铛时，额外支付 1.5 × 当前下注；百搭不能代替任何一种。",
    levelTwoEffect: "L2：额外支付从 1.5 × 当前下注提高到 2.5 × 当前下注。",
    synergy: "樱桃去核器和柠檬感染能调整三种字面水果的分布。",
    risk: "必须三种字面图案恰好同线；普通三连线与百搭替代不满足条件。",
    targetHint: null
  },
  leftovers: {
    effect: "本班第一次被消耗的食物返回当前最短转轮。",
    levelTwoEffect: "L2：本班前 2 份被消耗的食物都会返回当前最短转轮。",
    synergy: "深夜厨房提供食物，果酱罐会受食物带来的三转赔付加成影响。",
    risk: "食物回收会继续加长最短轮；本班返回额度用完后不再回收。",
    targetHint: null
  },
  "seven-purification": {
    effect: "在选定转轮把 1 个樱桃或柠檬替换为幸运7。",
    levelTwoEffect: null,
    synergy: "恶兆收集器和三重祝福都依赖幸运7中奖线。",
    risk: "会永久减少被选水果的数量，转轮总长度不变。",
    targetHint: "选择一个转轮上的樱桃或柠檬。"
  },
  "tithe-box": {
    effect: "支付 ¥10，在选定转轮加入 1 个幸运7，并获得 1 层恶兆。",
    levelTwoEffect: null,
    synergy: "恶兆收集器兑现恶兆，三重祝福放大幸运7中奖线。",
    risk: "立即扣除 ¥10 且转轮变长；新增幸运7不保证马上出现。",
    targetHint: "选择要加入幸运7的转轮。"
  },
  "omen-collector": {
    effect: "每转第一条幸运7中奖线消耗全部恶兆，额外支付恶兆层数 × 0.5 × 当前下注。",
    levelTwoEffect: "L2：系数从 0.5 × 当前下注提高为 1 × 当前下注。",
    synergy: "祈祷失败和什一税箱积累恶兆，七之净化提高幸运7兑现机会。",
    risk: "没有幸运7中奖线就无法兑现；一旦触发会清空全部恶兆。",
    targetHint: null
  },
  "triple-blessing": {
    effect: "每转第一条幸运7中奖线复制其赔付 1 次，并向每个转轮加入 1 个空白。",
    levelTwoEffect: "L2：复制 2 次，并向每个转轮加入 2 个空白。",
    synergy: "七之净化提高触发机会，空白电容可把新增空白转成免费转动。",
    risk: "空白会永久稀释所有付费符号；每转只由第一条幸运7中奖线触发。",
    targetHint: null
  },
  "midnight-bell": {
    effect: "每转第一条铃铛中奖线把其中第一个字面铃铛变成百搭，再重新检查中奖线。",
    levelTwoEffect: "L2：改为把前 2 个字面铃铛变成百搭，再重新检查。",
    synergy: "复写纸可增加铃铛，重新检查可能接上幸运7或水果连线。",
    risk: "每转只触发一次；百搭替代形成的铃铛线不一定有足够字面铃铛可变。",
    targetHint: null
  },
  "martyr-coin": {
    effect: "每班第一次基础转动前，可献祭向上取整的 10% 余额；启用后本班每条幸运7中奖线复制 1 次。",
    levelTwoEffect: "L2：本班每条幸运7中奖线改为复制 2 次。",
    synergy: "七之净化增加幸运7，安全保险丝能缓和献祭后的低余额风险。",
    risk: "献祭立即扣款且不保证本班出现幸运7中奖线。",
    targetHint: null
  },
  "artificial-crack": {
    effect: "在选定转轮加入 1 个永久裂纹；下一班专注上限 +1。",
    levelTwoEffect: null,
    synergy: "废料磁铁能让裂纹连线付钱，维修间可在边界移除裂纹。",
    risk: "永久裂纹可能让已装备部件在本转失效。",
    targetHint: "选择要加入永久裂纹的转轮。"
  },
  "scrap-magnet": {
    effect: "字面裂纹连线支付 2 × 当前下注，并移除组成连线的实体裂纹。",
    levelTwoEffect: "L2：每条字面裂纹连线改为支付 4 × 当前下注。",
    synergy: "保安室和松动弹簧制造裂纹，维修间能控制未连线的残余裂纹。",
    risk: "只有三个字面裂纹同线才付钱；裂纹在连成线前仍可能禁用部件。",
    targetHint: null
  },
  "loose-spring": {
    effect: "保安室踹击改为前进 2 格，并在该轮增加 2 个永久裂纹。",
    levelTwoEffect: "L2：踹击改为前进 3 格，仍增加 2 个永久裂纹。",
    synergy: "踹击预览让位移保持确定，废料磁铁可利用新增裂纹。",
    risk: "位移更远且每次制造 2 个永久裂纹；踹击仍占用本转唯一干预。",
    targetHint: null
  },
  "blank-capacitor": {
    effect: "每累计 3 个可见实体空白，获得 1 次免费转动；不足阈值的余数保留。",
    levelTwoEffect: "L2：阈值从每 3 个实体空白降低为每 2 个。",
    synergy: "三重祝福持续加入空白，过载马达能从免费转动的长连锁中获利。",
    risk: "只有可见的实体空白充能；免费转动不会退回此前下注。",
    targetHint: null
  },
  "warranty-fraud": {
    effect: "本班第一次有其他部件因裂纹失效时，支付 3 × 当前下注。",
    levelTwoEffect: "L2：首次失效赔付从 3 × 当前下注提高为 6 × 当前下注。",
    synergy: "保安室制造裂纹，安全保险丝能承接高风险路线的余额下限。",
    risk: "每班只赔第一次，而且必须是其他部件失效；自身失效不触发。",
    targetHint: null
  },
  "overload-motor": {
    effect: "从本次结算第 2 个核心连锁效果起，每个支付 0.25 × 当前下注；第 6 个还会向每轮加入 1 个裂纹。",
    levelTwoEffect: "L2：每个连锁效果的赔付从 0.25 × 当前下注提高为 0.5 × 当前下注。",
    synergy: "柠檬感染和午夜钟声制造重新检查，废料磁铁利用第 6 个效果产生的裂纹。",
    risk: "短连锁不会触发；达到第 6 个效果会永久损伤全部转轮。",
    targetHint: null
  },
  "pruning-shears": {
    effect: "从长度大于 6 的选定转轮移除 1 个选定的非百搭符号；转轮不会短于 6。",
    levelTwoEffect: null,
    synergy: "可清理空白或裂纹，也能提高保留符号的占比。",
    risk: "被剪掉的符号永久减少；长度为 6 的轮不能继续修剪。",
    targetHint: "选择长轮上的一个非百搭符号。"
  },
  "carbon-copy": {
    effect: "在选定转轮永久加入 2 个选定基础符号。",
    levelTwoEffect: null,
    synergy: "可补充水果、铃铛或幸运7，为已有部件提高触发密度。",
    risk: "转轮会永久变长，未复制的符号占比下降。",
    targetHint: "选择一个转轮及其中的基础符号。"
  },
  "safety-fuse": {
    effect: "余额低于最低下注时自动消耗，为余额补入 ¥20。",
    levelTwoEffect: "L2：自动救援金额从 ¥20 提高到 ¥40。",
    synergy: "殉道者硬币会主动压低余额，维修间帮助稳定到触发线之前。",
    risk: "一次性消耗品；只有严格低于最低下注才触发。",
    targetHint: null
  },
  calculator: {
    effect: "解锁每个转轮的精确符号概率。",
    levelTwoEffect: null,
    synergy: "为转轮改造提供改造前后的概率对照，也为会计账本铺路。",
    risk: "只提供信息，不直接增加赔付或余额。",
    targetHint: null
  },
  ledger: {
    effect: "保留符号概率，并解锁估算 RTP 与 95% 区间。",
    levelTwoEffect: null,
    synergy: "用配对估算比较转轮改造，继续升级可查看生存风险。",
    risk: "RTP 是有限样本估算，不是精确保证，也不能预测下一转。",
    targetHint: null
  },
  "statistics-terminal": {
    effect: "保留已有信息，并解锁赔付波动、当前观察期破产概率与预计可承受转动次数。",
    levelTwoEffect: null,
    synergy: "同时观察收益和生存风险，帮助判断是否继续高风险构筑。",
    risk: "所有结果都是当前机器与有限观察期的估算，不保证单局结果。",
    targetHint: null
  }
} as const satisfies Readonly<Record<UpgradeId, UpgradeCopy>>;

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function count(strip: readonly SymbolId[], symbol: SymbolId): number {
  return strip.filter((candidate) => candidate === symbol).length;
}

function projectedReels(state: RunState, id: UpgradeId, target: UpgradeTarget): RunState["reels"] | null {
  const result = dispatchCommand(state, { type: "CHOOSE_UPGRADE", choice: { id, action: "apply", target } });
  return result.ok ? result.state.reels : null;
}

function changedSymbols(id: UpgradeId, target: UpgradeTarget): readonly { readonly reel: ReelIndex; readonly symbol: SymbolId }[] {
  switch (target.kind) {
    case "two-reels":
      return target.reels.map((reel) => ({ reel, symbol: "lemon" as const }));
    case "reel":
      return [{ reel: target.reel, symbol: id === "tithe-box" ? "seven" : "crack" }];
    case "symbol-on-reel": {
      if (id === "cherry-pitter") {
        return [
          { reel: target.reel, symbol: target.symbol },
          { reel: target.reel, symbol: "cherry" }
        ];
      }
      if (id === "seven-purification") {
        return [
          { reel: target.reel, symbol: target.symbol },
          { reel: target.reel, symbol: "seven" }
        ];
      }
      return [{ reel: target.reel, symbol: target.symbol }];
    }
  }
}

function reelImpact(
  state: RunState,
  id: UpgradeId,
  target: UpgradeTarget,
  estimates?: { readonly before: MachineEstimate | null; readonly after: MachineEstimate | null }
): string | null {
  const afterReels = projectedReels(state, id, target);
  if (afterReels === null) return null;
  const details = changedSymbols(id, target).map(({ reel, symbol }) => {
    const beforeStrip = state.reels[reel];
    const afterStrip = afterReels[reel];
    const beforeCount = count(beforeStrip, symbol);
    const afterCount = count(afterStrip, symbol);
    const direction = afterCount / afterStrip.length >= beforeCount / beforeStrip.length ? "提高" : "降低";
    const probability = state.toolLevel >= 1
      ? `；概率 ${percent(beforeCount / beforeStrip.length)} → ${percent(afterCount / afterStrip.length)}`
      : `；抽到${SYMBOL_LABELS[symbol]}的机会${direction}`;
    return `第${reel + 1}轮：${SYMBOL_LABELS[symbol]} ${beforeCount} → ${afterCount}；总长度 ${beforeStrip.length} → ${afterStrip.length}${probability}`;
  });
  const beforeRtp = estimates?.before?.rtpMean;
  const afterRtp = estimates?.after?.rtpMean;
  if (state.toolLevel >= 2 && beforeRtp !== null && beforeRtp !== undefined && afterRtp !== null && afterRtp !== undefined) {
    details.push(`估算 RTP ${percent(beforeRtp)} → ${percent(afterRtp)}`);
  }
  return details.join("；");
}

function genericCurrentImpact(state: RunState, id: UpgradeId): string {
  const definition = UPGRADES[id];
  if (definition.kind === "reel-mod") return UPGRADE_COPY[id].targetHint ?? "选择目标后显示改造前后变化。";
  if (definition.kind === "tool") return `当前信息工具等级 L${state.toolLevel}；取得后解锁下一层可见信息。`;
  const equipped = state.partSlots.find((part) => part?.id === id);
  return equipped === undefined || equipped === null
    ? "当前未装备；取得后放入一个部件槽。"
    : equipped.level === 1
      ? "当前已装备 L1；再次取得会在原槽升级到 L2。"
      : "当前已装备 L2；已达到最高等级。";
}

function latestPartStatus(state: RunState, id: PartId): string {
  if (state.phase !== "RESOLVING_EFFECTS") return "当前状态：等待触发。";
  let start = -1;
  state.pendingEvents.forEach((event, index) => {
    if (event.type === "REELS_DRAWN") start = index;
  });
  const events = state.pendingEvents.slice(start + 1);
  if (events.some((event) => event.type === "PART_DISABLED" && event.partId === id)) {
    return "本转状态：因可见裂纹失效。";
  }
  if (events.some((event) => event.type === "PART_TRIGGERED" && event.partId === id)) {
    return "本转状态：已经触发。";
  }
  return "本转状态：未触发。";
}

function equippedImpact(state: RunState, part: PartInstance): string {
  const bet = getCurrentBet(state);
  const status = latestPartStatus(state, part.id);
  switch (part.id) {
    case "jam-jar": {
      const lines = state.counters.cherryWinsThisShift;
      const payout = lines * (part.level === 1 ? 0.5 : 1) * bet;
      return `本班已有 ${lines} 条樱桃中奖线；下一条额外赔付 ¥${money(payout)}。${status}`;
    }
    case "leftovers": {
      const remaining = Math.max(0, part.level - state.shiftFlags.returnedFoodCount);
      return `本班还可返回 ${remaining} 份食物；已返回 ${state.shiftFlags.returnedFoodCount} 份。${status}`;
    }
    case "omen-collector": {
      const payout = state.omen * (part.level === 1 ? 0.5 : 1) * bet;
      return `当前 ${state.omen} 层恶兆；触发时可额外赔付 ¥${money(payout)} 并清空恶兆。${status}`;
    }
    case "martyr-coin": {
      const cost = state.bankroll > 0 && Number.isFinite(state.bankroll) ? Math.ceil(state.bankroll * 0.1) : 0;
      return `本班${state.shiftFlags.martyrEnabled ? "已经献祭" : "尚未献祭"}；当前献祭成本 ¥${cost}。${status}`;
    }
    case "blank-capacitor": {
      const threshold = part.level === 1 ? 3 : 2;
      const charge = Math.max(0, state.counters.blankCharge) % threshold;
      return `当前蓄能 ${charge}/${threshold}；还差 ${threshold - charge} 个实体空白获得免费转动。${status}`;
    }
    case "warranty-fraud": {
      const payout = (part.level === 1 ? 3 : 6) * bet;
      return state.shiftFlags.warrantyPaid
        ? `本班已经赔付；本班不会再次赔付。${status}`
        : `本班尚未赔付；首次其他部件失效可赔 ¥${money(payout)}。${status}`;
    }
    case "loose-spring": {
      const steps = part.level === 1 ? 2 : 3;
      return `本班踹击${state.shiftFlags.kickUsed ? "已使用" : "可使用"}；踹击会前进 ${steps} 格并增加 2 个永久裂纹。${status}`;
    }
    case "safety-fuse": {
      const minimum = getMinimumBet(state);
      const rescue = getSafetyFuseRescuePayout(state);
      return rescue > 0
        ? `余额已低于最低下注 ¥${money(minimum)}；下次尝试付费转动时将消耗并救援 ¥${money(rescue)}。${status}`
        : `最低下注 ¥${money(minimum)}；余额尚未触发，触发后救援 ¥${part.level === 1 ? 20 : 40}。${status}`;
    }
    default:
      return `当前装备 L${part.level}。${status}`;
  }
}

export function describeUpgrade(
  state: RunState,
  id: UpgradeId,
  target?: UpgradeTarget,
  estimates?: {
    readonly before: MachineEstimate | null;
    readonly after: MachineEstimate | null;
  }
): UpgradePresentation {
  const definition = UPGRADES[id];
  const copy = UPGRADE_COPY[id];
  const targetImpact = definition.kind === "reel-mod" && target !== undefined
    ? reelImpact(state, id, target, estimates)
    : null;
  const available = definition.requires(state) && (
    definition.kind !== "part" || !state.partSlots.some((part) => part?.id === id && part.level === 2)
  );
  return {
    id,
    name: definition.name,
    kindLabel: KIND_LABELS[definition.kind],
    routeLabel: ROUTE_LABELS[definition.route],
    effect: copy.effect,
    levelTwoEffect: copy.levelTwoEffect,
    currentImpact: targetImpact ?? genericCurrentImpact(state, id),
    synergy: copy.synergy,
    risk: copy.risk,
    targetHint: copy.targetHint,
    available
  };
}

export function describeEquippedPart(state: RunState, part: PartInstance): UpgradePresentation {
  return {
    ...describeUpgrade(state, part.id),
    currentImpact: equippedImpact(state, part),
    available: part.level === 1
  };
}
