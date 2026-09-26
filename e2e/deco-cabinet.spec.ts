import { expect, test, type Locator, type Page } from "@playwright/test";
import { createRun } from "../src/core/run";

async function expectReadableGoldButton(button: Locator): Promise<void> {
  await button.hover();
  // Inspect the middle of the actual CSS transition, not just its readable endpoints.
  await button.evaluate((element) => element.getAnimations().forEach((animation) => {
    animation.pause();
    animation.currentTime = 60;
  }));
  const contrast = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const luminance = (color: string): number => {
      // Canvas normalizes both rgb() and color(srgb ...) emitted by color-mix().
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    };
    const foreground = luminance(style.color);
    const backgrounds = style.backgroundImage.match(/rgb\([^)]+\)/g) ?? [style.backgroundColor];
    return Math.min(...backgrounds.map((color) => {
      const background = luminance(color);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    }));
  });
  expect(contrast, "gold buttons retain readable text even under sticky touch hover").toBeGreaterThanOrEqual(4.5);
}

async function readyCabinet(page: Page): Promise<void> {
  await page.goto("/?seed=8");
  await page.getByRole("button", { name: "开始新局", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("group", { name: "选择服务" }).getByRole("button", { name: /深夜厨房/ }).click();
  await expect(page.getByRole("button", { name: "拉动老虎机", exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

test("artwork title screen, cabinet, and settlement stay usable on phone", async ({ page }, testInfo) => {
  await page.goto("/?seed=8");
  await page.evaluate(() => document.fonts.ready);
  for (const path of ["/art/cabinet-frame-v1.png", "/art/hotel-lobby-v1.png"]) {
    expect(await page.evaluate(async (url) => {
      const asset = new Image();
      asset.src = url;
      await asset.decode();
      return asset.naturalWidth;
    }, path)).toBeGreaterThan(500);
  }
  await page.screenshot({ path: testInfo.outputPath("title-phone.png"), fullPage: true });
  await page.getByRole("button", { name: "开始新局", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("group", { name: "选择服务" }).getByRole("button", { name: /深夜厨房/ }).click();
  const cabinet = page.getByRole("region", { name: "午夜好运老虎机" });
  expect(await cabinet.evaluate((element) => getComputedStyle(element, "::before").borderImageSource)).toContain("cabinet-frame-v1.png");
  expect(await cabinet.evaluate((element) => getComputedStyle(element, "::before").transform)).toBe("none");
  await page.screenshot({ path: testInfo.outputPath("cabinet-phone.png"), fullPage: true });
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await page.getByRole("button", { name: "拉动老虎机", exact: true }).click();
  await page.clock.runFor(1600);
  await expect(page.getByRole("button", { name: "收下这把", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "收下这把", exact: true }).click();
  await expect(cabinet.getByRole("region", { name: "结算演出队列" })).toBeVisible();
  await expect(page.getByRole("region", { name: "当前决策", exact: true })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("settlement-phone.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "直接结算", exact: true }).click();
  await expect(page.getByRole("button", { name: "拉动老虎机", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "返回前台", exact: true }).click();
  await expect(page.getByRole("button", { name: "继续游戏", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({ path: testInfo.outputPath("saved-title-320.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

for (const { width, reduced } of [{ width: 320, reduced: false }, { width: 390, reduced: false }, { width: 1280, reduced: false }, { width: 390, reduced: true }]) {
  test(`${width}px${reduced ? " reduced motion" : ""} cabinet keeps its full reel viewport while all reels spin and stop`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
    await readyCabinet(page);
    const machine = page.getByRole("region", { name: "老虎机转轮" });
    const before = (await machine.boundingBox())!;
    await page.screenshot({ path: testInfo.outputPath("ready.png"), fullPage: true });
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
    await page.getByRole("button", { name: "拉动老虎机", exact: true }).click();
    await page.clock.runFor(reduced ? 80 : 100);
    await expect(machine.locator('[data-reel-state="moving"]')).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath("spinning.png") });
    const moving = (await machine.boundingBox())!;
    expect(Math.abs(moving.height - before.height), "spinning must not collapse the 3×3 window").toBeLessThan(2);
    expect(moving.height).toBeGreaterThan(190);
    await expect(machine.getByRole("img")).toHaveCount(0); // No future result leaks through the filler.
    if (!reduced) {
      await page.clock.runFor(950);
      await expect(machine.locator('[data-reel-state="settled"]')).toHaveCount(1);
      expect(Math.abs((await machine.boundingBox())!.height - before.height)).toBeLessThan(2);
    }
    await page.clock.runFor(reduced ? 100 : 550);
    await expect(machine.locator('[data-testid="cell"]')).toHaveCount(9);
    expect(Math.abs((await machine.boundingBox())!.height - before.height)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test.describe("phone touch input", () => {
test.use({ isMobile: true, hasTouch: true });

test("phone lever remains visible at rest and after pulling, and one drag buys only one spin", async ({ page }, testInfo) => {
  await readyCabinet(page);
  const lever = page.getByTestId("pull-gesture");
  await expect(lever).toBeVisible();
  await lever.scrollIntoViewIfNeeded();
  const box = (await lever.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  const knob = (await lever.locator(".lever-knob").boundingBox())!;
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const touch = await page.context().newCDPSession(page);
  const x = knob.x + knob.width / 2;
  const y = knob.y + knob.height / 2;
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + 120 }] });
  await expect(lever).toHaveAttribute("data-pull-progress", "1");
  // Check touch-action during the gesture; release replaces the preparation panel and may clamp page scroll.
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const decision = page.getByRole("region", { name: "当前决策" });
  await expect(decision).toHaveAttribute("data-phase", "AWAITING_INTERVENTION");
  await expect(lever).toBeVisible();
  await expect(lever).toHaveAttribute("aria-disabled", "true");
  const respinRows = await page.getByRole("button", { name: /^选择第[123]轮$/ }).evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
  expect(respinRows).toHaveLength(3);
  expect(Math.max(...respinRows) - Math.min(...respinRows), "one control per reel, in the same left-to-right row").toBeLessThan(2);
  await expectReadableGoldButton(decision.getByRole("button", { name: "收下这把", exact: true }));
  await page.screenshot({ path: testInfo.outputPath("decision.png"), fullPage: true });
  const counts = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("midnight-lucky-hotel.run.v2")!);
    return { spins: state.commandHistory.filter((entry: { type: string }) => entry.type === "SPIN").length, wager: state.shiftWager };
  });
  expect(counts).toEqual({ spins: 1, wager: 10 });
  const before = await page.evaluate(() => localStorage.getItem("midnight-lucky-hotel.run.v2"));
  await page.getByRole("button", { name: "选择第2轮", exact: true }).tap();
  await expect(page.getByRole("button", { name: "确认重转第2轮", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("midnight-lucky-hotel.run.v2"))).toBe(before);
  await page.screenshot({ path: testInfo.outputPath("respin-preview.png"), fullPage: true });
  await page.getByRole("button", { name: "取消预览", exact: true }).tap();
  expect(await page.evaluate(() => localStorage.getItem("midnight-lucky-hotel.run.v2"))).toBe(before);
});

test("phone kick preview cancels cleanly and matches the single confirmed kick", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.evaluate((state) => {
    localStorage.setItem("midnight-lucky-hotel.run.v2", JSON.stringify(state));
    localStorage.removeItem("midnight-lucky-hotel.archives.v1");
  }, { ...createRun(8), phase: "READY_TO_SPIN", service: "security" });
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("button", { name: "拉动老虎机", exact: true }).tap();
  await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "AWAITING_INTERVENTION");
  const machine = page.getByRole("region", { name: "老虎机转轮" });
  const visible = () => machine.locator("[data-cell] [role='img']").evaluateAll((symbols) => symbols.map((symbol) => symbol.getAttribute("aria-label")));
  const original = await visible();
  const save = await page.evaluate(() => localStorage.getItem("midnight-lucky-hotel.run.v2"));
  await page.getByRole("button", { name: "踹击", exact: true }).tap();
  await page.getByRole("button", { name: "选择第1轮", exact: true }).tap();
  const preview = await visible();
  expect(preview).not.toEqual(original);
  expect(await page.evaluate(() => localStorage.getItem("midnight-lucky-hotel.run.v2"))).toBe(save);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath("kick-preview-320.png"), fullPage: true });
  await page.getByRole("button", { name: "取消预览", exact: true }).tap();
  expect(await visible()).toEqual(original);
  await page.getByRole("button", { name: "踹击", exact: true }).tap();
  await page.getByRole("button", { name: "选择第1轮", exact: true }).tap();
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await page.getByRole("button", { name: "确认踹击第1轮", exact: true }).tap();
  await page.clock.runFor(650);
  expect(await visible()).toEqual(preview);
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem("midnight-lucky-hotel.run.v2")!));
  expect(result.commandHistory.filter((command: { type: string }) => command.type === "KICK_REEL")).toHaveLength(1);
  expect(result.bankroll).toBe(JSON.parse(save!).bankroll);
  expect(result.interventionPoints).toBe(JSON.parse(save!).interventionPoints);
});
});
