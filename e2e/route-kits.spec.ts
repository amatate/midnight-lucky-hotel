import { test, expect } from "@playwright/test";
import { createRun } from "../src/core/run";

test("mobile starter, live route note and first upgrade work in both languages", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // New isolated Playwright context: never reads or changes a real player's saves.
  await page.goto("/?lang=en");
  await page.evaluate((state) => {
    localStorage.removeItem("midnight-lucky-hotel.archives.v1");
    localStorage.setItem("midnight-lucky-hotel.run.v2", JSON.stringify(state));
  }, createRun(820127));
  await page.reload();
  await page.getByRole("button", { name: "Continue game", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Continue game", exact: true }).click();
  const services = page.getByRole("group", { name: "Choose a service" });
  await expect(services).toContainText("Includes Candle, 2 omens and 2 tips");
  expect(await services.textContent()).not.toMatch(/\p{Script=Han}/u);
  await services.getByRole("button").filter({ hasText: "Includes Candle" }).click();
  await expect(page.getByTestId("cell")).toHaveCount(9);
  const badge = page.locator(".console-route-key");
  await expect(badge).toHaveText("Omens 2 · Tips 2");
  await page.screenshot({ path: testInfo.outputPath("route-ready-en.png"), fullPage: true });
  await badge.click();
  const note = page.getByRole("dialog", { name: "Build progress", exact: true });
  await expect(note).toContainText("Light the Candle now");
  await note.getByText("Triggers & limits", { exact: true }).click();
  await expect(note).toContainText("4 / 4 / 4");
  expect(await note.textContent()).not.toMatch(/\p{Script=Han}/u);
  await note.getByRole("button").first().click();
  for (let spin = 0; spin < 3; spin++) {
    await page.getByRole("button", { name: "Pull the lever", exact: true }).click();
    await page.getByRole("button", { name: "Keep this result", exact: true }).click();
    await page.getByRole("button", { name: "Skip to result", exact: true }).click();
    await expect(page.locator(".win-presentation")).toHaveCount(0);
  }
  await expect(page.getByTestId("upgrade-card").first()).toContainText("Triple Blessing");
  await expect(page.locator(".upgrade-fit")).toHaveCount(3);
  const fitStyle = await page.locator(".upgrade-fit").first().evaluate((node) => ({
    color: getComputedStyle(node).color, column: getComputedStyle(node).gridColumn
  }));
  expect(fitStyle).toEqual({ color: "rgb(32, 53, 44)", column: "1 / -1" });
  await page.screenshot({ path: testInfo.outputPath("route-upgrades-en.png"), fullPage: true });
  await page.goto("/?lang=zh");
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "继续游戏", exact: true }).click();
  await expect(page.getByTestId("upgrade-card").first()).toContainText("三重祝福");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(errors).toEqual([]);
});
