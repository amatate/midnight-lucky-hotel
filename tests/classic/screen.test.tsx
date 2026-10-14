import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ClassicScreen from "@/classic/ClassicScreen";
import { beginSpin, createClassic, settleSpin } from "@/classic/engine";
import { CLASSIC_KEY } from "@/classic/storage";
import { setLanguage } from "@/i18n/language";

vi.mock("@/classic/Reels", () => ({ Reels: () => <div aria-hidden="true">reels</div> }));
vi.mock("@/presentation/audio", () => ({ playSfx: vi.fn(), unlockAudio: () => true, playMechanicalBed: () => () => {} }));

beforeEach(() => {
  localStorage.clear(); setLanguage("zh", false);
  localStorage.setItem(CLASSIC_KEY, JSON.stringify(createClassic(8)));
  localStorage.setItem("midnight-lucky-hotel.archives", "hotel-sentinel");
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); vi.useRealTimers(); setLanguage("zh", false); });

it("loads independently and prevents rapid double spins while reserving the outcome", async () => {
  render(<ClassicScreen onHome={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /转一转/ })).toBeEnabled());
  vi.useFakeTimers();
  const button = screen.getByRole("button", { name: /转一转/ });
  await act(async () => { fireEvent.click(button); fireEvent.click(button); });
  const reserved = JSON.parse(localStorage.getItem(CLASSIC_KEY)!);
  expect(reserved.pending.ordinal).toBe(1); expect(reserved.credits).toBe(990);
  expect(screen.getByRole("button", { name: /转动中/ })).toBeDisabled();
  await act(async () => { vi.advanceTimersByTime(2_800); });
  await act(async () => { vi.advanceTimersByTime(2_000); });
  expect(JSON.parse(localStorage.getItem(CLASSIC_KEY)!)).toEqual(settleSpin(reserved));
  expect(localStorage.getItem("midnight-lucky-hotel.archives")).toBe("hotel-sentinel");
});

it("recovers a pending spin on entry and offers readable bilingual rules", async () => {
  const pending = beginSpin(createClassic(6), 500);
  localStorage.setItem(CLASSIC_KEY, JSON.stringify(pending));
  setLanguage("en", false);
  render(<ClassicScreen onHome={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "PAYTABLE / RULES" })).toBeEnabled());
  expect(JSON.parse(localStorage.getItem(CLASSIC_KEY)!)).toEqual(settleSpin(pending));
  fireEvent.click(screen.getByRole("button", { name: "PAYTABLE / RULES" }));
  expect(screen.getByRole("dialog", { name: "Paytable & rules" })).toBeVisible();
  expect(screen.getByText("1 on center line")).toBeVisible();
  expect(screen.getByText("2 on center line")).toBeVisible();
  expect(screen.getByText(/One cherry returns the bet/)).toBeVisible();
  expect(screen.getByText(/These are long-run mathematical averages/)).toBeInTheDocument();
});

it("does not destroy an unreadable save and asks before resetting", async () => {
  localStorage.setItem(CLASSIC_KEY, "broken-original");
  render(<ClassicScreen onHome={() => {}} />);
  await screen.findByRole("alert");
  expect(localStorage.getItem(CLASSIC_KEY)).toBe("broken-original");
  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  fireEvent.click(screen.getByRole("button", { name: "重新开台 · 1,000 虚拟筹码" }));
  expect(localStorage.getItem(CLASSIC_KEY)).toBe("broken-original");
  fireEvent.click(screen.getByRole("button", { name: "保留当前机台" }));
  expect(localStorage.getItem(CLASSIC_KEY)).toBe("broken-original");
  expect(localStorage.getItem("midnight-lucky-hotel.archives")).toBe("hotel-sentinel");
});
