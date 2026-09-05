import { describe, expect, it } from "vitest";
import {
  SERVICE_PRESENTATIONS,
  describeEquippedPart,
  describeUpgrade
} from "@/content/player-copy";
import { UPGRADE_IDS, UPGRADES } from "@/content/upgrades";
import { drawReels } from "@/core/reels";
import { createRun, dispatchCommand } from "@/core/run";
import type { MachineEstimate } from "@/sim/types";
import type { PartId, PartInstance, RunState, ServiceId, UpgradeId } from "@/core/types";

const PART_IDS = UPGRADE_IDS.filter((id): id is PartId => UPGRADES[id].kind === "part");

const DECISION_COPY: Readonly<Record<UpgradeId, readonly [string, string | null, string | null]>> = {
  "lemon-crate": ["选两轮，各加入 2 个柠檬", null, "两轮永久变长"],
  "cherry-pitter": ["把一轮的 1 个其他图案换成樱桃", "百搭不能替换", "被替换图案永久减少"],
  "lemon-infection": ["柠檬中奖后，把线外图案变成柠檬并重算", "每转首次柠檬线", null],
  "jam-jar": ["本班樱桃线越多，后续奖励越高", "第一条只充能", null],
  "fruit-salad": ["樱桃 + 柠檬 + 铃铛同线，额外 1.5×下注", "百搭不算", null],
  leftovers: ["本班第 1 份食物回到最短轮", "需要深夜厨房", "最短轮会变长"],
  "seven-purification": ["把一轮的 1 个樱桃或柠檬换成幸运7", "目标轮必须有水果", "被替换水果永久减少"],
  "tithe-box": ["付 ¥10，向一轮加入幸运7并获得 1 恶兆", null, "立即支付 ¥10，转轮变长"],
  "omen-collector": ["幸运7中奖时，把全部恶兆换成奖励", "每转首次幸运7线", null],
  "triple-blessing": ["首次幸运7线复制 1 次", "每转一次", "每轮永久加入 1 个空白"],
  "midnight-bell": ["首次铃铛线把铃铛变百搭并重算", "必须有字面铃铛", null],
  "martyr-coin": ["献祭余额，本班幸运7线额外复制", "首转前启用", "启用时立即失去向上取整的 10% 余额"],
  "artificial-crack": ["向一轮加入裂纹，下班专注上限 +1", null, "永久加入 1 个裂纹"],
  "scrap-magnet": ["裂纹同线，奖励 2×下注并移除它们", "必须是实体裂纹", null],
  "loose-spring": ["踹击前进 2 格并制造 2 个裂纹", "需要保安室", "每次踹击永久加入 2 裂纹"],
  "blank-capacitor": ["累计 3 个可见空白，获得 1 次免费转", "余数保留", null],
  "warranty-fraud": ["其他部件首次被裂纹禁用，奖励 3×下注", "自己失效不算", null],
  "overload-motor": ["从第 2 个连锁效果起，每个奖励 0.25×下注", "第 6 个效果还会损伤机器", "第 6 个效果使每轮永久 +1 裂纹"],
  "pruning-shears": ["从长轮删除 1 个非百搭图案", "轮长必须大于 6", "所选图案永久减少"],
  "carbon-copy": ["向一轮加入 2 个指定基础图案", "只能复制基础图案", "转轮永久变长"],
  "safety-fuse": ["余额不足最低下注时自动补 ¥20", "触发后消耗", "一次性部件"],
  calculator: ["显示每轮精确符号概率", null, null],
  ledger: ["显示模拟 RTP 和风险带", "信息是模拟估算", null],
  "statistics-terminal": ["显示破产概率、波动和可承受转数", "信息是模拟估算", null]
};

const STATIC_FACTS: Readonly<Record<UpgradeId, readonly string[]>> = {
  "lemon-crate": ["两个不同转轮", "各永久加入 2 个柠檬"],
  "cherry-pitter": ["选定转轮", "1 个非樱桃、非百搭", "替换为樱桃"],
  "lemon-infection": ["每转第一条柠檬中奖线", "线外", "重新检查中奖线"],
  "jam-jar": ["每条樱桃中奖线", "此前樱桃中奖线数 × 0.5 × 当前下注"],
  "fruit-salad": ["樱桃＋柠檬＋铃铛", "1.5 × 当前下注", "百搭不能代替"],
  leftovers: ["本班第一次被消耗的食物", "当前最短转轮"],
  "seven-purification": ["选定转轮", "1 个樱桃或柠檬", "替换为幸运7"],
  "tithe-box": ["支付 ¥10", "加入 1 个幸运7", "获得 1 层恶兆"],
  "omen-collector": ["第一条幸运7中奖线", "全部恶兆", "恶兆层数 × 0.5 × 当前下注"],
  "triple-blessing": ["第一条幸运7中奖线", "复制其赔付 1 次", "每个转轮加入 1 个空白"],
  "midnight-bell": ["第一条铃铛中奖线", "第一个字面铃铛变成百搭", "重新检查中奖线"],
  "martyr-coin": ["第一次基础转动前", "向上取整的 10% 余额", "每条幸运7中奖线复制 1 次"],
  "artificial-crack": ["1 个永久裂纹", "下一班专注上限 +1"],
  "scrap-magnet": ["字面裂纹连线", "2 × 当前下注", "移除组成连线的实体裂纹"],
  "loose-spring": ["踹击改为前进 2 格", "增加 2 个永久裂纹"],
  "blank-capacitor": ["每累计 3 个可见实体空白", "1 次免费转动", "余数保留"],
  "warranty-fraud": ["本班第一次有其他部件因裂纹失效", "3 × 当前下注"],
  "overload-motor": ["第 2 个核心连锁效果起", "0.25 × 当前下注", "第 6 个", "每轮加入 1 个裂纹"],
  "pruning-shears": ["长度大于 6", "移除 1 个选定的非百搭", "不会短于 6"],
  "carbon-copy": ["选定转轮", "永久加入 2 个", "基础符号"],
  "safety-fuse": ["低于最低下注", "消耗", "¥20"],
  calculator: ["每个转轮", "精确符号概率"],
  ledger: ["保留符号概率", "估算 RTP", "95% 区间"],
  "statistics-terminal": ["波动", "破产概率", "可承受转动次数"]
};

const LEVEL_TWO_FACTS: Readonly<Record<PartId, readonly string[]>> = {
  "lemon-infection": ["2 个", "重新检查"],
  "jam-jar": ["1 × 当前下注"],
  "fruit-salad": ["2.5 × 当前下注"],
  leftovers: ["前 2 份"],
  "omen-collector": ["1 × 当前下注"],
  "triple-blessing": ["复制 2 次", "每个转轮加入 2 个空白"],
  "midnight-bell": ["前 2 个字面铃铛"],
  "martyr-coin": ["复制 2 次"],
  "scrap-magnet": ["4 × 当前下注"],
  "loose-spring": ["前进 3 格", "仍增加 2 个永久裂纹"],
  "blank-capacitor": ["每 2 个"],
  "warranty-fraud": ["6 × 当前下注"],
  "overload-motor": ["0.5 × 当前下注"],
  "safety-fuse": ["¥40"]
};

function upgradeState(patch: Partial<RunState> = {}): RunState {
  return {
    ...createRun(71),
    phase: "CHOOSING_UPGRADE",
    service: "kitchen",
    currentCandidates: { synergy: "lemon-crate", pivot: "cherry-pitter", wildcard: "jam-jar" },
    ...patch
  };
}

function estimate(rtpMean: number): MachineEstimate {
  return {
    band: "near-break-even",
    symbolProbabilities: null,
    rtpMean,
    rtp95: [rtpMean - 0.05, rtpMean + 0.05],
    payoutStandardDeviation: null,
    ruinProbability: null,
    expectedAffordableSpins: null
  };
}

describe("player-facing content", () => {
  it("explains all four services with their actual action, two synergies, and a concrete cost", () => {
    const ids = Object.keys(SERVICE_PRESENTATIONS) as ServiceId[];
    expect(ids).toEqual(["repair", "kitchen", "chapel", "security"]);
    for (const id of ids) {
      const presentation = SERVICE_PRESENTATIONS[id];
      expect(presentation.name).not.toBe("");
      expect(presentation.identity).not.toBe("");
      expect(presentation.action).not.toBe("");
      expect(presentation.synergies.split("＋")).toHaveLength(2);
      expect(presentation.risk).not.toBe("");
    }

    expect(SERVICE_PRESENTATIONS.repair.action).toContain("每班 3 点专注");
    expect(SERVICE_PRESENTATIONS.repair.risk).toContain("1 枚小费");
    expect(SERVICE_PRESENTATIONS.kitchen.action).toContain("支付 ¥10");
    expect(SERVICE_PRESENTATIONS.kitchen.action).toContain("之后 3 次转动的全部赔付 +25%");
    expect(SERVICE_PRESENTATIONS.chapel.action).toContain("消耗 1 点专注");
    expect(SERVICE_PRESENTATIONS.chapel.risk).toContain("本转唯一一次干预");
    expect(SERVICE_PRESENTATIONS.security.action).toContain("确定性");
    expect(SERVICE_PRESENTATIONS.security.action).toContain("占用本转唯一一次干预");
    expect(SERVICE_PRESENTATIONS.security.action).toContain("永久裂纹");
  });

  it("gives all 24 upgrades complete factual copy and every part a numerical L2 delta", () => {
    expect(UPGRADE_IDS).toHaveLength(24);
    expect(PART_IDS).toHaveLength(14);
    const state = upgradeState();

    for (const id of UPGRADE_IDS) {
      const presentation = describeUpgrade(state, id);
      expect(presentation.id).toBe(id);
      expect(presentation.name).toBe(UPGRADES[id].name);
      expect(presentation.kindLabel).not.toBe("");
      expect(presentation.routeLabel).not.toBe("");
      expect([presentation.decisionEffect, presentation.triggerCondition, presentation.immediateCost]).toEqual(DECISION_COPY[id]);
      expect(presentation.currentImpact).not.toBe("");
      expect(presentation.synergy).not.toBe("");
      expect(presentation.risk).not.toBe("");
      for (const fact of STATIC_FACTS[id]) expect(presentation.effect).toContain(fact);

      if (UPGRADES[id].kind === "part") {
        expect(presentation.levelTwoEffect).not.toBeNull();
        for (const fact of LEVEL_TWO_FACTS[id as PartId]) {
          expect(presentation.levelTwoEffect).toContain(fact);
        }
      } else {
        expect(presentation.levelTwoEffect).toBeNull();
      }
    }
  });

  it("shows literal target counts and lengths but gates exact probability and estimated RTP", () => {
    const target = { kind: "two-reels", reels: [0, 1] } as const;
    const estimates = { before: estimate(0.9), after: estimate(1.1) };

    const noTool = describeUpgrade(upgradeState(), "lemon-crate", target, estimates);
    expect(noTool.currentImpact).toContain("第1轮：柠檬 3 → 5；总长度 12 → 14");
    expect(noTool.currentImpact).toContain("抽到柠檬的机会提高");
    expect(noTool.currentImpact).not.toMatch(/%|RTP|估算/);

    const calculator = describeUpgrade(upgradeState({ toolLevel: 1 }), "lemon-crate", target, estimates);
    expect(calculator.currentImpact).toContain("概率 25.0% → 35.7%");
    expect(calculator.currentImpact).not.toMatch(/RTP|估算/);

    const ledger = describeUpgrade(upgradeState({ toolLevel: 2 }), "lemon-crate", target, estimates);
    expect(ledger.currentImpact).toContain("估算 RTP 90.0% → 110.0%");
    expect(ledger.currentImpact).not.toContain("精确 RTP");
  });

  it("reports live counters, costs, payouts, and status from the current wager", () => {
    const state = upgradeState({
      bankroll: 101,
      betMode: "aggressive",
      omen: 4,
      counters: { cherryWinsThisShift: 3, blankCharge: 2 },
      shiftFlags: {
        ...createRun(71).shiftFlags,
        returnedFoodCount: 1,
        kickUsed: true,
        warrantyPaid: true
      }
    });
    const cases: readonly [PartInstance, readonly string[]][] = [
      [{ id: "jam-jar", level: 1 }, ["本班已有 3 条樱桃中奖线", "下一条额外赔付 ¥30"]],
      [{ id: "leftovers", level: 2 }, ["本班还可返回 1 份食物"]],
      [{ id: "omen-collector", level: 2 }, ["当前 4 层恶兆", "可额外赔付 ¥80"]],
      [{ id: "blank-capacitor", level: 1 }, ["当前蓄能 2/3", "还差 1 个实体空白"]],
      [{ id: "warranty-fraud", level: 1 }, ["本班已经赔付"]],
      [{ id: "loose-spring", level: 2 }, ["本班踹击已使用", "前进 3 格", "增加 2 个永久裂纹"]],
      [{ id: "safety-fuse", level: 1 }, ["最低下注 ¥5", "余额尚未触发"]]
    ];

    for (const [part, facts] of cases) {
      const presentation = describeEquippedPart(state, part);
      for (const fact of facts) expect(presentation.currentImpact).toContain(fact);
    }

    const rescue = describeEquippedPart({
      ...state,
      bankroll: 4,
      partSlots: [{ id: "safety-fuse", level: 1 }, null, null, null, null]
    }, { id: "safety-fuse", level: 1 });
    expect(rescue.currentImpact).toContain("低于最低下注 ¥5");
    expect(rescue.currentImpact).toContain("将消耗并救援 ¥20");
  });

  it("preserves an L1 capacitor's two banked blanks when the real controller upgrades it to L2", () => {
    const state = upgradeState({
      currentCandidates: {
        synergy: "blank-capacitor",
        pivot: "cherry-pitter",
        wildcard: "calculator"
      },
      counters: { cherryWinsThisShift: 0, blankCharge: 2 },
      partSlots: [{ id: "blank-capacitor", level: 1 }, null, null, null, null]
    });
    const upgraded = dispatchCommand(state, {
      type: "CHOOSE_UPGRADE",
      choice: { id: "blank-capacitor", action: "apply" }
    });
    expect(upgraded.ok).toBe(true);
    if (!upgraded.ok) throw new Error(upgraded.error.message);
    expect(upgraded.state.partSlots[0]).toEqual({ id: "blank-capacitor", level: 2 });
    expect(upgraded.state.counters.blankCharge).toBe(2);

    const presentation = describeEquippedPart(upgraded.state, upgraded.state.partSlots[0]!);
    expect(presentation.currentImpact).toContain("当前蓄能 2/2");
    expect(presentation.currentImpact).toContain("待结算 1 次免费转动");
    expect(presentation.currentImpact).toContain("下一次未失效的已接受盘面");
    expect(presentation.currentImpact).not.toContain("当前蓄能 0/2");
    expect(presentation.currentImpact).not.toContain("还差 2 个");
  });

  it("distinguishes martyr availability, completed payment, and a missed activation window", () => {
    const available: RunState = {
      ...createRun(72),
      phase: "READY_TO_SPIN",
      service: "chapel",
      bankroll: 101,
      partSlots: [{ id: "martyr-coin", level: 1 }, null, null, null, null]
    };
    const before = describeEquippedPart(available, available.partSlots[0]!);
    expect(before.currentImpact).toContain("现在可以献祭");
    expect(before.currentImpact).toContain("献祭成本 ¥11");

    const enabled = dispatchCommand(available, { type: "ENABLE_MARTYR" });
    expect(enabled.ok).toBe(true);
    if (!enabled.ok) throw new Error(enabled.error.message);
    expect(enabled.state.bankroll).toBe(90);
    const after = describeEquippedPart(enabled.state, enabled.state.partSlots[0]!);
    expect(after.currentImpact).toContain("本班已经献祭");
    expect(after.currentImpact).toContain("不会再次扣款");
    expect(after.currentImpact).not.toMatch(/当前献祭成本|¥9/);

    const missed = describeEquippedPart({ ...available, baseSpinsInShift: 1 }, available.partSlots[0]!);
    expect(missed.currentImpact).toContain("已经错过本班献祭窗口");
    expect(missed.currentImpact).not.toContain("献祭成本");
  });

  it("states when a below-minimum fuse will be consumed in ready and resolving phases", () => {
    const ready: RunState = {
      ...createRun(73),
      phase: "READY_TO_SPIN",
      service: "repair",
      bankroll: 4,
      partSlots: [{ id: "safety-fuse", level: 1 }, null, null, null, null]
    };
    const readyCopy = describeEquippedPart(ready, ready.partSlots[0]!);
    expect(readyCopy.currentImpact).toContain("下次尝试付费转动时将消耗并救援 ¥20");

    const resolving: RunState = {
      ...ready,
      phase: "RESOLVING_EFFECTS",
      pendingSpin: { draw: drawReels(ready.reels, ready.rng), isFree: false, bankrollBefore: 14, wager: 10 }
    };
    const resolvingCopy = describeEquippedPart(resolving, resolving.partSlots[0]!);
    expect(resolvingCopy.currentImpact).toContain("本次演出完成时将自动消耗并救援 ¥20");
    expect(resolvingCopy.currentImpact).not.toContain("下次尝试付费转动");
  });
});
