import { expect, test } from "@playwright/test";

test("portrait run persists after three real spins and an upgrade decision", async ({ page }) => {
  await page.goto("/?seed=123");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/?seed=123");

  const serviceChooser = page.getByRole("region", { name: "选择服务" });
  await expect(serviceChooser).toBeVisible();
  await serviceChooser.getByRole("button").first().click();
  await page.getByRole("button", { name: "保守" }).click();

  for (let spin = 0; spin < 3; spin += 1) {
    await page.getByRole("button", { name: "拉动老虎机" }).click();
    await page.getByRole("button", { name: "停轮" }).click();
    await page.getByRole("button", { name: "接受结果" }).click();
    await expect(page.getByRole("region", { name: "结算演出队列" })).toBeVisible();
    await page.getByRole("button", { name: "直接结算" }).click();
  }

  await expect(page.getByRole("region", { name: "选择升级" })).toBeVisible();
  await page.getByRole("button", { name: "放弃升级" }).click();

  const bankroll = await page.locator(".hud-primary strong").innerText();
  const shift = await page.locator(".hud-primary span").filter({ hasText: /第 \d+ 班/ }).innerText();
  expect(shift).toContain("第 2 班");

  await page.reload();
  const recovery = page.getByRole("dialog", { name: "恢复上次进度" });
  await expect(recovery).toBeVisible();
  await recovery.getByRole("button", { name: "继续演出" }).click();
  await expect(page.locator(".hud-primary strong")).toHaveText(bankroll);
  await expect(page.locator(".hud-primary span").filter({ hasText: /第 \d+ 班/ })).toHaveText(shift);

  const dimensions = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    primaryHeight: document.querySelector<HTMLElement>("[data-thumb-control='true']")?.getBoundingClientRect().height ?? 0
  }));
  expect(dimensions.overflow).toBeLessThanOrEqual(0);
  expect(dimensions.primaryHeight).toBeGreaterThanOrEqual(44);
});
