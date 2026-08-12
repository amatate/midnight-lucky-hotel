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

export function normalizeDrawIdentity(draw: ReelDraw): {
  readonly entryIds: ReelEntryIdSet;
  readonly visibleSourceIds: VisibleSourceIds;
} {
  const entryIds = entryIdsForStrips(draw.strips);
  const rawEntryIds: unknown = draw.entryIds;
  if (validSerializedEntryIds(draw.strips, rawEntryIds)) {
    const visibleSourceIds = rebaseValidVisibleSources(draw, rawEntryIds);
    if (visibleSourceIds !== null) return { entryIds, visibleSourceIds };
  }
  return { entryIds, visibleSourceIds: visibleSourceIdsAt(entryIds, draw.stops) };
}

export function drawReels(strips: ReelSet, rng: RngState): ReelDraw {
  const first = nextInt(rng, strips[0].length);
  const second = nextInt(first.rng, strips[1].length);
  const third = nextInt(second.rng, strips[2].length);
  const stops: StopSet = [first.value, second.value, third.value];

  const entryIds = entryIdsForStrips(strips);
  return {
    strips,
    stops,
    grid: gridAt(strips, stops),
    rng: third.rng,
    entryIds,
    visibleSourceIds: visibleSourceIdsAt(entryIds, stops)
  };
}

export function advanceReel(draw: ReelDraw, reelIndex: ReelIndex, steps: number): ReelDraw {
  const stops: [number, number, number] = [...draw.stops];
  const reelLength = draw.strips[reelIndex].length;
  stops[reelIndex] = modulo(stops[reelIndex] + steps, reelLength);

  const advancedWindow = windowAt(draw.strips[reelIndex], stops[reelIndex]);
  const grid: [ReelWindow, ReelWindow, ReelWindow] = [...draw.grid];
  grid[reelIndex] = advancedWindow;

  const identity = normalizeDrawIdentity(draw);
  const entryIds = identity.entryIds;
  const visibleSourceIds = identity.visibleSourceIds.map((ids) => [...ids]) as [
      [number, number, number],
      [number, number, number],
      [number, number, number]
    ];
  visibleSourceIds[reelIndex] = visibleSourceIdsAt(entryIds, stops)[reelIndex] as [number, number, number];

  return { strips: draw.strips, stops, grid, rng: draw.rng, entryIds, visibleSourceIds };
}
