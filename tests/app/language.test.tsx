import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { App } from "@/app/App";
import { GameGuide } from "@/app/components/GameGuide";
import { getLanguage, initialLanguage, LANGUAGE_KEY, setLanguage } from "@/i18n/language";
import { localizedProps, translate } from "@/i18n/translate";
import sources from "@/i18n/messages.json";
import english from "@/i18n/en.json";
import { createRun, dispatchCommand } from "@/core/run";
import { describeUpgrade } from "@/app/player-copy";
import { UPGRADE_IDS } from "@/content/upgrades";
import { feedbackIssueUrl } from "@/app/feedback";
import { ARCHIVE_KEY } from "@/persistence/archives";

beforeEach(() => { localStorage.clear(); setLanguage("zh", false); history.replaceState(null, "", "/"); });
afterEach(() => { cleanup(); setLanguage("zh", false); });
it("covers every message and preserves template arguments", () => {
  const args = (value: string) => [...new Set(value.match(/\{\d+\}/g) ?? [])].sort();
  for (const [id, source] of Object.entries(sources)) {
    const translated = (english as Record<string, string>)[id];
    expect(translated, `${id}: ${source}`).toBeTruthy();
    expect(translated).not.toMatch(/\p{Script=Han}/u);
    expect(args(translated!)).toEqual(args(source));
  }
});
it("uses URL, then saved preference, then browser language", () => {
  expect(initialLanguage("", "zh-TW")).toBe("zh");
  expect(initialLanguage("", "fr-FR")).toBe("en");
  localStorage.setItem(LANGUAGE_KEY, "zh");
  expect(initialLanguage("", "en-US")).toBe("zh");
  expect(initialLanguage("?lang=en&seed=8", "zh-CN")).toBe("en");
  expect(initialLanguage("?lang=unknown", "en-US")).toBe("zh");
});
it("switches lobby and collection, persists choice and searches English names", () => {
  render(<App seed={8} />);
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { name: "Midnight Lucky Hotel" })).toBeVisible();
  expect(document.documentElement.lang).toBe("en");
  expect(localStorage.getItem(LANGUAGE_KEY)).toBe("en");
  expect(location.search).toContain("lang=en");
  fireEvent.click(screen.getByRole("button", { name: "Collection" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search parts" }), { target: { value: "lemon" } });
  expect(screen.getByRole("heading", { name: "Lemon Infection" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Jam Jar" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "中文" }));
  expect(getLanguage()).toBe("zh");
});
it("switches a paused in-game menu without mutating the saved run", () => {
  setLanguage("en", false);
  render(<App seed={8} />);
  fireEvent.click(screen.getByRole("button", { name: "New game" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue game" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Choose a service" })).getAllByRole("button")[0]!);
  expect(screen.getByRole("button", { name: "Pull the lever" })).toBeEnabled();
  const saved = localStorage.getItem(ARCHIVE_KEY);
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("button", { name: "中文" }));
  expect(screen.getByRole("dialog", { name: "酒店菜单" })).toBeVisible();
  expect(localStorage.getItem(ARCHIVE_KEY)).toBe(saved);
  expect(screen.getByRole("button", { name: "拉动老虎机" })).toBeInTheDocument();
});
it("translates guide and all upgrade presentations without changing rules", () => {
  setLanguage("en", false);
  const { container } = render(<GameGuide />);
  expect(container.textContent).not.toMatch(/\p{Script=Han}/u);
  const state = createRun(8);
  const before = JSON.stringify(state);
  for (const id of UPGRADE_IDS) {
    for (const [field, value] of Object.entries(describeUpgrade(state, id))) {
      if (typeof value === "string") expect(translate(value), `${id}.${field}: ${value}`).not.toMatch(/\p{Script=Han}/u);
    }
  }
  expect(JSON.stringify(state)).toBe(before);
  const enResult = dispatchCommand(state, { type: "SELECT_SERVICE", serviceId: "kitchen" });
  setLanguage("zh", false);
  expect(dispatchCommand(state, { type: "SELECT_SERVICE", serviceId: "kitchen" })).toEqual(enResult);
});
it("preserves form values, handlers, identifiers and user-authored text", () => {
  setLanguage("en", false);
  const props = { children: "第 2 班", id: "第2班", onClick: () => {} };
  expect(localizedProps("option", props)).toEqual({ ...props, children: "Shift 2", value: "第 2 班" });
  expect(localizedProps("h3", { children: "我的樱桃存档", translate: "no" })).toEqual({ children: "我的樱桃存档", translate: "no" });
  expect(localizedProps("pre", { children: '{"name":"樱桃"}' })).toEqual({ children: '{"name":"樱桃"}' });
  expect(translate("第2轮第3格：樱桃 → 柠檬")).toBe("Reel 2, cell 3: Cherry → Lemon");
  expect(translate("第 1 班 · 剩余 3 转")).toBe("Shift 1 · Remaining 3 spins");
  expect(localizedProps(Symbol.for("react.fragment"), { children: "干预 2/2 · 小费 0" })).toEqual({ children: "Focus 2/2 · Tips 0" });
  expect(translate("第1轮：柠檬 3 → 5；总长度 12 → 14；抽到柠檬的机会提高；第2轮：柠檬 3 → 5；总长度 12 → 14；抽到柠檬的机会提高")).not.toMatch(/\p{Script=Han}/u);
  const url = new URL(feedbackIssueUrl(8));
  expect(url.searchParams.get("title")).toContain("Playtest feedback");
  expect(url.searchParams.get("body")).toContain("Seed: 8");
  expect(url.searchParams.get("body")).not.toMatch(/\p{Script=Han}/u);
});
