import { expect, test, type Page } from "@playwright/test";
import { createRun } from "../src/core/run";
import { HOTEL_ROOMS } from "../src/content/hotel";
import type { RoomTier, RunState } from "../src/core/types";

const blankReels: RunState["reels"] = [["blank", "blank", "blank"], ["blank", "blank", "blank"], ["blank", "blank", "blank"]];

async function takeSpin(page: Page) {
  await page.getByRole("button", { name: "拉动老虎机", exact: true }).click();
  await page.getByRole("button", { name: "收下这把", exact: true }).click();
  await expect(page.getByRole("region", { name: "结算演出队列" })).toHaveCount(0);
}

test("old three-room checkpoint migrates, opens room four, and settles only after four paid turns", async ({ page }, testInfo) => {
  const state: RunState = { ...createRun(8), phase: "AFTER_HOURS", service: "repair", shift: 5,
    afterHoursLevel: 3, freeAfterHoursLevel: 0, baseSpinsInShift: 3, exitUnlocked: true,
    bankroll: 10000, reels: blankReels, hotel: { cleared: 3, challenge: { tier: 3, status: "cleared" } } };
  const now = "2026-09-16T00:00:00.000Z";
  const record = { id: "three-room-test", name: "三房通关测试档", createdAt: now, updatedAt: now,
    rulesVersion: "rules-54eb1749df08ea12", coverage: "from-checkpoint", origin: "backup",
    parentId: null, favorite: false, initialState: state, snapshot: state, entries: [] };
  await page.goto("/");
  await page.getByRole("button", { name: "历史与存档", exact: true }).click();
  await page.getByLabel("导入复盘包").setInputFiles({ name: "three-rooms.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "midnight-lucky-hotel.archive", version: 1, run: record })) });
  await page.getByRole("button", { name: "按新版续玩（保留旧局）", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  const choices = page.getByRole("region", { name: "升房挑战" });
  await expect(choices).toContainText("长夜套房");
  await choices.screenshot({ path: testInfo.outputPath("six-room-itinerary.png") });
  await page.getByRole("button", { name: "升房挑战 · 留声机房", exact: true }).click();
  await expect(page.getByRole("region", { name: "客房进度" })).toContainText("单转最高");
  await expect(page.locator(".shift-plaque")).toContainText("剩余 4 转");
  for (let spin = 0; spin < 3; spin++) {
    await takeSpin(page);
    await expect(page.getByRole("button", { name: "拉动老虎机", exact: true })).toBeEnabled();
  }
  await expect(page.locator(".shift-plaque")).toContainText("剩余 1 转");
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  await takeSpin(page);
  await expect(page.getByRole("region", { name: "客房挑战结果" })).toContainText("未达标");
  await expect(page.getByRole("button", { name: "重试留声机房", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "完整日志", exact: true }).click();
  await page.getByRole("button", { name: "核验记录一致性", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("核验通过");
});

test("new count and long-night goals remain readable and save their fourth and fifth turns", async ({ page }, testInfo) => {
  for (const tier of [5, 6] as const) {
    const room = HOTEL_ROOMS[tier];
    const state: RunState = { ...createRun(8), phase: "READY_TO_SPIN", service: "repair", shift: 5,
      afterHoursLevel: tier, freeAfterHoursLevel: 0, baseSpinsInShift: room.paidSpins - 1,
      exitUnlocked: true, bankroll: 10000, reels: blankReels,
      hotel: { cleared: (tier - 1) as RoomTier, challenge: { tier, status: "playing",
        target: room.target, paidSpins: room.paidSpins, objective: room.objective } } };
    await page.goto("/");
    await page.evaluate((fixture) => {
      localStorage.removeItem("midnight-lucky-hotel.archives.v1");
      localStorage.setItem("midnight-lucky-hotel.run.v2", JSON.stringify(fixture));
    }, state);
    await page.reload();
    await page.getByRole("button", { name: "继续游戏", exact: true }).click();
    await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
    if (tier === 5) await expect(page.getByRole("progressbar", { name: "达标转数目标" })).toHaveAttribute("aria-valuemax", "3");
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.screenshot({ path: testInfo.outputPath(`room-${tier}-320.png`), fullPage: true });
    await takeSpin(page);
    await expect(page.getByRole("region", { name: "客房挑战结果" })).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("midnight-lucky-hotel.run.v2")!));
    expect(saved.baseSpinsInShift).toBe(room.paidSpins);
    expect(saved.spinHistory.at(-1).baseSpinIndex).toBe(room.paidSpins);
    expect(saved.hotel.challenge.status).toBe("failed");
  }
});
