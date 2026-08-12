import type { Paytable, ReelSet } from "@/core/types";

export const BASE_REELS: ReelSet = [
  ["cherry", "lemon", "cherry", "bell", "blank", "lemon", "cherry", "seven", "lemon", "bell", "cherry", "wild"],
  ["lemon", "cherry", "bell", "cherry", "wild", "lemon", "blank", "cherry", "seven", "lemon", "cherry", "bell"],
  ["bell", "cherry", "lemon", "blank", "cherry", "seven", "lemon", "cherry", "wild", "bell", "lemon", "cherry"]
];

export const BASE_PAYTABLE = {
  cherry: 0.8,
  lemon: 1.2,
  bell: 2,
  seven: 5,
  wild: 8
} as const satisfies Paytable;
