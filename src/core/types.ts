import type { GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";

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

export type RunPhase =
  | "CHOOSING_SERVICE"
  | "READY_TO_SPIN"
  | "SPINNING"
  | "AWAITING_INTERVENTION"
  | "RESOLVING_EFFECTS"
  | "CHOOSING_UPGRADE"
  | "SHIFT_COMPLETE"
  | "RUN_WON"
  | "RUN_LOST"
  | "AFTER_HOURS";

export type BetMode = "conservative" | "normal" | "aggressive";
export type Money = number;
export type ServiceId = "repair" | "kitchen" | "chapel" | "security";
export type AttributionSource = "base" | "part" | "intervention" | "service" | "agitation" | "overload";
export type CommandErrorCode = "INVALID_PHASE" | "INSUFFICIENT_FUNDS" | "INVALID_TARGET" | "RESOURCE_EXHAUSTED";

export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
}

export type PartId =
  | "lemon-infection"
  | "jam-jar"
  | "fruit-salad"
  | "leftovers"
  | "omen-collector"
  | "triple-blessing"
  | "midnight-bell"
  | "martyr-coin"
  | "scrap-magnet"
  | "loose-spring"
  | "blank-capacitor"
  | "warranty-fraud"
  | "overload-motor"
  | "safety-fuse";

export type UpgradeId =
  | "lemon-crate"
  | "cherry-pitter"
  | "lemon-infection"
  | "jam-jar"
  | "fruit-salad"
  | "leftovers"
  | "seven-purification"
  | "tithe-box"
  | "omen-collector"
  | "triple-blessing"
  | "midnight-bell"
  | "martyr-coin"
  | "artificial-crack"
  | "scrap-magnet"
  | "loose-spring"
  | "blank-capacitor"
  | "warranty-fraud"
  | "overload-motor"
  | "pruning-shears"
  | "carbon-copy"
  | "safety-fuse"
  | "calculator"
  | "ledger"
  | "statistics-terminal";

export type ContractId = "combination" | "discipline" | "rescue";
export type CounterId = "blankCharge" | "cherryWinsThisShift";
export type ExpenseSource = "wagers" | "kitchen" | "chapel" | "repair";

export interface CandidateSet {
  readonly synergy: UpgradeId;
  readonly pivot: UpgradeId;
  readonly wildcard: UpgradeId;
}

export interface PartInstance {
  readonly id: PartId;
  readonly level: 1 | 2;
}

export interface TimedBuff {
  readonly id: "food";
  readonly spinsRemaining: number;
  readonly additivePayout: number;
}

export interface ContractState {
  readonly id: ContractId;
  readonly targetSymbol?: BaseSymbolId;
  readonly target: number;
  readonly progress: number;
  readonly completed: boolean;
  readonly rewardClaimed: boolean;
  readonly startBankroll: Money;
  readonly interventionsUsed: number;
}

export interface ShiftFlags {
  readonly foodBought: boolean;
  readonly prayerUsed: boolean;
  readonly kickUsed: boolean;
  readonly repairLockUsed: boolean;
  readonly martyrEnabled: boolean;
  readonly warrantyPaid: boolean;
  readonly returnedFoodCount: number;
}

export interface ShiftSnapshot {
  readonly shift: number;
  readonly bankroll: Money;
  readonly reels: ReelSet;
  readonly parts: readonly PartInstance[];
  readonly totalWager: Money;
  readonly totalPayout: Money;
}

export interface RunState {
  readonly schemaVersion: 1;
  readonly initialSeed: number;
  readonly rng: RngState;
  readonly phase: RunPhase;
  readonly bankroll: Money;
  readonly checkoutTarget: 200;
  readonly shift: number;
  readonly baseSpinsInShift: number;
  readonly shiftWager: Money;
  readonly shiftPayout: Money;
  readonly baseBet: Money;
  readonly betMode: BetMode;
  readonly interventionPoints: number;
  readonly maxInterventionPoints: number;
  readonly nextShiftFocusBonus: number;
  readonly interventionUsedThisSpin: boolean;
  readonly reels: ReelSet;
  readonly temporaryReelAdditions: ReelSet;
  readonly pendingSpin: { readonly draw: ReelDraw; readonly isFree: boolean } | null;
  readonly freeSpinQueue: number;
  readonly service: ServiceId | null;
  readonly serviceCandidates: readonly [ServiceId, ServiceId, ServiceId];
  readonly tips: number;
  readonly agitation: number;
  readonly omen: number;
  readonly counters: Readonly<Record<CounterId, number>>;
  readonly shiftFlags: ShiftFlags;
  readonly partSlots: readonly [
    PartInstance | null,
    PartInstance | null,
    PartInstance | null,
    PartInstance | null,
    PartInstance | null
  ];
  readonly toolLevel: 0 | 1 | 2 | 3;
  readonly buffs: readonly TimedBuff[];
  readonly contract: ContractState | null;
  readonly afterHoursLevel: number;
  readonly exitUnlocked: boolean;
  readonly currentCandidates: CandidateSet | null;
  readonly acquiredUpgrades: readonly UpgradeId[];
  readonly pendingEvents: readonly GameEvent[];
  readonly attribution: Readonly<Record<AttributionSource, number>>;
  readonly expenses: Readonly<Record<ExpenseSource, Money>>;
  readonly shiftHistory: readonly ShiftSnapshot[];
  readonly commandHistory: readonly GameCommand[];
}
