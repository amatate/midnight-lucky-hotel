import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MioPortrait } from "@/meta/MioPortrait";

afterEach(cleanup);

it("keeps a visible placeholder until the current expression loads", () => {
  const { container, rerender } = render(<MioPortrait expression="welcome" framing="avatar" />);
  expect(screen.getByText("M")).toBeInTheDocument();
  fireEvent.load(container.querySelector("img")!);
  expect(container.firstChild).toHaveAttribute("data-ready", "true");
  expect(screen.queryByText("M")).not.toBeInTheDocument();
  rerender(<MioPortrait expression="thinking" framing="avatar" />);
  expect(container.firstChild).toHaveAttribute("data-ready", "false");
  expect(screen.getByText("M")).toBeInTheDocument();
  fireEvent.load(container.querySelector("img")!);
  expect(container.firstChild).toHaveAttribute("data-ready", "true");
});

it("can load another expression after one image fails", () => {
  const { container, rerender } = render(<MioPortrait expression="thinking" />);
  fireEvent.error(container.querySelector("img")!);
  expect(screen.getByText("M")).toBeInTheDocument();
  rerender(<MioPortrait expression="smile" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "/art/concierge/mio-smile-v2.webp");
  fireEvent.load(container.querySelector("img")!);
  expect(screen.queryByText("M")).not.toBeInTheDocument();
});
