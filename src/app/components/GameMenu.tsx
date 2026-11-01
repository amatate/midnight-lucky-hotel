import { useState } from "react";
import { HelpButton } from "@/app/components/HelpWindow";
import { LanguageSelector } from "@/app/components/LanguageSelector";
import { AudioSettings } from "@/app/components/AudioSettings";
import { GameGuide } from "@/app/components/GameGuide";
import { FeedbackButton } from "@/app/components/FeedbackButton";
import { downloadText } from "@/app/archive-copy";
import { exportArchive } from "@/persistence/archives";
import { UPGRADES } from "@/content/upgrades";
import type { GameController } from "@/app/useGame";

export function GameMenu({ game, onHome, onArchive, reduceFlash, onReduceFlash }: {
  readonly game: GameController;
  readonly onHome?: (() => void) | undefined;
  readonly onArchive: () => void;
  readonly reduceFlash: boolean;
  readonly onReduceFlash: (value: boolean) => void;
}): React.JSX.Element {
  const [backupName, setBackupName] = useState("手动备份");
  const [notice, setNotice] = useState("");
  return <HelpButton title="酒店菜单" trigger="菜单" className="console-menu-key" interactive>
    <footer className="game-utilities">
      <nav className="game-guide-entry" aria-label="游戏工具">
        {onHome && <button type="button" onClick={onHome}>返回前台</button>}
        <HelpButton title="游戏介绍" trigger="玩法与术语" className="guide-open-button"><GameGuide /></HelpButton>
        <FeedbackButton seed={game.state.initialSeed} />
      </nav>
      <p className="fine-print">返回前台会保存当前进度，不会结账或重开。</p>
      <LanguageSelector />
      <AudioSettings />
      {game.state.acquiredUpgrades.length > 0 && <details className="acquired-upgrades"><summary>已获得升级 · {game.state.acquiredUpgrades.length}</summary>
        <ul>{game.state.acquiredUpgrades.map((id, index) => <li key={`${id}-${index}`}>{UPGRADES[id].name}</li>)}</ul>
      </details>}
      {game.archive !== null && <section className="game-archive-bar" aria-label="档案工具">
        <div className="frontdesk-actions"><button type="button" onClick={onArchive}>完整日志</button>
          <button type="button" onClick={() => downloadText("night-" + game.state.initialSeed + ".json", exportArchive(game.archive!))}>导出本局</button></div>
        <details><summary>存档与种子 · {game.state.initialSeed}</summary>
          <form className="backup-form" onSubmit={(event) => { event.preventDefault(); setNotice(game.backup(backupName) ? "备份已保存，可在前台的历史与存档中恢复。" : "备份未写入，请查看保存提示并导出本局。"); }}>
            <label>备份名称<input maxLength={80} value={backupName} onChange={(event) => setBackupName(event.target.value)} /></label>
            <button type="submit" disabled={game.storageWarning !== null}>保存手动备份</button>
          </form>
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(String(game.state.initialSeed)); setNotice("种子已复制。"); } catch { setNotice("请手动复制种子：" + game.state.initialSeed); } }}>复制种子</button>
          <p role="status">{notice}</p>
        </details>
      </section>}
      <label className="reduce-flash-setting"><input type="checkbox" aria-label="减少闪烁" checked={reduceFlash} onChange={(event) => onReduceFlash(event.target.checked)} />减弱动态与闪烁</label>
      {game.storageWarning !== null && <p role="alert">{game.storageWarning}</p>}
    </footer>
  </HelpButton>;
}
