import { createClassic, isClassicState, settleSpin, type ClassicState } from "./engine";

export const CLASSIC_KEY = "midnight-lucky-hotel.classic.v1";
export interface ClassicSnapshot { readonly raw: string; readonly state: ClassicState }
type Store = Pick<Storage, "getItem" | "setItem">;

export function saveClassic(previous: ClassicSnapshot, state: ClassicState, storage: Store = localStorage): ClassicSnapshot {
  // An older tab must never overwrite newer credits/results. No hotel keys are read or written.
  if (storage.getItem(CLASSIC_KEY) !== previous.raw) throw new Error("classic-conflict");
  if (!isClassicState(state)) throw new Error("classic-invalid");
  const raw = JSON.stringify(state);
  storage.setItem(CLASSIC_KEY, raw);
  return { raw, state };
}
export function openClassic(storage: Store = localStorage, seed = crypto.getRandomValues(new Uint32Array(1))[0]!): ClassicSnapshot {
  const raw = storage.getItem(CLASSIC_KEY);
  if (raw === null) {
    const state = createClassic(seed);
    const serialized = JSON.stringify(state);
    storage.setItem(CLASSIC_KEY, serialized);
    return { raw: serialized, state };
  }
  let state: unknown;
  try { state = JSON.parse(raw); } catch { throw new Error("classic-invalid"); }
  if (!isClassicState(state)) throw new Error("classic-invalid");
  const snapshot = { raw, state };
  return state.pending === null ? snapshot : saveClassic(snapshot, settleSpin(state), storage);
}
/** Only call after explicit confirmation; overwrites this mode's session, not hotel archives. */
export function resetClassic(previousRaw: string | null, storage: Store = localStorage): ClassicSnapshot {
  if (storage.getItem(CLASSIC_KEY) !== previousRaw) throw new Error("classic-conflict");
  const state = createClassic(crypto.getRandomValues(new Uint32Array(1))[0]!);
  const raw = JSON.stringify(state);
  storage.setItem(CLASSIC_KEY, raw);
  return { raw, state };
}
