import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { getBuildFit } from "@/app/build-fit";
import { describeEquippedPart, describeUpgrade } from "@/app/player-copy";
import { routeReadiness } from "@/app/route-readiness";
import { UpgradeStrategyDetails } from "@/app/components/UpgradeStrategyDetails";
import { getBuildFit as ruleFit } from "@/content/build-fit";
import { describeUpgrade as ruleCopy } from "@/content/player-copy";
import { UPGRADE_IDS } from "@/content/upgrades";
import { createRun } from "@/core/run";
import type { RunState, ServiceId } from "@/core/types";
import { setLanguage } from "@/i18n/language";
import { translate } from "@/i18n/translate";

afterEach(() => { cleanup(); setLanguage("zh", false); });
const examples = (): RunState[] => {
  const base = createRun(8);
  const services: ServiceId[] = ["repair", "kitchen", "chapel", "security"];
  return [
    ...services.map((service): RunState => ({ ...base, service })),
    { ...base, service: "kitchen", partSlots: [{ id: "harvest-vat", level: 2 }, { id: "lemon-infection", level: 1 }, null, null, null],
      counters: { ...base.counters, harvestCharge: 2 } },
    { ...base, service: "kitchen", partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null] },
    { ...base, service: "chapel", omen: 2, tips: 1, partSlots: [{ id: "votive-candle", level: 1 }, null, null, null, null] },
    { ...base, service: "chapel", partSlots: [{ id: "votive-candle", level: 2 }, null, null, null, null],
      counters: { ...base.counters, votiveCharge: 3 } },
    { ...base, service: "security", reels: [[...base.reels[0], "crack"], [...base.reels[1], "crack"], [...base.reels[2], "crack"]],
      partSlots: [{ id: "shock-absorber", level: 1 }, null, null, null, null] }
  ];
};

it("changes display wording without changing availability, fit classification or the run", () => {
  for (const state of examples()) {
    const before = structuredClone(state);
    for (const id of UPGRADE_IDS) {
      const display = describeUpgrade(state, id);
      const rules = ruleCopy(state, id);
      expect(display.id).toBe(rules.id);
      expect(display.name).toBe(rules.name);
      expect(display.available).toBe(rules.available);
      expect(display.targetHint).toBe(rules.targetHint);
      expect(getBuildFit(state, id).kind).toBe(ruleFit(state, id).kind);
    }
    expect(state).toEqual(before);
  }
});

it("keeps costs, caps, timing and chance limitations explicit in plain language", () => {
  const state = createRun(8);
  expect(describeUpgrade(state, "jam-jar").effect).toContain("最高每条多奖3倍");
  expect(describeUpgrade(state, "jam-jar").levelTwoEffect).toContain("最高多奖6倍");
  expect(describeUpgrade(state, "blank-capacitor").risk).toContain("7个空白：送1次免费转，剩1个");
  expect(describeUpgrade(state, "artificial-crack").triggerCondition).toContain("不能超过客房上限");
  expect(describeUpgrade(state, "overload-motor").immediateCost).toContain("第6个");
  expect(describeUpgrade(state, "votive-candle").risk).toContain("点烛时就扣掉");
  expect(describeUpgrade(state, "calculator").triggerCondition).toContain("不提高中奖率");
  expect(describeUpgrade(state, "warranty-fraud").triggerCondition).toContain("每班只赔一次");
  expect(describeEquippedPart(state, { id: "jam-jar", level: 2 }).effect).toBe(describeUpgrade(state, "jam-jar").effect);
});

it("translates contextual route and build advice, including charged and damaged machines", () => {
  setLanguage("en", false);
  for (const state of examples()) {
    for (const text of Object.values(routeReadiness(state))) {
      expect(translate(text), text).not.toMatch(/\p{Script=Han}/u);
    }
    for (const id of UPGRADE_IDS) {
      const text = getBuildFit(state, id).text;
      expect(translate(text), text).not.toMatch(/\p{Script=Han}/u);
    }
  }
});

it("also translates L2 details after the UI strips the level prefix", () => {
  setLanguage("en", false);
  for (const id of UPGRADE_IDS) {
    const presentation = describeUpgrade(createRun(8), id);
    const { container, unmount } = render(<UpgradeStrategyDetails presentation={presentation} levelLabel="L1 → L2" />);
    expect(container.textContent, id).not.toMatch(/\p{Script=Han}/u);
    unmount();
  }
});
