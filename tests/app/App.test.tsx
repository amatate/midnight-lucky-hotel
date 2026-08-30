import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { App } from "@/app/App";

const appStyles = readFileSync(resolve(process.cwd(), "src/app/styles.css"), "utf8");

afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-task7-safe-area-style]").forEach((style) => style.remove());
});

it("renders the midnight hotel cabinet", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "午夜好运酒店" })).toBeVisible();
  expect(screen.getByRole("region", { name: "午夜好运老虎机" })).toBeVisible();
});

it.each(["(max-width: 360px)", "(min-width: 390px)"])(
  "keeps independent left and right safe-area sources at %s",
  (condition) => {
    const style = document.createElement("style");
    style.dataset.task7SafeAreaStyle = "true";
    style.textContent = appStyles;
    document.head.append(style);

    const media = Array.from(style.sheet!.cssRules)
      .find((rule): rule is CSSMediaRule => "conditionText" in rule && (rule as CSSMediaRule).conditionText === condition);
    expect(media).toBeDefined();
    const gamePage = Array.from(media?.cssRules ?? [])
      .find((rule): rule is CSSStyleRule => "selectorText" in rule && (rule as CSSStyleRule).selectorText === ".game-page");

    expect(gamePage).toBeDefined();
    expect(gamePage!.style.getPropertyValue("padding-left")).toContain("env(safe-area-inset-left)");
    expect(gamePage!.style.getPropertyValue("padding-right")).toContain("env(safe-area-inset-right)");
    expect(gamePage!.style.getPropertyValue("padding-inline")).toBe("");
  }
);
