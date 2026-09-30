import { useCallback, useRef, useState } from "react";
import type { GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { createRun, dispatchCommand } from "@/core/run";
import type { CommandError, RunState } from "@/core/types";
import { loadRun, saveRun } from "@/persistence/storage";
import { playCommandSound, playEventTone } from "@/presentation/audio";
import {
  activeRecord, backupSession, openArchiveSession, persistSession, readLibrary, recordAction, startArchivedRun,
  type ArchiveSession, type RunArchive
} from "@/persistence/archives";

export interface GameController {
  readonly state: RunState;
  readonly events: readonly GameEvent[];
  readonly error: CommandError | null;
  readonly wasRecovered: boolean;
  readonly archive: RunArchive | null;
  readonly storageWarning: string | null;
  readonly send: (command: GameCommand) => void;
  readonly sendAutomatic: (command: GameCommand) => void;
  readonly retrySave: () => boolean;
  readonly backup: (name: string) => boolean;
  readonly restartSameSeed: () => void;
  readonly restartNextSeed: () => void;
}

function nextSeed(seed: number): number {
  return (Math.trunc(seed) + 0x9e37_79b9) >>> 0;
}

export function useGame(seed: number, initialState?: RunState): GameController {
  const recovered = useRef<boolean | null>(null);
  const archiveRef = useRef<ArchiveSession | null>(null);
  const initializationWarning = useRef<string | null>(null);
  const [state, setState] = useState<RunState>(() => {
    if (initialState !== undefined) {
      recovered.current = false;
      return initialState;
    }
    let next: RunState;
    try {
      const saved = activeRecord(readLibrary());
      next = saved?.snapshot ?? createRun(seed);
      recovered.current = saved !== null;
      archiveRef.current = openArchiveSession(next);
    } catch (cause) {
      const loaded = loadRun();
      next = loaded.ok ? loaded.state : createRun(seed);
      recovered.current = loaded.ok;
      initializationWarning.current = cause instanceof Error ? cause.message : "无法读取档案。";
    }
    return next;
  });
  const stateRef = useRef(state);
  const [events, setEvents] = useState<readonly GameEvent[]>([]);
  const [error, setError] = useState<CommandError | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(initializationWarning.current);
  const [, refreshArchive] = useState(0);

  const retrySave = useCallback(() => {
    if (archiveRef.current === null) return false;
    persistSession(archiveRef.current);
    setStorageWarning(archiveRef.current.warning);
    refreshArchive((value) => value + 1);
    return archiveRef.current.warning === null;
  }, []);

  const backup = useCallback((name: string) => {
    if (archiveRef.current === null) return false;
    backupSession(archiveRef.current, name);
    setStorageWarning(archiveRef.current.warning);
    refreshArchive((value) => value + 1);
    return archiveRef.current.warning === null;
  }, []);

  const replaceRun = useCallback((runSeed: number) => {
    const session = archiveRef.current;
    if (session !== null) {
      persistSession(session);
      if (session.warning !== null) { setStorageWarning(session.warning); return; }
      try {
        const library = startArchivedRun(session.library, runSeed);
        const record = activeRecord(library)!;
        archiveRef.current = { library, record, warning: null };
        stateRef.current = record.snapshot;
        setState(record.snapshot);
      } catch (cause) { setStorageWarning(cause instanceof Error ? cause.message : "新局保存失败。"); return; }
    } else if (initialState !== undefined) {
      const next = createRun(runSeed);
      saveRun(next);
      stateRef.current = next;
      setState(next);
    } else return;
    setEvents([]);
    setError(null);
  }, [initialState]);

  const dispatch = useCallback((command: GameCommand, actor: "player" | "system") => {
    const session = archiveRef.current;
    if ((session !== null && session.warning !== null) || initializationWarning.current !== null) return;
    const before = stateRef.current;
    const result = dispatchCommand(before, command);
    if (session !== null) {
      try { recordAction(session, before, command, result, actor); }
      catch (cause) { session.warning = cause instanceof Error ? cause.message : "日志保存失败。"; setStorageWarning(session.warning); return; }
      setStorageWarning(session.warning);
    } else if (result.ok) saveRun(result.state);
    if (!result.ok) {
      setError(result.error);
      setEvents([]);
      return;
    }
    stateRef.current = result.state;
    setState(result.state);
    setEvents(result.events);
    setError(null);
    // Audio observes successful commands only, never replayed saves or rejected actions.
    if (actor === "player") playCommandSound(command);
    const terminal = result.events.find((event) => event.type === "ROOM_COMPLETED")
      ?? result.events.find((event) => event.type === "RUN_ENDED");
    if (terminal) playEventTone(terminal);
  }, []);

  const send = useCallback((command: GameCommand) => dispatch(command, "player"), [dispatch]);
  const sendAutomatic = useCallback((command: GameCommand) => dispatch(command, "system"), [dispatch]);
  const restartSameSeed = useCallback(() => replaceRun(stateRef.current.initialSeed), [replaceRun]);
  const restartNextSeed = useCallback(() => replaceRun(nextSeed(stateRef.current.initialSeed)), [replaceRun]);

  return { state, events, error, wasRecovered: recovered.current === true, archive: archiveRef.current?.record ?? null,
    storageWarning, send, sendAutomatic, retrySave, backup, restartSameSeed, restartNextSeed };
}
