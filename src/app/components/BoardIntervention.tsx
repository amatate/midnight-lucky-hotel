import { HelpButton, HelpFacts } from "@/app/components/HelpWindow";
import { INTERVENTION_LABELS } from "@/app/board-intervention";
import type { BoardInterventionController } from "@/app/useBoardIntervention";

export function BoardInterventionModes({ controller, compact = false }: { readonly controller: BoardInterventionController; readonly compact?: boolean }): React.JSX.Element | null {
  if (controller.modes.length === 0) return null;
  if (compact && controller.modes.length === 1) return <div className="console-single-mode">{INTERVENTION_LABELS[controller.modes[0]!]}<span>点列预览 · 确认才消耗</span></div>;
  return <div className="board-intervention-modes" role="group" aria-label="干预方式">
    {controller.modes.map((mode) => <button key={mode} type="button" aria-pressed={controller.mode === mode}
      disabled={!controller.enabled} onClick={() => controller.selectMode(mode)}>{INTERVENTION_LABELS[mode]}</button>)}
    <span>再点一列</span>
  </div>;
}

export function BoardInterventionControls({ controller, onAccept, paused, compact = false }: {
  readonly controller: BoardInterventionController;
  readonly onAccept: () => void;
  readonly paused: boolean;
  readonly compact?: boolean;
}): React.JSX.Element {
  const { mode, preview, selectedReel } = controller;
  const isKick = mode === "KICK_REEL";
  const isLock = mode === "LOCK_AND_RESPIN_OTHERS";
  const cost = isKick ? "不花钱、不耗干预点 · 留下 1 个永久裂纹" : "1 干预点 · 不再扣下注";
  const action = selectedReel === null ? "先点选一列" : isLock
    ? `确认锁住第${selectedReel + 1}轮` : `确认${isKick ? "踹击" : "重转"}第${selectedReel + 1}轮`;
  return <section className="context-tray board-intervention-controls" aria-label="当前决策" data-phase="AWAITING_INTERVENTION">
    {compact && <BoardInterventionModes controller={controller} compact />}
    {controller.modes.length === 0 ? <p role="status">没有可用干预，正在确认结果</p> : <>
      <div className="board-decision-copy" aria-live="polite">
        <strong>{preview === null ? "点一列可干预，或收下这把" : isKick ? "盘面是踹击预览 · 尚未执行" : compact ? `当前 ${preview.currentLineCount} 条基础中奖线可能被打散` : isLock ? `保留第${selectedReel! + 1}轮，重转另外两轮` : `只重转第${selectedReel! + 1}轮，其余不动`}</strong>
        <p>{cost}</p>
        {!compact && preview !== null && (isKick
          ? <p>基础中奖线：{preview.currentLineCount} → {preview.previewLineCount} 条。只预览图案，部件连锁另算。</p>
          : <p>{preview.currentLineCount > 0
              ? `当前 ${preview.currentLineCount} 条基础中奖线可能被打散，虚线标出了这些位置。`
              : "当前没有基础中奖线；重转也可能仍不中奖。"} 不预知随机结果。</p>)}
      </div>
      <div className="board-decision-buttons">
        {preview === null
          ? <button type="button" aria-label="收下这把" className="primary-button accept-outcome" disabled={paused} onClick={onAccept}>收下这把{compact && <small>不消耗干预点</small>}</button>
          : <><button type="button" aria-label={action} className="primary-button" disabled={!controller.enabled} onClick={controller.confirm}>{action}{compact && <small>{isKick ? "+1 永久裂纹" : "1 干预点 · 不扣下注"}</small>}</button>
            <button type="button" disabled={paused} onClick={controller.cancel}>取消预览</button></>}
      </div>
      <div className="board-decision-note"><span>选轮、看预览不消耗资源</span>
        <HelpButton title="盘面干预"><HelpFacts cost={cost}
          effect={isKick ? "按盘面预览确定性推进选定转轮。确认后才移动图案并留下裂纹。" : isLock ? "锁住一整列，另外两列随机重转。" : "只随机重转选中的一列，另外两列保持不变。"}
          limit="每转只能干预一次。锁轮和踹击各限每班一次；祈祷也会占用这一转的干预。基础线提示不代表最终奖金，部件、食物和裂纹效果仍在确认结果后结算。"
          current={preview === null ? "点列只是预览，不消耗资源。" : isKick ? `基础中奖线 ${preview.currentLineCount} → ${preview.previewLineCount} 条。` : `当前 ${preview.currentLineCount} 条中奖线可能被打散；重转也可能不中。`} /></HelpButton>
      </div>
    </>}
  </section>;
}
