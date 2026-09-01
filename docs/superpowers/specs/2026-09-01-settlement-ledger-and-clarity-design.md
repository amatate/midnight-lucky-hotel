# 午夜好运酒店：结算账本与信息清晰度更新设计

- 日期：2026-09-01
- 状态：聊天方案已获用户批准，等待书面规格复核
- 产品范围：现有 React Web/PWA 原型的结算事实层、表现层与班次信息层
- 体验主题：酒店前台过账——盘面先给证据，奖金逐笔入账，班末打印小票

## 1. 背景与目标

试玩已经证明拉杆、自动停轮和构筑循环具备基础乐趣，但玩家仍无法稳定回答三个问题：

1. 这一转具体扣了多少钱、每一笔奖励从哪里来、最终余额为何是这个数？
2. 水果沙拉触发时究竟是哪一条线满足了条件？
3. 为什么经过升级界面后，老虎机又显示成同一个固定盘面？

本轮先解决因果可读性和结算爽感，不增加新的玩法系统。成功标准是：玩家能从盘面、逐笔入账和历史小票中复述一转的完整金额公式，同时仍愿意迅速进入下一次拉动。

## 2. 范围与不能破坏的约束

本轮包含：

- 每转生成可持久化、可审计的结算小票；
- 赔付总额与余额按真实奖励顺序逐笔递增；
- 水果沙拉产生带支付线身份的正式特殊中奖事件；
- 升级场景前后保留上一转的最终可见盘面；
- 精简升级卡，并把普通班次和整局报告改成玩家可读的小票。

本轮不包含：

- Jackpot、房间阶梯、主页、完整收藏集或新升级；
- 基础倍率、转轮概率、RNG、下注公式、三转一班、五班一局、退房目标或候选生成改动；
- 对当前工作区中尚未提交的 Task 13 基础赔付表和验证材料做回退或重写；
- 隐藏保底、假近失、为配合动画重排事件或延迟权威结算。

固定种子回归中，允许变化的只有新增的审计数据、特殊事件类型和表现分级；盘面、余额、转轮条、资源、合同、构筑与后续 RNG 必须保持一致。

## 3. 方案选择

### 3.1 方案 A：仅在表现层临时推导

直接从 `pendingEvents` 计算滚动数字，并从最终盘面重新扫描水果沙拉。改动最少，但结算结束后事件会被清空，无法真正回看；刷新会丢失；界面还会复制一份水果沙拉规则。该方案不满足玩家提出的持久日志要求，拒绝采用。

### 3.2 方案 B：最小结算小票与特殊线事件

核心在结算完成的同一次状态转换中生成不可变 `SpinReceipt`；水果沙拉生成带 `lineId` 的 `PATTERN_LINE_WIN`；表现层只翻译和播放这些事实。日志、数字递增、高亮、刷新恢复和盘面连续性共享同一真相来源。

采用方案 B。

### 3.3 方案 C：完整事件溯源与酒店元系统

保存全部命令、交易、结算和局外进度，并同时建设主页、收藏集和房间系统。扩展性最高，但会把本轮从清晰度修复扩大为新架构，不利于判断本次体验改动是否有效，暂缓。

## 4. 权威数据与数据流

### 4.1 数据流

```text
SPIN
  记录本转扣款前余额、实际下注和免费转身份
    ↓
ACCEPT_OUTCOME
  resolveSpin 生成最终盘面、逐笔奖励事件和权威余额
    ↓
同一次状态转换原子追加 SpinReceipt
    ↓
表现层按事件与小票播放高亮、数字和余额
    ↓
PRESENTATION_COMPLETE
  只清空 pendingEvents；SpinReceipt 继续保留
    ↓
账本抽屉、班末小票和下一班静态盘面读取历史
```

小票必须在 `ACCEPT_OUTCOME` 中随权威结算原子创建，不能在 React effect 或 `PRESENTATION_COMPLETE` 中创建。这样刷新恢复、React Strict Mode、加速和跳过演出都不会产生重复记录。

### 4.2 运行状态升级

`RunState` 升级为 schema v2，并新增：

```ts
interface PendingSpin {
  readonly draw: ReelDraw;
  readonly isFree: boolean;
  readonly bankrollBefore: Money;
  readonly wager: Money;
}

interface RunState {
  readonly schemaVersion: 2;
  readonly spinHistory: readonly SpinReceipt[];
  readonly nextSpinOrdinal: number;
}
```

历史最多保存最近 100 转。淘汰最旧小票时 `nextSpinOrdinal` 继续递增，避免加班模式使存档无限增长。

### 4.3 小票结构

小票不保存完整 `ReelDraw`、转轮条或本地化中文文案，只保存 3×3 最终盘面和解释金额所需的结构化 ID：

```ts
type ReceiptFormula =
  | {
      readonly kind: "known";
      readonly preMultiplierAmount: number;
      readonly appliedMultiplier: number;
    }
  | { readonly kind: "legacy-unavailable" };

type ReceiptAward =
  | {
      readonly sequence: number;
      readonly kind: "line";
      readonly lineId: LineWin["lineId"];
      readonly symbol: SymbolId;
      readonly source: Exclude<AttributionSource, "overload">;
      readonly formula: ReceiptFormula;
      readonly amount: Money;
    }
  | {
      readonly sequence: number;
      readonly kind: "pattern-line";
      readonly patternId: "fruit-salad";
      readonly partId: "fruit-salad";
      readonly lineId: LineWin["lineId"];
      readonly formula: ReceiptFormula;
      readonly amount: Money;
    }
  | {
      readonly sequence: number;
      readonly kind: "part-bonus";
      readonly source: "part";
      readonly partId: PartId;
      readonly formula: ReceiptFormula;
      readonly amount: Money;
    }
  | {
      readonly sequence: number;
      readonly kind: "bonus";
      readonly source: Exclude<AttributionSource, "part" | "overload">;
      readonly formula: ReceiptFormula;
      readonly amount: Money;
    }
  | {
      readonly sequence: number;
      readonly kind: "overload";
      readonly source: "overload";
      readonly formula: ReceiptFormula;
      readonly amount: Money;
    }
  | {
      readonly sequence: number;
      readonly kind: "opaque";
      readonly formula: { readonly kind: "legacy-unavailable" };
      readonly amount: Money;
    };

interface SpinReceipt {
  readonly ordinal: number;
  readonly shift: number;
  readonly afterHoursLevel: number;
  readonly isFree: boolean;
  readonly baseSpinIndex: 1 | 2 | 3 | null;
  readonly bankrollBefore: Money;
  readonly wager: Money;
  readonly finalGrid: Grid;
  readonly awards: readonly ReceiptAward[];
  readonly totalPayout: Money;
  readonly bankrollAfter: Money;
}
```

UI 安全派生：

- 扣注后余额：`bankrollBefore - wager`；
- 本转净变化：`totalPayout - wager`；
- 逐步累计：按 `awards.sequence` 累加；
- 已知公式：`safePayout(preMultiplierAmount × appliedMultiplier) = amount`，只在最终一步按分取整；
- 守恒：`bankrollBefore - wager + totalPayout = bankrollAfter`。

付费转记录真实的 `baseSpinIndex`；免费转为 `null`，界面显示“免费转 · 小票 #ordinal”，不从截断后的数组位置猜测班内序号。`afterHoursLevel = 0` 显示普通班次，大于 0 时显示“加班第 N 段 · 第 M 转”。

小票奖励只来自本次 `resolveSpin` 生成的结算事件，不把更早留在 `pendingEvents` 的服务购买或保险丝救援误算成本转奖金。完整经济交易日志留给未来独立的 `RunTransaction`，本轮不扩张。

### 4.4 现有金额事件的补充字段

小票构建器不得重新运行赔付规则。中央结算器在金额最终取整时，把计算依据一并写入事件：

- `LINE_WIN` 增加未提前取整的 `preMultiplierAmount` 与 `appliedMultiplier`；
- `PAYOUT_ADDED` 增加未提前取整的 `preMultiplierAmount`、`appliedMultiplier`，并在来源是部件时从当前效果注册来源写入 `partId`；
- `OVERLOAD` 以 `preMultiplierAmount = amount`、`appliedMultiplier = 1` 记录；
- 所有事件的 `amount` 仍是已经过倍率和金额安全处理的最终权威金额。

`SpinReceipt` 只把本次 `resolveSpin` 返回的这些金额事件映射为 `ReceiptAward`，并以 `PAYOUT_COMPLETE.total` 做守恒校验。实现必须保持当前“完整乘法后统一调用 `safePayout`”的舍入顺序，不能先把 `preMultiplierAmount` 舍入到分再乘倍率。表现层与账本不能从当前赔付表、当前食物层数或最终盘面反推历史金额。

## 5. 特殊中奖线：水果沙拉

水果沙拉不是三个相同符号，不能伪造成普通 `LINE_WIN`。新增事件：

```ts
{
  readonly type: "PATTERN_LINE_WIN";
  readonly sequence: number;
  readonly patternId: "fruit-salad";
  readonly partId: "fruit-salad";
  readonly lineId: LineWin["lineId"];
  readonly preMultiplierAmount: number;
  readonly appliedMultiplier: number;
  readonly amount: Money;
}
```

水果沙拉效果改为结构化的特殊线奖励，由中央结算器统一加钱并生成事件。每条合格支付线只生成一个 `PATTERN_LINE_WIN`，不得再生成一笔等额 `PAYOUT_ADDED`。

表现层把 `PATTERN_LINE_WIN` 与普通 `LINE_WIN` 一样映射到 `activeLineIds`，但显示真实名称：

```text
水果沙拉！
顶线：樱桃 + 柠檬 + 铃铛
组合奖励 +¥15
```

多条水果沙拉线按支付线顺序逐条播放。它计入视觉上的中奖线数和连锁强度，但不会改变金额、概率或合同规则。

## 6. 逐笔结算演出

### 6.1 显示数字

结算开始时不得显示最终奖金和最终可见余额。表现层从最新 `SpinReceipt` 派生：

- `displayPayout` 初始为 0；
- `displayBankroll` 初始为 `bankrollBefore - wager`；
- 每个奖励按 `sequence` 同时推动两个数字；
- `PAYOUT_COMPLETE` 只校准到权威总额，不再次加钱；
- HUD 在结算期间使用 `displayBankroll`，演出结束后恢复读取权威 `state.bankroll`。

### 6.2 时间参数

| 阶段 | 时长 | 表现 |
|---|---:|---|
| 停轮确认 | 120ms | 盘面静止，保留一拍期待 |
| 中奖线点亮 | 80ms | 对应三格与支付线描金 |
| 奖励不超过 1 倍下注 | 240ms | 数字 ease-out 递增 |
| 奖励为 1–3 倍下注 | 360ms | 数字递增并轻微放大 |
| 奖励超过 3 倍下注 | 520ms | 更长递增与较强落定 |
| 金额落定 | 180ms | 最高 1.10 倍后回弹 |
| 下一事件间隔 | 80ms | 清理当前高亮 |

普通中奖总时长控制在 0.7–1.0 秒，构筑连锁控制在 1.2–2.2 秒。长链不得因为内部非金额事件无限拖慢；非金额事件只在确实解释因果时短暂出现。

无中奖约 350ms 显示：

```text
空手而归
本转支出 ¥10
```

### 6.3 控制与无障碍

- “加速演出”：后续每项压缩至约 80ms；
- “直接结算”：立即显示准确终值，但小票已经存在；
- “减弱动态与闪烁”：不滚数字、不震动、不脉冲，直接切换准确数值并保留静态高亮；
- 四条路径不得发送额外规则命令、写入 RNG 或改变最终状态。

## 7. 账本抽屉

老虎机主界面的余额窗旁增加“账本”入口，打开不超过屏高 72% 的底部抽屉。它不阻塞主循环，关闭后焦点返回入口。

折叠行：

```text
第 2 班 · 第 3 转　-¥10 → +¥23　净 +¥13
```

展开内容：

```text
转前余额                     ¥100
下注                         -¥10
樱桃 · 顶线                  +¥8
水果沙拉 · 顶线             +¥15
总赔付                       +¥23
转后余额                     ¥113
```

有额外倍率时允许展开公式，如 `¥15 × 食物 1.25 = ¥18.75`。默认列表只显示金额因果，不显示内部事件名、sequence 或开发者术语。

免费转标记为“免费转”，下注显示 `¥0`。空历史显示“拉动一次后，前台会在这里留下结算小票”。

## 8. 跨班盘面连续性

`SpinReceipt.finalGrid` 保存结算后的最终权威盘面，包括柠檬感染等变换结果。老虎机没有 `pendingSpin` 时，静态盘面的优先级为：

1. 当前结算表现的 `displayGrid`；
2. 最近一张 `SpinReceipt.finalGrid`；
3. 新局尚未转动时的转轮条预览。

升级场景卸载并重新挂载柜体后仍显示最近小票的盘面。该盘面只用于显示，不写回转轮条，不改变停点、概率、RNG 或下一转结果。真正重开新局会清空历史并恢复初始预览。

## 9. 升级卡信息层级

候选卡默认只承担“现在是否选择”的任务，固定为四层：

```text
[强化 · 水果]

水果沙拉

樱桃 + 柠檬 + 铃铛同线
额外获得 1.5×下注

条件：百搭不算

[选择]
```

规则：

- 核心效果最多两行；
- 必要条件最多一行；
- 即时扣款、永久裂纹和替换部件等不可逆代价必须留在卡面；
- L2、完整协同和长期风险移入“攻略详情”抽屉；
- 角色名称缩短为“强化／转向／豪赌”；
- 选中后只展开当前卡，其他卡折叠为标题；
- 确认区不重复完整效果，只说明将安装到哪里、会替换什么以及需要选择的目标。

“攻略详情”使用可复用的详情组件，未来收藏集直接复用，但本轮不建设收藏集主页面。

## 10. 班末与整局报告

普通班次进入升级界面时，顶部先显示一张不阻塞操作的前台小票。它读取本班权威 `ShiftSnapshot.totalWager` 与 `totalPayout`，只陈述能够准确归属到本班转轮的盈亏：

```text
第 2 班收工
本班转轮盈亏 +¥18
余额 ¥138 / 目标 ¥200
下注 ¥30 · 赔付 ¥48
```

“本班转轮盈亏”严格等于 `totalPayout - totalWager`。厨房、教堂和升级边界发生的现金变化不伪装成转轮盈亏：购买时即时显示，最终余额会包含它们；完整逐笔经济交易留给未来 `RunTransaction`。因此本轮不使用“当前快照余额减上一快照余额”来归属班次，避免把班间改装费用错误算进下一班。

整局或加班报告：

- 先显示最终余额、相对开局的余额变化、总下注和总赔付；总下注读取 `state.expenses.wagers`，总赔付读取 `state.attribution` 各来源之和，不能从已截断或迁移不完整的 `spinHistory` 求和；
- 最大收入来源读取 `state.attribution`，必须同时显示累计金额，金额为 0 时不显示；
- 删除重复的“主要收入来自……主要支出是……”；
- “尚未完成”改为“构筑提示”或“下一步可补强”；
- 没有可展示估值时完全隐藏 RTP；
- 有权限且有数据时显示“当前模拟 RTP 108% · 仅为估算”，不显示“轨迹点”。

报告和升级按钮同时可用；小票入场不超过 700ms，也不能成为额外的确认点击。

## 11. 存档迁移

新增 v2 存储键，同时保留对当前 v1 键的只读回退：

1. v1 与 v2 使用两个独立、严格、精确字段白名单的解码器；新增的 v2 必填事件字段不能倒灌到 v1 解码器，也不能为了兼容旧数据放宽 v2 校验；
2. 优先读取并严格校验 v2；
3. 没有 v2 时先用独立 `GameEventV1`／`RunStateV1` 结构验证 v1，再迁移并立即保存为 v2；
4. 清除存档时同时删除 v1 与 v2；
5. v1 已完成的旧转动无法还原历史，小票历史从迁移时开始，不能伪造；
6. v1 若正处于 `SPINNING` 或 `AWAITING_INTERVENTION`，根据免费转身份和当前实际下注补齐 `PendingSpin` 元数据；
7. v1 若正处于 `RESOLVING_EFFECTS`，只读取最后一个 `REELS_DRAWN` 之后、`PAYOUT_COMPLETE` 之前的金额事件生成一张迁移小票，避免把更早的服务或救援事件算入本转。旧 `LINE_WIN` 与 `PAYOUT_ADDED` 只能使用 `legacy-unavailable` 公式；旧水果沙拉没有 `lineId` 时只能迁移成不带支付线声明的 `opaque` 奖励，不能猜线；
8. 结算中 v1 的 `bankrollAfter = state.bankroll`，`wager` 从免费转身份和当时下注恢复，`bankrollBefore = bankrollAfter - totalPayout + wager`；
9. 损坏、超限、未知事件或不守恒的小票继续按无效存档处理，不放宽安全校验。

存档不得持久化本地化文案，也不得保存完整转轮条副本到每张小票。

v2 小票严格校验还必须满足：

- `spinHistory.length <= 100`，单张 `awards.length <= 128`；该上限覆盖中央 100 个效果上限以及有界的基础线和系统奖励；
- receipt ordinal 严格递增，`nextSpinOrdinal` 大于历史最后一个 ordinal；
- 单张 awards 的 sequence 严格递增且唯一；
- 所有金额有限、非负且不超过 `MAX_MONEY`，已知公式必须满足 `safePayout(preMultiplierAmount × appliedMultiplier) = amount`；
- `part-bonus` 必须有合法 `partId` 且 source 固定为 `part`，`overload` 的 source 固定为 `overload`，其他 bonus 不能冒用这两个来源；
- `finalGrid` 必须通过现有 3×3 合法符号网格校验；
- receipt 总额与余额守恒，免费转 wager 必须为 0，付费转 `baseSpinIndex` 必须为 1、2 或 3。

## 12. 错误与降级

- receipt 构建候选金额和 `PAYOUT_COMPLETE` 不一致属于开发错误；测试环境应失败。生产环境不得追加不守恒的小票，而是生成一张金额等于权威总额、公式为 `legacy-unavailable` 的 `opaque` 小票，保证当前局和下次加载都有效；
- 浏览器拒绝本地存储时，游戏继续可玩，当前会话内账本仍可使用；
- 浏览器不允许声音、震动或动画时静默降级，金额与高亮信息不能丢失；
- v2 持久化解码仍严格拒绝真正损坏的小票；账本抽屉“跳过单条损坏记录”只是当前会话渲染的防御措施，不能代替保存前和加载时校验，也不能把坏记录重新保存。

## 13. 自动化验收

### 13.1 核心与存档

- 每个成功结算恰好生成一张小票；拒绝命令不生成；
- 免费转 `wager = 0`，付费转记录当时实际下注；
- `sum(awards.amount) = totalPayout`；
- `bankrollBefore - wager + totalPayout = bankrollAfter`；
- `PAYOUT_COMPLETE` 只校准一次，不能把总额再次加入；
- 小票在 `pendingEvents` 清空、跨班和刷新恢复后仍存在；
- 恢复结算演出不会重复追加小票；
- 历史超过 100 转只淘汰最旧项，ordinal 不重置；
- 单张奖励数、金额范围、sequence、ordinal、来源联合类型、最终网格和 `nextSpinOrdinal` 均按 v2 严格边界校验；
- v1 正常、转动中、结算中存档均按本规格迁移；损坏或超限存档安全拒绝。

### 13.2 水果沙拉与表现

- 每条合格水果沙拉线只生成一个 `PATTERN_LINE_WIN`，并携带正确 `lineId`；
- 百搭不能替代，重新检查不能重复奖励；
- 特殊线与普通线、部件追加、躁动和过载都不漏算、不双算；
- 基础 ¥20、部件 ¥15 的演出必须显示 `0 → 20 → 35`，不能开场直接显示 35；
- 初始 ¥100、下注 ¥10、赔付 ¥35 时，演出余额为 `90 → 110 → 125`，最终权威余额为 ¥125；
- 完整播放、加速、直接结算和减弱动态得到完全相同的最终状态、小票和余额。

### 13.3 连续性与回归

- 第三转最终盘面 A 经过升级场景后仍显示 A；
- 若结算把 A 变为 B，下一班显示 B；
- 真正重开新局不显示上局盘面；
- 改动前后同一种子的下一转 `ReelDraw`、RNG、余额和全部规则状态一致，排除明确新增的审计字段。

### 13.4 UI

- 320、390、430px 宽度下账本入口、抽屉、升级卡和班末小票无横向溢出；
- 所有可点击控件至少 44px，有可见键盘焦点；
- 抽屉打开后焦点受控，关闭后返回入口；
- 减弱动态模式无滚动数字、摇屏和脉冲闪烁，但金额、中奖线和因果仍完整。

## 14. 真人试玩验收

自动测试不能证明“看懂了”或“更刺激”。本轮完成后至少进行一次手机宽度真人试玩，并确认：

1. 随机抽一转，玩家能根据小票复述扣款、每条线、部件追加和最终余额；
2. 水果沙拉触发时，玩家能立即指出命中的是哪条支付线；
3. 逐笔跳钱有期待和落点，但普通结算不会拖慢下一拉；
4. 跨班看到上一盘面时感到连续，而不是误以为 RNG 被固定；
5. 升级卡首屏能在数秒内读懂，必要的不可逆代价没有被隐藏；
6. 账本像酒店前台小票，而不是占据主循环的财务软件。

## 15. 推荐实施顺序

1. schema v2、`PendingSpin` 元数据、`SpinReceipt`、存档迁移与守恒测试；
2. `PATTERN_LINE_WIN`、水果沙拉单线事件与固定种子回归；
3. 表现层递增金额、HUD 显示余额和四种演出路径；
4. 账本抽屉与跨班最终盘面；
5. 升级卡详情分层、班末小票和整局报告改写；
6. 响应式、无障碍、完整自动化与真人试玩验收。
