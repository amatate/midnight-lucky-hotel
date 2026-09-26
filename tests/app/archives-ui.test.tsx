import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { useGame } from "@/app/useGame";
import { activeRecord, readLibrary } from "@/persistence/archives";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function start(): void {
  fireEvent.click(screen.getByRole("button", { name: "开始新局" }));
  fireEvent.click(screen.getByRole("button", { name: "继续游戏" }));
  fireEvent.click(within(screen.getByRole("group", { name: "选择服务" })).getAllByRole("button")[0]!);
}

it("shows gameplay choices in the full log and returns without advancing the game", () => {
  render(<App seed={12} />);
  start();
  const before = activeRecord(readLibrary())!.snapshot;
  fireEvent.click(screen.getByRole("button", { name: "菜单" }));
  fireEvent.click(screen.getByRole("button", { name: "完整日志" }));
  expect(screen.getByRole("region", { name: "完整游戏日志" })).toBeVisible();
  expect(screen.getByText(/选择服务 · /)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "核验记录一致性" }));
  expect(screen.getByText(/核验通过/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /^返回$/ }));
  expect(activeRecord(readLibrary())!.snapshot).toEqual(before);
});

it("saves a named checkpoint and restores it as a separate branch", () => {
  render(<App seed={12} />);
  start();
  fireEvent.click(screen.getByRole("button", { name: "菜单" }));
  fireEvent.click(screen.getByText(/存档与种子/));
  fireEvent.change(screen.getByLabelText("备份名称"), { target: { value: "水果测试存档" } });
  fireEvent.click(screen.getByRole("button", { name: "保存手动备份" }));
  expect(readLibrary().runs).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "返回前台" }));
  fireEvent.click(screen.getByRole("button", { name: "历史与存档" }));
  const checkpoint = screen.getByRole("heading", { name: "水果测试存档" }).closest("article")!;
  fireEvent.click(within(checkpoint).getByRole("button", { name: "恢复为续玩分支" }));
  expect(readLibrary().runs).toHaveLength(3);
  expect(activeRecord(readLibrary())!.origin).toBe("restored");
  expect(screen.getByRole("dialog", { name: "恢复上次进度" })).toBeVisible();
});

it("validates seeds and keeps the previous game when starting a new one", () => {
  render(<App seed={12} />);
  fireEvent.change(screen.getByLabelText("游戏种子"), { target: { value: "-1" } });
  fireEvent.click(screen.getByRole("button", { name: "开始新局" }));
  expect(screen.getByRole("status")).toHaveTextContent("种子必须");
  expect(readLibrary().runs).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("游戏种子"), { target: { value: "42" } });
  start();
  fireEvent.click(screen.getByRole("button", { name: "菜单" }));
  fireEvent.click(screen.getByRole("button", { name: "返回前台" }));
  fireEvent.change(screen.getByLabelText("游戏种子"), { target: { value: "43" } });
  fireEvent.click(screen.getByRole("button", { name: "开始新局" }));
  expect(readLibrary().runs.map((run) => run.snapshot.initialSeed)).toEqual([42, 43]);
});

it("lets players browse route explanations and favorite parts without altering a run", () => {
  render(<App seed={12} />);
  start();
  const before = activeRecord(readLibrary())!.snapshot;
  fireEvent.click(screen.getByRole("button", { name: "菜单" }));
  fireEvent.click(screen.getByRole("button", { name: "返回前台" }));
  fireEvent.click(screen.getByRole("button", { name: "收藏图鉴" }));
  fireEvent.change(screen.getByLabelText("搜索部件"), { target: { value: "柠檬感染" } });
  fireEvent.click(screen.getByRole("button", { name: "收藏部件" }));
  expect(readLibrary().favoriteUpgrades).toContain("lemon-infection");
  expect(activeRecord(readLibrary())!.snapshot).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "玩法与设置" }));
  fireEvent.click(screen.getByLabelText("静音"));
  expect(localStorage.getItem("midnight-lucky-hotel.muted")).toBe("1");
});

it("exposes quota failures and blocks further gameplay until the unsaved journal is persisted", () => {
  const { result } = renderHook(() => useGame(12));
  const serviceId = result.current.state.serviceCandidates[0];
  const setter = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  act(() => result.current.send({ type: "SELECT_SERVICE", serviceId }));
  expect(result.current.storageWarning).toContain("自动保存失败");
  expect(result.current.archive!.entries).toHaveLength(1);
  act(() => result.current.send({ type: "SPIN" }));
  expect(result.current.state.phase).toBe("READY_TO_SPIN");
  setter.mockRestore();
  act(() => result.current.retrySave());
  expect(result.current.storageWarning).toBeNull();
  expect(activeRecord(readLibrary())!.entries).toHaveLength(1);
});
