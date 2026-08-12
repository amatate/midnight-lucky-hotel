import type { Grid, RunState, SymbolId } from "@/core/types";

const SYMBOLS: Readonly<Record<SymbolId, { readonly glyph: string; readonly label: string }>> = {
  cherry: { glyph: "🍒", label: "樱桃" },
  lemon: { glyph: "🍋", label: "柠檬" },
  bell: { glyph: "🔔", label: "铃铛" },
  seven: { glyph: "7", label: "幸运7" },
  wild: { glyph: "★", label: "百搭" },
  blank: { glyph: "·", label: "空白" },
  food: { glyph: "🍲", label: "食物" },
  crack: { glyph: "╱", label: "裂纹" }
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
              aria-label={SYMBOLS[symbol].label}
              key={`${rowIndex}-${symbol}`}
            >
              <span aria-hidden="true">{SYMBOLS[symbol].glyph}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
