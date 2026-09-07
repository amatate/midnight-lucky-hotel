import type { Paytable, ReelSet } from "@/core/types";

export const BASE_REELS: ReelSet = [
  ["cherry", "lemon", "cherry", "bell", "blank", "lemon", "cherry", "seven", "lemon", "bell", "cherry", "wild"],
  ["lemon", "cherry", "bell", "cherry", "wild", "lemon", "blank", "cherry", "seven", "lemon", "cherry", "bell"],
  ["bell", "cherry", "lemon", "blank", "cherry", "seven", "lemon", "cherry", "wild", "bell", "lemon", "cherry"]
];

export const BASE_PAYTABLE = {
  cherry: 0.6,
  lemon: 0.9,
  bell: 1.5,
  seven: 3.5,
  wild: 5.5
} as const satisfies Paytable;
