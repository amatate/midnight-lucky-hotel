import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "@/app/App";

vi.mock("@/classic/ClassicScreen", () => ({ default: ({ onHome }: { onHome: () => void }) => <section><h1>Classic fixture</h1><button onClick={onHome}>Return fixture</button></section> }));
vi.mock("@/presentation/audio", () => ({ installAudio: () => () => {}, playSfx: vi.fn(), unlockAudio: () => true }));
afterEach(() => { cleanup(); history.replaceState({}, "", "/"); localStorage.clear(); });

it("opens Classic directly without creating or rewriting hotel archives", async () => {
  localStorage.clear();
  localStorage.setItem("unrelated-save", "preserve");
  history.replaceState({}, "", "/?mode=classic&lang=zh");
  render(<App />);
  await screen.findByRole("heading", { name: "Classic fixture" });
  expect(Object.keys(localStorage)).toEqual(["unrelated-save"]);
  expect(localStorage.getItem("unrelated-save")).toBe("preserve");
});

it("offers a distinct lobby entry and returns without restarting a hotel run", async () => {
  localStorage.clear(); history.replaceState({}, "", "/");
  render(<App />);
  const before = { ...localStorage };
  fireEvent.click(screen.getByRole("button", { name: /经典机台/ }));
  await screen.findByRole("heading", { name: "Classic fixture" });
  expect(location.search).toBe("?mode=classic");
  expect({ ...localStorage }).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "Return fixture" }));
  expect(screen.getByRole("heading", { name: "午夜好运酒店" })).toBeVisible();
  expect(location.search).toBe("");
});
