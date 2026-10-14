import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ClassicScreen from "@/classic/ClassicScreen";
import { PayoutTray } from "@/classic/PayoutTray";
import { setLanguage } from "@/i18n/language";

const scene = vi.hoisted(() => ({ play: vi.fn(), clear: vi.fn(), dispose: vi.fn() }));
const createScene = vi.hoisted(() => vi.fn());
vi.mock("@/classic/coin-scene", () => ({ createCoinScene: createScene }));
vi.mock("@/presentation/audio", () => ({ unlockAudio: () => true, playSfx: vi.fn(), playCoinImpact: vi.fn(), playMechanicalBed: () => () => {} }));
beforeEach(() => { localStorage.clear(); setLanguage("zh", false); createScene.mockResolvedValue(scene); vi.stubGlobal("WebGL2RenderingContext", class {}); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); history.replaceState({}, "", "/"); });

it("offers three demo intensities without opening or modifying any machine save", async () => {
  history.replaceState({}, "", "/?mode=classic&machine=vault&demo=coins");
  localStorage.setItem("midnight-lucky-hotel.classic.vault.v1", "unreadable-player-save");
  localStorage.setItem("hotel", "untouched"); const before = { ...localStorage };
  render(<ClassicScreen onHome={() => {}} />);
  await screen.findByText("3D 物理 · 撞击驱动声音");
  fireEvent.click(screen.getByRole("button", { name: /满盘落币/ }));
  await waitFor(() => expect(scene.play).toHaveBeenCalledWith(expect.objectContaining({ tier: "large" })));
  fireEvent.click(screen.getByRole("button", { name: /少量落币/ }));
  await waitFor(() => expect(scene.play).toHaveBeenLastCalledWith(expect.objectContaining({ tier: "small" })));
  expect({ ...localStorage }).toEqual(before);
});

it("does not initialize 3D for reduced motion and disposes it on a quality switch", async () => {
  const { rerender } = render(<PayoutTray cue={{ id: 1, seed: 7, tier: "large" }} three reduced warm />);
  expect(createScene).not.toHaveBeenCalled(); expect(screen.getByTestId("payout-tray")).toHaveAttribute("data-mode", "still");
  rerender(<PayoutTray cue={null} three reduced={false} warm />);
  await waitFor(() => expect(screen.getByTestId("payout-tray")).toHaveAttribute("data-mode", "3d"));
  rerender(<PayoutTray cue={null} three={false} reduced={false} warm />);
  expect(scene.dispose).toHaveBeenCalled(); expect(screen.getByTestId("payout-tray")).toHaveAttribute("data-mode", "2d");
});

it("keeps a lightweight tray available if the physical renderer fails", async () => {
  createScene.mockRejectedValueOnce(new Error("WebGL unavailable"));
  render(<PayoutTray cue={{ id: 1, seed: 9, tier: "small" }} three reduced={false} warm />);
  await waitFor(() => expect(screen.getByTestId("payout-tray")).toHaveAttribute("data-mode", "2d"));
  expect(document.querySelectorAll(".payout-flat-coins i")).toHaveLength(8);
});

it("clears cosmetics on backgrounding without replaying the last cue", async () => {
  render(<PayoutTray cue={{ id: 1, seed: 9, tier: "small" }} three reduced={false} warm />);
  await waitFor(() => expect(scene.play).toHaveBeenCalledTimes(1));
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(scene.clear).toHaveBeenCalled(); expect(scene.play).toHaveBeenCalledTimes(1);
  vi.restoreAllMocks();
});
