import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoinBurst } from "@/app/components/CoinBurst";
import { Hud } from "@/app/components/Hud";
import { WinPresentation } from "@/app/components/WinPresentation";
import { PartsBar } from "@/app/components/PartsBar";
import { createRun } from "@/core/run";
import type { GameEvent } from "@/core/events";
import type { Grid, RunState } from "@/core/types";
import type { SettlementPresentationState } from "@/app/useSettlementPresentation";
import type { PresentationSummary } from "@/presentation/summary";
import appStyles from "@/app/styles.css?inline";

const GRID: Grid = [
  ["cherry", "blank", "blank"],
  ["cherry", "lemon", "blank"],
  ["cherry", "bell", "blank"]
];

function summary(patch: Partial<PresentationSummary> = {}): PresentationSummary {
  return {
    total: 20,
    lines: [{
      sequence: 1,
      lineId: "top",
      symbol: "cherry",
      amount: 20,
      cells: [[0, 0], [1, 0], [2, 0]]
    }],
    partTriggers: [],
    effectCount: 0,
    chainLength: 1,
    freeSpinsGranted: 0,
    tier: "win",
    ...patch
  };
}

function state(events: readonly GameEvent[], patch: Partial<RunState> = {}): RunState {
  const base = createRun(606);
  return {
    ...base,
    phase: "RESOLVING_EFFECTS",
    service: "kitchen",
    bankroll: 120,
    pendingSpin: {
      isFree: false,
      draw: { strips: base.reels, stops: [0, 0, 0], grid: GRID, rng: base.rng }
    },
    pendingEvents: events,
    ...patch
  };
}

function presentation(
  currentEvent: GameEvent | null,
  currentSummary: PresentationSummary = summary(),
  patch: Partial<SettlementPresentationState> = {}
): SettlementPresentationState {
  return {
    summary: currentSummary,
    currentEvent,
    eventIndex: currentEvent === null ? 0 : 1,
    eventTotal: currentEvent === null ? 0 : 1,
    activeLineIds: currentEvent?.type === "LINE_WIN" ? [currentEvent.lineId as "top"] : [],
    activePartId: currentEvent?.type === "PART_TRIGGERED" ? currentEvent.partId : null,
    changedCells: [],
    displayGrid: GRID,
    done: false,
    accelerated: false,
    speedUp: vi.fn(),
    skip: vi.fn(),
    ...patch
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.querySelectorAll("[data-task6-test-style]").forEach((style) => style.remove());
});

describe("CoinBurst", () => {
  it("measures a cabinet-level path from the real win area to the HUD balance and keeps every point inside mobile width", async () => {
    const rect = (x: number, y: number, width: number, height: number): DOMRect => ({
      x,
      y,
      width,
      height,
      top: y,
      right: x + width,
      bottom: y + height,
      left: x,
      toJSON: () => ({})
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("data-anchor") === "cabinet") return rect(100, 50, 320, 700);
      if (this.getAttribute("data-anchor") === "win-area") return rect(130, 330, 260, 180);
      if (this.getAttribute("data-anchor") === "balance") return rect(118, 90, 100, 30);
      return rect(0, 0, 0, 0);
    });
    const CoinGeometryHarness = () => {
      const cabinetRef = useRef<HTMLDivElement>(null);
      const winAreaRef = useRef<HTMLDivElement>(null);
      const balanceRef = useRef<HTMLDivElement>(null);
      return (
        <div data-anchor="cabinet" data-coin-cabinet="true" ref={cabinetRef}>
          <div data-anchor="balance" ref={balanceRef} />
          <div data-anchor="win-area" ref={winAreaRef} />
          <CoinBurst
            count={80}
            containerRef={cabinetRef}
            sourceRef={winAreaRef}
            destinationRef={balanceRef}
          />
        </div>
      );
    };
    const style = document.createElement("style");
    style.dataset.task6TestStyle = "true";
    style.textContent = appStyles;
    document.head.append(style);
    const { container } = render(<CoinGeometryHarness />);

    const burst = screen.getByTestId("coin-burst");
    await waitFor(() => expect(rectSpy).toHaveBeenCalled());
    expect(burst).toHaveAttribute("aria-hidden", "true");
    expect(burst).toHaveAttribute("data-overlay-scope", "cabinet");
    expect(burst).toHaveAttribute("data-source-x", "160");
    expect(burst).toHaveAttribute("data-source-y", "370");
    expect(burst).toHaveAttribute("data-target-x", "68");
    expect(burst).toHaveAttribute("data-target-y", "55");
    expect(container.querySelectorAll(".coin-particle")).toHaveLength(48);
    expect(container.querySelector(".coin-particle")).toHaveStyle({
      "--coin-start-x": "151px",
      "--coin-start-y": "365px",
      "--coin-apex-x": "102px",
      "--coin-apex-y": "11px",
      "--coin-end-x": "62px",
      "--coin-end-y": "51px",
      "--coin-mid-rotation": "-81deg",
      "--coin-rotation": "-180deg",
      "--coin-delay": "0ms"
    });
    for (const particle of container.querySelectorAll<HTMLElement>(".coin-particle")) {
      for (const property of ["--coin-start-x", "--coin-apex-x", "--coin-end-x"]) {
        const value = Number.parseFloat(particle.style.getPropertyValue(property));
        expect(value).toBeGreaterThanOrEqual(7);
        expect(value).toBeLessThanOrEqual(313);
      }
    }
    expect(getComputedStyle(burst).position).toBe("absolute");
    expect(getComputedStyle(burst).inset).toBe("0px");
    expect(getComputedStyle(burst).overflow).toBe("visible");
  });
});

describe("food buff tickets", () => {
  it("reveals each new three-spin +25% layer only when its causal food event is presented", () => {
    const firstFood = { sequence: 2, type: "FOOD_CONSUMED", reel: 0 } as const;
    const secondFood = { sequence: 5, type: "FOOD_CONSUMED", reel: 2 } as const;
    const resolving = state([secondFood, firstFood], {
      buffs: [
        { id: "food", spinsRemaining: 2, additivePayout: 0.25 },
        { id: "food", spinsRemaining: 3, additivePayout: 0.25 },
        { id: "food", spinsRemaining: 3, additivePayout: 0.25 }
      ]
    });
    const { rerender } = render(
      <Hud state={resolving} estimate={null} estimateStatus="idle" presentedThroughSequence={1} />
    );

    let status = screen.getByRole("region", { name: "食物加成" });
    expect(within(status).getByText("食物加成 1 层")).toBeVisible();
    expect(within(status).getByLabelText("第 1 层 +25%，剩余 2/3 次转动")).toBeVisible();
    expect(within(status).getAllByTestId("food-ticket").map((ticket) => ticket.getAttribute("data-active"))).toEqual([
      "true", "true", null
    ]);

    rerender(<Hud state={resolving} estimate={null} estimateStatus="idle" presentedThroughSequence={2} />);
    status = screen.getByRole("region", { name: "食物加成" });
    expect(within(status).getByText("食物加成 2 层")).toBeVisible();
    expect(within(status).getByLabelText("第 2 层 +25%，剩余 3/3 次转动")).toBeVisible();

    rerender(<Hud state={resolving} estimate={null} estimateStatus="idle" presentedThroughSequence={4} />);
    expect(within(screen.getByRole("region", { name: "食物加成" })).getAllByTestId("food-buff-stack")).toHaveLength(2);

    rerender(<Hud state={resolving} estimate={null} estimateStatus="idle" presentedThroughSequence={5} />);
    status = screen.getByRole("region", { name: "食物加成" });
    expect(within(status).getByText("食物加成 3 层")).toBeVisible();
    expect(within(status).getAllByTestId("food-buff-stack")).toHaveLength(3);
    expect(within(status).getByLabelText("第 1 层 +25%，剩余 2/3 次转动")).toBeVisible();
    expect(within(status).getByLabelText("第 2 层 +25%，剩余 3/3 次转动")).toBeVisible();
    expect(within(status).getByLabelText("第 3 层 +25%，剩余 3/3 次转动")).toBeVisible();
    expect(within(status).getAllByTestId("food-ticket").filter((ticket) => (
      ticket.getAttribute("data-active") === "true"
    ))).toHaveLength(8);
  });

  it("tears one of the three visible cells after each later spin and removes the layer at 3→2→1→0", () => {
    const ready = { ...createRun(606), phase: "READY_TO_SPIN", service: "kitchen" } as const;
    const withRemaining = (spinsRemaining: number): RunState => ({
      ...ready,
      buffs: spinsRemaining === 0 ? [] : [{ id: "food", spinsRemaining, additivePayout: 0.25 }]
    });
    const { rerender } = render(<Hud state={withRemaining(3)} estimate={null} estimateStatus="idle" />);

    const activeCells = () => within(screen.getByRole("region", { name: "食物加成" }))
      .queryAllByTestId("food-ticket")
      .filter((ticket) => ticket.getAttribute("data-active") === "true");
    expect(activeCells()).toHaveLength(3);

    rerender(<Hud state={withRemaining(2)} estimate={null} estimateStatus="idle" />);
    expect(activeCells()).toHaveLength(2);
    expect(screen.getByLabelText("第 1 层 +25%，剩余 2/3 次转动")).toBeVisible();

    rerender(<Hud state={withRemaining(1)} estimate={null} estimateStatus="idle" />);
    expect(activeCells()).toHaveLength(1);
    expect(screen.getByLabelText("第 1 层 +25%，剩余 1/3 次转动")).toBeVisible();

    rerender(<Hud state={withRemaining(0)} estimate={null} estimateStatus="idle" />);
    expect(screen.getByText("食物加成 0 层")).toBeVisible();
    expect(screen.queryByTestId("food-buff-stack")).not.toBeInTheDocument();
  });
});

describe("WinPresentation", () => {
  it("keeps exact payout, balance destination, line count, part count, and cause chain visible", () => {
    const event = { sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 20, source: "base" } as const;
    const currentSummary = summary({
      total: 35,
      partTriggers: [{ sequence: 2, partId: "jam-jar", level: 1 }],
      chainLength: 2,
      tier: "chain"
    });
    render(<WinPresentation
      state={state([event], { bankroll: 135 })}
      presentation={presentation(event, currentSummary)}
      reducedMotion={false}
    />);

    const region = screen.getByRole("region", { name: "结算演出队列" });
    expect(within(region).getByText("+¥35")).toBeVisible();
    expect(within(region).getByText("飞向余额 ¥135")).toBeVisible();
    expect(within(region).getByText("1 条中奖线 · 1 次部件触发 · 因果链 2")).toBeVisible();
    expect(within(region).getByText("樱桃顶线 +¥20")).toBeVisible();
    expect(within(region).queryByTestId("coin-burst")).not.toBeInTheDocument();
    expect(region).toHaveStyle({ "--cabinet-shake": "3px" });
  });

  it("keeps the full static result accessible while reduced motion removes coins and shake", () => {
    const event = { sequence: 1, type: "OVERLOAD", amount: 80 } as const;
    render(<WinPresentation
      state={state([event], { bankroll: 180 })}
      presentation={presentation(event, summary({
        total: 80,
        lines: [],
        partTriggers: [],
        effectCount: 6,
        chainLength: 0,
        tier: "runaway"
      }))}
      reducedMotion
    />);

    const region = screen.getByRole("region", { name: "结算演出队列" });
    expect(within(region).getByText("+¥80")).toBeVisible();
    expect(within(region).getByText("飞向余额 ¥180")).toBeVisible();
    expect(within(region).getByText("机器过载 +¥80")).toBeVisible();
    expect(within(region).queryByTestId("coin-burst")).not.toBeInTheDocument();
    expect(region).toHaveAttribute("data-reduced-motion", "true");
    expect(region).toHaveStyle({ "--cabinet-shake": "0px" });
  });

  it.each([
    [
      { sequence: 1, type: "FOOD_CONSUMED", reel: 1 } as const,
      "第2轮食物已消耗：这份食物提供 1 层 +25%，接下来 3 次转动有效；多份食物的层数可叠加"
    ],
    [
      { sequence: 1, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 } as const,
      "果酱罐：樱桃刻度 2 → 3"
    ],
    [
      { sequence: 1, type: "PART_TRIGGERED", partId: "fruit-salad", level: 1 } as const,
      "水果沙拉：字面樱桃 + 柠檬 + 铃铛；百搭不能代替"
    ],
    [
      { sequence: 1, type: "PART_TRIGGERED", partId: "leftovers", level: 2 } as const,
      "剩菜打包：本班返回食物额度 1/2"
    ]
  ])("uses an explicit fruit-route cause label", (event, expected) => {
    const run = state([event], {
      counters: { blankCharge: 0, cherryWinsThisShift: 3 },
      shiftFlags: { ...createRun(606).shiftFlags, returnedFoodCount: 1 },
      partSlots: [
        event.type === "PART_TRIGGERED" ? { id: event.partId, level: event.level } : null,
        null,
        null,
        null,
        null
      ]
    });
    render(<WinPresentation state={run} presentation={presentation(event)} reducedMotion={false} />);

    expect(screen.getByText(expected)).toBeVisible();
  });

  it("names an added payout by its truthful source instead of calling every award a chain", () => {
    const event = { sequence: 1, type: "PAYOUT_ADDED", amount: 15, source: "service" } as const;
    render(<WinPresentation state={state([event])} presentation={presentation(event)} reducedMotion={false} />);

    expect(screen.getByText("服务追加赔付 +¥15")).toBeVisible();
    expect(screen.queryByText(/连锁赔付/)).not.toBeInTheDocument();
  });

  it("derives jam and leftovers per-event ordinals from causal sequence even when input storage is unsorted", () => {
    const jamEarly = { sequence: 2, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 } as const;
    const jamLate = { sequence: 8, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 } as const;
    const jamState = state([jamLate, jamEarly], {
      counters: { blankCharge: 0, cherryWinsThisShift: 4 },
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null]
    });
    const { rerender } = render(
      <WinPresentation state={jamState} presentation={presentation(jamEarly)} reducedMotion={false} />
    );
    expect(screen.getByText("果酱罐：樱桃刻度 2 → 3")).toBeVisible();
    rerender(<WinPresentation state={jamState} presentation={presentation(jamLate)} reducedMotion={false} />);
    expect(screen.getByText("果酱罐：樱桃刻度 3 → 4")).toBeVisible();

    const leftoversEarly = { sequence: 3, type: "PART_TRIGGERED", partId: "leftovers", level: 2 } as const;
    const leftoversLate = { sequence: 9, type: "PART_TRIGGERED", partId: "leftovers", level: 2 } as const;
    const leftoversState = state([leftoversLate, leftoversEarly], {
      shiftFlags: { ...createRun(606).shiftFlags, returnedFoodCount: 2 },
      partSlots: [{ id: "leftovers", level: 2 }, null, null, null, null]
    });
    rerender(<WinPresentation state={leftoversState} presentation={presentation(leftoversEarly)} reducedMotion={false} />);
    expect(screen.getByText("剩菜打包：本班返回食物额度 1/2")).toBeVisible();
    rerender(<WinPresentation state={leftoversState} presentation={presentation(leftoversLate)} reducedMotion={false} />);
    expect(screen.getByText("剩菜打包：本班返回食物额度 2/2")).toBeVisible();
  });
});

describe("PartsBar settlement lamp", () => {
  it("derives part status from causal sequence when recovered events are stored out of order", () => {
    const draw = { strips: GRID, stops: [0, 0, 0] as const, grid: GRID, rng: { value: 1 } };
    const recovered = state([
      { sequence: 2, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 },
      { sequence: 1, type: "REELS_DRAWN", draw }
    ], {
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null]
    });

    render(<PartsBar state={recovered} activePartId="jam-jar" presentedThroughSequence={2} />);

    expect(screen.getByText(/本转状态：已经触发/)).toBeInTheDocument();
  });

  it("lights only the lowest-index matching non-disabled slot in a malformed duplicate recovery", () => {
    const recovered = state([
      { sequence: 1, type: "PART_DISABLED", partId: "jam-jar", slot: 0 },
      { sequence: 2, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 }
    ], {
      partSlots: [
        { id: "jam-jar", level: 1 },
        { id: "jam-jar", level: 1 },
        { id: "jam-jar", level: 1 },
        null,
        null
      ]
    });
    render(<PartsBar state={recovered} activePartId="jam-jar" presentedThroughSequence={2} />);

    const slots = screen.getAllByTestId("part-slot");
    expect(slots.map((slot) => slot.getAttribute("data-active"))).toEqual([null, "true", null, null, null]);
  });

  it("lights no duplicate slot when every matching part is causally disabled", () => {
    const recovered = state([
      { sequence: 1, type: "PART_DISABLED", partId: "jam-jar", slot: 0 },
      { sequence: 2, type: "PART_DISABLED", partId: "jam-jar", slot: 1 },
      { sequence: 3, type: "PART_TRIGGERED", partId: "jam-jar", level: 1 }
    ], {
      partSlots: [{ id: "jam-jar", level: 1 }, { id: "jam-jar", level: 1 }, null, null, null]
    });
    render(<PartsBar state={recovered} activePartId="jam-jar" presentedThroughSequence={3} />);

    expect(screen.getAllByTestId("part-slot").filter((slot) => slot.getAttribute("data-active") === "true")).toHaveLength(0);
  });
});
