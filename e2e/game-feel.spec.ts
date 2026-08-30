import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { GameCommand } from "../src/core/commands";
import type { GameEvent } from "../src/core/events";
import { normalizeDrawIdentity } from "../src/core/reels";
import { createRun, dispatchCommand } from "../src/core/run";
import type { Grid, ReelDraw, ReelSet, RunState } from "../src/core/types";

const RUN_STORAGE_KEY = "midnight-lucky-hotel.run.v1";

type FeedbackTier = "win" | "chain" | "runaway";

function accepted(state: RunState, command: GameCommand): RunState {
  const result = dispatchCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error.code} ${result.error.message}`);
  return result.state;
}

function controllerPhaseStates(seed: number): {
  readonly spinning: RunState;
  readonly awaiting: RunState;
  readonly resolving: RunState;
} {
  const initial = createRun(seed);
  const ready = accepted(initial, { type: "SELECT_SERVICE", serviceId: initial.serviceCandidates[0] });
  const spinning = accepted(ready, { type: "SPIN" });
  const awaiting = accepted(spinning, { type: "REELS_STOPPED" });
  const resolving = accepted(awaiting, { type: "ACCEPT_OUTCOME" });
  return { spinning, awaiting, resolving };
}

const FIXTURE_STRIPS: ReelSet = [
  ["cherry", "cherry", "cherry", "bell", "lemon", "blank"],
  ["cherry", "cherry", "cherry", "lemon", "bell", "blank"],
  ["cherry", "cherry", "cherry", "seven", "lemon", "blank"]
];

function fixtureDraw(seed: number): ReelDraw {
  const grid = FIXTURE_STRIPS.map((strip) => strip.slice(0, 3)) as unknown as Grid;
  return normalizeDrawIdentity({
    strips: FIXTURE_STRIPS,
    stops: [0, 0, 0],
    grid,
    rng: { value: seed },
    preInterventionPaying: true
  });
}

function fixedEvents(tier: FeedbackTier, draw: ReelDraw): {
  readonly events: readonly GameEvent[];
  readonly total: number;
  readonly expectedCoins: number;
} {
  if (tier === "win") {
    return {
      events: [
        { sequence: 1, type: "REELS_DRAWN", draw },
        { sequence: 2, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 10, source: "base" },
        { sequence: 3, type: "PAYOUT_COMPLETE", total: 10 }
      ],
      total: 10,
      expectedCoins: 8
    };
  }
  if (tier === "chain") {
    return {
      events: [
        { sequence: 1, type: "REELS_DRAWN", draw },
        { sequence: 2, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 10, source: "base" },
        { sequence: 3, type: "LINE_WIN", lineId: "middle", symbol: "cherry", amount: 10, source: "base" },
        { sequence: 4, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 },
        { sequence: 5, type: "PAYOUT_ADDED", amount: 10, source: "part" },
        { sequence: 6, type: "PAYOUT_COMPLETE", total: 30 }
      ],
      total: 30,
      expectedCoins: 24
    };
  }
  return {
    events: [
      { sequence: 1, type: "REELS_DRAWN", draw },
      { sequence: 2, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 20, source: "base" },
      { sequence: 3, type: "PART_TRIGGERED", partId: "overload-motor", level: 1 },
      { sequence: 4, type: "PAYOUT_ADDED", amount: 20, source: "part" },
      { sequence: 5, type: "OVERLOAD", amount: 60 },
      { sequence: 6, type: "PAYOUT_COMPLETE", total: 100 }
    ],
    total: 100,
    expectedCoins: 48
  };
}

function presentationFixture(seed: number, tier: FeedbackTier): {
  readonly state: RunState;
  readonly total: number;
  readonly expectedCoins: number;
} {
  const draw = fixtureDraw(seed);
  const resolved = controllerPhaseStates(seed).resolving;
  const fixed = fixedEvents(tier, draw);
  const partSlots: RunState["partSlots"] = tier === "chain"
    ? [{ id: "jam-jar", level: 1 }, null, null, null, null]
    : tier === "runaway"
      ? [{ id: "overload-motor", level: 1 }, null, null, null, null]
      : [null, null, null, null, null];
  return {
    state: {
      ...resolved,
      bankroll: 100 + fixed.total,
      shiftPayout: fixed.total,
      reels: FIXTURE_STRIPS,
      pendingSpin: { draw, isFree: false },
      pendingEvents: fixed.events,
      partSlots,
      counters: { blankCharge: 0, cherryWinsThisShift: tier === "chain" ? 1 : 0 },
      attribution: {
        base: tier === "runaway" ? 20 : tier === "chain" ? 20 : 10,
        part: tier === "chain" ? 10 : tier === "runaway" ? 20 : 0,
        intervention: 0,
        service: 0,
        agitation: 0,
        overload: tier === "runaway" ? 60 : 0
      }
    },
    total: fixed.total,
    expectedCoins: fixed.expectedCoins
  };
}

async function installSnapshot(page: Page, state: RunState): Promise<void> {
  await page.goto(`/?seed=${state.initialSeed}`);
  await page.evaluate(({ storageKey, snapshot }) => {
    localStorage.clear();
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, { storageKey: RUN_STORAGE_KEY, snapshot: state });
  await page.reload();
  await expect(page.getByRole("dialog", { name: "恢复上次进度" })).toBeVisible();
}

async function storedSnapshot(page: Page): Promise<{
  readonly phase: string;
  readonly history: readonly { readonly type: string }[];
}> {
  return page.evaluate((storageKey) => {
    const snapshot = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
      phase?: string;
      commandHistory?: readonly { type?: string }[];
    } | null;
    return {
      phase: snapshot?.phase ?? "MISSING",
      history: (snapshot?.commandHistory ?? []).map(({ type }) => ({ type: type ?? "MISSING" }))
    };
  }, RUN_STORAGE_KEY);
}

function countCommand(
  snapshot: { readonly history: readonly { readonly type: string }[] },
  type: string
): number {
  return snapshot.history.filter((command) => command.type === type).length;
}

for (const fixture of [
  { tier: "win", label: "中奖" },
  { tier: "chain", label: "构筑连锁" },
  { tier: "runaway", label: "机器失控" }
] as const) {
  test(`fixed ${fixture.tier} feedback exposes its exact total and bounded particle tier`, async ({ page }, testInfo) => {
    const { state, total, expectedCoins } = presentationFixture(800 + expectedCoinsFor(fixture.tier), fixture.tier);
    await installSnapshot(page, state);

    const presentation = page.getByRole("region", { name: "结算演出队列" });
    const namedWinLine = fixture.tier === "win"
      ? page.waitForFunction(() =>
          document.querySelector<HTMLElement>("[aria-label='结算演出队列']")
            ?.textContent?.includes("樱桃顶线 +¥10") === true)
      : null;
    await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续演出" }).click();
    await expect(presentation).toBeVisible();
    await expect(presentation.getByText(fixture.label, { exact: true })).toBeVisible();
    await expect(presentation.getByText(`+¥${total}`, { exact: true })).toBeVisible();
    await expect(presentation.getByText(/条中奖线.*次部件触发.*因果链/)).toBeVisible();
    if (namedWinLine !== null) {
      const handle = await namedWinLine;
      await handle.dispose();
    }
    const particles = page.getByTestId("coin-particle");
    await expect(particles).toHaveCount(expectedCoins);
    expect(await particles.count()).toBeLessThanOrEqual(48);
    await attachScreenshot(page, testInfo, `feedback-${fixture.tier}`);

    await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "READY_TO_SPIN");
  });
}

function expectedCoinsFor(tier: FeedbackTier): number {
  return tier === "win" ? 8 : tier === "chain" ? 24 : 48;
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("reduced motion keeps static payout evidence while removing coins, shake, and blur", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { state, total } = presentationFixture(901, "runaway");
  await installSnapshot(page, state);

  const presentation = page.getByRole("region", { name: "结算演出队列" });
  await expect(presentation).toHaveAttribute("data-reduced-motion", "true");
  await expect(presentation.getByText(`+¥${total}`, { exact: true })).toBeVisible();
  await expect(presentation.getByText(/条中奖线.*次部件触发.*因果链/)).toBeVisible();
  await expect(page.getByTestId("coin-particle")).toHaveCount(0);

  const motion = await page.evaluate(() => {
    const machine = document.querySelector<HTMLElement>("[data-motion-kind]");
    const blurred = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => getComputedStyle(element).filter.includes("blur")).length;
    return {
      blurred,
      shake: machine?.style.getPropertyValue("--cabinet-shake") ?? "missing",
      animation: machine === null ? "missing" : getComputedStyle(machine).animationName
    };
  });
  expect(motion).toEqual({ blurred: 0, shake: "0px", animation: "none" });

  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续演出" }).click();
  await expect.poll(async () => countCommand(await storedSnapshot(page), "PRESENTATION_COMPLETE")).toBe(1);
  await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "READY_TO_SPIN");
});

test("recovery pauses a spinning run and resumes exactly one automatic stop", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const state = controllerPhaseStates(910).spinning;
  await installSnapshot(page, state);

  const before = await storedSnapshot(page);
  await page.waitForTimeout(350);
  expect(await storedSnapshot(page)).toEqual(before);
  await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "SPINNING");

  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续停轮" }).click();
  await expect.poll(async () => (await storedSnapshot(page)).phase).toBe("AWAITING_INTERVENTION");
  await expect.poll(async () => countCommand(await storedSnapshot(page), "REELS_STOPPED")).toBe(1);
  await page.waitForTimeout(350);
  expect(countCommand(await storedSnapshot(page), "REELS_STOPPED")).toBe(1);
});

test("recovery pauses an intervention boundary and resumes exactly one automatic accept", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const state: RunState = {
    ...controllerPhaseStates(911).awaiting,
    interventionPoints: 0
  };
  await installSnapshot(page, state);

  const before = await storedSnapshot(page);
  await page.waitForTimeout(350);
  expect(await storedSnapshot(page)).toEqual(before);
  await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "AWAITING_INTERVENTION");

  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续干预" }).click();
  await expect.poll(async () => countCommand(await storedSnapshot(page), "ACCEPT_OUTCOME")).toBe(1);
  await page.waitForTimeout(350);
  expect(countCommand(await storedSnapshot(page), "ACCEPT_OUTCOME")).toBe(1);
});

test("recovery pauses a resolving run and resumes exactly one automatic completion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const state = presentationFixture(912, "win").state;
  await installSnapshot(page, state);

  const before = await storedSnapshot(page);
  await page.waitForTimeout(350);
  expect(await storedSnapshot(page)).toEqual(before);
  await expect(page.getByRole("region", { name: "当前决策" })).toHaveAttribute("data-phase", "RESOLVING_EFFECTS");

  await page.getByRole("dialog", { name: "恢复上次进度" }).getByRole("button", { name: "继续演出" }).click();
  await expect.poll(async () => countCommand(await storedSnapshot(page), "PRESENTATION_COMPLETE")).toBe(1);
  await expect.poll(async () => (await storedSnapshot(page)).phase).toBe("READY_TO_SPIN");
  await page.waitForTimeout(350);
  expect(countCommand(await storedSnapshot(page), "PRESENTATION_COMPLETE")).toBe(1);
});
