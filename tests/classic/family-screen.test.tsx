import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ClassicScreen from "@/classic/ClassicScreen";
import { beginMachineSpin, createMachine, settleMachineSpin } from "@/classic/machines";
import { machineKey } from "@/classic/machine-storage";
import { setLanguage } from "@/i18n/language";

vi.mock("@/classic/Reels", () => ({ Reels: ({ machine }: { machine: string }) => <div data-testid="reel-machine">{machine}</div> }));
vi.mock("@/presentation/audio", () => ({ playSfx: vi.fn(), unlockAudio: () => true, playMechanicalBed: () => () => {} }));
beforeEach(() => {
  localStorage.clear(); setLanguage("zh", false);
  localStorage.setItem(machineKey("original"), JSON.stringify(createMachine("original", 44)));
  localStorage.setItem("hotel-sentinel", "untouched");
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); vi.useRealTimers(); setLanguage("zh", false); history.replaceState({}, "", "/"); });

it("lets players change cabinets and returns to the exact original record", async () => {
  const original = localStorage.getItem(machineKey("original"));
  history.replaceState({}, "", "/?mode=classic&machine=diamond");
  render(<ClassicScreen onHome={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /转一转/ })).toBeEnabled());
  expect(screen.getByRole("heading", { name: "双倍钻石" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /换机台/ }));
  fireEvent.click(screen.getByRole("button", { name: /经典机台/ }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "经典机台" })).toBeVisible());
  expect(screen.getByTestId("reel-machine")).toHaveTextContent("original");
  expect(localStorage.getItem(machineKey("original"))).toBe(original);
  expect(localStorage.getItem("hotel-sentinel")).toBe("untouched");
  expect(location.search).toBe("?mode=classic");
});

it("finishes base reels before offering a free bonus button and settles one combined payout", async () => {
  history.replaceState({}, "", "/?mode=classic&machine=wheel");
  localStorage.setItem(machineKey("wheel"), JSON.stringify(createMachine("wheel", 16)));
  render(<ClassicScreen onHome={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /转一转/ })).toBeEnabled());
  vi.useFakeTimers();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /转一转/ })); });
  const reserved = JSON.parse(localStorage.getItem(machineKey("wheel"))!);
  expect(reserved.pending.feature).toBe("wheel"); expect(reserved.credits).toBe(990);
  await act(async () => { vi.advanceTimersByTime(2800); });
  const bonus = screen.getByRole("button", { name: /启动轮盘/ });
  expect(bonus).toBeEnabled(); expect(screen.getByRole("button", { name: /换机台/ })).toBeDisabled();
  expect(JSON.parse(localStorage.getItem(machineKey("wheel"))!).spins).toBe(0);
  await act(async () => { fireEvent.click(bonus); fireEvent.click(bonus); });
  await act(async () => { vi.advanceTimersByTime(3700); });
  await act(async () => { vi.advanceTimersByTime(2000); });
  expect(JSON.parse(localStorage.getItem(machineKey("wheel"))!)).toEqual(settleMachineSpin(reserved));
  expect(screen.getByTestId("classic-credits")).toHaveTextContent("1,010");
  expect(screen.getByTestId("feature-breakdown")).toHaveTextContent("基础 0 + 轮盘 20（×2）= 20");
  expect(screen.getByTestId("bonus-wheel")).toHaveAttribute("data-sector", "3");
});

it("reopening an unplayed wheel bonus awards it once without showing another bonus button", async () => {
  history.replaceState({}, "", "/?mode=classic&machine=wheel&lang=en"); setLanguage("en", false);
  localStorage.setItem(machineKey("wheel"), JSON.stringify(beginMachineSpin(createMachine("wheel", 16), 0)));
  render(<ClassicScreen onHome={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /^SPIN/ })).toBeEnabled());
  expect(screen.getByTestId("classic-credits")).toHaveTextContent("1,010");
  expect(screen.getByTestId("feature-breakdown")).toHaveTextContent("Base 0 + wheel 20");
  fireEvent.click(screen.getByRole("button", { name: "PAYTABLE / RULES" }));
  expect(screen.getByText(/All eight sectors have equal/)).toBeVisible();
});

it("scales the Vault display with bet without changing accumulated pool and confirms reset scope", async () => {
  history.replaceState({}, "", "/?mode=classic&machine=vault");
  localStorage.setItem(machineKey("vault"), JSON.stringify(settleMachineSpin(beginMachineSpin(createMachine("vault", 1), 0))));
  render(<ClassicScreen onHome={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "25" })).toBeEnabled());
  expect(screen.getByTestId("vault-pool")).toHaveTextContent("2,000.4");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "25" })); });
  expect(screen.getByTestId("vault-pool")).toHaveTextContent("5,001");
  expect(JSON.parse(localStorage.getItem(machineKey("vault"))!).pool).toBe(20004);
  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  fireEvent.click(screen.getByRole("button", { name: /重新开台 ·/ }));
  expect(screen.getByText(/金库的累积奖池也会重置/)).toBeVisible();
  expect(screen.getByText(/其他机台、酒店进度与收藏不受影响/)).toBeVisible();
});

it("holds the awarded vault amount through celebration even if the next bet changes", async () => {
  history.replaceState({}, "", "/?mode=classic&machine=vault");
  localStorage.setItem(machineKey("vault"), JSON.stringify(createMachine("vault", 2957)));
  render(<ClassicScreen onHome={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /转一转/ })).toBeEnabled());
  vi.useFakeTimers();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /转一转/ })); });
  await act(async () => { vi.advanceTimersByTime(2800); });
  expect(screen.getByTestId("vault-pool")).toHaveTextContent("2,000.4");
  await act(async () => { vi.advanceTimersByTime(1750); });
  expect(screen.getByTestId("classic-paid")).toHaveTextContent("2,000.4");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "25" })); });
  expect(screen.getByTestId("vault-pool")).toHaveTextContent("2,000.4");
  await act(async () => { vi.advanceTimersByTime(300); });
  expect(screen.getByTestId("vault-pool")).toHaveTextContent("5,000");
  expect(screen.getByTestId("classic-credits")).toHaveTextContent("2,990.4");
});

it("can recover from a stale-tab error while a wheel bonus waits", async () => {
  history.replaceState({}, "", "/?mode=classic&machine=wheel");
  localStorage.setItem(machineKey("wheel"), JSON.stringify(createMachine("wheel", 16)));
  render(<ClassicScreen onHome={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /转一转/ })).toBeEnabled());
  vi.useFakeTimers();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /转一转/ })); });
  await act(async () => { vi.advanceTimersByTime(2800); });
  const pending = JSON.parse(localStorage.getItem(machineKey("wheel"))!);
  const latest = JSON.stringify(settleMachineSpin(pending));
  localStorage.setItem(machineKey("wheel"), latest);
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: machineKey("wheel"), newValue: latest })));
  expect(screen.getByRole("button", { name: "重新读取" })).toBeEnabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重新读取" })); });
  expect(screen.getByTestId("classic-credits")).toHaveTextContent("1,010");
});
