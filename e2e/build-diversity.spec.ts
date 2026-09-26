import { expect, test, type Page } from "@playwright/test";
import { createRun } from "../src/core/run";
import type { RunState, SymbolId } from "../src/core/types";

const solid = (symbol: SymbolId): RunState["reels"] => [Array(12).fill(symbol), Array(12).fill(symbol), Array(12).fill(symbol)];
async function load(page: Page, patch: Partial<RunState>) {
  const state: RunState = { ...createRun(8), phase: "READY_TO_SPIN", service: "kitchen", bankroll: 2000, ...patch };
  await page.goto("/");
  await page.evaluate((fixture) => {
    // This storage belongs only to Playwright's isolated context, never the player's tab.
    localStorage.clear();
    localStorage.setItem("midnight-lucky-hotel.run.v2", JSON.stringify(fixture));
    localStorage.setItem("midnight-lucky-hotel.reduce-flash", "1");
  }, state);
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
}
async function spin(page: Page) {
  await page.getByRole("button", { name: "拉动老虎机", exact: true }).click();
  await page.getByRole("button", { name: "收下这把", exact: true }).click();
  await expect(page.getByRole("region", { name: "结算演出队列" })).toHaveCount(0);
}
async function saved(page: Page): Promise<RunState> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("midnight-lucky-hotel.run.v2")!));
}
test("phone: delayed meal and third harvest settle, reload, and verify the archive", async ({ page }, info) => {
  await load(page, { baseSpinsInShift: 1, reels: solid("lemon"), counters: { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 2 },
    partSlots: [{ id: "lemon-infection", level: 2 }, { id: "harvest-vat", level: 2 }, null, null, null] });
  await expect(page.getByText(/陈酿果桶 · 存酿 2\/3/)).toBeVisible();
  await page.getByRole("button", { name: "购买食物（¥7.5）", exact: true }).click();
  await page.screenshot({ path: info.outputPath("harvest-ready.png"), fullPage: true });
  await spin(page);
  expect((await saved(page)).counters.harvestCharge).toBe(0);
  expect((await saved(page)).spinHistory.at(-1)!.awards.some((award) => award.kind === "part-bonus" && award.partId === "harvest-vat")).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("button", { name: "完整日志", exact: true }).click();
  await page.getByRole("button", { name: "核验记录一致性", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("核验通过");
});
test("phone: player lights candle and collects its bonus; flywheel prevents damage", async ({ page }, info) => {
  await load(page, { service: "chapel", omen: 3, tips: 3, reels: solid("blank"),
    partSlots: [{ id: "votive-candle", level: 2 }, null, null, null, null] });
  await page.getByRole("button", { name: "点燃还愿烛台（1 小费）", exact: true }).click();
  await expect(page.getByRole("button", { name: "点燃还愿烛台（1 小费）", exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: info.outputPath("candle-ready-320.png"), fullPage: true });
  await spin(page);
  const candle = await saved(page);
  expect(candle.tips).toBe(2); expect(candle.counters.votiveCharge).toBe(0);
  expect(candle.spinHistory.at(-1)!.totalPayout).toBe(120);

  await load(page, { service: "security", reels: [["crack"], ["blank"], ["blank"]],
    partSlots: [{ id: "shock-absorber", level: 2 }, { id: "blank-capacitor", level: 1 }, null, null, null] });
  await spin(page);
  const fault = await saved(page);
  expect(fault.spinHistory.at(-1)!.awards.some((award) => award.kind === "part-bonus" && award.partId === "shock-absorber" && award.amount === 30)).toBe(true);
  await page.screenshot({ path: info.outputPath("flywheel-result-320.png"), fullPage: true });
});
