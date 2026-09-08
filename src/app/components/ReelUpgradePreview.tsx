import { useMemo } from "react";
import { SYMBOL_LABELS } from "@/app/labels";
import { previewReelChanges, type PreviewCell } from "@/app/reel-preview";
import { SymbolFace } from "@/app/components/SymbolFace";
import type { RunState, UpgradeChoice } from "@/core/types";

function Strip({ cells, label }: { readonly cells: readonly PreviewCell[]; readonly label: string }): React.JSX.Element {
  return <div className="preview-strip-row"><span className="preview-strip-label">{label}<small>{cells.length} 格</small></span>
    <ol className="preview-strip" aria-label={label}>{cells.map((cell, index) => <li key={index}
      className={`preview-cell is-${cell.change}`}
      aria-label={`${cell.change === "added" ? "新增" : cell.change === "removed" ? "移除" : "保留"}：${SYMBOL_LABELS[cell.symbol]}`}>
      <SymbolFace symbol={cell.symbol} decorative />
      {cell.change !== "unchanged" && <span className="preview-cell-mark" aria-hidden="true">{cell.change === "added" ? "+" : "−"}</span>}
    </li>)}</ol></div>;
}

export function ReelUpgradePreview({ state, choice }: { readonly state: RunState; readonly choice: UpgradeChoice }): React.JSX.Element | null {
  const changes = useMemo(() => previewReelChanges(state, choice), [state, choice]);
  if (changes.length === 0) return null;
  return <section className="reel-upgrade-preview" aria-label="转轮改造预览">
    <header><strong>机器会这样变</strong><span>金框 ＋ 新增 · 红线 − 移除</span></header>
    {changes.map(({ reel, before, after }) => <div className="preview-reel" role="group" aria-label={`第${reel + 1}轮改造`} key={reel}>
      <h5>第 {reel + 1} 轮</h5><Strip cells={before} label="现在" /><Strip cells={after} label="改造后" />
    </div>)}
    <p className="preview-footnote">这是整条转轮，不是下一转的结果。确认获取后才会改变；长条带可横向滑动。</p>
  </section>;
}
