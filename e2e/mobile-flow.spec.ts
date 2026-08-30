import { expect, test, type Page, type TestInfo } from "@playwright/test";

const RUN_STORAGE_KEY = "midnight-lucky-hotel.run.v1";
const REAL_FLOW_SEED = 8;

async function startFreshRun(page: Page, seed = REAL_FLOW_SEED): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/?seed=${seed}`);
}

async function storedCommandCount(page: Page, type: string): Promise<number> {
  return page.evaluate(({ storageKey, commandType }) => {
    const serialized = localStorage.getItem(storageKey);
    if (serialized === null) return 0;
    const snapshot = JSON.parse(serialized) as { commandHistory?: readonly { type?: string }[] };
    return snapshot.commandHistory?.filter((command) => command.type === commandType).length ?? 0;
  }, { storageKey: RUN_STORAGE_KEY, commandType: type });
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string, fullPage = false): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function completePaidSpin(
  page: Page,
  spinNumber: number,
  testInfo: TestInfo,
  observeSequentialStops = false
): Promise<void> {
  const decision = page.getByRole("region", { name: "当前决策" });
  const reels = page.getByRole("region", { name: "老虎机转轮" }).locator("[data-reel-state]");
  const completedBefore = await storedCommandCount(page, "PRESENTATION_COMPLETE");
  const firstStopEvidence = observeSequentialStops
    ? page.waitForFunction(() => {
        const states = [...document.querySelectorAll<HTMLElement>("[aria-label='老虎机转轮'] [data-reel-state]")]
          .map((reel) => reel.dataset.reelState);
        return states.join(",") === "settled,moving,moving" ? states : false;
      }).then(async (handle) => {
        const states = await handle.jsonValue();
        await handle.dispose();
        const screenshot = testInfo.outputPath("automatic-sequential-stops.png");
        await page.screenshot({ path: screenshot });
        return { states, screenshot };
      })
    : null;
  const secondStopEvidence = observeSequentialStops
    ? page.waitForFunction(() => {
        const states = [...document.querySelectorAll<HTMLElement>("[aria-label='老虎机转轮'] [data-reel-state]")]
          .map((reel) => reel.dataset.reelState);
        return states.join(",") === "settled,settled,moving" ? states : false;
      }).then(async (handle) => {
        const states = await handle.jsonValue();
        await handle.dispose();
        return states;
      })
    : null;

  await expect(decision).toHaveAttribute("data-phase", "READY_TO_SPIN");
  await page.getByRole("button", { name: "拉动老虎机" }).click();
  await expect(decision).toHaveAttribute("data-phase", "SPINNING");
  await expect(reels).toHaveCount(3);
  await expect(reels.nth(0)).toHaveAttribute("data-reel-state", "moving");
  await expect(reels.nth(1)).toHaveAttribute("data-reel-state", "moving");
  await expect(reels.nth(2)).toHaveAttribute("data-reel-state", "moving");

  if (observeSequentialStops) {
    const first = await firstStopEvidence!;
    const second = await secondStopEvidence!;
    expect(first.states).toEqual(["settled", "moving", "moving"]);
    expect(second).toEqual(["settled", "settled", "moving"]);
    await testInfo.attach("automatic-sequential-stops", {
      path: first.screenshot,
      contentType: "image/png"
    });
  }

  await expect(decision).toHaveAttribute("data-phase", "AWAITING_INTERVENTION");
  await expect(decision.getByRole("button", { name: /^重转第\d轮$/ }).first()).toBeVisible();
  await decision.getByRole("button", { name: "收下这把" }).click();

  await expect(decision).toHaveAttribute("data-phase", "RESOLVING_EFFECTS");
  await expect(decision.getByRole("region", { name: "结算演出队列" })).toBeVisible();
  await expect.poll(() => storedCommandCount(page, "PRESENTATION_COMPLETE")).toBe(completedBefore + 1);
  await expect(decision).toHaveAttribute(
    "data-phase",
    spinNumber === 3 ? "CHOOSING_UPGRADE" : "READY_TO_SPIN"
  );
}

test("a real kitchen shift automatically stops, settles, and applies a targeted fruit upgrade", async ({ page }, testInfo) => {
  await startFreshRun(page);

  const decision = page.getByRole("region", { name: "当前决策" });
  await expect(decision).toHaveAttribute("data-phase", "CHOOSING_SERVICE");
  const serviceChooser = decision.getByRole("group", { name: "选择服务" });
  await expect(serviceChooser).toBeVisible();
  await serviceChooser.getByRole("button", { name: /深夜厨房/ }).click();

  await decision.getByRole("button", { name: "购买食物（¥10）" }).click();
  await decision.getByRole("button", { name: "保守" }).click();
  await expect(decision.getByRole("button", { name: "保守" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "拉动老虎机" })).toBeEnabled();

  await completePaidSpin(page, 1, testInfo, true);
  await completePaidSpin(page, 2, testInfo);
  await completePaidSpin(page, 3, testInfo);

  const upgradePicker = decision.getByRole("group", { name: "选择升级" });
  await expect(upgradePicker).toBeVisible();
  const cards = upgradePicker.getByRole("article");
  await expect(cards).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    const card = cards.nth(index);
    await expect(card.getByRole("heading", { level: 3 })).not.toHaveText("");
    await expect(card).toContainText("效果");
    await expect(card).toContainText("当前影响");
    await expect(card).toContainText("协同");
    await expect(card).toContainText("代价／风险");
    await expect(card.getByRole("button", { name: /^选择/ })).toBeVisible();
  }

  const fruitCard = cards.filter({ has: page.getByRole("heading", { name: "樱桃去核器" }) });
  await expect(fruitCard).toHaveCount(1);
  await fruitCard.getByRole("button", { name: "选择樱桃去核器" }).click();
  const target = fruitCard.getByLabel("目标符号");
  await expect(target).toHaveValue("0:lemon");
  const maintenance = fruitCard.getByRole("complementary", { name: "维修票据" });
  await expect(maintenance).toContainText("第1轮：柠檬 3 → 2");
  await expect(maintenance).toContainText("第1轮：樱桃 4 → 5");
  await attachScreenshot(page, testInfo, "three-upgrade-tickets", true);

  await fruitCard.getByRole("button", { name: "获取樱桃去核器" }).click();
  await expect(decision).toHaveAttribute("data-phase", "READY_TO_SPIN");
  await expect(page.getByText("第 2 班 · 0/3")).toBeVisible();
  await expect(page.getByRole("region", { name: "已获得升级" })).toContainText("樱桃去核器");

  const firstReelSymbols = page.getByLabel("第1轮", { exact: true }).getByRole("img");
  await expect(firstReelSymbols).toHaveCount(3);
  expect(await firstReelSymbols.evaluateAll((symbols) => symbols.map((symbol) => symbol.getAttribute("aria-label")))).toEqual([
    "樱桃",
    "樱桃",
    "铃铛"
  ]);
  await attachScreenshot(page, testInfo, "acquired-fruit-change");

  await page.reload();
  const recovery = page.getByRole("dialog", { name: "恢复上次进度" });
  await expect(recovery).toBeVisible();
  await recovery.getByRole("button", { name: "继续游戏" }).click();
  await expect(page.getByText("第 2 班 · 0/3")).toBeVisible();
  await expect(page.getByRole("region", { name: "已获得升级" })).toContainText("樱桃去核器");
  const persistedChange = await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
      acquiredUpgrades?: readonly string[];
      reels?: readonly (readonly string[])[];
    } | null;
    return {
      acquired: snapshot?.acquiredUpgrades?.includes("cherry-pitter") ?? false,
      firstThree: snapshot?.reels?.[0]?.slice(0, 3) ?? []
    };
  }, RUN_STORAGE_KEY);
  expect(persistedChange).toEqual({ acquired: true, firstThree: ["cherry", "cherry", "bell"] });
});

test("the current decision remains usable at all supported portrait widths", async ({ page }, testInfo) => {
  const viewports = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 430, height: 932 }
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await startFreshRun(page, REAL_FLOW_SEED);
    const decision = page.getByRole("region", { name: "当前决策" });
    await decision.getByRole("group", { name: "选择服务" }).getByRole("button", { name: /深夜厨房/ }).click();
    await decision.getByRole("button", { name: "保守" }).click();

    const layout = await page.evaluate(() => {
      const tooSmall = [...document.querySelectorAll<HTMLElement>("button, select")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName,
            width: rect.width,
            height: rect.height
          };
        })
        .filter(({ width, height }) => width < 44 || height < 44);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        tooSmall
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
    expect(layout.tooSmall).toEqual([]);

    const lever = page.getByRole("button", { name: "拉动老虎机" });
    await lever.scrollIntoViewIfNeeded();
    await expect(lever).toBeVisible();
    await expect(lever).toBeEnabled();
    const box = await lever.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

    await attachScreenshot(page, testInfo, `portrait-${viewport.width}`);
  }
});

test("the controlled production shell restores local assets and a saved run offline", async ({ page, context }) => {
  await page.goto(`/?seed=${REAL_FLOW_SEED}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!await page.evaluate(() => navigator.serviceWorker.controller !== null)) await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  const decision = page.getByRole("region", { name: "当前决策" });
  await decision.getByRole("group", { name: "选择服务" }).getByRole("button", { name: /深夜厨房/ }).click();
  await decision.getByRole("button", { name: "购买食物（¥10）" }).click();
  await expect(page.getByRole("region", { name: "本局状态" })).toContainText("余额 ¥90");

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "午夜好运酒店" })).toBeVisible();
    const recovery = page.getByRole("dialog", { name: "恢复上次进度" });
    await expect(recovery).toBeVisible();

    const localAssets = await page.evaluate(async () => {
      const urls = [
        "/fonts/SmileySans-Oblique.woff2",
        "/fonts/BarlowCondensed-SemiBold.woff2",
        "/icons/icon-192.svg",
        "/icons/icon-512.svg"
      ];
      const responses = await Promise.all(urls.map(async (url) => {
        const response = await fetch(url);
        return { url, ok: response.ok, length: (await response.arrayBuffer()).byteLength };
      }));
      await Promise.all([
        document.fonts.load('400 24px "Smiley Sans"'),
        document.fonts.load('600 24px "Barlow Condensed"')
      ]);
      return {
        responses,
        fonts: {
          display: document.fonts.check('400 24px "Smiley Sans"'),
          numbers: document.fonts.check('600 24px "Barlow Condensed"')
        }
      };
    });
    expect(localAssets.responses.every(({ ok, length }) => ok && length > 0)).toBe(true);
    expect(localAssets.fonts).toEqual({ display: true, numbers: true });

    await recovery.getByRole("button", { name: "继续游戏" }).click();
    await expect(decision).toHaveAttribute("data-phase", "READY_TO_SPIN");
    await expect(page.getByRole("region", { name: "本局状态" })).toContainText("余额 ¥90");
  } finally {
    await context.setOffline(false);
  }
});
