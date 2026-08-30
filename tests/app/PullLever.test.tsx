import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PullLever } from "@/app/components/PullLever";

let audioLog: string[] = [];

class TestAudioContext {
  readonly destination = {} as AudioDestinationNode;
  readonly currentTime = 0;
  readonly state = "suspended" as AudioContextState;

  resume(): Promise<void> {
    audioLog.push("unlock");
    return Promise.resolve();
  }

  createOscillator(): OscillatorNode {
    return {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
      type: "sine"
    } as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    return {
      connect: vi.fn(),
      gain: {
        exponentialRampToValueAtTime: vi.fn(),
        setValueAtTime: vi.fn()
      }
    } as unknown as GainNode;
  }
}

const audioDescriptor = Object.getOwnPropertyDescriptor(window, "AudioContext");
const vibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, "vibrate");

beforeEach(() => {
  audioLog = [];
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: TestAudioContext
  });
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vi.fn(() => true)
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (audioDescriptor === undefined) Reflect.deleteProperty(window, "AudioContext");
  else Object.defineProperty(window, "AudioContext", audioDescriptor);
  if (vibrateDescriptor === undefined) Reflect.deleteProperty(navigator, "vibrate");
  else Object.defineProperty(navigator, "vibrate", vibrateDescriptor);
});

function gesture(progress: number, pointerId = 1): HTMLElement {
  const track = screen.getByTestId("pull-gesture");
  fireEvent.pointerDown(track, { clientY: 20, pointerId });
  fireEvent.pointerMove(track, { clientY: 20 + progress * 120, pointerId });
  return track;
}

describe("PullLever", () => {
  it.each([
    [0, "0"],
    [0.72, "0.72"],
    [0.81, "0.81"],
    [0.82, "0.82"],
    [1.2, "1"]
  ])("maps a 120px pointer journey at %s to clamped progress %s", (travel, expected) => {
    render(<PullLever reducedMotion={false} onPull={vi.fn()} />);

    const track = gesture(travel);

    expect(track).toHaveAttribute("data-pull-progress", expected);
    expect(track.style.getPropertyValue("--pull-progress")).toBe(expected);
  });

  it("fires the 10ms detent once per gesture even after recrossing 72%", () => {
    render(<PullLever reducedMotion={false} onPull={vi.fn()} />);
    const track = screen.getByTestId("pull-gesture");

    fireEvent.pointerDown(track, { clientY: 0, pointerId: 3 });
    fireEvent.pointerMove(track, { clientY: 0.7196 * 120, pointerId: 3 });
    expect(navigator.vibrate).not.toHaveBeenCalled();
    fireEvent.pointerMove(track, { clientY: 86.4, pointerId: 3 });
    fireEvent.pointerMove(track, { clientY: 60, pointerId: 3 });
    fireEvent.pointerMove(track, { clientY: 100, pointerId: 3 });

    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(10);

    fireEvent.pointerUp(track, { clientY: 60, pointerId: 3 });
    fireEvent.pointerDown(track, { clientY: 0, pointerId: 4 });
    fireEvent.pointerMove(track, { clientY: 90, pointerId: 4 });
    expect(navigator.vibrate).toHaveBeenCalledTimes(2);
  });

  it("returns without pulling when released below 82%", () => {
    const onPull = vi.fn();
    render(<PullLever reducedMotion={false} onPull={onPull} />);
    const track = gesture(0.81);

    fireEvent.pointerUp(track, { clientY: 20 + 0.81 * 120, pointerId: 1 });

    expect(onPull).not.toHaveBeenCalled();
    expect(track).toHaveAttribute("data-pull-progress", "0");
    expect(track).toHaveAttribute("data-lever-state", "returning");
  });

  it("does not round a near-threshold release up to a pull", () => {
    const onPull = vi.fn();
    render(<PullLever reducedMotion={false} onPull={onPull} />);
    const track = gesture(0.8196);

    fireEvent.pointerUp(track, { clientY: 20 + 0.8196 * 120, pointerId: 1 });

    expect(onPull).not.toHaveBeenCalled();
  });

  it("pulls synchronously at 82%, hits bottom for 70ms, and settles after 210ms", async () => {
    vi.useFakeTimers();
    const onPull = vi.fn(() => audioLog.push("pull"));
    render(<PullLever reducedMotion={false} onPull={onPull} />);
    const track = gesture(0.82);
    audioLog = [];

    fireEvent.pointerUp(track, { clientY: 20 + 0.82 * 120, pointerId: 1 });

    expect(onPull).toHaveBeenCalledTimes(1);
    expect(audioLog.slice(0, 2)).toEqual(["unlock", "pull"]);
    expect(track).toHaveAttribute("data-pull-progress", "1");
    expect(track).toHaveAttribute("data-lever-state", "impact");

    await act(async () => vi.advanceTimersByTimeAsync(69));
    expect(track).toHaveAttribute("data-pull-progress", "1");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(track).toHaveAttribute("data-pull-progress", "0");
    expect(track).toHaveAttribute("data-lever-state", "returning");
    await act(async () => vi.advanceTimersByTimeAsync(209));
    expect(track).toHaveAttribute("data-lever-state", "returning");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(track).toHaveAttribute("data-lever-state", "idle");
  });

  it("emits the detent before a fast threshold pull with no pointer move", () => {
    const feedbackOrder: string[] = [];
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vi.fn(() => {
        feedbackOrder.push("detent");
        return true;
      })
    });
    const onPull = vi.fn(() => feedbackOrder.push("pull"));
    render(<PullLever reducedMotion={false} onPull={onPull} />);
    const track = screen.getByTestId("pull-gesture");

    fireEvent.pointerDown(track, { clientY: 20, pointerId: 6 });
    fireEvent.pointerUp(track, { clientY: 118.4, pointerId: 6 });

    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
    expect(feedbackOrder).toEqual(["detent", "pull"]);
    expect(onPull).toHaveBeenCalledTimes(1);
  });

  it("cancels an owned pointer and ignores a later release", () => {
    const onPull = vi.fn();
    render(<PullLever reducedMotion={false} onPull={onPull} />);
    const track = gesture(1, 8);

    fireEvent.pointerCancel(track, { pointerId: 8 });
    fireEvent.pointerUp(track, { clientY: 140, pointerId: 8 });

    expect(onPull).not.toHaveBeenCalled();
    expect(track).toHaveAttribute("data-pull-progress", "0");
  });

  it("ignores foreign pointers and duplicate releases", () => {
    const onPull = vi.fn();
    render(<PullLever reducedMotion={false} onPull={onPull} />);
    const track = screen.getByTestId("pull-gesture");

    fireEvent.pointerDown(track, { clientY: 0, pointerId: 10 });
    fireEvent.pointerMove(track, { clientY: 120, pointerId: 11 });
    fireEvent.pointerUp(track, { clientY: 120, pointerId: 11 });
    expect(track).toHaveAttribute("data-pull-progress", "0");
    expect(onPull).not.toHaveBeenCalled();

    fireEvent.pointerMove(track, { clientY: 120, pointerId: 10 });
    fireEvent.pointerUp(track, { clientY: 120, pointerId: 10 });
    fireEvent.pointerUp(track, { clientY: 120, pointerId: 10 });
    expect(onPull).toHaveBeenCalledTimes(1);
  });

  it("disables both pointer input and the accessible fallback button", () => {
    const onPull = vi.fn();
    render(<PullLever disabled reducedMotion={false} onPull={onPull} />);
    const track = screen.getByTestId("pull-gesture");
    const button = screen.getByRole("button", { name: "拉动老虎机" });

    fireEvent.pointerDown(track, { clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(track, { clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(track, { clientY: 120, pointerId: 1 });
    fireEvent.click(button);

    expect(track).toHaveAttribute("aria-disabled", "true");
    expect(track).toHaveAttribute("data-pull-progress", "0");
    expect(button).toBeDisabled();
    expect(onPull).not.toHaveBeenCalled();
  });

  it("cancels and releases an owned drag when rerendered disabled", async () => {
    vi.useFakeTimers();
    const onPull = vi.fn();
    const { rerender } = render(<PullLever reducedMotion={false} onPull={onPull} />);
    const track = screen.getByTestId("pull-gesture");
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(track, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      releasePointerCapture: { configurable: true, value: releasePointerCapture }
    });

    fireEvent.pointerDown(track, { clientY: 20, pointerId: 12 });
    fireEvent.pointerMove(track, { clientY: 80, pointerId: 12 });
    expect(track).toHaveAttribute("data-lever-state", "dragging");
    expect(track).toHaveAttribute("data-pull-progress", "0.5");

    rerender(<PullLever disabled reducedMotion={false} onPull={onPull} />);

    expect(setPointerCapture).toHaveBeenCalledWith(12);
    expect(releasePointerCapture).toHaveBeenCalledWith(12);
    expect(track).toHaveAttribute("aria-disabled", "true");
    expect(track).toHaveAttribute("data-pull-progress", "0");
    expect(track).toHaveAttribute("data-lever-state", "returning");
    fireEvent.pointerMove(track, { clientY: 140, pointerId: 12 });
    fireEvent.pointerUp(track, { clientY: 140, pointerId: 12 });
    expect(navigator.vibrate).not.toHaveBeenCalled();
    expect(onPull).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(210));
    expect(track).toHaveAttribute("data-lever-state", "idle");
  });

  it("routes the fallback button through one shortened guarded pull", async () => {
    vi.useFakeTimers();
    const onPull = vi.fn();
    render(<PullLever reducedMotion={false} onPull={onPull} />);
    const track = screen.getByTestId("pull-gesture");
    const button = screen.getByRole("button", { name: "拉动老虎机" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(onPull).toHaveBeenCalledTimes(1);
    expect(track).toHaveAttribute("data-actuation", "button");
    expect(track).toHaveAttribute("data-pull-progress", "1");
    await act(async () => vi.advanceTimersByTimeAsync(45));
    expect(track).toHaveAttribute("data-pull-progress", "0");
    await act(async () => vi.advanceTimersByTimeAsync(140));
    expect(track).toHaveAttribute("data-lever-state", "idle");
  });

  it("uses a static 160ms reduced-motion fallback", async () => {
    vi.useFakeTimers();
    const onPull = vi.fn();
    render(<PullLever reducedMotion onPull={onPull} />);
    const track = screen.getByTestId("pull-gesture");

    fireEvent.click(screen.getByRole("button", { name: "拉动老虎机" }));
    expect(onPull).toHaveBeenCalledTimes(1);
    expect(track).toHaveAttribute("data-reduced-motion", "true");
    await act(async () => vi.advanceTimersByTimeAsync(159));
    expect(track).toHaveAttribute("data-lever-state", "returning");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(track).toHaveAttribute("data-lever-state", "idle");
  });
});
