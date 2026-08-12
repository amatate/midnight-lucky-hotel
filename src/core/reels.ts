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

function validEntryIds(strips: ReelSet, candidate: ReelEntryIdSet | undefined): candidate is ReelEntryIdSet {
  return candidate !== undefined && candidate.length === 3 && candidate.every((ids, reel) =>
    ids.length === strips[reel]!.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => Number.isSafeInteger(id) && id >= 0 && id <= Number.MAX_SAFE_INTEGER - 101)
  );
}

export function normalizedEntryIds(draw: Pick<ReelDraw, "strips" | "entryIds">): ReelEntryIdSet {
  return validEntryIds(draw.strips, draw.entryIds) ? draw.entryIds : entryIdsForStrips(draw.strips);
}

export function visibleSourceIdsAt(entryIds: ReelEntryIdSet, stops: StopSet): VisibleSourceIds {
  return entryIds.map((ids, reel) => {
    const start = modulo(stops[reel]!, ids.length);
    return [ids[start]!, ids[(start + 1) % ids.length]!, ids[(start + 2) % ids.length]!];
  }) as unknown as VisibleSourceIds;
}

export function normalizedVisibleSourceIds(draw: ReelDraw, entryIds: ReelEntryIdSet): VisibleSourceIds {
  if (
    draw.visibleSourceIds !== undefined &&
    draw.visibleSourceIds.length === 3 &&
    draw.visibleSourceIds.every((sourceIds, reel) =>
      sourceIds.length === 3 && sourceIds.every((id, row) => {
        const index = entryIds[reel]!.indexOf(id);
        return index >= 0 && draw.strips[reel]![index] === draw.grid[reel]![row];
      })
    )
  ) {
    return draw.visibleSourceIds;
  }
  return visibleSourceIdsAt(entryIds, draw.stops);
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

  const entryIds = normalizedEntryIds(draw);
  const visibleSourceIds = normalizedVisibleSourceIds(draw, entryIds).map((ids) => [...ids]) as [
      [number, number, number],
      [number, number, number],
      [number, number, number]
    ];
  visibleSourceIds[reelIndex] = visibleSourceIdsAt(entryIds, stops)[reelIndex] as [number, number, number];

  return { strips: draw.strips, stops, grid, rng: draw.rng, entryIds, visibleSourceIds };
}
