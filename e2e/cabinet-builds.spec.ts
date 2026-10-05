import { expect, test, type Page } from "@playwright/test";
import { HOTEL_ROOMS } from "../src/content/hotel";
import { dispatchCommand } from "../src/core/run";
import { createLegacyRun as createRun } from "../tests/fixtures/legacy-run";
import type { RoomTier, RunState } from "../src/core/types";

async function load(page: Page, tier: RoomTier, patch: Partial<RunState> = {}) {
  const initial: RunState = { ...createRun(8), phase: "SHIFT_COMPLETE", shift: 5,
    baseSpinsInShift: 3, exitUnlocked: true, bankroll: 5000, service: "kitchen", tips: 3, omen: 3,
    partSlots: [{ id: "harvest-vat", level: 2 }, { id: "votive-candle", level: 2 }, { id: "shock-absorber", level: 2 }, null, null],
    counters: { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 2 },
    reels: [Array(12).fill("lemon"), Array(12).fill("lemon"), Array(12).fill("lemon")],
    hotel: { cleared: (tier - 1) as 0 | RoomTier, challenge: null } };
  const entered = dispatchCommand(initial, { type: "ENTER_ROOM" });
  if (!entered.ok) throw new Error(entered.error.message);
  await page.goto("/");
  await page.evaluate((state) => {
    // Only the isolated test context, never a player's existing tab or archive.
    localStorage.clear();
    localStorage.setItem("midnight-lucky-hotel.run.v2", JSON.stringify(state));
    localStorage.setItem("midnight-lucky-hotel.reduce-flash", "1");
  }, { ...entered.state, ...patch });
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  await expect(page.locator('.physical-parts [data-art-ready="true"]')).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
}

test("all six room skins, mixed slots and phone/desktop layouts remain readable", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  for (const tier of [1, 2, 3, 4, 5, 6] as const) {
    await page.setViewportSize({ width: tier === 4 ? 1280 : tier === 5 ? 320 : 390, height: 844 });
    await load(page, tier);
    const machine = page.getByRole("region", { name: "午夜好运老虎机" });
    await expect(machine).toHaveAttribute("data-room-tier", String(tier));
    await expect(machine.locator(".cabinet-marquee")).toHaveText(HOTEL_ROOMS[tier].name);
    await expect(machine.getByTestId("cell")).toHaveCount(9);
    await expect(machine.getByTestId("part-slot")).toHaveCount(5);
    await expect(machine.getByRole("region", { name: "本转准备" })).toBeVisible();
    expect(await machine.getByTestId("pull-gesture").evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (tier === 4) await expect(page.locator(".goal-peak-gauge")).toHaveCount(1);
    if (tier === 5) await expect(page.locator(".goal-star-lamps i")).toHaveCount(3);
    if (tier === 6) await expect(page.locator(".room-turn-ticks i")).toHaveCount(5);
    await page.screenshot({ path: info.outputPath(`room-${tier}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("installed modules show real spending and settlement; lever keeps nine windows", async ({ page }, info) => {
  await load(page, 2);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("midnight-lucky-hotel.run.v2")!) as RunState);
  const before = await saved();
  await page.getByRole("button", { name: /陈酿果桶 · L2/ }).click();
  await expect(page.getByRole("dialog", { name: "陈酿果桶 · L2" })).toBeVisible();
  await page.getByRole("button", { name: "关闭说明", exact: true }).click();
  expect(await saved()).toEqual(before);
  await page.getByRole("button", { name: "点燃还愿烛台（1 小费）", exact: true }).click();
  await expect(page.locator('[data-part-readout="votive-candle"]')).toContainText("3/3");
  await page.getByRole("button", { name: "购买食物（¥37.5）", exact: true }).click();
  const ready = await saved(); expect(ready.bankroll).toBe(before.bankroll - 37.5); expect(ready.tips).toBe(2);
  await page.screenshot({ path: info.outputPath("mixed-prepared.png"), fullPage: true });
  const reels = page.getByRole("region", { name: "老虎机转轮" });
  const height = (await reels.boundingBox())!.height;
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const lever = page.getByTestId("pull-gesture");
  await lever.scrollIntoViewIfNeeded();
  const box = (await lever.locator(".lever-knob").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 130, { steps: 5 }); await page.mouse.up();
  await page.clock.runFor(80);
  expect(Math.abs((await reels.boundingBox())!.height - height)).toBeLessThan(2);
  // Real cells are intentionally not mounted while moving, to avoid leaking the
  // committed draw. Three fixed-height covered reels retain all nine windows.
  await expect(reels.getByTestId("reel")).toHaveCount(3);
  await expect(reels.getByTestId("reduced-reel-cover")).toHaveCount(3);
  await page.clock.runFor(500);
  await expect(reels.getByTestId("cell")).toHaveCount(9);
  await page.getByRole("button", { name: "收下这把", exact: true }).click();
  await expect(page.locator('[data-part-readout="harvest-vat"]')).toContainText("结算中");
  await page.screenshot({ path: info.outputPath("mixed-settling.png"), fullPage: true });
  await page.getByRole("button", { name: "直接结算", exact: true }).click();
  const after = await saved();
  expect(after.commandHistory.filter((c) => c.type === "SPIN")).toHaveLength(1);
  expect(after.counters.votiveCharge).toBe(0);
  expect(after.counters.harvestCharge).toBe(0);
  expect(after.spinHistory.at(-1)!.awards.some((award) => award.kind === "part-bonus" && award.partId === "harvest-vat")).toBe(true);
  await expect(page.locator('[data-part-readout="harvest-vat"]')).toContainText("0/3");
});
