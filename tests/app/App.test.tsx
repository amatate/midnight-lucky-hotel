import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "@/app/App";

it("renders the midnight hotel cabinet", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "午夜好运酒店" })).toBeVisible();
  expect(screen.getByRole("region", { name: "午夜好运老虎机" })).toBeVisible();
});
