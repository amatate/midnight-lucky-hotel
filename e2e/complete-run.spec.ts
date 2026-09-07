import { expect, test, type Page } from "@playwright/test";
import { createFruitScenario } from "../tests/fixtures/run-fixtures";

const RUN_STORAGE_KEY = "midnight-lucky-hotel.run.v1";
const TEST_SEED = 820_127;

async function waitForAny(page: Page, roleOrName: string): Promise<void> {
  const selectors = [
    page.getByRole("region", { name: "本局总结" }),
    page.getByRole("button", { name: "接受结果" }),
    page.getByRole("region", { name: "选择升级" }),
    page.getByRole("region", { name: "结算演出队列" }),
    page.getByRole("button", { name: "拉动老虎机" }),
    page.getByRole("button", { name: "继续加班" }),
    page.getByRole("button", { name: "结账离开" })
  ];
  for (let attempt = 0; attempt < 120; attempt += 1) {
    for (const element of selectors) {
      if (await element.isVisible()) return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`timeout waiting for ${roleOrName}`);
}

async function settleQueueIfNeeded(page: Page): Promise<void> {
  const queue = page.getByRole("region", { name: "结算演出队列" });
  if (!(await queue.isVisible())) return;
  const quick = page.getByRole("button", { name: "直接结算" });
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(queue).toBeHidden();
}

async function completeOneSpin(page: Page): Promise<void> {
  const spin = page.getByRole("button", { name: "拉动老虎机" });
  await expect(spin).toBeVisible();
  await spin.click();

  const stop = page.getByRole("button", { name: "停轮" });
  await expect(stop).toBeVisible();
  await stop.click();

  await waitForAny(page, "post-stop stable state");

  const accept = page.getByRole("button", { name: "接受结果" });
  if (await accept.isVisible()) {
    await accept.click();
    await waitForAny(page, "after accept");
    await settleQueueIfNeeded(page);
    await waitForAny(page, "after settlement");
  }
}

async function settleInitialStateIfNeeded(page: Page): Promise<void> {
  const summary = page.getByRole("region", { name: "本局总结" });
  const readyToSpin = page.getByRole("button", { name: "拉动老虎机" });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await summary.isVisible()) return;
    if (await readyToSpin.isVisible()) {
      await completeOneSpin(page);
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error("timeout settling initial fixture");
}

test("complete fixture run, one overtime block, and cash out with deterministic summary fields", async ({ page }) => {
  const scenario = createFruitScenario(TEST_SEED, "e2e");
  await page.goto(`/?seed=${TEST_SEED}`);
  await page.evaluate(({ state, storageKey }) => {
    localStorage.clear();
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, { state: scenario, storageKey: RUN_STORAGE_KEY });
  await page.reload();

  await page.getByRole("button", { name: "继续游戏", exact: true }).click();

  const recovery = page.getByRole("dialog", { name: "恢复上次进度" });
  await expect(recovery).toBeVisible();
  await recovery.getByRole("button", { name: "继续游戏" }).click();

  await settleInitialStateIfNeeded(page);

  const runSummary = page.getByRole("region", { name: "本局总结" });
  await expect(runSummary).toBeVisible();
  await expect(page.getByRole("button", { name: "继续加班" })).toBeVisible();
  await page.getByRole("button", { name: "继续加班" }).click();

  for (let spin = 0; spin < 3; spin += 1) {
    const ready = page.getByRole("button", { name: "拉动老虎机" });
    if (await ready.isVisible()) {
      await completeOneSpin(page);
    }
    const summary = page.getByRole("region", { name: "本局总结" });
    const upgrade = page.getByRole("region", { name: "选择升级" });
    const settleAwait = page.getByRole("button", { name: "接受结果" });
    const actionRequired = await summary.isVisible() || await upgrade.isVisible() || await settleAwait.isVisible();
    if (!actionRequired && spin < 2) {
      await expect(ready).toBeVisible({ timeout: 3000 });
    }
    if (actionRequired) break;
  }

  const overTimeSummary = page.getByRole("region", { name: "本局总结" });
  if (await page.getByRole("region", { name: "选择升级" }).isVisible()) {
    await page.getByRole("button", { name: "放弃升级" }).click();
    await expect(page.getByRole("region", { name: "选择升级" })).toBeHidden();
  }
  await expect(overTimeSummary).toBeVisible();
  await expect(overTimeSummary.getByText("主要收入：")).toBeVisible();
  await expect(overTimeSummary.getByText("主要支出：")).toBeVisible();
  await expect(overTimeSummary.getByText("RTP")).toBeVisible();
  await expect(overTimeSummary.getByText("尚未完成：")).toBeVisible();
  const finalBankroll = page.locator(".run-summary strong");
  await expect(finalBankroll).toHaveText(/\d/);

  await page.getByRole("button", { name: "结账离开" }).click();
  const finalSummary = page.getByRole("region", { name: "本局总结" });
  await expect(finalSummary).toBeVisible();
  await expect(finalSummary.getByText("运行报告")).toBeVisible();
  await expect(finalSummary.getByText("主要收入：")).toBeVisible();
  await expect(finalSummary.getByText("主要支出：")).toBeVisible();
  await expect(finalSummary.getByText("RTP")).toBeVisible();
  await expect(finalSummary.getByText(/本局/)).toBeVisible();
});
