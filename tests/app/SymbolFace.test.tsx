import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SYMBOL_LABELS } from "@/app/labels";
import { SymbolFace } from "@/app/components/SymbolFace";
import type { SymbolId } from "@/core/types";

const SYMBOLS: readonly SymbolId[] = [
  "cherry",
  "lemon",
  "bell",
  "seven",
  "wild",
  "blank",
  "food",
  "crack"
];

afterEach(cleanup);

describe("SymbolFace", () => {
  it.each(SYMBOLS)("renders %s as labelled enamel art with a vector fallback for failed loads", (symbol) => {
    const { container } = render(<SymbolFace symbol={symbol} />);

    const face = screen.getByRole("img", { name: SYMBOL_LABELS[symbol] });
    const art = face.querySelector("img")!;
    expect(art).toHaveAttribute("src", expect.stringContaining(`art/reels/${symbol}-v2.webp`));
    expect(face.querySelector("svg")).toBeNull();
    fireEvent.error(art);
    expect(face.querySelector("svg")).toBeInTheDocument();
    expect(face).toHaveAttribute("data-symbol", symbol);
    expect(container).not.toHaveTextContent(/🍒|🍋|🔔|🍲|★|╱/u);
    expect(container.textContent).toBe("");
  });

  it("removes decorative tape faces from the accessibility tree", () => {
    const { container } = render(<SymbolFace symbol="seven" decorative />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild).not.toHaveAttribute("aria-label");
  });
});
