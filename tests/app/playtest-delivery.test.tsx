import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { FeedbackButton } from "@/app/components/FeedbackButton";
import { createUpdateController } from "@/app/update-policy";
import { UpdateNotice } from "@/app/components/UpdateNotice";

afterEach(cleanup);
it("discloses the minimal feedback payload before opening an editable GitHub draft", async () => {
  render(<FeedbackButton seed={12345} />);
  await userEvent.click(screen.getByRole("button", { name: "反馈问题" }));
  const dialog = screen.getByRole("dialog", { name: "反馈问题" });
  expect(dialog).toHaveTextContent("不会自动上传");
  const link = screen.getByRole("link", { name: "到 GitHub 填写反馈" });
  const url = new URL(link.getAttribute("href")!);
  expect(url.origin + url.pathname).toBe("https://github.com/amatate/midnight-lucky-hotel/issues/new");
  expect(url.searchParams.get("body")).toContain("12345");
  expect(url.searchParams.get("body")).toContain("规则版本");
  expect(url.searchParams.get("body")).not.toMatch(/bankroll|commandHistory|localStorage/);
  expect(dialog).toHaveTextContent("种子");
});

it("defers update activation to the lobby and only reloads after user approval", async () => {
  const reload = vi.fn();
  const controller = createUpdateController(reload);
  const activate = vi.fn(async () => {});
  controller.offer(activate);
  const { rerender } = render(<UpdateNotice playing controller={controller} />);
  expect(screen.getByRole("button", { name: "更新游戏" })).toBeDisabled();
  await controller.apply();
  expect(activate).not.toHaveBeenCalled();
  rerender(<UpdateNotice playing={false} controller={controller} />);
  await userEvent.click(screen.getByRole("button", { name: "更新游戏" }));
  expect(activate).toHaveBeenCalledOnce();
  controller.activationReady();
  expect(reload).toHaveBeenCalledOnce();
});

it("never lets another tab's activation or a delayed activation refresh an active game", async () => {
  const reload = vi.fn(); const controller = createUpdateController(reload);
  controller.activationReady();
  expect(reload).not.toHaveBeenCalled();
  controller.setPlaying(false);
  controller.offer(async () => {});
  await controller.apply();
  controller.setPlaying(true);
  controller.activationReady();
  expect(reload).not.toHaveBeenCalled();
  controller.setPlaying(false);
  expect(reload).not.toHaveBeenCalled();
  await controller.apply();
  expect(reload).toHaveBeenCalledOnce();
});
