import { expect, test } from "@playwright/test";

test("portrait run persists after three real spins and a real acquired upgrade", async ({ page }) => {
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

  const upgradePicker = page.getByRole("region", { name: "选择升级" });
  await expect(upgradePicker).toBeVisible();
  const chosenCard = upgradePicker.getByTestId("upgrade-card").first();
  const upgradeName = await chosenCard.getByRole("heading").innerText();
  await chosenCard.getByRole("button", { name: /^选择/ }).click();
  const targets = upgradePicker.locator(".upgrade-targets");
  await expect(targets).toBeVisible();
  await targets.getByRole("button", { name: /^获取/ }).click();
  await expect(page.getByRole("region", { name: "已获得升级" })).toContainText(upgradeName);

  const bankroll = await page.locator(".hud-primary strong").innerText();
  const shift = await page.locator(".hud-primary span").filter({ hasText: /第 \d+ 班/ }).innerText();
  expect(shift).toContain("第 2 班");

  await page.reload();
  const recovery = page.getByRole("dialog", { name: "恢复上次进度" });
  await expect(recovery).toBeVisible();
  await recovery.getByRole("button", { name: "继续游戏" }).click();
  await expect(page.locator(".hud-primary strong")).toHaveText(bankroll);
  await expect(page.locator(".hud-primary span").filter({ hasText: /第 \d+ 班/ })).toHaveText(shift);
  await expect(page.getByRole("region", { name: "已获得升级" })).toContainText(upgradeName);

  const dimensions = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    primaryHeight: document.querySelector<HTMLElement>("[data-thumb-control='true']")?.getBoundingClientRect().height ?? 0
  }));
  expect(dimensions.overflow).toBeLessThanOrEqual(0);
  expect(dimensions.primaryHeight).toBeGreaterThanOrEqual(44);
});

test("installed production shell reloads while offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!await page.evaluate(() => navigator.serviceWorker.controller !== null)) await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 5_000 });

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 8_000 });
    await expect(page.getByRole("heading", { name: "午夜好运酒店" })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
