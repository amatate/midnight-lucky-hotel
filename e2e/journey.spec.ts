import { expect, test, type Page } from "@playwright/test";
import { createRun, dispatchCommand } from "../src/core/run";
import type { GameCommand } from "../src/core/commands";
import type { RunState } from "../src/core/types";

function send(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
async function spin(page: Page) {
  await page.getByRole("button", { name: "拉动老虎机", exact: true }).click();
  await page.getByRole("button", { name: "收下这把", exact: true }).click();
  const skip = page.getByRole("button", { name: "直接结算", exact: true });
  await skip.click();
  await expect(page.getByRole("region", { name: "结算演出队列" })).toHaveCount(0);
}
test("mobile View Room grows across three rounds, restores progress and only then awards the room", async ({ page }) => {
  let state: RunState = { ...createRun(8), phase: "SHIFT_COMPLETE", shift: 3, baseSpinsInShift: 3,
    service: "kitchen", bankroll: 5000, exitUnlocked: true,
    reels: [Array(12).fill("wild"), Array(12).fill("wild"), Array(12).fill("wild")],
    hotel: { cleared: 1, gardenRewardsGranted: 2, challenge: null } };
  state = send(state, { type: "ENTER_ROOM" });
  for (let index = 0; index < 3; index++)
    for (const type of ["SPIN", "REELS_STOPPED", "ACCEPT_OUTCOME", "PRESENTATION_COMPLETE"] as const) state = send(state, { type });
  await page.goto("/?lang=zh");
  await page.evaluate((fixture) => {
    // Fresh Playwright context only; never the user's browser or profile.
    localStorage.removeItem("midnight-lucky-hotel.archives.v1");
    localStorage.setItem("midnight-lucky-hotel.run.v2", JSON.stringify(fixture));
  }, state);
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  const rest = page.getByRole("region", { name: "客房回合休息" });
  await expect(rest).toContainText("景观房 · 回合 1 / 3");
  await expect(page.getByRole("region", { name: "客房挑战结果" })).toHaveCount(0);
  await expect(page.getByTestId("upgrade-card")).toHaveCount(3);
  await page.getByRole("button", { name: "放弃升级", exact: true }).click();
  await expect(page.locator(".shift-plaque")).toContainText("回合 2/3");
  await expect(page.getByTestId("cell")).toHaveCount(9);
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  await expect(page.locator(".shift-plaque")).toContainText("回合 2/3");
  for (let index = 0; index < 3; index++) await spin(page);
  await expect(rest).toContainText("景观房 · 回合 2 / 3");
  await expect(page.getByTestId("upgrade-card")).toHaveCount(3);
  await page.getByRole("button", { name: "放弃升级", exact: true }).click();
  for (let index = 0; index < 3; index++) await spin(page);
  await expect(page.getByRole("region", { name: "客房挑战结果" })).toContainText("景观房 · 挑战成功");
  await page.getByRole("button", { name: "放弃升级", exact: true }).click();
  await expect(page.getByRole("button", { name: "升房挑战 · 顶层套房", exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "菜单", exact: true }).click();
  await page.getByRole("button", { name: "完整日志", exact: true }).click();
  await page.getByRole("button", { name: "核验记录一致性", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("核验通过");
});
