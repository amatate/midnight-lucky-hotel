// One real play screenshot for the README, always in a disposable browser context.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(process.env.PLAYTEST_URL ?? "http://localhost:5173/");
  await page.getByRole("textbox", { name: "游戏种子" }).fill("20260812");
  await page.getByRole("button", { name: "开始新局", exact: true }).click();
  const recovery = page.getByRole("dialog", { name: "恢复上次进度" });
  if (await recovery.isVisible()) await recovery.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.locator(".service-choice").first().click();
  await page.getByRole("button", { name: "拉动老虎机", exact: true }).click();
  await page.getByRole("button", { name: "收下这把", exact: true }).click();
  await page.getByRole("button", { name: "拉动老虎机", exact: true }).waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector('[aria-label="当前决策"]')?.getAttribute("data-phase") === "READY_TO_SPIN");
  await page.evaluate(() => document.fonts.ready);
  const directory = fileURLToPath(new URL("../docs/media/", import.meta.url));
  await mkdir(directory, { recursive: true });
  const destination = fileURLToPath(new URL("../docs/media/gameplay.png", import.meta.url));
  await page.getByRole("region", { name: "午夜好运老虎机", exact: true }).screenshot({ path: destination });
  console.log("Saved real first-spin screenshot:", destination);
} finally {
  await browser.close();
}
