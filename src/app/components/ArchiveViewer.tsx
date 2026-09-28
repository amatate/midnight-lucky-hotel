import { useState } from "react";
import { commandLabel, downloadText, entryBlock, eventLabel, FIELD_LABELS, money, readableValue } from "@/app/archive-copy";
import { UPGRADES } from "@/content/upgrades";
import { exportArchive, RULES_VERSION, verifyArchive, type RunArchive } from "@/persistence/archives";
import { LedgerDrawer } from "@/app/components/LedgerDrawer";
import { translate } from "@/i18n/translate";
import { getLanguage } from "@/i18n/language";

export function ArchiveViewer({ record, onClose }: { readonly record: RunArchive; readonly onClose: () => void }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("all");
  const [block, setBlock] = useState("all");
  const [page, setPage] = useState(0);
  const [verification, setVerification] = useState("");
  const entries = record.entries.toReversed().filter((entry) =>
    (actor === "all" || (actor === "failed" ? !entry.ok : entry.actor === actor))
    && (block === "all" || entryBlock(entry) === block)
    && [commandLabel(entry.command), ...entry.events.map(eventLabel), readableValue(entry.changes)]
      .flatMap((text) => [text, translate(text)]).join(" ").toLowerCase().includes(query.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(entries.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  const state = record.snapshot;
  return (
    <section className="archive-view frontdesk" aria-label="完整游戏日志">
      <header className="frontdesk-heading"><div><p className="eyebrow">NIGHT AUDIT / GAME ARCHIVE</p><h1>游戏档案</h1></div>
        <button type="button" onClick={onClose}>返回</button></header>
      <section className="archive-card">
        <h2 translate="no">{record.name}</h2>
        <p>种子 {state.initialSeed} · 余额 {money(state.bankroll)} · 共 {state.nextSpinOrdinal - 1} 转</p>
        <p>{state.afterHoursLevel > 0 ? "加班第 " + state.afterHoursLevel + " 段" : "第 " + state.shift + " 班"} · {record.entries.length} 条日志</p>
        <p className="fine-print">规则 {record.rulesVersion}{record.rulesVersion !== RULES_VERSION ? " · 与当前版本不同，只读" : ""}</p>
        {record.origin === "legacy" && <p className="archive-notice">旧局更新前的规则版本无法追溯；指纹仅标识接入完整日志时使用的规则。</p>}
        {record.coverage === "from-checkpoint" && <p className="archive-notice">从保存检查点开始记录。更早的完整事件未知；保留的旧小票和操作列表可查，不补造历史。</p>}
        <p>当前部件：{state.partSlots.filter((part) => part !== null).map((part) => UPGRADES[part.id].name + " L" + part.level).join("、") || "暂无"}</p>
        <div className="frontdesk-actions">
          <button type="button" onClick={() => downloadText("night-" + state.initialSeed + "-" + record.id + ".json", exportArchive(record))}>导出完整复盘包</button>
          <button type="button" disabled={record.rulesVersion !== RULES_VERSION} onClick={() => setVerification(verifyArchive(record))}>核验记录一致性</button>
          <LedgerDrawer receipts={state.spinHistory} />
        </div>
        <p role="status">{verification}</p>
        <details><summary>起始检查点与旧操作记录</summary><pre>{JSON.stringify(record.initialState, null, 2)}</pre></details>
      </section>
      <div className="archive-filters">
        <label>搜索日志<input value={query} placeholder="柠檬、食物、祈祷…" onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
        <label>操作类型<select value={actor} onChange={(event) => { setActor(event.target.value); setPage(0); }}>
          <option value="all">全部操作</option><option value="player">玩家操作</option><option value="system">系统动作</option><option value="failed">被拒绝的操作</option>
        </select></label>
        <label>班次<select value={block} onChange={(event) => { setBlock(event.target.value); setPage(0); }}>
          <option value="all">所有班次</option>{[...new Set(record.entries.map(entryBlock))].map((label) => <option key={label}>{label}</option>)}
        </select></label>
      </div>
      {entries.length === 0 && <p className="archive-empty">{record.entries.length === 0 ? "尚无新日志。下一次游戏操作将自动记录。" : "没有匹配的日志。"}</p>}
      <ol className="action-log">
        {entries.slice(currentPage * 30, currentPage * 30 + 30).map((entry) => <li key={entry.ordinal}>
          <details className="archive-card">
            <summary><span className="log-meta">#{entry.ordinal} · {entryBlock(entry)} · {entry.actor === "system" ? "系统" : "玩家"}</span>
              <strong>{commandLabel(entry.command)}</strong><span className={entry.ok ? "log-success" : "log-failure"}>{entry.ok ? "已执行" : "未执行"}</span>
              {entry.changes.bankroll !== undefined && <span>{money(Number(entry.changes.bankroll.before))} → {money(Number(entry.changes.bankroll.after))}</span>}
            </summary>
            <p className="fine-print">{new Date(entry.at).toLocaleString(getLanguage() === "en" ? "en-US" : "zh-CN")}</p>
            {entry.error !== null && <p role="note">拒绝原因：{entry.error.code} · {entry.error.message}</p>}
            <ol>{entry.events.map((event, index) => <li key={index}>{eventLabel(event)}</li>)}</ol>
            {Object.entries(entry.changes).map(([field, change]) => <details key={field} className="log-change">
              <summary>{FIELD_LABELS[field] ?? field}变化</summary><div className="log-before-after"><div><b>之前</b><pre>{translate(readableValue(change.before))}</pre></div><div><b>之后</b><pre>{translate(readableValue(change.after))}</pre></div></div>
            </details>)}
            <details><summary>原始调试数据（指令／事件／变化）</summary><pre>{JSON.stringify(entry, null, 2)}</pre></details>
          </details>
        </li>)}
      </ol>
      <nav className="frontdesk-actions" aria-label="日志翻页"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <span>{currentPage + 1} / {pageCount} · {entries.length} 条</span><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>
      <p className="fine-print">日志完整保存；分页只影响显示。核验不操作正在游玩的游戏，也不改变存档。</p>
    </section>
  );
}
