import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HotelDrums } from "@/app/components/HotelDrums";
import type { HotelDrumFrame } from "@/presentation/hotel-drum-scene";
import { createRun } from "@/core/run";

const mock = vi.hoisted(() => ({ load: vi.fn(), create: vi.fn(), show: vi.fn(), dispose: vi.fn() }));
vi.mock("@/presentation/hotel-drum-scene", () => ({ loadDrumArt: mock.load, createHotelDrumScene: mock.create }));
const grid = [["cherry", "bell", "wild"], ["wild", "food", "food"], ["crack", "lemon", "blank"]] as const;
const frame: HotelDrumFrame = { grid, target: grid, startGrid: grid, strips: createRun(8).reels,
  plan: null, paused: false, startedAt: 0 };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("WebGLRenderingContext", class {});
  mock.load.mockResolvedValue(new Map()); mock.create.mockImplementation(() => ({ show: mock.show, dispose: mock.dispose }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("loads lazily, forwards the presentation cursor and disposes on unmount", async () => {
  const ready = vi.fn(), view = render(<HotelDrums frame={frame} reducedMotion={false} onReady={ready} />);
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
  expect(mock.show).toHaveBeenLastCalledWith(frame);
  const cursor = { ...frame, grid: [...grid].reverse() as unknown as HotelDrumFrame["grid"] };
  view.rerender(<HotelDrums frame={cursor} reducedMotion={false} onReady={ready} />);
  expect(mock.show).toHaveBeenLastCalledWith(cursor);
  view.unmount(); expect(mock.dispose).toHaveBeenCalledTimes(1);
});
it("leaves reduced motion on the existing 2D renderer without loading WebGL", () => {
  const ready = vi.fn(); render(<HotelDrums frame={frame} reducedMotion onReady={ready} />);
  expect(ready).toHaveBeenLastCalledWith(false); expect(mock.load).not.toHaveBeenCalled();
});
it("falls back and disposes after context loss", async () => {
  const ready = vi.fn(); render(<HotelDrums frame={frame} reducedMotion={false} onReady={ready} />);
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
  act(() => { mock.create.mock.calls[0]![2](); });
  expect(mock.dispose).toHaveBeenCalledTimes(1); expect(ready).toHaveBeenLastCalledWith(false);
});
it("cannot install a scene after a late asset load completes following unmount", async () => {
  let resolve!: (art: Map<unknown, unknown>) => void;
  mock.load.mockReturnValue(new Promise(done => { resolve = done; }));
  const ready = vi.fn(), view = render(<HotelDrums frame={frame} reducedMotion={false} onReady={ready} />);
  await waitFor(() => expect(mock.load).toHaveBeenCalled()); view.unmount();
  await act(async () => { resolve(new Map()); });
  expect(mock.create).not.toHaveBeenCalled(); expect(ready).not.toHaveBeenCalledWith(true);
});
