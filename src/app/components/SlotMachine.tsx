import { SYMBOL_LABELS } from "@/app/labels";
import type { Grid, RunState, SymbolId } from "@/core/types";

const SYMBOL_GLYPHS: Readonly<Record<SymbolId, string>> = {
  cherry: "🍒",
  lemon: "🍋",
  bell: "🔔",
  seven: "7",
  wild: "★",
  blank: "·",
  food: "🍲",
  crack: "╱"
};

function visibleGrid(state: RunState): Grid {
  if (state.pendingSpin !== null) return state.pendingSpin.draw.grid;
  return state.reels.map((strip) => [strip[0] ?? "blank", strip[1] ?? "blank", strip[2] ?? "blank"]) as unknown as Grid;
}

export function SlotMachine({ state }: { readonly state: RunState }): React.JSX.Element {
  const grid = visibleGrid(state);
  return (
    <section className={`slot-machine ${state.phase === "SPINNING" ? "is-spinning" : ""}`} aria-label="老虎机转轮">
      {grid.map((reel, reelIndex) => (
        <div className="reel" data-testid="reel" aria-label={`第${reelIndex + 1}轮`} key={reelIndex}>
          {reel.map((symbol, rowIndex) => (
            <div
              className={`symbol symbol-${symbol}`}
              data-testid="cell"
              role="img"
              aria-label={SYMBOL_LABELS[symbol]}
              key={`${rowIndex}-${symbol}`}
            >
              <span aria-hidden="true">{SYMBOL_GLYPHS[symbol]}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
