import { expect, test, type Page } from "@playwright/test";
import { createLegacyRun as createRun } from "../tests/fixtures/legacy-run";
import type { RunState } from "../src/core/types";

async function pull(page: Page): Promise<void> {
  await page.getByRole("button", { name: "拉动老虎机", exact: true }).click();
  await page.getByRole("button", { name: "收下这把", exact: true }).click();
  await page.getByRole("button", { name: "直接结算", exact: true }).click();
  await expect(page.getByRole("region", { name: "当前决策" })).not.toHaveAttribute("data-phase", "RESOLVING_EFFECTS");
}

test("stage three: disclosed room, tip upgrade, immediate meal, recovery and recorded room win", async ({ page }, testInfo) => {
  // Synthetic checkpoint, not a player's run. The isolated context never accesses Chrome's profile.
  const fixture: RunState = {
    ...createRun(8), phase: "SHIFT_COMPLETE", service: "kitchen", shift: 5, baseSpinsInShift: 3,
    bankroll: 1000, exitUnlocked: true, tips: 3,
    reels: [Array(12).fill("cherry"), Array(12).fill("cherry"), Array(12).fill("cherry")],
    partSlots: [{ id: "jam-jar", level: 1 }, { id: "cherry-press", level: 1 }, null, null, null],
    acquiredUpgrades: ["jam-jar", "cherry-press"]
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate((state) => {
    localStorage.setItem("midnight-lucky-hotel.run.v2", JSON.stringify(state));
    localStorage.removeItem("midnight-lucky-hotel.archives.v1");
  }, fixture);
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏" }).click();
  await expect(page.getByRole("region", { name: "升房挑战" })).toContainText("赔付目标 ¥3600");
  await page.screenshot({ path: testInfo.outputPath("room-choices-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "升房挑战 · 花园房", exact: true }).click();
  await expect(page.getByRole("region", { name: "客房进度" })).toContainText("当段赔付 ¥0 / ¥450");
  await expect(page.getByRole("button", { name: "激进", exact: true })).toBeDisabled();
  await page.getByText("小费精修 · 3 枚小费", { exact: true }).click();
  await page.getByRole("button", { name: "果酱罐 → L2（3 小费）", exact: true }).click();
  const savedBeforeHelp = await page.evaluate(() => localStorage.getItem("midnight-lucky-hotel.archives.v1"));
  await page.getByRole("button", { name: "了解购买食物" }).click();
  const mealHelp = page.getByRole("dialog", { name: "购买食物" });
  await expect(mealHelp).toContainText("立即支付 ¥18.75");
  await expect(mealHelp).toContainText("3 转适用赔付 +50%");
  await expect(page.locator("#root")).toHaveJSProperty("inert", true);
  await page.screenshot({ path: testInfo.outputPath("meal-help-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(page.locator("#root")).toHaveJSProperty("inert", false);
  expect(await page.evaluate(() => localStorage.getItem("midnight-lucky-hotel.archives.v1"))).toBe(savedBeforeHelp);
  await expect(page.getByRole("button", { name: "了解购买食物" })).toBeFocused();
  await page.getByRole("button", { name: "玩法与术语" }).click();
  await page.getByRole("dialog").getByText("专注、裂纹、恶兆……这些资源有什么用？", { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("废料磁铁、保修欺诈免疫裂纹");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const guideBox = await page.getByRole("dialog").boundingBox();
  expect(guideBox!.height).toBeLessThanOrEqual(724);
  await expect(page.getByRole("button", { name: "关闭说明" })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("guide-mobile.png") });
  await page.getByRole("button", { name: "关闭说明" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "购买食物（¥18.75）", exact: true }).click();
  await expect(page.getByRole("region", { name: "食物加成" })).toContainText("当前合计 +50%");
  await page.getByRole("region", { name: "食物加成" }).screenshot({ path: testInfo.outputPath("meal-buff.png") });
  await pull(page);
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏" }).click();
  await expect(page.getByRole("region", { name: "客房进度" })).toContainText("花园房");
  await expect(page.locator('[data-counter="bet"]')).toContainText("¥25");
  await pull(page);
  await pull(page);
  await expect(page.getByRole("region", { name: "客房挑战结果" })).toContainText("挑战成功");
  await page.getByRole("button", { name: "放弃升级", exact: true }).click();
  await expect(page.getByRole("button", { name: "升房挑战 · 景观房", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath("room-cleared-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "完整日志", exact: true }).click();
  await page.getByRole("button", { name: "核验记录一致性" }).click();
  await expect(page.getByRole("status")).toContainText("核验通过");
  await expect(page.getByText("花 3 小费精修第 1 槽部件至 L2", { exact: true })).toBeVisible();
});
