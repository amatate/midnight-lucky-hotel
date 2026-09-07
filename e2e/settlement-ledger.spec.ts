import { expect, test, type Page } from "@playwright/test";
import type { GameCommand } from "../src/core/commands";
import { normalizeDrawIdentity } from "../src/core/reels";
import { createRun, dispatchCommand } from "../src/core/run";
import type { Grid, ReelSet, RunState } from "../src/core/types";
import { RUN_STORAGE_KEY } from "../src/persistence/storage";

const SALAD_STRIPS: ReelSet = [
  ["cherry", "cherry", "blank", "bell", "lemon", "blank"],
  ["lemon", "cherry", "blank", "bell", "seven", "blank"],
  ["bell", "cherry", "blank", "seven", "lemon", "blank"]
];

const SALAD_GRID: Grid = [
  ["cherry", "cherry", "blank"],
  ["lemon", "cherry", "blank"],
  ["bell", "cherry", "blank"]
];

function accepted(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error.code} ${result.error.message}`);
  return result.state;
}

async function installSnapshot(page: Page, state: RunState): Promise<void> {
  await page.goto(`/?seed=${state.initialSeed}`);
  await page.evaluate(({ storageKey, snapshot }) => {
    localStorage.clear();
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, { storageKey: RUN_STORAGE_KEY, snapshot: state });
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "恢复上次进度" })).toBeVisible();
}

function saladResolvingFixture(): RunState {
  let state = createRun(808);
  state = accepted(state, { type: "SELECT_SERVICE", serviceId: state.serviceCandidates[0] });
  state = {
    ...state,
    bankroll: 80,
    baseSpinsInShift: 2,
    shiftWager: 20,
    expenses: { ...state.expenses, wagers: 20 }
  };
  state = accepted(state, { type: "SPIN" });
  state = accepted(state, { type: "REELS_STOPPED" });
  const draw = normalizeDrawIdentity({
    ...state.pendingSpin!.draw,
    strips: SALAD_STRIPS,
    stops: [0, 0, 0],
    grid: SALAD_GRID,
    preInterventionPaying: true
  });
  state = {
    ...state,
    reels: SALAD_STRIPS,
    pendingSpin: { ...state.pendingSpin!, draw },
    partSlots: [{ id: "fruit-salad", level: 1 }, null, null, null, null]
  };
  return accepted(state, { type: "ACCEPT_OUTCOME" });
}

async function finishPresentation(page: Page): Promise<void> {
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续演出" }).click();
  await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "CHOOSING_UPGRADE");
}

async function openOnlyReceipt(page: Page) {
  await page.getByRole("button", { name: "账本" }).click();
  const ledger = page.getByRole("dialog", { name: "前台账本" });
  await expect(ledger).toBeVisible();
  const receipts = ledger.locator(".ledger-receipt");
  await expect(receipts).toHaveCount(1);
  return { ledger, receipt: receipts.first() };
}

test("payouts enter the balance step by step and remain auditable after the shift", async ({ page }) => {
  const state = saladResolvingFixture();
  expect(state.spinHistory.at(-1)).toMatchObject({
    bankrollBefore: 80,
    wager: 10,
    totalPayout: 21,
    bankrollAfter: 91
  });
  await installSnapshot(page, state);

  const firstAward = page.waitForFunction(() => document.body.innerText.includes("本转累计 ¥6，余额 ¥76"))
    .then((handle) => handle.dispose());
  const finalAward = page.waitForFunction(() => document.body.innerText.includes("本转累计 ¥21，余额 ¥91"))
    .then((handle) => handle.dispose());
  const saladHighlight = page.waitForFunction(() => {
    const highlighted = [...document.querySelectorAll<HTMLElement>("[data-highlighted='true']")]
      .map((cell) => cell.dataset.cell)
      .sort();
    return highlighted.join(",") === "0-0,1-0,2-0" && document.body.innerText.includes("水果沙拉");
  }).then((handle) => handle.dispose());

  await expect(page.getByRole("region", { name: "本局状态" })).toContainText("余额 ¥70");
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续演出" }).click();
  await firstAward;
  await saladHighlight;
  await finalAward;
  await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "CHOOSING_UPGRADE");

  const { receipt } = await openOnlyReceipt(page);
  await expect(receipt).toContainText("-¥10 → +¥21 · 净 +¥11");
  await receipt.getByRole("button").click();
  await expect(receipt.getByText("樱桃 · 中线", { exact: true })).toBeVisible();
  await expect(receipt.getByText("水果沙拉 · 顶线", { exact: true })).toBeVisible();
});

test("direct settlement keeps the already-created receipt", async ({ page }) => {
  const state = saladResolvingFixture();
  expect(state.spinHistory).toHaveLength(1);
  expect(state.spinHistory[0]?.ordinal).toBe(1);
  await installSnapshot(page, state);

  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续演出" }).click();
  await page.getByRole("button", { name: "直接结算" }).click();
  await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "CHOOSING_UPGRADE");

  const { receipt } = await openOnlyReceipt(page);
  await expect(receipt).toContainText("+¥21");
  await receipt.getByRole("button").click();
  await expect(receipt.getByText("¥91", { exact: true })).toBeVisible();
});

test("reload restores history and the next shift preserves the resolved grid", async ({ page }) => {
  await installSnapshot(page, saladResolvingFixture());
  await finishPresentation(page);

  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏" }).click();
  const { ledger } = await openOnlyReceipt(page);
  await page.getByRole("button", { name: "关闭账本" }).click();
  await expect(ledger).toBeHidden();

  await page.getByRole("button", { name: "放弃升级" }).click();
  await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "READY_TO_SPIN");
  const labels = await page.getByRole("region", { name: "老虎机转轮" }).locator("[data-cell]").getByRole("img")
    .evaluateAll((symbols) => symbols.map((symbol) => symbol.getAttribute("aria-label")));
  expect(labels).toEqual(["樱桃", "樱桃", "空白", "柠檬", "樱桃", "空白", "铃铛", "樱桃", "空白"]);
});

test("a new run starts with empty receipts while the prior run remains archived", async ({ page }) => {
  await installSnapshot(page, saladResolvingFixture());
  await page.goto("/?seed=808");
  await page.getByRole("button", { name: "开始新局" }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏" }).click();

  await page.getByRole("button", { name: "账本" }).click();
  const ledger = page.getByRole("dialog", { name: "前台账本" });
  await expect(ledger).toContainText("拉动一次后，前台会在这里留下结算小票");
  await expect(ledger.locator(".ledger-receipt")).toHaveCount(0);
});
