import { expect, test, type Page } from "@playwright/test";
import { dispatchCommand } from "../src/core/run";
import { createLegacyRun as createRun } from "../tests/fixtures/legacy-run";
import type { RunState } from "../src/core/types";

async function load(page: Page) {
  const entry = dispatchCommand({ ...createRun(8), phase: "SHIFT_COMPLETE", shift: 5, service: "kitchen",
    baseSpinsInShift: 3, exitUnlocked: true, bankroll: 5000, tips: 3, omen: 3,
    partSlots: [{ id: "harvest-vat", level: 2 }, { id: "votive-candle", level: 2 }, { id: "shock-absorber", level: 2 }, null, null],
    hotel: { cleared: 1, challenge: null } }, { type: "ENTER_ROOM" });
  if (!entry.ok) throw new Error(entry.error.message);
  await page.goto("./");
  await page.evaluate((state) => {
    // A fresh Playwright context only. Never the player's browser storage.
    localStorage.clear(); localStorage.setItem("midnight-lucky-hotel.run.v2", JSON.stringify(state));
  }, entry.state);
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
}
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("midnight-lucky-hotel.run.v2")!) as RunState);

test("three mobile viewports keep the board, five sockets and action key stationary", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  for (const size of [{ width: 360, height: 640 }, { width: 390, height: 760 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(size); await load(page);
    await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
    const reel = page.locator(".slot-machine"); const parts = page.locator(".parts-panel");
    const ready = (await reel.boundingBox())!; const slots = (await parts.boundingBox())!;
    await page.screenshot({ path: info.outputPath(`ready-${size.width}.png`), fullPage: true });
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    console.log(JSON.stringify({ viewport: size, document: dimensions, reels: ready, parts: slots, pull: await page.locator(".pull-button").boundingBox() }));
    expect(dimensions.width).toBeLessThanOrEqual(size.width);
    // Short browser chrome may scroll a little; preserve board geometry and reachable controls.
    expect(dimensions.height).toBeLessThanOrEqual(Math.max(size.height, 680));
    expect(ready.height).toBeGreaterThanOrEqual(184);
    await expect(page.getByTestId("cell")).toHaveCount(9); await expect(page.getByTestId("part-slot")).toHaveCount(5);
    expect(await page.getByTestId("cell").evaluateAll((cells) => cells.every((cell) => {
      const face = cell.querySelector(".symbol-face")!.getBoundingClientRect();
      const box = cell.getBoundingClientRect();
      return face.height <= box.height + 1 && face.width <= box.width + 1;
    }))).toBe(true);
    await page.getByRole("button", { name: "拉动老虎机" }).click();
    await page.clock.runFor(80);
    await expect(page.getByTestId("filler-tape")).toHaveCount(3);
    expect((await reel.boundingBox())!.height).toBe(ready.height);
    await page.screenshot({ path: info.outputPath(`spinning-${size.width}.png`) });
    await page.clock.runFor(1400);
    await expect(page.getByTestId("cell")).toHaveCount(9);
    expect((await reel.boundingBox())!.y).toBe(ready.y);
    const before = await saved(page);
    await page.getByRole("button", { name: "第2轮键", exact: true }).click();
    expect(await saved(page)).toEqual(before);
    await page.screenshot({ path: info.outputPath(`intervention-${size.width}.png`) });
    await page.getByRole("button", { name: "取消预览" }).click();
    await page.getByRole("button", { name: "收下这把", exact: true }).click();
    expect((await reel.boundingBox())!.y).toBe(ready.y);
    expect((await parts.boundingBox())!.y).toBe(slots.y);
    await page.screenshot({ path: info.outputPath(`settling-${size.width}.png`) });
    await page.getByRole("button", { name: "直接结算", exact: true }).click();
    await expect(page.getByRole("button", { name: "拉动老虎机" })).toBeEnabled();
    expect((await saved(page)).commandHistory.filter((command) => command.type === "SPIN")).toHaveLength(1);
  }
  expect(errors).toEqual([]);
});

test("a new seeded shift can prepare, finish three spins, upgrade and return to the fixed cabinet", async ({ page }, info) => {
  await page.goto("./");
  await page.getByText("自选种子与收藏", { exact: true }).click();
  await page.getByRole("textbox", { name: "游戏种子" }).fill("8");
  await page.getByRole("button", { name: "开始新局", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("button", { name: /深夜厨房/ }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath("house-ready.png"), fullPage: true });
  for (let spin = 0; spin < 3; spin++) {
    await page.getByRole("button", { name: "拉动老虎机" }).click();
    await page.getByRole("button", { name: "收下这把", exact: true }).click();
    await page.getByRole("button", { name: "直接结算", exact: true }).click();
  }
  await expect(page.getByTestId("upgrade-card")).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("maintenance-tickets.png"), fullPage: true });
  await page.getByTestId("upgrade-card").first().getByRole("button", { name: /^选择/ }).click();
  await page.getByRole("button", { name: /^获取/ }).click();
  await expect(page.getByRole("button", { name: "拉动老虎机" })).toBeEnabled();
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.locator(".fixed-console").boundingBox())!.width).toBeLessThanOrEqual(430);
  await page.screenshot({ path: info.outputPath("desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
  await page.getByRole("button", { name: /准备 \/ 调注/ }).click();
  await expect(page.getByRole("dialog", { name: "本转准备" })).toBeVisible();
  await page.getByRole("button", { name: "关闭说明" }).click();
  await expect(page.getByRole("button", { name: "拉动老虎机" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: info.outputPath("large-text.png"), fullPage: true });
});

test("meal preview is free, confirmation spends once, nested help stays paused and legible", async ({ page }, info) => {
  await load(page);
  const before = await saved(page);
  await page.getByRole("button", { name: /点餐/ }).click();
  await page.getByRole("button", { name: "送餐至第3轮" }).click();
  expect(await saved(page)).toEqual(before);
  await expect(page.getByRole("button", { name: "第3轮键" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await saved(page)).toEqual(before);
  await page.getByRole("button", { name: /点餐/ }).click();
  await page.getByRole("button", { name: "第3轮键" }).click();
  await page.getByRole("button", { name: /确认送餐/ }).click();
  const after = await saved(page); expect(after.bankroll).toBe(before.bankroll - 37.5);
  expect(after.commandHistory.filter((command) => command.type === "BUY_FOOD")).toHaveLength(1);
  await page.getByRole("button", { name: /陈酿果桶 · L2/ }).click();
  expect(await page.locator(".help-content .part-detail").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(242, 227, 192)");
  await page.screenshot({ path: info.outputPath("readable-help.png") });
  await page.getByRole("button", { name: "关闭说明" }).click();
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole("button", { name: "拉动老虎机" }).click();
  await page.getByRole("button", { name: "菜单", exact: true }).click();
  await page.getByRole("button", { name: "玩法与术语" }).click();
  await page.getByRole("dialog", { name: "游戏介绍" }).getByRole("button", { name: "关闭说明" }).click();
  await page.clock.runFor(4000);
  expect((await saved(page)).phase).toBe("SPINNING");
  await page.getByRole("dialog", { name: "酒店菜单" }).getByRole("button", { name: "关闭说明" }).click();
  await expect(page.locator(".fixed-console")).toHaveAttribute("data-paused", "false");
  await page.clock.runFor(1500);
  await expect.poll(async () => (await saved(page)).phase).toBe("AWAITING_INTERVENTION");
});
