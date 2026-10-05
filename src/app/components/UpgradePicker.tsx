import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SYMBOL_LABELS } from "@/app/labels";
import { UpgradeStrategyDetails } from "@/app/components/UpgradeStrategyDetails";
import { HelpButton, HelpFacts, HelpWindow } from "@/app/components/HelpWindow";
import {
  buildUpgradeChoice,
  needsUpgradeReelTarget,
  needsUpgradeSymbolTarget,
  upgradeSymbolTargets
} from "@/app/upgrade-choice";
import { useUpgradePreviewEstimate } from "@/app/useUpgradePreviewEstimate";
import { ReelUpgradePreview } from "@/app/components/ReelUpgradePreview";
import { UpgradeConsequences } from "@/app/components/UpgradeConsequences";
import { describeUpgrade } from "@/app/player-copy";
import { UPGRADES } from "@/content/upgrades";
import { getBuildFit } from "@/content/build-fit";
import { HOTEL_ROOMS, nextRoomTier } from "@/content/hotel";
import { dispatchCommand } from "@/core/run";
import type { GameCommand } from "@/core/commands";
import type { ReelIndex, RunState, UpgradeId } from "@/core/types";
import type { MachineEstimate } from "@/sim/types";

const ROLE_LABELS = {
  synergy: "强化",
  pivot: "转向",
  wildcard: "豪赌"
} as const;

interface UpgradePickerProps {
  readonly compact?: boolean;
  readonly state: RunState;
  readonly onCommand: (command: GameCommand) => void;
  readonly currentEstimate?: MachineEstimate | null;
}

export function UpgradePicker({ state, onCommand, currentEstimate = null, compact = false }: UpgradePickerProps): React.JSX.Element | null {
  const offers = state.currentCandidates;
  const workshop = state.workshop?.status === "shopping" ? state.workshop : null;
  const [selectedId, setSelectedId] = useState<UpgradeId | null>(null);
  const [reel, setReel] = useState<ReelIndex>(0);
  const [secondReel, setSecondReel] = useState<ReelIndex>(1);
  const [symbolTargetValue, setSymbolTargetValue] = useState("");
  const [replaceSlot, setReplaceSlot] = useState(0);
  const offerKey = offers === null ? "none" : `${offers.synergy}|${offers.pivot}|${offers.wildcard}`;
  const symbolOptions = useMemo(
    () => selectedId === null ? [] : upgradeSymbolTargets(state, selectedId),
    [selectedId, state]
  );

  useEffect(() => {
    setSelectedId(null);
  }, [offerKey]);

  const chosenSymbol = symbolOptions.find(({ reel: optionReel, symbol }) => `${optionReel}:${symbol}` === symbolTargetValue)
    ?? symbolOptions[0];
  const selectedChoice = selectedId === null
    ? null
    : buildUpgradeChoice(state, selectedId, { reel, secondReel, symbolTarget: chosenSymbol, replaceSlot });
  const selectedDefinition = selectedId === null ? null : UPGRADES[selectedId];
  const previewEstimate = useUpgradePreviewEstimate(state, selectedChoice);

  if (offers === null) return null;
  const canReroll = dispatchCommand(state, { type: "REROLL_CANDIDATES" }).ok;
  const nextTier = nextRoomTier(state);
  const nextReserve = nextTier === null ? 0 : HOTEL_ROOMS[nextTier].bet * HOTEL_ROOMS[nextTier].paidSpins;

  const fullNewPart = selectedId !== null && selectedDefinition?.kind === "part" &&
    state.partSlots.every((part) => part !== null) && !state.partSlots.some((part) => part?.id === selectedId);
  const selectedTarget = selectedChoice?.action === "apply" ? selectedChoice.target : undefined;
  const selectedPresentation = selectedId === null
    ? null
    : describeUpgrade(state, selectedId, selectedTarget, {
        before: currentEstimate,
        after: previewEstimate.estimate
      });
  const replacedPart = selectedChoice?.action === "replace"
    ? state.partSlots[selectedChoice.replaceSlot] ?? null
    : null;
  const selectedImpact = selectedChoice?.action === "replace" && selectedDefinition !== null && replacedPart !== null
    ? `将替换槽 ${selectedChoice.replaceSlot + 1} 的${UPGRADES[replacedPart.id].name} L${replacedPart.level}；${selectedDefinition.name}会以 L1 装入该槽。`
    : selectedPresentation?.currentImpact ?? "";

  const choose = (id: UpgradeId): void => {
    setSelectedId(id);
    setReel(0);
    setSecondReel(1);
    setSymbolTargetValue("");
    setReplaceSlot(0);
  };

  return (
    <div className={`upgrade-picker${compact ? " console-upgrade-picker" : ""}`} role="group" aria-label="选择升级">
      <header className="upgrade-header">
        <div>
          <p className="tray-kicker">凌晨维修票</p>
          <h2>{workshop === null ? "选择一项升级" : "金币整备 · 三选一"}</h2>
          <p>{workshop === null ? "三张维修票，只取一张。选择后确认安装。" : `每项整备 ¥${workshop.cost}，确认才扣款；奉献箱另有 ¥10 自带消耗。本次结算限一次。`}</p>
          {workshop !== null && <p>当前钱包 ¥{state.bankroll}；不购买离开不扣钱，也不返小费。</p>}
          {workshop !== null && selectedId !== null && <p>购买后余额 ¥{state.bankroll - workshop.cost - (selectedId === "tithe-box" ? 10 : 0)}；下一房备付金 ¥{nextReserve}（餐费另算）。{state.bankroll - workshop.cost - (selectedId === "tithe-box" ? 10 : 0) < nextReserve ? "购买后不足以立即入房。" : ""}</p>}
          {!compact && <p>花 1 小费重抽，至少换入 1 个不同选项；没有新选项不扣费。也可攒 3 枚精修核心。</p>}
          <p className="ticket-wallet">小费 {state.tips}</p>
        </div>
        <button
          type="button"
          disabled={!canReroll}
          onClick={() => onCommand({ type: "REROLL_CANDIDATES" })}
        >重抽升级（1 小费）</button>
      </header>
      <div className="upgrade-grid">
        {(Object.entries(offers) as [keyof typeof offers, UpgradeId][]).map(([role, id]) => {
          const definition = UPGRADES[id];
          const presentation = describeUpgrade(state, id);
          const ownedLevelOne = definition.kind === "part" && state.partSlots.some((part) => part?.id === id && part.level === 1);
          const selected = selectedId === id;
          return (
            <article className={`upgrade-card${selected ? " is-selected" : ""}${!compact && selectedId !== null && !selected ? " is-folded" : ""}`} data-testid="upgrade-card" key={role}>
              <div className="ticket-stub">
                <span>{ROLE_LABELS[role]}</span>
                <span>{presentation.kindLabel} · {presentation.routeLabel}</span>
              </div>
              <h3>{presentation.name}</h3>
              {(compact || selectedId === null || selected) && <p className="upgrade-fit" data-fit={getBuildFit(state, id).kind}>{getBuildFit(state, id).text}</p>}
              {compact || selectedId === null || selected ? (
                <>
                  <div className="upgrade-copy">
                    <p className="decision-effect">{presentation.decisionEffect}</p>
                    {!compact && presentation.triggerCondition !== null && <p><strong>条件</strong> {presentation.triggerCondition}</p>}
                    {presentation.immediateCost !== null && <p className="upgrade-warning"><strong>立即影响</strong> {presentation.immediateCost}</p>}
                    {ownedLevelOne && <p className="owned-level">已持有 L1 → 本次升为 L2</p>}
                  </div>
                  <HelpButton title={presentation.name + "升级说明"} trigger="效果与代价" className="upgrade-help-button">
                    <HelpFacts cost={workshop === null ? presentation.immediateCost ?? "占用本班一次三选一机会；无额外即时金钱支出。" : `整备费 ¥${workshop.cost}。${presentation.immediateCost ?? "无其他即时支出。"}`}
                      effect={ownedLevelOne ? presentation.levelTwoEffect ?? presentation.effect : presentation.effect}
                      limit={presentation.risk} current={presentation.currentImpact} />
                    <UpgradeStrategyDetails presentation={presentation} levelLabel={ownedLevelOne ? "L1 → L2" : "L2 效果"} />
                  </HelpButton>
                </>
              ) : null}
              <button className="select-ticket" type="button" aria-pressed={selected} onClick={() => choose(id)}>选择{definition.name}</button>

              {selected && selectedDefinition !== null && selectedPresentation !== null && (
                <UpgradeConfirmationSurface compact={compact} title={`安装 · ${selectedDefinition.name}`} onClose={() => setSelectedId(null)}>
                  <h4>确认 {selectedDefinition.name}</h4>
                  {selectedId === "lemon-crate" && (
                    <div className="field-row">
                      <label>第一目标转轮<select value={reel} onChange={(event) => setReel(Number(event.target.value) as ReelIndex)}>
                        <option value={0}>第1轮</option><option value={1}>第2轮</option><option value={2}>第3轮</option>
                      </select></label>
                      <label>第二目标转轮<select value={secondReel} onChange={(event) => setSecondReel(Number(event.target.value) as ReelIndex)}>
                        <option value={0}>第1轮</option><option value={1}>第2轮</option><option value={2}>第3轮</option>
                      </select></label>
                    </div>
                  )}
                  {needsUpgradeReelTarget(selectedId) && (
                    <label>目标转轮<select value={reel} onChange={(event) => setReel(Number(event.target.value) as ReelIndex)}>
                      <option value={0}>第1轮</option><option value={1}>第2轮</option><option value={2}>第3轮</option>
                    </select></label>
                  )}
                  {needsUpgradeSymbolTarget(selectedId) && (
                    <label>目标符号<select
                      value={chosenSymbol === undefined ? "" : `${chosenSymbol.reel}:${chosenSymbol.symbol}`}
                      onChange={(event) => setSymbolTargetValue(event.target.value)}
                    >
                      {symbolOptions.map((target) => (
                        <option value={`${target.reel}:${target.symbol}`} key={`${target.reel}:${target.symbol}`}>
                          第{target.reel + 1}轮 · {SYMBOL_LABELS[target.symbol]}
                        </option>
                      ))}
                    </select></label>
                  )}
                  {fullNewPart && (
                    <label>替换部件槽<select value={replaceSlot} onChange={(event) => setReplaceSlot(Number(event.target.value))}>
                      {state.partSlots.map((part, slot) => <option value={slot} key={slot}>槽 {slot + 1} · {part === null ? "空" : UPGRADES[part.id].name}</option>)}
                    </select></label>
                  )}
                  {selectedDefinition.kind === "reel-mod" ? (
                    <aside className="maintenance-ticket" aria-label="维修票据">
                      <h4>维修票据</h4>
                      {selectedChoice !== null && <ReelUpgradePreview state={state} choice={selectedChoice} />}
                      <p>{selectedPresentation.currentImpact}</p>
                      {state.toolLevel >= 2 && previewEstimate.status !== "ready" && <p>正在配对估算当前机器与改造后机器</p>}
                    </aside>
                  ) : (
                    <div className="upgrade-preview">
                      <p><strong>立即结果：</strong>{selectedImpact}</p>
                    </div>
                  )}
                  <UpgradeConsequences state={state} id={selectedId} />
                  <button
                    className="primary-button"
                    type="button"
                    disabled={selectedChoice === null || (workshop !== null && state.bankroll < workshop.cost + (selectedId === "tithe-box" ? 10 : 0))}
                    onClick={() => selectedChoice !== null && onCommand({ type: "CHOOSE_UPGRADE", choice: selectedChoice })}
                  >{workshop === null ? "获取" : `支付 ¥${workshop.cost + (selectedId === "tithe-box" ? 10 : 0)} · 购买`}{selectedDefinition.name}</button>
                </UpgradeConfirmationSurface>
              )}
            </article>
          );
        })}
      </div>
      <button className="quiet-button" type="button" onClick={() => onCommand({ type: "DECLINE_UPGRADE" })}>{workshop === null ? "放弃升级" : "本次不购买（不返小费）"}</button>
    </div>
  );
}

function UpgradeConfirmationSurface({ compact, title, children, onClose }: {
  readonly compact: boolean; readonly title: string; readonly children: ReactNode; readonly onClose: () => void;
}): React.JSX.Element {
  const content = <div className="upgrade-card-confirmation">{children}</div>;
  return compact ? <HelpWindow title={title} interactive onClose={onClose}>{content}</HelpWindow> : content;
}
