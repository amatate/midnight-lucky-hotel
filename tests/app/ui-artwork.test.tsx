import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UiAtlasArt, UpgradeArt } from "@/app/components/UiArtwork";
import { PART_ART_INDEX } from "@/app/components/CabinetArtwork";
import { UI_ART_INDEX, UI_ATLAS, uiArtFrame, uiArtViewBox, type UiArtId } from "@/app/ui-art-index";
import { UPGRADE_IDS, UPGRADES } from "@/content/upgrades";
import { GuestbookPage } from "@/meta/ConciergeDesk";
import { emptyGuestbook, QUESTS } from "@/meta/guestbook";
import { setLanguage } from "@/i18n/language";

beforeEach(() => { localStorage.clear(); setLanguage("zh", false); });
afterEach(cleanup);

it("maps all 29 upgrades, five routes and nine keepsakes without reusing atlas cells", () => {
  expect(Object.keys(PART_ART_INDEX)).toHaveLength(19);
  expect(Object.keys(UI_ART_INDEX)).toHaveLength(24);
  expect(new Set(Object.values(UI_ART_INDEX)).size).toBe(24);
  for (const index of Object.values(UI_ART_INDEX)) {
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(UI_ATLAS.columns * UI_ATLAS.rows);
  }
  for (const id of UPGRADE_IDS) {
    expect(Object.hasOwn(UPGRADES[id].kind === "part" ? PART_ART_INDEX : UI_ART_INDEX, id)).toBe(true);
  }
  for (const quest of QUESTS) expect(Object.hasOwn(UI_ART_INDEX, `keepsake-${quest.id}`)).toBe(true);
  for (const id of Object.keys(UI_ART_INDEX) as UiArtId[]) {
    const [x, y, width, height] = uiArtFrame(id);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(1536);
    expect(y + height).toBeLessThanOrEqual(1024);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  }
  expect(uiArtViewBox("lemon-crate")).toBe("20 40 240 208");
  expect(uiArtViewBox("keepsake-all-rooms")).toBe("1280 749 236 233");
});

it("reuses installed part art, and crops the new atlas for tools", () => {
  const { container } = render(<><UpgradeArt id="jam-jar" /><UpgradeArt id="calculator" /></>);
  expect(container.querySelector('[data-part-art="jam-jar"]')).not.toBeNull();
  const art = container.querySelector('[data-ui-art="calculator"]')!;
  expect(art.getAttribute("aria-hidden")).toBe("true");
  expect(art.querySelector("svg")?.getAttribute("viewBox")).toBe(uiArtViewBox("calculator"));
  expect(art.querySelector("image")?.getAttribute("clip-path")).toMatch(/^url\(#.+\)$/);
  expect(art.querySelector("image")?.getAttribute("href")).toBe(import.meta.env.BASE_URL + UI_ATLAS.file);
});

it("keeps a decorative fallback if the atlas cannot load", () => {
  const { container } = render(<UiAtlasArt id="route-fruit" />);
  const art = container.firstElementChild!;
  const bitmap = art.querySelector("image")!;
  expect(art).not.toHaveAttribute("data-art-ready");
  fireEvent.load(bitmap);
  expect(art).toHaveAttribute("data-art-ready", "true");
  fireEvent.error(bitmap);
  expect(art).not.toHaveAttribute("data-art-ready");
  expect(art.querySelector(".ui-art-fallback")).toHaveTextContent("◇");
});

it("shows unearned keepsakes as previews without claiming rewards or revealing earned notes", () => {
  const book = emptyGuestbook();
  const before = structuredClone(book);
  const claim = vi.fn(), go = vi.fn();
  const { container } = render(<GuestbookPage book={book} onClaim={claim} onGo={go} error="" />);
  fireEvent.click(screen.getByRole("button", { name: "纪念收藏" }));
  expect(container.querySelectorAll(".keepsake-card")).toHaveLength(9);
  expect(container.querySelectorAll(".keepsake-card[data-collected]")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: /黄铜房钥匙/ }));
  expect(screen.queryByText(/澪：钥匙不替你开出大奖/)).toBeNull();
  expect(screen.getByText(/图鉴累计发现 8 种/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "去完成" }));
  expect(go).toHaveBeenCalledWith(QUESTS.find(q => q.id === "eight-parts"));
  expect(claim).not.toHaveBeenCalled();
  expect(book).toEqual(before);
  expect(localStorage.length).toBe(0);
});

it("only marks actual collected keepsakes and still opens their memory", () => {
  const { container } = render(<GuestbookPage book={{ ...emptyGuestbook(), claimed: ["read-ledger"] }} onClaim={vi.fn()} onGo={vi.fn()} error="" />);
  fireEvent.click(screen.getByRole("button", { name: "纪念收藏" }));
  expect(container.querySelectorAll(".keepsake-card[data-collected]")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /黄铜账签/ }));
  expect(screen.getByText(/澪：回本不是净赚/)).toBeVisible();
});
