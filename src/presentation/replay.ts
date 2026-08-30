import type { GameEvent } from "@/core/events";
import type { Grid, ReelIndex, ReelWindow, RowIndex, SymbolId } from "@/core/types";

export interface GridReplayFrame {
  readonly sequence: number;
  readonly grid: Grid;
  readonly changedCells: readonly { reel: ReelIndex; row: RowIndex }[];
}

export interface GridReplay {
  readonly initialGrid: Grid | null;
  readonly frames: readonly GridReplayFrame[];
  readonly finalGrid: Grid | null;
}

type MutableGrid = [SymbolId[], SymbolId[], SymbolId[]];

function cloneGrid(grid: Grid): Grid {
  return grid.map((reel) => [...reel] as ReelWindow) as unknown as Grid;
}

function mutableGrid(grid: Grid): MutableGrid {
  return grid.map((reel) => [...reel]) as MutableGrid;
}

function isCellIndex(value: number): value is ReelIndex | RowIndex {
  return Number.isInteger(value) && value >= 0 && value <= 2;
}

export function buildGridReplay(events: readonly GameEvent[]): GridReplay {
  const lastDraw = events.reduce<Extract<GameEvent, { type: "REELS_DRAWN" }> | null>((latest, event) => {
    if (event.type !== "REELS_DRAWN") return latest;
    return latest === null || event.sequence >= latest.sequence ? event : latest;
  }, null);
  if (lastDraw === null) return { initialGrid: null, frames: [], finalGrid: null };

  const initialGrid = cloneGrid(lastDraw.draw.grid);
  const current = mutableGrid(lastDraw.draw.grid);
  const frames: GridReplayFrame[] = [];
  const changes = events
    .filter((event): event is Extract<GameEvent, { type: "SYMBOL_CHANGED" }> =>
      event.type === "SYMBOL_CHANGED" && event.sequence > lastDraw.sequence)
    .sort((left, right) => left.sequence - right.sequence);

  for (const change of changes) {
    if (!isCellIndex(change.reel) || !isCellIndex(change.row)) continue;
    if (current[change.reel][change.row] !== change.from) continue;
    current[change.reel][change.row] = change.to;
    frames.push({
      sequence: change.sequence,
      grid: cloneGrid(current as unknown as Grid),
      changedCells: [{ reel: change.reel, row: change.row }]
    });
  }

  return { initialGrid, frames, finalGrid: cloneGrid(current as unknown as Grid) };
}
