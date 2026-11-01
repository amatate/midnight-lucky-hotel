import type { PartId, ServiceId, UpgradeId, UpgradeRoute } from "@/core/types";
import type { QuestId } from "@/meta/guestbook";

// Art-only coordinates. Do not put sprite locations in rules, RNG or save data.
export const UI_ATLAS = { file: "art/hotel-icons-v1.webp", columns: 6, rows: 4, cell: 256 } as const;
export const UI_ART_INDEX = {
  "lemon-crate": 0, "cherry-pitter": 1, "seven-purification": 2,
  "tithe-box": 3, "artificial-crack": 4, "pruning-shears": 5,
  "carbon-copy": 6, calculator: 7, ledger: 8, "statistics-terminal": 9,
  "route-fruit": 10, "route-chapel": 11, "route-neutral": 12,
  "route-violent": 13, "route-information": 14,
  "keepsake-first-spin": 15, "keepsake-read-ledger": 16, "keepsake-two-cabinets": 17,
  "keepsake-first-part": 18, "keepsake-four-cabinets": 19, "keepsake-eight-parts": 20,
  "keepsake-garden": 21, "keepsake-penthouse": 22, "keepsake-all-rooms": 23
} as const satisfies Record<Exclude<UpgradeId, PartId> | `route-${UpgradeRoute}` | `keepsake-${QuestId}`, number>;
export type UiArtId = keyof typeof UI_ART_INDEX;

// Generation follows a 6×4 layout, but objects are not perfectly on the grid.
// Measured alpha silhouettes + a small edge allowance avoid clipped handles
// and neighboring sprites. Actual clipping happens inside the SVG as well.
const UI_ART_FRAMES = [
  [20, 40, 240, 208], [279, 29, 234, 223], [545, 54, 195, 196],
  [775, 39, 226, 222], [1033, 80, 222, 151], [1279, 46, 241, 216],
  [31, 274, 213, 232], [262, 309, 265, 188], [528, 279, 241, 235],
  [780, 289, 239, 220], [1052, 286, 206, 207], [1300, 286, 206, 207],
  [35, 529, 209, 208], [286, 529, 209, 209], [538, 529, 207, 207],
  [793, 529, 211, 210], [1080, 515, 149, 225], [1282, 528, 236, 207],
  [26, 757, 222, 220], [275, 782, 250, 171], [546, 750, 220, 230],
  [770, 758, 245, 215], [1028, 757, 239, 213], [1280, 749, 236, 233]
] as const;

export const SERVICE_ART_ROUTE: Readonly<Record<ServiceId, UpgradeRoute>> = {
  kitchen: "fruit", chapel: "chapel", repair: "neutral", security: "violent"
};

export function uiArtViewBox(id: UiArtId): string {
  return uiArtFrame(id).join(" ");
}

export function uiArtFrame(id: UiArtId): readonly [number, number, number, number] {
  return UI_ART_FRAMES[UI_ART_INDEX[id]];
}
