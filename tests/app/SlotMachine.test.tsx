import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlotMachine } from "@/app/components/SlotMachine";
import { createRun } from "@/core/run";
import type { Grid, RunPhase, RunState } from "@/core/types";
import type { ReelMotionPlan } from "@/presentation/reel-timeline";

const STABLE_GRID: Grid = [
  ["blank", "blank", "blank"],
  ["blank", "blank", "blank"],
  ["blank", "blank", "blank"]
];

const FINAL_GRID: Grid = [
  ["cherry", "lemon", "bell"],
  ["seven", "wild", "food"],
  ["crack", "cherry", "lemon"]
];

const BASE_PLAN: ReelMotionPlan = {
  cycleKey: "2:SPIN",
  kind: "base",
  spinningReels: [0, 1, 2],
  revealAtMs: { 0: 1000, 1: 1220, 2: 1440 },
  completeAtMs: 1440
};

function stateWithGrid(grid: Grid, phase: RunPhase): RunState {
  const base = createRun(501);
  return {
    ...base,
    phase,
    service: "kitchen",
    pendingSpin: {
      isFree: false,
      draw: {
        strips: base.reels,
        stops: [0, 0, 0],
        grid,
        rng: base.rng
      }
    }
  };
}

function labelsIn(element: HTMLElement): string[] {
  return within(element).queryAllByRole("img").map((node) => node.getAttribute("aria-label") ?? "");
}

function reelStates(): string[] {
  return screen.getAllByTestId("reel").map((reel) => reel.getAttribute("data-reel-state") ?? "");
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => vi.useFakeTimers());

describe("SlotMachine", () => {
  it("keeps every authoritative label private until that reel reaches its planned stop", () => {
    const stable = stateWithGrid(STABLE_GRID, "AWAITING_INTERVENTION");
    const spinning = stateWithGrid(FINAL_GRID, "SPINNING");
    const { rerender } = render(
      <SlotMachine state={stable} motionPlan={null} reducedMotion={false} />
    );

    rerender(<SlotMachine state={spinning} motionPlan={BASE_PLAN} reducedMotion={false} />);
    const machine = screen.getByRole("region", { name: "老虎机转轮" });
    expect(labelsIn(machine)).toEqual([]);
    expect(machine).not.toHaveTextContent(/樱桃|柠檬|铃铛|幸运7|百搭|食物|裂纹/);
    expect(screen.getAllByTestId("filler-tape")).toHaveLength(3);
    expect(screen.getAllByTestId("filler-tape").every((tape) => tape.getAttribute("aria-hidden") === "true")).toBe(true);

    act(() => vi.advanceTimersByTime(999));
    expect(labelsIn(machine)).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(labelsIn(screen.getAllByTestId("reel")[0]!)).toEqual(["樱桃", "柠檬", "铃铛"]);
    expect(labelsIn(screen.getAllByTestId("reel")[1]!)).toEqual([]);

    act(() => vi.advanceTimersByTime(219));
    expect(labelsIn(screen.getAllByTestId("reel")[1]!)).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(labelsIn(screen.getAllByTestId("reel")[1]!)).toEqual(["幸运7", "百搭", "食物"]);

    act(() => vi.advanceTimersByTime(219));
    expect(labelsIn(screen.getAllByTestId("reel")[2]!)).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(labelsIn(machine)).toEqual([
      "樱桃", "柠檬", "铃铛",
      "幸运7", "百搭", "食物",
      "裂纹", "樱桃", "柠檬"
    ]);
    expect(screen.getAllByTestId("cell")).toHaveLength(9);
  });

  it.each([
    {
      name: "normal respin",
      plan: {
        cycleKey: "4:RESPIN_REEL:1",
        kind: "respin",
        spinningReels: [1],
        revealAtMs: { 1: 620 },
        completeAtMs: 620
      } satisfies ReelMotionPlan,
      before: ["static", "moving", "static"],
      revealMs: 620
    },
    {
      name: "kick",
      plan: {
        cycleKey: "4:KICK_REEL:2",
        kind: "kick",
        spinningReels: [2],
        revealAtMs: { 2: 620 },
        completeAtMs: 620
      } satisfies ReelMotionPlan,
      before: ["static", "static", "moving"],
      revealMs: 620
    },
    {
      name: "repair lock",
      plan: {
        cycleKey: "4:LOCK_AND_RESPIN_OTHERS:1",
        kind: "repair-lock",
        spinningReels: [0, 2],
        revealAtMs: { 0: 480, 2: 620 },
        completeAtMs: 620
      } satisfies ReelMotionPlan,
      before: ["moving", "locked", "moving"],
      revealMs: 620
    }
  ])("moves only the shared plan reels for $name", ({ plan, before, revealMs }) => {
    const stable = stateWithGrid(STABLE_GRID, "AWAITING_INTERVENTION");
    const spinning = stateWithGrid(FINAL_GRID, "SPINNING");
    const { rerender } = render(
      <SlotMachine state={stable} motionPlan={null} reducedMotion={false} />
    );

    rerender(<SlotMachine state={spinning} motionPlan={plan} reducedMotion={false} />);
    expect(reelStates()).toEqual(before);
    expect(screen.getAllByTestId("filler-tape")).toHaveLength(plan.spinningReels.length);

    act(() => vi.advanceTimersByTime(revealMs));
    expect(labelsIn(screen.getByRole("region", { name: "老虎机转轮" }))).toEqual([
      "樱桃", "柠檬", "铃铛",
      "幸运7", "百搭", "食物",
      "裂纹", "樱桃", "柠檬"
    ]);
  });

  it("uses explicit replay grids instead of exposing the already-resolved pending grid", () => {
    const resolved: Grid = [
      ["lemon", "blank", "blank"],
      ["blank", "lemon", "blank"],
      ["blank", "blank", "lemon"]
    ];
    const replayInitial: Grid = [
      ["cherry", "blank", "blank"],
      ["blank", "cherry", "blank"],
      ["blank", "blank", "cherry"]
    ];
    const replayFrame: Grid = [
      ["lemon", "blank", "blank"],
      ["blank", "cherry", "blank"],
      ["blank", "blank", "cherry"]
    ];
    const state = stateWithGrid(resolved, "RESOLVING_EFFECTS");
    const { rerender } = render(
      <SlotMachine state={state} motionPlan={null} reducedMotion={false} displayGrid={replayInitial} />
    );

    expect(screen.getAllByRole("img", { name: "樱桃" })).toHaveLength(3);
    expect(screen.queryByRole("img", { name: "柠檬" })).not.toBeInTheDocument();

    rerender(
      <SlotMachine
        state={state}
        motionPlan={null}
        reducedMotion={false}
        displayGrid={replayFrame}
        changedCells={[{ reel: 0, row: 0 }]}
      />
    );
    expect(screen.getAllByRole("img", { name: "柠檬" })).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: "樱桃" })).toHaveLength(2);
    expect(document.querySelector("[data-cell='0-0']")).toHaveAttribute("data-changed", "true");
    expect(document.querySelector("[data-cell='1-1']")).not.toHaveAttribute("data-changed");
  });

  it("maps highlighted payline ids to the exact union of PAYLINES cells", () => {
    render(
      <SlotMachine
        state={stateWithGrid(FINAL_GRID, "AWAITING_INTERVENTION")}
        motionPlan={null}
        reducedMotion={false}
        highlightedLineIds={["top", "diagonal-up"]}
      />
    );

    const highlighted = screen.getAllByTestId("cell").filter((cell) => cell.getAttribute("data-highlighted") === "true");
    expect(highlighted.map((cell) => cell.getAttribute("data-cell"))).toEqual([
      "0-0", "0-2", "1-0", "1-1", "2-0"
    ]);
  });

  it("shows a smoked static cover then reveals every reduced-motion reel at 160ms", () => {
    const reducedPlan: ReelMotionPlan = {
      ...BASE_PLAN,
      revealAtMs: { 0: 160, 1: 160, 2: 160 },
      completeAtMs: 160
    };
    const stable = stateWithGrid(STABLE_GRID, "AWAITING_INTERVENTION");
    const spinning = stateWithGrid(FINAL_GRID, "SPINNING");
    const { rerender } = render(
      <SlotMachine state={stable} motionPlan={null} reducedMotion />
    );

    rerender(<SlotMachine state={spinning} motionPlan={reducedPlan} reducedMotion />);
    expect(screen.getAllByTestId("reduced-reel-cover")).toHaveLength(3);
    expect(labelsIn(screen.getByRole("region", { name: "老虎机转轮" }))).toEqual([]);

    act(() => vi.advanceTimersByTime(159));
    expect(labelsIn(screen.getByRole("region", { name: "老虎机转轮" }))).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(labelsIn(screen.getByRole("region", { name: "老虎机转轮" }))).toHaveLength(9);
  });

  it("uses the same deterministic filler tape for different authoritative outcomes", () => {
    const alternateGrid: Grid = [
      ["seven", "seven", "seven"],
      ["wild", "wild", "wild"],
      ["lemon", "lemon", "lemon"]
    ];
    const first = render(
      <SlotMachine state={stateWithGrid(FINAL_GRID, "SPINNING")} motionPlan={BASE_PLAN} reducedMotion={false} />
    );
    const firstTape = first.container.querySelectorAll("[data-testid='filler-tape']")[1]!.innerHTML;
    first.unmount();

    const second = render(
      <SlotMachine state={stateWithGrid(alternateGrid, "SPINNING")} motionPlan={BASE_PLAN} reducedMotion={false} />
    );
    const secondTape = second.container.querySelectorAll("[data-testid='filler-tape']")[1]!.innerHTML;

    expect(secondTape).toBe(firstTape);
    expect(secondTape).not.toContain("aria-label");
  });

  it("cancels an old cycle's reveal timers when a new cycle replaces it", () => {
    const firstPlan: ReelMotionPlan = {
      ...BASE_PLAN,
      cycleKey: "2:SPIN:first"
    };
    const replacementPlan: ReelMotionPlan = {
      ...BASE_PLAN,
      cycleKey: "4:RESPIN:replacement",
      revealAtMs: { 0: 1200, 1: 1400, 2: 1600 },
      completeAtMs: 1600
    };
    const stable = stateWithGrid(STABLE_GRID, "AWAITING_INTERVENTION");
    const spinning = stateWithGrid(FINAL_GRID, "SPINNING");
    const { rerender } = render(
      <SlotMachine state={stable} motionPlan={null} reducedMotion={false} />
    );
    rerender(<SlotMachine state={spinning} motionPlan={firstPlan} reducedMotion={false} />);
    act(() => vi.advanceTimersByTime(500));

    rerender(<SlotMachine state={spinning} motionPlan={replacementPlan} reducedMotion={false} />);
    act(() => vi.advanceTimersByTime(500));
    expect(labelsIn(screen.getByRole("region", { name: "老虎机转轮" }))).toEqual([]);
    act(() => vi.advanceTimersByTime(699));
    expect(labelsIn(screen.getByRole("region", { name: "老虎机转轮" }))).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(labelsIn(screen.getAllByTestId("reel")[0]!)).toEqual(["樱桃", "柠檬", "铃铛"]);
  });

  it("restarts visual timing when reduced motion changes inside the same cycle", () => {
    const reducedPlan: ReelMotionPlan = {
      ...BASE_PLAN,
      revealAtMs: { 0: 160, 1: 160, 2: 160 },
      completeAtMs: 160
    };
    const stable = stateWithGrid(STABLE_GRID, "AWAITING_INTERVENTION");
    const spinning = stateWithGrid(FINAL_GRID, "SPINNING");
    const { rerender } = render(
      <SlotMachine state={stable} motionPlan={null} reducedMotion={false} />
    );
    rerender(<SlotMachine state={spinning} motionPlan={reducedPlan} reducedMotion />);
    act(() => vi.advanceTimersByTime(100));

    rerender(<SlotMachine state={spinning} motionPlan={BASE_PLAN} reducedMotion={false} />);
    act(() => vi.advanceTimersByTime(60));
    expect(labelsIn(screen.getByRole("region", { name: "老虎机转轮" }))).toEqual([]);
    act(() => vi.advanceTimersByTime(939));
    expect(labelsIn(screen.getByRole("region", { name: "老虎机转轮" }))).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(labelsIn(screen.getAllByTestId("reel")[0]!)).toEqual(["樱桃", "柠檬", "铃铛"]);
  });

  it("uses authoritative unchanged reels when an intervention cycle mounts without a prior stable ref", () => {
    const respinPlan: ReelMotionPlan = {
      cycleKey: "4:RESPIN_REEL:1",
      kind: "respin",
      spinningReels: [1],
      revealAtMs: { 1: 620 },
      completeAtMs: 620
    };

    render(
      <SlotMachine
        state={stateWithGrid(FINAL_GRID, "SPINNING")}
        motionPlan={respinPlan}
        reducedMotion={false}
      />
    );

    expect(labelsIn(screen.getAllByTestId("reel")[0]!)).toEqual(["樱桃", "柠檬", "铃铛"]);
    expect(labelsIn(screen.getAllByTestId("reel")[1]!)).toEqual([]);
    expect(labelsIn(screen.getAllByTestId("reel")[2]!)).toEqual(["裂纹", "樱桃", "柠檬"]);
  });
});
