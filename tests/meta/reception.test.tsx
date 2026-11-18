import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FrontDesk } from "@/app/components/FrontDesk";
import { readLibrary } from "@/persistence/archives";
import { GUESTBOOK_KEY, noteGuestActivity, readGuestbook } from "@/meta/guestbook";
import { setLanguage } from "@/i18n/language";

beforeEach(() => {
  localStorage.clear(); setLanguage("zh", false);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage("zh", false); });
const front = (onClassic = vi.fn()) => render(<FrontDesk library={readLibrary()} error={null} defaultSeed={8} onLibrary={() => {}} onPlay={() => {}} onClassic={onClassic} />);

it("opens an explicit lesson from the first quest without starting a hotel run", () => {
  const open = vi.fn(); front(open);
  fireEvent.click(screen.getByRole("button", { name: "住客手册" }));
  fireEvent.click(within(screen.getByRole("heading", { name: "学会第一转" }).closest("li")!).getByRole("button", { name: /去完成/ }));
  expect(open).toHaveBeenCalledWith({ machine: "original", welcome: "lesson" });
  expect(readLibrary().runs).toHaveLength(0);
});
it("collects and rereads a keepsake, preserving machine data and refreshing state", () => {
  noteGuestActivity("ledger"); localStorage.setItem("hotel-sentinel", "unchanged"); front();
  fireEvent.click(screen.getByRole("button", { name: "住客手册" }));
  fireEvent.click(screen.getByRole("button", { name: /请澪盖章/ }));
  expect(screen.getByRole("dialog", { name: "已领取纪念章" })).toHaveTextContent("黄铜账签");
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(screen.getByRole("button", { name: "收好这份纪念" }));
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(readGuestbook().claimed).toEqual(["read-ledger"]);
  fireEvent.click(screen.getByRole("button", { name: "纪念收藏" }));
  fireEvent.click(screen.getByRole("button", { name: /黄铜账签/ }));
  expect(screen.getByText(/澪：回本不是净赚/)).toBeVisible();
  expect(localStorage.getItem("hotel-sentinel")).toBe("unchanged");
  cleanup(); front();
  fireEvent.click(screen.getByRole("button", { name: "住客手册" }));
  expect(screen.getByText("已收入收藏")).toBeVisible();
});
it("reports guestbook errors without blocking play or overwriting the old record", () => {
  localStorage.setItem(GUESTBOOK_KEY, "bad record"); front();
  expect(screen.getByRole("alert")).toHaveTextContent("原记录未覆盖");
  expect(screen.getByRole("button", { name: /经典机台/ })).toBeEnabled();
  expect(localStorage.getItem(GUESTBOOK_KEY)).toBe("bad record");
});
it("offers English goals and all six portrait expressions", () => {
  setLanguage("en", false); front();
  fireEvent.click(screen.getByRole("button", { name: "Guestbook" }));
  expect(screen.getByRole("heading", { name: "Your first spin" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Keepsakes" }));
  expect(screen.getByRole("region", { name: "Room keycard collection" })).toBeVisible();
  fireEvent.click(screen.getByText("Meet Mio · six expression portraits"));
  for (const [label, path] of [["Welcome", "welcome"], ["Smile", "smile"], ["Thinking", "thinking"], ["Delighted", "delighted"], ["Concerned", "concerned"], ["Proud", "proud"]] as const) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(document.querySelector(".mio-gallery img")?.getAttribute("src")).toContain(`mio-${path}-v2.webp`);
  }
});
