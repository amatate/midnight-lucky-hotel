import { nextInt } from "@/core/random";
import type { Grid, ReelDraw, ReelIndex, ReelSet, ReelStrip, ReelWindow, RngState, StopSet } from "@/core/types";

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

export function drawReels(strips: ReelSet, rng: RngState): ReelDraw {
  const first = nextInt(rng, strips[0].length);
  const second = nextInt(first.rng, strips[1].length);
  const third = nextInt(second.rng, strips[2].length);
  const stops: StopSet = [first.value, second.value, third.value];

  return { strips, stops, grid: gridAt(strips, stops), rng: third.rng };
}

export function advanceReel(draw: ReelDraw, reelIndex: ReelIndex, steps: number): ReelDraw {
  const stops: [number, number, number] = [...draw.stops];
  const reelLength = draw.strips[reelIndex].length;
  stops[reelIndex] = modulo(stops[reelIndex] + steps, reelLength);

  const advancedWindow = windowAt(draw.strips[reelIndex], stops[reelIndex]);
  const grid: [ReelWindow, ReelWindow, ReelWindow] = [...draw.grid];
  grid[reelIndex] = advancedWindow;

  return { strips: draw.strips, stops, grid, rng: draw.rng };
}
