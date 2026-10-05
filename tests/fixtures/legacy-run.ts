import { createRun } from "@/core/run";
import type { RunState } from "@/core/types";

/** Historical fixtures keep the five-shift opening; journey tests use createRun directly. */
export function createLegacyRun(seed: number): RunState {
  const { introShifts: _intro, routeKits: _kits, ...state } = createRun(seed);
  return { ...state, checkoutTarget: 200 };
}
