import { isClassicState } from "./engine";
import { CLASSIC_KEY, openClassic, resetClassic, saveClassic } from "./storage";
import { createMachine, isFeatureMachineState, isFeatureState, settleMachineSpin, type MachineId, type MachineState } from "./machines";

export interface MachineSnapshot { readonly raw: string; readonly state: MachineState }
type Store = Pick<Storage, "getItem" | "setItem">;
export const machineKey = (id: MachineId): string => id === "original" ? CLASSIC_KEY : `midnight-lucky-hotel.classic.${id}.v1`;
function valid(id: MachineId, state: unknown): state is MachineState {
  return id === "original" ? isClassicState(state) && !("machine" in state) : isFeatureMachineState(state, id);
}
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
export function saveMachine(id: MachineId, previous: MachineSnapshot, state: MachineState, storage: Store = localStorage): MachineSnapshot {
  if (!valid(id, state)) throw new Error("classic-invalid");
  if (id === "original" && !isFeatureState(state)) return saveClassic(previous, state, storage);
  if (storage.getItem(machineKey(id)) !== previous.raw) throw new Error("classic-conflict");
  const raw = JSON.stringify(state); storage.setItem(machineKey(id), raw); return { raw, state };
}
export function openMachine(id: MachineId, storage: Store = localStorage, initialSeed = seed()): MachineSnapshot {
  if (id === "original") return openClassic(storage, initialSeed);
  const raw = storage.getItem(machineKey(id));
  if (raw === null) {
    const state = createMachine(id, initialSeed); const serialized = JSON.stringify(state);
    storage.setItem(machineKey(id), serialized); return { raw: serialized, state };
  }
  let state: unknown; try { state = JSON.parse(raw); } catch { throw new Error("classic-invalid"); }
  if (!valid(id, state)) throw new Error("classic-invalid");
  const snapshot = { raw, state };
  return state.pending ? saveMachine(id, snapshot, settleMachineSpin(state), storage) : snapshot;
}
export function resetMachine(id: MachineId, previousRaw: string | null, storage: Store = localStorage): MachineSnapshot {
  if (id === "original") return resetClassic(previousRaw, storage);
  if (storage.getItem(machineKey(id)) !== previousRaw) throw new Error("classic-conflict");
  const state = createMachine(id, seed()); const raw = JSON.stringify(state);
  storage.setItem(machineKey(id), raw); return { raw, state };
}
