import { expect, test } from "@playwright/test";

test("Pages assets, PWA scope and offline startup work under the repository path", async ({ page, context, request, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "午夜好运酒店", exact: true })).toBeVisible();
  const base = new URL(baseURL!);
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe(`${base.pathname}manifest.webmanifest`);
  const manifestResponse = await request.get(new URL(manifestHref!, base).href);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe(base.pathname);
  expect(manifest.scope).toBe(base.pathname);
  for (const icon of manifest.icons) expect(icon.src).toMatch(new RegExp(`^${base.pathname}icons/`));
  for (const name of ["cabinet-frame", "hotel-lobby", "installed-parts", "room-crowns", "hotel-rooms"]) {
    const response = await request.get(new URL(`art/${name}-v1.png`, base).href);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe(base.href);
  // Prompt-mode updates deliberately do not force-claim an in-progress game.
  // Reopening an installed app is the first controlled navigation.
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(new URL("sw.js", base).href);
  // This context is created by Playwright and never reads the player's browser profile.
  await context.setOffline(true);
  await page.reload();
  await page.getByText("自选种子与收藏", { exact: true }).click();
  await page.getByRole("textbox", { name: "游戏种子" }).fill("8");
  await page.getByRole("button", { name: "开始新局", exact: true }).click();
  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("button", { name: /深夜厨房/ }).click();
  await expect(page.getByTestId("cell")).toHaveCount(9);
  await expect(page.locator('[data-part-art="room-service"]')).toHaveAttribute("data-art-ready", "true");
  expect(await page.locator('image').evaluateAll((images) => images.every((img) => img.getAttribute("href")?.startsWith(location.pathname)))).toBe(true);
  await page.getByRole("button", { name: "拉动老虎机" }).click();
  await page.getByRole("button", { name: "收下这把", exact: true }).click();
  await page.getByRole("button", { name: "直接结算", exact: true }).click();
  await expect(page.getByRole("button", { name: "拉动老虎机" })).toBeEnabled();
  expect(errors).toEqual([]);
});
