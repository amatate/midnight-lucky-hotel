import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "@/app/App";

it("renders the functional prototype shell", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "午夜好运酒店" })).toBeVisible();
  expect(screen.getByText("功能原型")).toBeVisible();
});
