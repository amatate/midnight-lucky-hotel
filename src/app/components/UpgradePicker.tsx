import { useEffect, useMemo, useState } from "react";
import { SYMBOL_LABELS } from "@/app/labels";
import {
  buildUpgradeChoice,
  needsUpgradeReelTarget,
  needsUpgradeSymbolTarget,
  upgradeSymbolTargets
} from "@/app/upgrade-choice";
import { useUpgradePreviewEstimate } from "@/app/useUpgradePreviewEstimate";
import { describeUpgrade } from "@/content/player-copy";
import { UPGRADES } from "@/content/upgrades";
import type { GameCommand } from "@/core/commands";
import type { ReelIndex, RunState, UpgradeId } from "@/core/types";
import type { MachineEstimate } from "@/sim/types";

const ROLE_LABELS = {
  synergy: "强化现有组合",
  pivot: "修补风险／换路线",
  wildcard: "高风险改规则"
} as const;

interface UpgradePickerProps {
  readonly state: RunState;
  readonly onCommand: (command: GameCommand) => void;
  readonly currentEstimate?: MachineEstimate | null;
}

export function UpgradePicker({ state, onCommand, currentEstimate = null }: UpgradePickerProps): React.JSX.Element | null {
  const offers = state.currentCandidates;
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
    <div className="upgrade-picker" role="group" aria-label="选择升级">
      <header className="upgrade-header">
        <div>
          <p className="tray-kicker">凌晨维修票</p>
          <h2>选择一项升级</h2>
          <p>三张票据只取一张，先看清整套影响再落锤。</p>
          <p className="ticket-wallet">小费 {state.tips}</p>
        </div>
        <button
          type="button"
          disabled={state.tips < 1}
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
            <article className={`upgrade-card${selected ? " is-selected" : ""}`} data-testid="upgrade-card" key={role}>
              <div className="ticket-stub">
                <span>{ROLE_LABELS[role]}</span>
                <span>{presentation.kindLabel} · {presentation.routeLabel}</span>
              </div>
              <h3>{presentation.name}</h3>
              <div className="upgrade-copy">
                <p><strong>效果</strong> {presentation.effect}</p>
                {presentation.levelTwoEffect !== null && (
                  <p><strong>{ownedLevelOne ? "L1 → L2" : "L2 效果"}</strong> {presentation.levelTwoEffect.replace(/^L2：/, "")}</p>
                )}
                <p><strong>当前影响</strong> {presentation.currentImpact}</p>
                <p><strong>协同</strong> {presentation.synergy}</p>
                <p><strong>代价／风险</strong> {presentation.risk}</p>
              </div>
              <button className="select-ticket" type="button" aria-pressed={selected} onClick={() => choose(id)}>选择{definition.name}</button>

              {selected && selectedDefinition !== null && selectedPresentation !== null && (
                <div className="upgrade-card-confirmation">
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
                      <p>{selectedPresentation.currentImpact}</p>
                      {state.toolLevel >= 2 && previewEstimate.status !== "ready" && <p>正在配对估算当前机器与改造后机器</p>}
                    </aside>
                  ) : (
                    <div className="upgrade-preview">
                      <p><strong>完整效果：</strong>{selectedPresentation.effect}</p>
                      <p><strong>选择后的影响：</strong>{selectedImpact}</p>
                    </div>
                  )}
                  <button
                    className="primary-button"
                    type="button"
                    disabled={selectedChoice === null}
                    onClick={() => selectedChoice !== null && onCommand({ type: "CHOOSE_UPGRADE", choice: selectedChoice })}
                  >获取{selectedDefinition.name}</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <button className="quiet-button" type="button" onClick={() => onCommand({ type: "DECLINE_UPGRADE" })}>放弃升级</button>
    </div>
  );
}
