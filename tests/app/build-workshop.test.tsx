import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BuildWorkshop, BuildWorkshopButton } from "@/app/components/BuildWorkshop";
import { HelpPauseContext } from "@/app/components/HelpWindow";
import { buildDefaultUpgradeChoice } from "@/app/upgrade-choice";
import { createRun, dispatchCommand } from "@/core/run";
import type { RunState } from "@/core/types";
import { setLanguage } from "@/i18n/language";
import { BLUEPRINT_STORAGE_KEY } from "@/workshop/blueprints";

beforeEach(() => { localStorage.clear(); setLanguage("zh", false); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const ready = (patch: Partial<RunState> = {}): RunState => ({ ...createRun(8), phase: "READY_TO_SPIN", service: "kitchen",
  partSlots: [{ id: "harvest-vat", level: 1 }, null, null, null, null], ...patch });
function Harness({ initial }: { initial: RunState }): React.JSX.Element {
  const [state, setState] = useState(initial);
  return <BuildWorkshop state={state} onCommand={(action) => { const result = dispatchCommand(state, action); if (result.ok) setState(result.state); }} />;
}

it("opens a paused read-only diagnosis and closes without commands", () => {
  const command = vi.fn(); const pause = vi.fn();
  render(<HelpPauseContext.Provider value={pause}><BuildWorkshopButton state={ready()} onCommand={command} /></HelpPauseContext.Provider>);
  fireEvent.click(screen.getByRole("button", { name: /构筑工坊/ }));
  expect(screen.getByRole("dialog", { name: "构筑工坊" })).toHaveTextContent("基础信息免费查看");
  expect(pause).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "关闭工坊" }));
  expect(pause).toHaveBeenLastCalledWith(false); expect(command).not.toHaveBeenCalled();
});

it("requires explicit confirmation to shelve a charged part and can restore it", () => {
  render(<Harness initial={ready({ counters: { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 2 } })} />);
  fireEvent.click(screen.getByRole("button", { name: "组装" }));
  fireEvent.click(screen.getByRole("button", { name: "工作槽 1 · 陈酿果桶 L1" }));
  fireEvent.click(screen.getByRole("button", { name: "备用槽 1 · 空" }));
  expect(screen.getByText(/移入备用的部件会清空/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "工作槽 1 · 陈酿果桶 L1" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "确认换装" }));
  fireEvent.click(screen.getByRole("button", { name: "备用槽 1 · 陈酿果桶 L1" }));
  fireEvent.click(screen.getByRole("button", { name: "工作槽 1 · 空" }));
  fireEvent.click(screen.getByRole("button", { name: "确认换装" }));
  expect(screen.getByRole("button", { name: "工作槽 1 · 陈酿果桶 L1" })).toBeInTheDocument();
});

it("shows free symbol proportions and spends one arrangement only on confirmation", () => {
  render(<Harness initial={ready()} />);
  fireEvent.click(screen.getByRole("button", { name: "编排" }));
  expect(screen.getByText("图案占比 · 免费查看")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^位置 1 ·/ }));
  fireEvent.click(screen.getByRole("button", { name: /^位置 8 ·/ }));
  expect(screen.getByText("编排次数：可用 1 次")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "确认编排 · 本回合 1 次" }));
  expect(screen.getByText("本回合已编排；下一回合恢复。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^位置 1 ·/ })).toBeDisabled();
});

it("tests and saves an isolated build without commands or official storage writes", () => {
  const state = ready(); const before = JSON.stringify(state); const command = vi.fn();
  localStorage.setItem("midnight-lucky-hotel.run.v2", "untouched-official-record");
  render(<BuildWorkshop state={state} onCommand={command} />);
  fireEvent.click(screen.getByRole("button", { name: "试机收藏" }));
  fireEvent.change(screen.getByLabelText("收藏名称"), { target: { value: "果园实验" } });
  fireEvent.click(screen.getByRole("button", { name: "收藏当前" }));
  expect(localStorage.getItem(BLUEPRINT_STORAGE_KEY)).toContain("果园实验");
  fireEvent.click(screen.getByRole("button", { name: "独立试转 12 次" }));
  expect(screen.getByRole("region", { name: "试机结果" })).toHaveTextContent("12 付费");
  expect(command).not.toHaveBeenCalled(); expect(JSON.stringify(state)).toBe(before);
  expect(localStorage.getItem("midnight-lucky-hotel.run.v2")).toBe("untouched-official-record");
});

it("keeps mid-round editing locked while independent tests remain available", () => {
  render(<Harness initial={ready({ baseSpinsInShift: 1 })} />);
  fireEvent.click(screen.getByRole("button", { name: "组装" }));
  expect(screen.getByRole("button", { name: "工作槽 1 · 陈酿果桶 L1" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "试机收藏" }));
  expect(screen.getByRole("button", { name: "独立试转 12 次" })).toBeEnabled();
});

it("upgrades an owned reserve part without replacing an active slot", () => {
  const state = ready({ workbench: { name: "", reserve: [{ id: "salad-dressing", level: 1 }, null] },
    currentCandidates: { synergy: "salad-dressing", pivot: "carbon-copy", wildcard: "cherry-pitter" } });
  expect(buildDefaultUpgradeChoice(state, "salad-dressing")).toEqual({ id: "salad-dressing", action: "apply" });
});

it("renders the workshop instructions in English", () => {
  setLanguage("en", false);
  render(<BuildWorkshop state={ready()} onCommand={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Test & save" }));
  expect(screen.getByText(/Fixed ¥10 bet, 12 paid spins/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Blueprint name"), { target: { value: "柠檬汽水" } });
  fireEvent.click(screen.getByRole("button", { name: "Save current" }));
  expect(screen.getByRole("option", { name: "柠檬汽水" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Test 12 paid spins" }));
  expect(within(screen.getByRole("region", { name: "Experiment result" })).getByText(/Test receipt/)).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Experiment result" })).getByText("柠檬汽水")).toBeInTheDocument();
});
