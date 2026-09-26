import { getSafetyFuseRescuePayout } from "@/content/effects/neutral";
import { UPGRADES } from "@/content/upgrades";
import { getCurrentBet, getMinimumBet, getMartyrCost } from "@/core/progression";
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
  readonly decisionEffect: string;
  readonly triggerCondition: string | null;
  readonly immediateCost: string | null;
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

interface UpgradeDecisionCopy {
  readonly decisionEffect: string;
  readonly triggerCondition: string | null;
  readonly immediateCost: string | null;
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
    action: "每班任选一转开始前，可支付本关标准下注的 75%（初始 ¥7.5），立即获得接下来 3 次转动的适用赔付 +50%；同时向选定轮加入食物，抽中后再获得之后 3 次转动的适用赔付 +25%。每班限一次。",
    synergies: "剩菜打包（把食物送回最短轮）＋果酱罐（樱桃连线逐步加价）",
    risk: "餐费立即扣除，不随保守／激进档切换；免费转也消耗加成次数，空转不会返还餐费。食物会加长转轮；过载保护与保险丝救援不享受加成。"
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
    synergies: "松动弹簧（相同损伤、踹得更远）＋废料磁铁（裂纹连线变成赔付）",
    risk: "永久裂纹可能在可见时让部件本转失效；损伤会留到之后的转动。"
  }
} as const satisfies Readonly<Record<ServiceId, ServicePresentation>>;

const UPGRADE_COPY = {
  "harvest-vat": {
    effect: "有樱桃线、柠檬线或水果沙拉中奖的付费转，存 1 格果酿；第 3 格立即开桶，额外支付 12 × 当前下注并清零。",
    levelTwoEffect: "L2：开桶额外支付 24 × 当前下注。",
    synergy: "稳定水果构筑负责存酿；可等即将开桶时买餐，放大这一转。",
    risk: "每个付费转最多存 1 格，免费转不存也不开桶；跨班保留。占一个槽，前两次只积累；替换果桶会丢失存酿。", targetHint: null
  },
  "votive-candle": {
    effect: "转动前花 1 小费点烛，存入最多 3 层恶兆；下一次烛台正常工作时，每层额外支付 2 × 当前下注，不需要幸运7中奖。",
    levelTwoEffect: "L2：每层额外支付 4 × 当前下注。",
    synergy: "祈祷失败积累恶兆；点烛可择机兑现，也能搭配食物，不占干预。",
    risk: "小费和恶兆立即扣除，收集器不能重复兑现这部分恶兆；失效时存量保留等待下一转。跨班保留，替换烛台会丢失存量。", targetHint: null
  },
  "shock-absorber": {
    effect: "每转抵消 1 个可见裂纹造成的停工，并按 1 个可见实体裂纹支付 2 × 当前下注；自己免疫裂纹。",
    levelTwoEffect: "L2：抵消 2 个裂纹，按最多 2 个实体裂纹各付 3 × 当前下注。",
    synergy: "少量裂纹变收入，还能保护电容或马达；留给磁铁回收，或用维修间清理。",
    risk: "不移除裂纹，多于保护额度的裂纹仍会让其他部件停工；占一个槽，减少停工也可能减少骗保机会。", targetHint: null
  },
  "cherry-press": {
    effect: "每转第一条樱桃中奖线触发：盘面字面樱桃从第 3 颗起，每颗额外支付 0.5 × 下注，最多计 6 颗。",
    levelTwoEffect: "L2：每颗额外支付 1 × 下注，仍最多计 6 颗。", synergy: "樱桃去核器提高密度，果酱罐继续累积连线奖金。",
    risk: "百搭不算樱桃；盘面不足 3 颗字面樱桃时不加钱。全部变成柠檬后不再触发。", targetHint: null
  },
  "salad-dressing": {
    effect: "每条水果沙拉额外支付其原始奖金的 50%；与原沙拉奖金分别享受食物加成。",
    levelTwoEffect: "L2：额外支付其原始奖金的 100%。", synergy: "水果沙拉保留樱桃、柠檬和铃铛的混合连线，厨房放大两份奖金。",
    risk: "必须装备且成功触发水果沙拉；百搭替代、三连柠檬均无效。", targetHint: null
  },
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
    effect: "每转首次柠檬线把 1 个线外基础图案变成柠檬并重算；无可感染图案且盘面至少 6 颗字面柠檬时，改为收成 2 × 下注。",
    levelTwoEffect: "L2：感染 2 个；成熟收成提高为 5 × 下注。每转只触发一次。",
    synergy: "柠檬木箱提高启动机会，提纯后靠成熟收成继续赚钱；厨房放大两阶段的收入。",
    risk: "只感染线外樱桃、铃铛或幸运7；感染与收成不同时触发。会破坏樱桃果酱和混合沙拉构筑。",
    targetHint: null
  },
  "jam-jar": {
    effect: "每条樱桃中奖线都会充能；额外奖金 = 本班此前樱桃中奖线数（最多计 6 层）× 0.5 × 当前下注。",
    levelTwoEffect: "L2：系数从 0.5 × 当前下注提高为 1 × 当前下注。",
    synergy: "樱桃去核器增加樱桃密度，厨房加成会同时放大这份部件赔付。",
    risk: "本班第一条樱桃中奖线此前计数为 0，因此只充能、不加钱；有效充能上限 6 层，换班归零。",
    targetHint: null
  },
  "fruit-salad": {
    effect: "同一支付线上出现字面樱桃＋柠檬＋铃铛时，额外支付 1.5 × 当前下注；百搭不能代替任何一种。",
    levelTwoEffect: "L2：额外支付从 1.5 × 当前下注提高到 2.5 × 当前下注。",
    synergy: "按不同转轮分配三种图案，搭配沙拉酱和厨房放大混合线。",
    risk: "必须三种字面图案恰好同线；百搭不能代替。柠檬感染会消掉樱桃、铃铛，不适合继续保留沙拉。",
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
    effect: "每转第一条幸运7中奖线复制其赔付 1 次；本班首次触发时，仅向最长轮加入 1 个临时空白。",
    levelTwoEffect: "L2：复制 2 次；代价不增加，仍整班只加入 1 个临时空白。",
    synergy: "七之净化提高触发机会，空白电容可把付费转中的空白变成额外机会。",
    risk: "空白只稀释本班后续转动，换班或进入下一段自动清除；不会永久改轮。只复制第一条幸运7线，不复制其他部件奖金。",
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
    effect: "每班第一次基础转动前，可献祭向上取整的 10% 余额（最多本关标准下注的 2 倍）；启用后本班每条幸运7中奖线复制 1 次。",
    levelTwoEffect: "L2：本班每条幸运7中奖线改为复制 2 次。",
    synergy: "七之净化增加幸运7，安全保险丝能缓和献祭后的低余额风险。",
    risk: "献祭立即扣款且不保证本班出现幸运7中奖线。",
    targetHint: null
  },
  "artificial-crack": {
    effect: "在选定转轮加入 1 个永久裂纹；下一班专注上限 +1。",
    levelTwoEffect: null,
    synergy: "废料磁铁能让裂纹连线付钱，维修间可在边界移除裂纹。",
    risk: "永久裂纹可能让部件失效；额外专注只持续下一班，仍受客房上限限制，入房可能用不到。",
    targetHint: "选择要加入永久裂纹的转轮。"
  },
  "scrap-magnet": {
    effect: "字面裂纹连线支付 4 × 当前下注，并移除组成连线的实体裂纹；本部件免疫裂纹失效。",
    levelTwoEffect: "L2：每条字面裂纹连线改为支付 6 × 当前下注。",
    synergy: "保安室和松动弹簧制造裂纹，维修间能控制未连线的残余裂纹。",
    risk: "只有三个字面裂纹同线才付钱；裂纹仍可能禁用其他非免疫部件，消除后不追溯恢复本转效果。",
    targetHint: null
  },
  "loose-spring": {
    effect: "保安室踹击改为前进 2 格，仍只在该轮增加 1 个永久裂纹。",
    levelTwoEffect: "L2：踹击改为前进 3 格，仍只增加 1 个永久裂纹。",
    synergy: "踹击预览让位移保持确定，废料磁铁可利用新增裂纹。",
    risk: "更远不一定更好，先看踹击预览；每次制造 1 个永久裂纹，仍占用本转唯一干预。",
    targetHint: null
  },
  "blank-capacitor": {
    effect: "付费转中累计 3 个可见实体空白，获得 1 次免费转；每个付费转最多赠 1 次，不足阈值的余数保留。",
    levelTwoEffect: "L2：充能阈值从 3 个实体空白降低为 2 个；每转赠送上限不变。",
    synergy: "三重祝福的本班空白可提供充能，额外转动继续触发其他部件。",
    risk: "免费转不充能；超出一次赠送的整份充能不储存，只保留余数。三次付费转最多由本部件赠三次。",
    targetHint: null
  },
  "warranty-fraud": {
    effect: "本班第一次有其他部件因裂纹失效时，支付 3 × 当前下注；本部件免疫裂纹失效。",
    levelTwoEffect: "L2：首次失效赔付从 3 × 当前下注提高为 6 × 当前下注。",
    synergy: "保安室制造裂纹，安全保险丝能承接高风险路线的余额下限。",
    risk: "每班只赔第一次，而且必须有其他非免疫部件失效；单独装备不触发。",
    targetHint: null
  },
  "overload-motor": {
    effect: "从本次结算第 2 个核心连锁效果起，每个支付 0.25 × 当前下注；第 6 个向裂纹最少的一轮加入 1 个裂纹。",
    levelTwoEffect: "L2：每个连锁效果的赔付从 0.25 × 当前下注提高为 0.5 × 当前下注。",
    synergy: "柠檬感染和午夜钟声制造重新检查，废料磁铁利用第 6 个效果产生的裂纹。",
    risk: "短连锁不会触发；达到第 6 个效果会永久新增 1 个裂纹，自己产生的效果不继续计数。",
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
    effect: "余额低于最低下注时自动消耗，补入 1 次最低下注，至少 ¥20。",
    levelTwoEffect: "L2：补入 2 次最低下注，至少 ¥40。",
    synergy: "殉道者硬币会主动压低余额，维修间帮助稳定到触发线之前。",
    risk: "一次性消耗品；只有严格低于最低下注才触发。保住下注机会，不保证中奖或凑足客房要求的全部下注备付金。",
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

const UPGRADE_DECISION_COPY = {
  "harvest-vat": { decisionEffect: "水果中奖存酿，第 3 次额外 +12×下注", triggerCondition: "只计付费转，每转存 1 格；跨班保留", immediateCost: null },
  "votive-candle": { decisionEffect: "花小费把最多 3 恶兆换成下一转奖金", triggerCondition: "主动点烛，每层 +2×下注，不必中奖", immediateCost: "点烛花 1 小费，消耗存入的恶兆" },
  "shock-absorber": { decisionEffect: "挡住 1 个裂纹停工，并获得 2×下注", triggerCondition: "需可见裂纹；自己免疫", immediateCost: null },
  "cherry-press": { decisionEffect: "樱桃中奖时，从第 3 颗樱桃起每颗 +0.5×下注", triggerCondition: "每转首次樱桃线，最多计 6 颗；百搭不计数", immediateCost: null },
  "salad-dressing": { decisionEffect: "每条水果沙拉再加 50% 奖金", triggerCondition: "需要水果沙拉触发", immediateCost: null },
  "lemon-crate": { decisionEffect: "选两轮，各加入 2 个柠檬", triggerCondition: null, immediateCost: "两轮永久变长" },
  "cherry-pitter": { decisionEffect: "把一轮的 1 个其他图案换成樱桃", triggerCondition: "百搭不能替换", immediateCost: "被替换图案永久减少" },
  "lemon-infection": { decisionEffect: "柠檬中奖后感染；成熟盘面改为 +2×下注", triggerCondition: "每转首次柠檬线；收成需至少 6 柠檬且无可感染图案", immediateCost: "会替换线外樱桃、铃铛、幸运7" },
  "jam-jar": { decisionEffect: "本班樱桃线越多，后续奖励越高", triggerCondition: "第一条只充能", immediateCost: null },
  "fruit-salad": { decisionEffect: "樱桃 + 柠檬 + 铃铛同线，额外 1.5×下注", triggerCondition: "百搭不算", immediateCost: null },
  leftovers: { decisionEffect: "本班第 1 份食物回到最短轮", triggerCondition: "需要深夜厨房", immediateCost: "最短轮会变长" },
  "seven-purification": { decisionEffect: "把一轮的 1 个樱桃或柠檬换成幸运7", triggerCondition: "目标轮必须有水果", immediateCost: "被替换水果永久减少" },
  "tithe-box": { decisionEffect: "付 ¥10，向一轮加入幸运7并获得 1 恶兆", triggerCondition: null, immediateCost: "立即支付 ¥10，转轮变长" },
  "omen-collector": { decisionEffect: "幸运7中奖时，把全部恶兆换成奖励", triggerCondition: "每转首次幸运7线", immediateCost: null },
  "triple-blessing": { decisionEffect: "首次幸运7线复制 1 次", triggerCondition: "每转一次", immediateCost: "本班首次触发：最长轮 +1 临时空白，换班清除" },
  "midnight-bell": { decisionEffect: "首次铃铛线把铃铛变百搭并重算", triggerCondition: "必须有字面铃铛", immediateCost: null },
  "martyr-coin": { decisionEffect: "献祭余额，本班幸运7线额外复制", triggerCondition: "首转前启用", immediateCost: "支付向上取整的 10% 余额，最多标准下注 ×2" },
  "artificial-crack": { decisionEffect: "向一轮加入裂纹，下班专注上限 +1", triggerCondition: null, immediateCost: "永久加入 1 个裂纹" },
  "scrap-magnet": { decisionEffect: "裂纹同线，奖励 4×下注并移除它们", triggerCondition: "必须是实体裂纹", immediateCost: null },
  "loose-spring": { decisionEffect: "踹击前进 2 格，损伤仍为 1 裂纹", triggerCondition: "需要保安室，先看预览", immediateCost: "每次踹击永久加入 1 裂纹" },
  "blank-capacitor": { decisionEffect: "付费转累计 3 个可见空白，赠 1 次免费转", triggerCondition: "每转最多赠 1 次，余数保留；免费转不充能", immediateCost: null },
  "warranty-fraud": { decisionEffect: "其他部件首次被裂纹禁用，奖励 3×下注", triggerCondition: "自己失效不算", immediateCost: null },
  "overload-motor": { decisionEffect: "从第 2 个连锁效果起，每个奖励 0.25×下注", triggerCondition: "第 6 个效果还会损伤机器", immediateCost: "裂纹最少的一轮永久 +1 裂纹" },
  "pruning-shears": { decisionEffect: "从长轮删除 1 个非百搭图案", triggerCondition: "轮长必须大于 6", immediateCost: "所选图案永久减少" },
  "carbon-copy": { decisionEffect: "向一轮加入 2 个指定基础图案", triggerCondition: "只能复制基础图案", immediateCost: "转轮永久变长" },
  "safety-fuse": { decisionEffect: "余额不足时补 1 次最低下注，至少 ¥20", triggerCondition: "低于最低下注自动触发", immediateCost: "一次性部件" },
  calculator: { decisionEffect: "显示每轮精确符号概率", triggerCondition: null, immediateCost: null },
  ledger: { decisionEffect: "显示模拟 RTP 和风险带", triggerCondition: "信息是模拟估算", immediateCost: null },
  "statistics-terminal": { decisionEffect: "显示破产概率、波动和可承受转数", triggerCondition: "信息是模拟估算", immediateCost: null }
} as const satisfies Readonly<Record<UpgradeId, UpgradeDecisionCopy>>;

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
    case "harvest-vat":
      return state.phase === "RESOLVING_EFFECTS" ? `存酿进度结算后更新。${status}`
        : `果酿 ${state.counters.harvestCharge ?? 0}/3；再有 ${3 - (state.counters.harvestCharge ?? 0)} 个付费转水果中奖即可开桶，加 ¥${money((part.level === 1 ? 12 : 24) * bet)}（未计食物）。${status}`;
    case "votive-candle":
      return state.phase === "RESOLVING_EFFECTS" ? `烛台存量结算后更新。${status}`
        : `烛台已存 ${state.counters.votiveCharge ?? 0} 层；每层可兑 ¥${money((part.level === 1 ? 2 : 4) * bet)}（未计食物）。尚有恶兆 ${state.omen}，小费 ${state.tips}。${status}`;
    case "shock-absorber":
      return `最多挡住 ${part.level} 个裂纹停工；按最多 ${part.level} 个实体裂纹各付 ¥${money((part.level === 1 ? 2 : 3) * bet)}。不消除裂纹。${status}`;
    case "jam-jar": {
      const lines = state.counters.cherryWinsThisShift;
      const payout = Math.min(6, lines) * (part.level === 1 ? 0.5 : 1) * bet;
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
    case "triple-blessing": {
      const blanks = (state.blockReelAdditions ?? []).reduce((n, strip) => n + strip.length, 0);
      return `每转首次幸运7线额外复制 ${part.level} 次；本班已有 ${blanks} 个临时空白，下一班清除。${status}`;
    }
    case "martyr-coin": {
      if (state.shiftFlags.martyrEnabled) {
        return `本班已经献祭；不会再次扣款，幸运7中奖线按当前等级复制。${status}`;
      }
      const canEnable = state.phase === "READY_TO_SPIN" && state.pendingSpin === null && state.baseSpinsInShift === 0;
      if (!canEnable) return `尚未献祭，但已经错过本班献祭窗口；本班不能再启用。${status}`;
      const cost = getMartyrCost(state);
      return `本班尚未献祭；现在可以献祭，献祭成本 ¥${cost}。${status}`;
    }
    case "blank-capacitor": {
      const threshold = part.level === 1 ? 3 : 2;
      const charge = Math.max(0, state.counters.blankCharge);
      return `当前蓄能 ${charge}/${threshold}；付费转还需 ${Math.max(0, threshold - charge)} 个实体空白。每转最多赠 1 次，免费转不充能。${status}`;
    }
    case "warranty-fraud": {
      const payout = (part.level === 1 ? 3 : 6) * bet;
      return state.shiftFlags.warrantyPaid
        ? `本班已经赔付；本班不会再次赔付。${status}`
        : `本班尚未赔付；首次其他部件失效可赔 ¥${money(payout)}。${status}`;
    }
    case "loose-spring": {
      const steps = part.level === 1 ? 2 : 3;
      return `本班踹击${state.shiftFlags.kickUsed ? "已使用" : "可使用"}；踹击会前进 ${steps} 格并增加 1 个永久裂纹。${status}`;
    }
    case "safety-fuse": {
      const minimum = getMinimumBet(state);
      const rescue = getSafetyFuseRescuePayout(state);
      if (rescue > 0) {
        const trigger = state.phase === "RESOLVING_EFFECTS" && state.freeSpinQueue === 0
          ? `本次演出完成时将自动消耗并救援 ¥${money(rescue)}`
          : state.phase === "READY_TO_SPIN"
            ? `下次尝试付费转动时将消耗并救援 ¥${money(rescue)}`
            : `进入下一次付费转动前将消耗并救援 ¥${money(rescue)}`;
        return `余额已低于最低下注 ¥${money(minimum)}；${trigger}。${status}`;
      }
      return `最低下注 ¥${money(minimum)}；余额尚未触发，触发后救援 ¥${money(Math.max(part.level === 1 ? 20 : 40, minimum * part.level))}。${status}`;
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
    ...UPGRADE_DECISION_COPY[id],
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
