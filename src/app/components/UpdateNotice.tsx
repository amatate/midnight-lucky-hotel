import { useLayoutEffect, useSyncExternalStore } from "react";
import { gameUpdates, type UpdateController } from "@/app/update-policy";

export function UpdateNotice({ playing, controller = gameUpdates }: { readonly playing: boolean; readonly controller?: UpdateController }): React.JSX.Element | null {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useLayoutEffect(() => { controller.setPlaying(playing); return () => controller.setPlaying(true); }, [controller, playing]);
  if (!state.available) return null;
  return <section className="update-notice" aria-label="游戏更新">
    <strong>有新版本可用</strong>
    <p>{playing ? "这局不会自动刷新。请先返回前台保存进度，再更新。" : "建议先导出存档备份。若开着其他游戏标签页，也请先返回前台。"}</p>
    {state.error !== null && <p role="alert">{state.error}</p>}
    <button type="button" disabled={playing || state.busy} onClick={() => void controller.apply()}>{state.busy ? "正在准备更新…" : "更新游戏"}</button>
  </section>;
}
