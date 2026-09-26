import { expect, test } from "@playwright/test";
import { createRun } from "../src/core/run";
import type { RunState } from "../src/core/types";

test("hotel recovery: migrate, buy one upgrade, reload and retry on mobile", async ({ page }, testInfo) => {
  // Synthetic old checkpoint in a fresh browser context, never the player's storage.
  const state: RunState = { ...createRun(20260812), phase: "AFTER_HOURS", service: "repair",
    shift: 5, baseSpinsInShift: 3, exitUnlocked: true, bankroll: 4043,
    blockStartBankroll: 3108, shiftPayout: 1185, shiftWager: 150, afterHoursLevel: 12,
    betMode: "aggressive", commandHistory: [{ type: "CONTINUE" }, ...Array(11).fill({ type: "ENTER_ROOM" })],
    hotel: { cleared: 1, challenge: { tier: 2, status: "failed", target: 2000 } },
    partSlots: [{ id: "martyr-coin", level: 2 }, null, null, null, null],
    shiftHistory: [{ shift: 5, afterHoursLevel: 12, bankroll: 4043, reels: createRun(20260812).reels,
      parts: [{ id: "martyr-coin", level: 2 }], totalPayout: 1185, totalWager: 150 }],
    expenses: { wagers: 1380, chapel: 516, kitchen: 0, repair: 0 }
  };
  const now = new Date().toISOString();
  const record = { id: "old-test", name: "旧局整备检查点", createdAt: now, updatedAt: now,
    rulesVersion: "rules-76b3ccda2416e7f9", coverage: "from-checkpoint", origin: "backup",
    parentId: null, favorite: false, initialState: state, snapshot: state, entries: [] };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "历史与存档", exact: true }).click();
  await page.getByLabel("导入复盘包").setInputFiles({ name: "old-run.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "midnight-lucky-hotel.archive", version: 1, run: record })) });
  await page.getByRole("button", { name: "按新版续玩（保留旧局）", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏" }).click();
  await expect(page.getByText("当前钱包 ¥4043")).toBeVisible();
  await expect(page.getByText("+¥935")).toBeVisible();
  await expect(page.getByText(/自由加班下一转：¥31.25/)).toBeVisible();
  await page.getByRole("button", { name: "查看金币整备 · ¥100" }).click();
  await expect(page.getByRole("heading", { name: "金币整备 · 三选一" })).toBeVisible();
  const first = page.getByTestId("upgrade-card").first();
  await first.getByRole("button", { name: /^选择/ }).click();
  await first.getByRole("button", { name: /^支付 ¥/ }).click();
  await expect(page.getByText("+¥935")).toBeVisible();
  await expect(page.getByText(/本次整备已处理/)).toBeVisible();
  await expect(page.getByRole("button", { name: /查看金币整备/ })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("region", { name: "本局总结" }).screenshot({ path: testInfo.outputPath("room-ledger-mobile.png") });
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏" }).click();
  await expect(page.getByText(/本次整备已处理/)).toBeVisible();
  await page.getByRole("button", { name: "重试景观房", exact: true }).click();
  await expect(page.getByRole("region", { name: "客房进度" })).toContainText("本段奖金 ¥0 / ¥1200");
  await expect(page.locator('[data-counter="bet"]')).toContainText("¥50");
  await page.getByRole("button", { name: "完整日志", exact: true }).click();
  await page.getByRole("button", { name: "核验记录一致性" }).click();
  await expect(page.getByRole("status")).toContainText("核验通过");
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "返回前台", exact: true }).click();
  await page.getByRole("button", { name: "历史与存档", exact: true }).click();
  await expect(page.getByRole("heading", { name: "旧局整备检查点 · 导入", exact: true })).toBeVisible();
});
