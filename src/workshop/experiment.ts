import type { GameCommand } from "@/core/commands";
import { roundMoney } from "@/core/progression";
import { createRun, dispatchCommand } from "@/core/run";
import type { PartId, RunState, SpinReceipt } from "@/core/types";
import { RULES_VERSION } from "@/persistence/archives";
import { isBlueprint, type Blueprint } from "@/workshop/blueprints";

export const EXPERIMENT_BET = 10;
export const MAX_EXPERIMENT_SPINS = 96;

export interface ExperimentReport {
  readonly seed: number;
  readonly rulesVersion: string;
  readonly paidSpins: number;
  readonly freeSpins: number;
  readonly totalWager: number;
  readonly totalPayout: number;
  readonly net: number;
  readonly winningSpins: number;
  /** Directly attributed bonuses; does not pretend to allocate every causal synergy. */
  readonly partIncome: Partial<Readonly<Record<PartId, number>>>;
  readonly spins: readonly SpinReceipt[];
  readonly warnings: readonly string[];
  readonly warningsEn: readonly string[];
  readonly truncated: boolean;
}

function command(state: RunState, action: GameCommand): RunState {
  const result = dispatchCommand(state, action);
  if (!result.ok) throw new Error(`试机中止：${action.type} · ${result.error.message}`);
  return result.state;
}

/**
 * Passive, fixed-stake laboratory, not an RTP estimate or a prediction of a saved run.
 * Only the recipe enters this function. No official wallet, RNG, counters, prayers,
 * pending board, archive, stay payment or collection progress can enter or be written.
 */
export function runExperiment(
  blueprint: Blueprint,
  seed: number,
  paidSpins = 12,
  options: { readonly allowCurrentRules?: boolean } = {}
): ExperimentReport {
  if (!isBlueprint(blueprint)) throw new Error("无法试机：构筑格式无效。");
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error("试机种子须为 0–4294967295 的整数。");
  if (!Number.isInteger(paidSpins) || paidSpins < 1 || paidSpins > 24) throw new Error("试机次数须为 1–24 次付费转。");
  const outdated = blueprint.rulesVersion !== RULES_VERSION;
  if (outdated && !options.allowCurrentRules) throw new Error("收藏来自其他规则版本；请明确选择按当前规则复试，旧结果不会被重现。");
  const warnings = [
    "独立小样本试机，不是长期 RTP，也不会预测正式局的下一转。",
    "固定下注 ¥10；每 3 次付费转休息一次；清空蓄力与临时效果，不点餐、不祈祷、不手动干预，不购买升级。",
    "实验余额充足，不模拟破产、房间限制或房费；主动型部件和安全保险丝的价值不会完整体现。"
  ];
  const warningsEn = [
    "This independent, small-sample test is not a long-term RTP estimate or a prediction of your next official spin.",
    "Fixed ¥10 bets, with a break after every 3 paid spins. Charges and temporary effects start empty. No meals, prayers, manual interventions or upgrades are used.",
    "The lab has ample funds: bankruptcy, room restrictions and rent are not simulated. Active parts and the safety fuse cannot show their full value here."
  ];
  if (outdated) {
    warnings.push("此收藏已明确按当前规则重测，未改写原收藏，不能与旧版结果视为同规则复现。");
    warningsEn.push("This older blueprint was explicitly retested under current rules. The saved blueprint is unchanged; this is not a reproduction of its old-rule results.");
  }
  const maximum = blueprint.service === "repair" ? 3 : 2;
  let state: RunState = {
    ...createRun(seed),
    // Retain the core's post-initialization RNG, including for the valid seed 0.
    phase: "READY_TO_SPIN",
    bankroll: 1_000_000, blockStartBankroll: 1_000_000,
    reels: blueprint.reels.map((strip) => [...strip]) as unknown as RunState["reels"],
    partSlots: blueprint.partSlots.map((part) => part === null ? null : { ...part }) as unknown as RunState["partSlots"],
    service: blueprint.service, interventionPoints: maximum, maxInterventionPoints: maximum,
    // Overtime enables as many three-pull blocks as requested; the lab explicitly
    // normalizes its stake after each real CONTINUE instead of applying hotel inflation.
    afterHoursLevel: 1, freeAfterHoursLevel: 0, exitUnlocked: true,
    baseBet: EXPERIMENT_BET, contract: null, counters: { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 0, votiveCharge: 0 }
  };
  const spins: SpinReceipt[] = [];
  let paid = 0;
  let truncated = false;
  while (paid < paidSpins || state.freeSpinQueue > 0) {
    if (spins.length >= MAX_EXPERIMENT_SPINS) {
      truncated = true;
      warnings.push(`达到 ${MAX_EXPERIMENT_SPINS} 次总转安全上限；报告只统计已完成转，剩余免费转未计入。`);
      warningsEn.push(`The ${MAX_EXPERIMENT_SPINS}-spin safety limit was reached. Only completed spins are counted; remaining free spins are excluded.`);
      break;
    }
    if (state.phase === "AFTER_HOURS") {
      if (state.currentCandidates !== null) state = command(state, { type: "DECLINE_UPGRADE" });
      state = command(state, { type: "CONTINUE" });
      state = { ...state, freeAfterHoursLevel: 0, contract: null };
    }
    if (state.phase !== "READY_TO_SPIN") throw new Error(`试机中止：出现非预期状态 ${state.phase}。`);
    state = command(state, { type: "SPIN" });
    state = command(state, { type: "REELS_STOPPED" });
    state = command(state, { type: "ACCEPT_OUTCOME" });
    const receipt = state.spinHistory.at(-1);
    if (receipt === undefined) throw new Error("试机中止：缺少结算收据。");
    spins.push(receipt);
    if (!receipt.isFree) paid += 1;
    state = command(state, { type: "PRESENTATION_COMPLETE" });
  }
  const totalWager = roundMoney(spins.reduce((sum, spin) => sum + spin.wager, 0));
  const totalPayout = roundMoney(spins.reduce((sum, spin) => sum + spin.totalPayout, 0));
  const partIncome: Partial<Record<PartId, number>> = {};
  for (const spin of spins) for (const award of spin.awards) {
    if (award.kind === "part-bonus" || award.kind === "pattern-line") {
      partIncome[award.partId] = roundMoney((partIncome[award.partId] ?? 0) + award.amount);
    }
  }
  return {
    seed, rulesVersion: RULES_VERSION, paidSpins: paid, freeSpins: spins.length - paid,
    totalWager, totalPayout, net: roundMoney(totalPayout - totalWager),
    winningSpins: spins.filter((spin) => spin.totalPayout > 0).length,
    partIncome, spins, warnings, warningsEn, truncated
  };
}
