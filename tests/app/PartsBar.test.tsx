import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PartsBar } from "@/app/components/PartsBar";
import { createRun } from "@/core/run";
import type { RunState } from "@/core/types";

afterEach(cleanup);

describe("PartsBar", () => {
  it("shows the complete rule, L1 to L2 delta, live progress, and only shared part attribution", () => {
    const state: RunState = {
      ...createRun(91),
      phase: "READY_TO_SPIN",
      service: "kitchen",
      counters: { ...createRun(91).counters, cherryWinsThisShift: 2 },
      partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null],
      attribution: { ...createRun(91).attribution, part: 42.5 }
    };
    render(<PartsBar state={state} />);

    const panel = screen.getByRole("region", { name: "部件栏" });
    expect(within(panel).getByText("本局全部部件贡献 ¥42.5")).toBeVisible();
    const part = within(panel).getByText("果酱罐 · L1").closest("details")!;
    expect(within(part).getByText(/每条樱桃中奖线都会充能/)).toBeInTheDocument();
    expect(within(part).getByText(/L1 → L2/).closest("p")).toHaveTextContent("0.5 × 当前下注提高为 1 × 当前下注");
    expect(within(part).getByText(/本班已有 2 条樱桃中奖线/).closest("p")).toHaveTextContent("下一条额外赔付 ¥10");
    expect(within(part).getByText(/当前状态：等待触发/)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/shift-scaling|fruit|cherry/);
    expect(panel).not.toHaveTextContent(/果酱罐贡献/);
  });

  it("reports the current presentation's disabled state without inventing a per-part total", () => {
    const state: RunState = {
      ...createRun(92),
      phase: "RESOLVING_EFFECTS",
      service: "security",
      partSlots: [{ id: "scrap-magnet", level: 2 }, null, null, null, null],
      pendingEvents: [{ sequence: 1, type: "PART_DISABLED", partId: "scrap-magnet", slot: 0 }]
    };
    render(<PartsBar state={state} />);

    expect(screen.getByText("废料磁铁 · L2")).toBeVisible();
    expect(screen.getByText(/本转状态：因可见裂纹失效/)).toBeInTheDocument();
    expect(screen.getByText(/L1 → L2/).closest("p")).toHaveTextContent("4 × 当前下注");
  });
});
