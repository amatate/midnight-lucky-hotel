import { useEffect, useMemo, useState } from "react";
import { UPGRADES } from "@/content/upgrades";
import type { GameCommand } from "@/core/commands";
import type { BaseSymbolId, ReelIndex, RunState, SymbolId, UpgradeChoice, UpgradeId } from "@/core/types";

const ROLE_LABELS = { synergy: "协同", pivot: "转向", wildcard: "变数" } as const;
const KIND_LABELS = { "reel-mod": "改造转轮", part: "机器部件", tool: "信息工具" } as const;
const BASE_SYMBOLS = new Set<SymbolId>(["cherry", "lemon", "bell", "seven"]);

interface TargetPair {
  readonly reel: ReelIndex;
  readonly symbol: Exclude<SymbolId, "wild">;
}

function symbolTargets(state: RunState, id: UpgradeId): readonly TargetPair[] {
  const targets: TargetPair[] = [];
  state.reels.forEach((strip, reelNumber) => {
    const reel = reelNumber as ReelIndex;
    if (id === "pruning-shears" && strip.length <= 6) return;
    [...new Set(strip)].forEach((symbol) => {
      if (symbol === "wild") return;
      const allowed = id === "cherry-pitter"
        ? symbol !== "cherry"
        : id === "seven-purification"
          ? symbol === "cherry" || symbol === "lemon"
          : id === "carbon-copy"
            ? BASE_SYMBOLS.has(symbol)
            : id === "pruning-shears";
      if (allowed) targets.push({ reel, symbol });
    });
  });
  return targets;
}

function needsSymbolTarget(id: UpgradeId): boolean {
  return id === "cherry-pitter" || id === "seven-purification" || id === "pruning-shears" || id === "carbon-copy";
}

function needsReelTarget(id: UpgradeId): boolean {
  return id === "tithe-box" || id === "artificial-crack";
}

function upgradeChoice(
  state: RunState,
  id: UpgradeId,
  reel: ReelIndex,
  secondReel: ReelIndex,
  symbolPair: TargetPair | undefined,
  replaceSlot: number
): UpgradeChoice | null {
  const definition = UPGRADES[id];
  if (definition.kind === "part") {
    const alreadyOwned = state.partSlots.some((part) => part?.id === id);
    const inventoryFull = state.partSlots.every((part) => part !== null);
    return inventoryFull && !alreadyOwned
      ? { id, action: "replace", replaceSlot }
      : { id, action: "apply" };
  }
  if (id === "lemon-crate") {
    return reel === secondReel ? null : { id, action: "apply", target: { kind: "two-reels", reels: [reel, secondReel] } };
  }
  if (needsSymbolTarget(id)) {
    return symbolPair === undefined
      ? null
      : { id, action: "apply", target: { kind: "symbol-on-reel", reel: symbolPair.reel, symbol: symbolPair.symbol } };
  }
  if (needsReelTarget(id)) return { id, action: "apply", target: { kind: "reel", reel } };
  return { id, action: "apply" };
}

interface UpgradePickerProps {
  readonly state: RunState;
  readonly onCommand: (command: GameCommand) => void;
}

export function UpgradePicker({ state, onCommand }: UpgradePickerProps): React.JSX.Element | null {
  const offers = state.currentCandidates;
  const [selectedId, setSelectedId] = useState<UpgradeId | null>(null);
  const [reel, setReel] = useState<ReelIndex>(0);
  const [secondReel, setSecondReel] = useState<ReelIndex>(1);
  const [symbolTargetValue, setSymbolTargetValue] = useState("");
  const [replaceSlot, setReplaceSlot] = useState(0);
  const offerKey = offers === null ? "none" : `${offers.synergy}|${offers.pivot}|${offers.wildcard}`;
  const symbolOptions = useMemo(
    () => selectedId === null ? [] : symbolTargets(state, selectedId),
    [selectedId, state]
  );

  useEffect(() => {
    setSelectedId(null);
  }, [offerKey]);

  if (offers === null) return null;

  const chosenSymbol = symbolOptions.find(({ reel: optionReel, symbol }) => `${optionReel}:${symbol}` === symbolTargetValue)
    ?? symbolOptions[0];
  const selectedChoice = selectedId === null
    ? null
    : upgradeChoice(state, selectedId, reel, secondReel, chosenSymbol, replaceSlot);
  const selectedDefinition = selectedId === null ? null : UPGRADES[selectedId];
  const fullNewPart = selectedId !== null && selectedDefinition?.kind === "part" &&
    state.partSlots.every((part) => part !== null) && !state.partSlots.some((part) => part?.id === selectedId);

  return (
    <section className="upgrade-picker" aria-label="选择升级">
      <header>
        <div>
          <p className="eyebrow">班次奖励</p>
          <h2>选择一项升级</h2>
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
          return (
            <article className={`upgrade-card ${selectedId === id ? "is-selected" : ""}`} data-testid="upgrade-card" key={role}>
              <span>{ROLE_LABELS[role]}</span>
              <h3>{definition.name}</h3>
              <p>{KIND_LABELS[definition.kind]} · {definition.tags.slice(0, 2).join(" / ")}</p>
              <button type="button" onClick={() => {
                setSelectedId(id);
                setReel(0);
                setSecondReel(1);
                setSymbolTargetValue("");
                setReplaceSlot(0);
              }}>选择{definition.name}</button>
            </article>
          );
        })}
      </div>
      {selectedId !== null && selectedDefinition !== null && (
        <div className="upgrade-targets">
          <h3>确认 {selectedDefinition.name}</h3>
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
          {needsReelTarget(selectedId) && (
            <label>目标转轮<select value={reel} onChange={(event) => setReel(Number(event.target.value) as ReelIndex)}>
              <option value={0}>第1轮</option><option value={1}>第2轮</option><option value={2}>第3轮</option>
            </select></label>
          )}
          {needsSymbolTarget(selectedId) && (
            <label>目标符号<select
              value={chosenSymbol === undefined ? "" : `${chosenSymbol.reel}:${chosenSymbol.symbol}`}
              onChange={(event) => setSymbolTargetValue(event.target.value)}
            >
              {symbolOptions.map((target) => (
                <option value={`${target.reel}:${target.symbol}`} key={`${target.reel}:${target.symbol}`}>
                  第{target.reel + 1}轮 · {target.symbol}
                </option>
              ))}
            </select></label>
          )}
          {fullNewPart && (
            <label>替换部件槽<select value={replaceSlot} onChange={(event) => setReplaceSlot(Number(event.target.value))}>
              {state.partSlots.map((part, slot) => <option value={slot} key={slot}>槽 {slot + 1} · {part === null ? "空" : UPGRADES[part.id].name}</option>)}
            </select></label>
          )}
          <button
            className="primary-button"
            type="button"
            disabled={selectedChoice === null}
            onClick={() => selectedChoice !== null && onCommand({ type: "CHOOSE_UPGRADE", choice: selectedChoice })}
          >获取{selectedDefinition.name}</button>
        </div>
      )}
      <button className="quiet-button" type="button" onClick={() => onCommand({ type: "DECLINE_UPGRADE" })}>放弃升级</button>
    </section>
  );
}
