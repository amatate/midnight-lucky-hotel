import { expect, test, type Page } from "@playwright/test";
import { createRun } from "../src/core/run";
import type { RunState } from "../src/core/types";

async function resume(page: Page) {
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏" }).click();
}
async function pull(page: Page) {
  await page.getByRole("button", { name: "拉动老虎机", exact: true }).click();
  await page.getByRole("button", { name: "收下这把", exact: true }).click();
  await page.getByRole("button", { name: "直接结算", exact: true }).click();
  await expect(page.getByRole("region", { name: "当前决策" })).not.toHaveAttribute("data-phase", "RESOLVING_EFFECTS");
}
test("blessing: visible temporary cost survives reload, clears next shift and replays", async ({ page }, testInfo) => {
  // This synthetic checkpoint lives only in Playwright's fresh storage, never the player's Chrome profile.
  const state: RunState = { ...createRun(8), phase: "READY_TO_SPIN", service: "repair", bankroll: 1000,
    reels: [Array(12).fill("seven"), Array(12).fill("seven"), Array(12).fill("seven")],
    partSlots: [{ id: "triple-blessing", level: 2 }, null, null, null, null] };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate((fixture) => {
    localStorage.setItem("midnight-lucky-hotel.run.v2", JSON.stringify(fixture));
    localStorage.removeItem("midnight-lucky-hotel.archives.v1");
  }, state);
  await page.reload();
  await resume(page);
  await pull(page);
  await expect(page.getByRole("region", { name: "本局状态" })).toContainText("本班空白 1");
  await page.getByRole("button", { name: "了解本班临时空白" }).click();
  const help = page.getByRole("dialog", { name: "本班临时空白" });
  await expect(help).toContainText("下一班／下一段自动清除");
  await expect(help).toContainText("不是永久改轮");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("blessing-cost-mobile.png") });
  await page.getByRole("button", { name: "关闭说明" }).click();
  await page.reload();
  await resume(page);
  await expect(page.getByRole("region", { name: "本局状态" })).toContainText("本班空白 1");
  await pull(page); await pull(page);
  await page.getByRole("button", { name: "放弃升级", exact: true }).click();
  await expect(page.getByRole("button", { name: "了解本班临时空白" })).toHaveCount(0);
  await page.getByRole("button", { name: "完整日志", exact: true }).click();
  await page.getByRole("button", { name: "核验记录一致性" }).click();
  await expect(page.getByRole("status")).toContainText("核验通过");
});
