export type BaseSymbolId = "cherry" | "lemon" | "bell" | "seven";
export type SymbolId = BaseSymbolId | "wild" | "blank" | "food" | "crack";
export type ReelIndex = 0 | 1 | 2;
export type RowIndex = 0 | 1 | 2;
export type ReelWindow = readonly [SymbolId, SymbolId, SymbolId];
export type Grid = readonly [ReelWindow, ReelWindow, ReelWindow];
export type ReelStrip = readonly SymbolId[];
export type ReelSet = readonly [ReelStrip, ReelStrip, ReelStrip];
export type StopSet = readonly [number, number, number];
export type PaySymbolId = BaseSymbolId | "wild";
export type Paytable = Readonly<Record<PaySymbolId, number>>;

export interface LineWin {
  readonly lineId: "top" | "middle" | "bottom" | "diagonal-down" | "diagonal-up";
  readonly symbol: PaySymbolId;
  readonly cells: readonly [
    readonly [ReelIndex, RowIndex],
    readonly [ReelIndex, RowIndex],
    readonly [ReelIndex, RowIndex]
  ];
  readonly multiplier: number;
}

export interface RngState {
  readonly value: number;
}

export interface RandomIntResult {
  readonly value: number;
  readonly rng: RngState;
}

export interface ReelDraw {
  readonly strips: ReelSet;
  readonly stops: StopSet;
  readonly grid: Grid;
  readonly rng: RngState;
}
