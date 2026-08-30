import { describeEquippedPart } from "@/content/player-copy";
import type { PartId, RunState } from "@/core/types";

export interface PartsBarProps {
  readonly state: RunState;
  readonly activePartId?: PartId | null;
  readonly presentedThroughSequence?: number | null;
}

export function PartsBar({ state, activePartId = null, presentedThroughSequence }: PartsBarProps): React.JSX.Element {
  const orderedEvents = [...state.pendingEvents].sort((left, right) => left.sequence - right.sequence);
  const visibleEvents = presentedThroughSequence === undefined
    ? orderedEvents
    : presentedThroughSequence === null
      ? []
      : orderedEvents.filter((event) => event.sequence <= presentedThroughSequence);
  const visibleState = { ...state, pendingEvents: visibleEvents };
  const disabledSlots = new Set(visibleEvents.flatMap((event) => event.type === "PART_DISABLED" ? [event.slot] : []));
  const activeSlot = activePartId === null
    ? -1
    : state.partSlots.findIndex((part, slot) => part?.id === activePartId && !disabledSlots.has(slot));
  return (
    <section className="parts-panel" aria-label="部件栏">
      <h2>部件</h2>
      <p>本局全部部件贡献 ¥{state.attribution.part}</p>
      <div className="parts-bar">
        {state.partSlots.map((part, slot) => {
          const presentation = part === null ? null : describeEquippedPart(visibleState, part);
          const active = slot === activeSlot;
          return (
            <div
              className={`part-slot ${part === null ? "is-empty" : ""}${active ? " is-triggered" : ""}`}
              data-testid="part-slot"
              data-active={active ? "true" : undefined}
              key={slot}
            >
              {part !== null && <span className="part-trigger-lamp" aria-hidden="true" />}
              {part === null || presentation === null ? (
                <span aria-label={`空部件槽 ${slot + 1}`}>空</span>
              ) : (
                <details>
                  <summary>{presentation.name} · L{part.level}</summary>
                  <p><strong>完整触发规则：</strong>{presentation.effect}</p>
                  <p><strong>L1 → L2：</strong>{presentation.levelTwoEffect?.replace(/^L2：/, "")}</p>
                  <p><strong>当前进度／状态：</strong>{presentation.currentImpact}</p>
                  <p><strong>协同：</strong>{presentation.synergy}</p>
                  <p><strong>代价／风险：</strong>{presentation.risk}</p>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
