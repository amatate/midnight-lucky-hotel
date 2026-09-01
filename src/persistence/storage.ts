import type { RunState } from "@/core/types";
import { MAX_SNAPSHOT_BYTES } from "@/persistence/codec-shared";
import { migrateRunStateV1 } from "@/persistence/migrate-v1";
import { decodeRunStateV1 } from "@/persistence/schema-v1";
import { decodeRunStateV2 } from "@/persistence/schema-v2";

export const RUN_STORAGE_KEY = "midnight-lucky-hotel.run.v2";
export const LEGACY_RUN_STORAGE_KEY = "midnight-lucky-hotel.run.v1";

export type LoadRunResult =
  | { readonly ok: true; readonly state: RunState }
  | { readonly ok: false; readonly reason: "MISSING" | "INVALID_SNAPSHOT" };

function decodeSerialized<T>(serialized: string, decode: (value: unknown) => T | null): T | null {
  if (serialized.length > MAX_SNAPSHOT_BYTES) return null;
  try {
    return decode(JSON.parse(serialized));
  } catch {
    return null;
  }
}

export function saveRun(state: RunState): void {
  if (decodeRunStateV2(state) === null) return;
  try {
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is optional; gameplay must remain available in restricted contexts.
  }
}

export function loadRun(): LoadRunResult {
  let serializedV2: string | null;
  try {
    serializedV2 = localStorage.getItem(RUN_STORAGE_KEY);
  } catch {
    return { ok: false, reason: "INVALID_SNAPSHOT" };
  }
  if (serializedV2 !== null) {
    const state = decodeSerialized(serializedV2, decodeRunStateV2);
    return state === null ? { ok: false, reason: "INVALID_SNAPSHOT" } : { ok: true, state };
  }

  let serializedV1: string | null;
  try {
    serializedV1 = localStorage.getItem(LEGACY_RUN_STORAGE_KEY);
  } catch {
    return { ok: false, reason: "INVALID_SNAPSHOT" };
  }
  if (serializedV1 === null) return { ok: false, reason: "MISSING" };
  const legacy = decodeSerialized(serializedV1, decodeRunStateV1);
  if (legacy === null) return { ok: false, reason: "INVALID_SNAPSHOT" };
  const state = migrateRunStateV1(legacy);
  if (state === null) return { ok: false, reason: "INVALID_SNAPSHOT" };
  saveRun(state);
  return { ok: true, state };
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_STORAGE_KEY);
  } catch {
    // Persistence is optional; restart should still work.
  }
  try {
    localStorage.removeItem(LEGACY_RUN_STORAGE_KEY);
  } catch {
    // Persistence is optional; restart should still work.
  }
}
