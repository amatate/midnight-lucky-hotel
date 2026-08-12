import { nextInt } from "@/core/random";
import type {
  Grid,
  ReelDraw,
  ReelEntryIdSet,
  ReelIndex,
  ReelSet,
  ReelStrip,
  ReelWindow,
  RngState,
  StopSet,
  VisibleSourceIds
} from "@/core/types";

const SYMBOL_IDS = new Set<unknown>(["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"]);

function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function windowAt(strip: ReelStrip, stop: number): ReelWindow {
  const start = modulo(stop, strip.length);
  return [strip[start]!, strip[(start + 1) % strip.length]!, strip[(start + 2) % strip.length]!];
}

function gridAt(strips: ReelSet, stops: StopSet): Grid {
  return [windowAt(strips[0], stops[0]), windowAt(strips[1], stops[1]), windowAt(strips[2], stops[2])];
}

function isSymbolId(value: unknown): value is ReelStrip[number] {
  return SYMBOL_IDS.has(value);
}

function sanitizeStrips(value: unknown): ReelSet {
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2].map((reel) => {
    const candidate = source[reel];
    if (!Array.isArray(candidate) || candidate.length === 0) return ["blank"];
    return Array.from({ length: candidate.length }, (_unused, index) =>
      Object.hasOwn(candidate, index) && isSymbolId(candidate[index]) ? candidate[index] : "blank"
    );
  }) as unknown as ReelSet;
}

export function entryIdsForStrips(strips: ReelSet): ReelEntryIdSet {
  return strips.map((strip) => strip.map((_symbol, index) => index)) as unknown as ReelEntryIdSet;
}

function denseArray(value: unknown, length: number): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function validRawStrips(value: unknown): value is ReelSet {
  return denseArray(value, 3) && value.every((strip) =>
    Array.isArray(strip) && strip.length > 0 &&
    Array.from({ length: strip.length }, (_unused, index) => index).every((index) =>
      Object.hasOwn(strip, index) && isSymbolId(strip[index])
    )
  );
}

function normalizeStops(value: unknown, strips: ReelSet): { readonly stops: StopSet; readonly valid: boolean } {
  if (!denseArray(value, 3) || !value.every((stop) => Number.isFinite(stop) && Number.isInteger(stop))) {
    return { stops: [0, 0, 0], valid: false };
  }
  return {
    stops: value.map((stop, reel) => modulo(stop as number, strips[reel]!.length)) as unknown as StopSet,
    valid: true
  };
}

function validGrid(value: unknown): value is Grid {
  return denseArray(value, 3) && value.every((row) =>
    denseArray(row, 3) && row.every(isSymbolId)
  );
}

function validSerializedEntryIds(strips: ReelSet, value: unknown): value is ReelEntryIdSet {
  if (!denseArray(value, 3)) return false;
  return value.every((candidate, reel) => {
    const strip = strips[reel]!;
    if (!denseArray(candidate, strip.length)) return false;
    const ids = candidate as readonly unknown[];
    return ids.every((id) => Number.isSafeInteger(id) && (id as number) >= 0) &&
      new Set(ids).size === ids.length;
  });
}

export function visibleSourceIdsAt(entryIds: ReelEntryIdSet, stops: StopSet): VisibleSourceIds {
  return entryIds.map((ids, reel) => {
    const start = modulo(stops[reel]!, ids.length);
    return [ids[start]!, ids[(start + 1) % ids.length]!, ids[(start + 2) % ids.length]!];
  }) as unknown as VisibleSourceIds;
}

function rebaseValidVisibleSources(draw: ReelDraw, oldEntryIds: ReelEntryIdSet): VisibleSourceIds | null {
  const value: unknown = draw.visibleSourceIds;
  if (!denseArray(value, 3)) return null;
  const rebased: number[][] = [];
  for (let reel = 0; reel < 3; reel += 1) {
    const candidate = value[reel];
    if (!denseArray(candidate, 3)) return null;
    const ids: number[] = [];
    for (let row = 0; row < 3; row += 1) {
      const oldId = candidate[row];
      if (!Number.isSafeInteger(oldId) || (oldId as number) < 0) return null;
      const sourceIndex = oldEntryIds[reel]!.indexOf(oldId as number);
      if (sourceIndex < 0 || draw.strips[reel]![sourceIndex] !== draw.grid[reel]![row]) return null;
      ids.push(sourceIndex);
    }
    rebased.push(ids);
  }
  return rebased as unknown as VisibleSourceIds;
}

function inferVisibleSources(strips: ReelSet, stops: StopSet, grid: Grid): VisibleSourceIds | null {
  const canonical = visibleSourceIdsAt(entryIdsForStrips(strips), stops);
  if (canonical.every((ids, reel) => ids.every((sourceIndex, row) =>
    strips[reel]![sourceIndex] === grid[reel]![row]
  ))) {
    return canonical;
  }
  const inferred: number[][] = [];
  for (let reel = 0; reel < 3; reel += 1) {
    const ids: number[] = [];
    for (let row = 0; row < 3; row += 1) {
      const sourceIndex = strips[reel]!.indexOf(grid[reel]![row]!);
      if (sourceIndex < 0) return null;
      ids.push(sourceIndex);
    }
    inferred.push(ids);
  }
  return inferred as unknown as VisibleSourceIds;
}

export function normalizeDrawIdentity(draw: ReelDraw): ReelDraw & {
  readonly entryIds: ReelEntryIdSet;
  readonly visibleSourceIds: VisibleSourceIds;
} {
  const rawStrips: unknown = draw?.strips;
  const rawStripsAreValid = validRawStrips(rawStrips);
  const strips = rawStripsAreValid ? rawStrips : sanitizeStrips(rawStrips);
  const normalizedStops = normalizeStops(draw?.stops, strips);
  const stops = normalizedStops.stops;
  const entryIds = entryIdsForStrips(strips);
  const canonicalGrid = gridAt(strips, stops);
  const rawGrid: unknown = draw?.grid;
  const coreValid = rawStripsAreValid && normalizedStops.valid && validGrid(rawGrid);

  if (coreValid) {
    const rawEntryIds: unknown = draw.entryIds;
    if (validSerializedEntryIds(strips, rawEntryIds)) {
      const visibleSourceIds = rebaseValidVisibleSources(
        { ...draw, strips, stops, grid: rawGrid } as ReelDraw,
        rawEntryIds
      );
      if (visibleSourceIds !== null) {
        return { ...draw, strips, stops, grid: rawGrid, entryIds, visibleSourceIds };
      }
    }
    const inferred = inferVisibleSources(strips, stops, rawGrid);
    if (inferred !== null) {
      return { ...draw, strips, stops, grid: rawGrid, entryIds, visibleSourceIds: inferred };
    }
  }

  return {
    ...draw,
    strips,
    stops,
    grid: canonicalGrid,
    entryIds,
    visibleSourceIds: visibleSourceIdsAt(entryIds, stops)
  };
}

export function drawReels(strips: ReelSet, rng: RngState): ReelDraw {
  const safeStrips = sanitizeStrips(strips);
  const first = nextInt(rng, safeStrips[0].length);
  const second = nextInt(first.rng, safeStrips[1].length);
  const third = nextInt(second.rng, safeStrips[2].length);
  const stops: StopSet = [first.value, second.value, third.value];

  const entryIds = entryIdsForStrips(safeStrips);
  return {
    strips: safeStrips,
    stops,
    grid: gridAt(safeStrips, stops),
    rng: third.rng,
    entryIds,
    visibleSourceIds: visibleSourceIdsAt(entryIds, stops)
  };
}

export function advanceReel(draw: ReelDraw, reelIndex: ReelIndex, steps: number): ReelDraw {
  const normalized = normalizeDrawIdentity(draw);
  const stops: [number, number, number] = [...normalized.stops];
  const reelLength = normalized.strips[reelIndex].length;
  stops[reelIndex] = modulo(stops[reelIndex] + steps, reelLength);

  const advancedWindow = windowAt(normalized.strips[reelIndex], stops[reelIndex]);
  const grid: [ReelWindow, ReelWindow, ReelWindow] = [...normalized.grid];
  grid[reelIndex] = advancedWindow;

  const entryIds = normalized.entryIds;
  const visibleSourceIds = normalized.visibleSourceIds.map((ids) => [...ids]) as [
      [number, number, number],
      [number, number, number],
      [number, number, number]
    ];
  visibleSourceIds[reelIndex] = visibleSourceIdsAt(entryIds, stops)[reelIndex] as [number, number, number];

  return { ...normalized, stops, grid, entryIds, visibleSourceIds };
}
