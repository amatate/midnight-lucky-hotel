interface UpdateState { readonly available: boolean; readonly busy: boolean; readonly error: string | null }

/** A service-worker activation is not permission to refresh a live game. */
export function createUpdateController(reload: () => void) {
  let playing = true;
  let approved = false;
  let activated = false;
  let activate: (() => Promise<void>) | null = null;
  let state: UpdateState = { available: false, busy: false, error: null };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<UpdateState>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setPlaying(value: boolean) { playing = value; },
    offer(update: () => Promise<void>) { activate = update; activated = false; approved = false; publish({ available: true, busy: false, error: null }); },
    activationReady() {
      activated = true;
      if (approved && !playing) reload();
      else publish({ available: true, busy: false });
      approved = false;
    },
    async apply(): Promise<boolean> {
      if (playing || !state.available || state.busy) return false;
      approved = true;
      if (activated) { approved = false; reload(); return true; }
      if (activate === null) { approved = false; return false; }
      publish({ busy: true, error: null });
      try { await activate(); return true; }
      catch { approved = false; publish({ busy: false, error: "更新暂时失败。进度没有清除，可稍后重试。" }); return false; }
    }
  };
}
export type UpdateController = ReturnType<typeof createUpdateController>;
export const gameUpdates = createUpdateController(() => window.location.reload());
