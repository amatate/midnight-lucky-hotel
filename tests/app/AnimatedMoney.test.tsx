import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedMoney } from "@/app/components/AnimatedMoney";

describe("AnimatedMoney", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16)));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("snaps on mount, then eases to the exact cent target without announcing frame values", async () => {
    const { rerender } = render(
      <AnimatedMoney target={0} durationMs={360} resetKey="spin-1" animationKey="spin-1:start" reducedMotion={false} accessibleLabel="本转累计 ¥0" />
    );
    expect(screen.getByTestId("animated-money")).toHaveTextContent("0");

    rerender(
      <AnimatedMoney target={35.37} durationMs={360} resetKey="spin-1" animationKey="spin-1:award-1" reducedMotion={false} accessibleLabel="本转累计 ¥35.37" />
    );
    await act(async () => vi.advanceTimersByTimeAsync(180));
    const intermediate = Number(screen.getByTestId("animated-money").textContent);
    expect(intermediate).toBeGreaterThan(0);
    expect(intermediate).toBeLessThan(35.37);
    expect(screen.getByText("本转累计 ¥35.37")).toHaveClass("sr-only");
    expect(screen.getAllByText(/本转累计/)).toHaveLength(1);

    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(screen.getByTestId("animated-money")).toHaveTextContent("35.37");
    expect(screen.getAllByText(/本转累计/)).toHaveLength(1);
  });

  it("snaps a new reset, cancels stale frames, and restarts only the current award tween", async () => {
    const { rerender, unmount } = render(
      <AnimatedMoney target={0} durationMs={360} resetKey="spin-1" animationKey="spin-1:start" reducedMotion={false} />
    );
    rerender(<AnimatedMoney target={40} durationMs={360} resetKey="spin-1" animationKey="spin-1:award-1" reducedMotion={false} />);
    await act(async () => vi.advanceTimersByTimeAsync(160));
    const firstIntermediate = Number(screen.getByTestId("animated-money").textContent);

    rerender(<AnimatedMoney target={40} durationMs={360} resetKey="spin-1" animationKey="spin-1:award-2" reducedMotion={false} />);
    await act(async () => vi.advanceTimersByTimeAsync(32));
    expect(Number(screen.getByTestId("animated-money").textContent)).toBeGreaterThanOrEqual(firstIntermediate);

    rerender(<AnimatedMoney target={5} durationMs={360} resetKey="spin-2" animationKey="spin-2:start" reducedMotion={false} />);
    expect(screen.getByTestId("animated-money")).toHaveTextContent("5");
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("animated-money")).toHaveTextContent("5");

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("snaps target changes without creating a frame loop when motion is reduced", async () => {
    const raf = vi.mocked(requestAnimationFrame);
    const { rerender } = render(
      <AnimatedMoney target={0} durationMs={0} resetKey="spin-1" animationKey="spin-1:start" reducedMotion />
    );
    rerender(<AnimatedMoney target={35} durationMs={0} resetKey="spin-1" animationKey="spin-1:award" reducedMotion />);

    expect(screen.getByTestId("animated-money")).toHaveTextContent("35");
    expect(raf).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an in-flight tween and snaps when reduced motion is enabled mid-animation", async () => {
    const { rerender } = render(
      <AnimatedMoney target={0} durationMs={360} resetKey="spin-1" animationKey="spin-1:start" reducedMotion={false} />
    );
    rerender(<AnimatedMoney target={35} durationMs={360} resetKey="spin-1" animationKey="spin-1:award" reducedMotion={false} />);
    await act(async () => vi.advanceTimersByTimeAsync(160));
    expect(Number(screen.getByTestId("animated-money").textContent)).toBeGreaterThan(0);
    expect(Number(screen.getByTestId("animated-money").textContent)).toBeLessThan(35);

    rerender(<AnimatedMoney target={35} durationMs={360} resetKey="spin-1" animationKey="spin-1:award" reducedMotion />);

    expect(screen.getByTestId("animated-money")).toHaveTextContent("35");
    expect(vi.getTimerCount()).toBe(0);
  });
});
