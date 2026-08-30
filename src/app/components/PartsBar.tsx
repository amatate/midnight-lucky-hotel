import { useState } from "react";
import { describeEquippedPart } from "@/content/player-copy";
import type { PartId, RunState } from "@/core/types";

const PART_GLYPHS: Readonly<Record<PartId, string>> = {
  "lemon-infection": "M12 4c4 0 7 3 7 7s-3 8-8 8-7-3-7-7 3-7 8-7c1-2 3-3 5-3",
  "jam-jar": "M7 7h10l1 12H6L7 7m0-3h10v3H7",
  "fruit-salad": "M4 12h16c0 5-3 8-8 8s-8-3-8-8m4-3 3 3 3-5 3 5",
  leftovers: "M6 8h12l-1 12H7L6 8m3 0V5h6v3m-6 5h6",
  "omen-collector": "M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6m9-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  "triple-blessing": "m12 3 1.4 3.5L17 8l-3 2.3 1 3.7-3-2-3 2 1-3.7L7 8l3.6-1.5L12 3",
  "midnight-bell": "M6 16h12l-2-3V9a4 4 0 0 0-8 0v4l-2 3m4 3h4",
  "martyr-coin": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v10m-3-5h6",
  "scrap-magnet": "M5 4v9a7 7 0 0 0 14 0V4h-5v9a2 2 0 0 1-4 0V4H5m0 4h5m4 0h5",
  "loose-spring": "M4 6h4l-4 4h8l-4 4h8l-4 4h8",
  "blank-capacitor": "M8 4v16m8-16v16M4 8h4m8 0h4M4 16h4m8 0h4",
  "warranty-fraud": "M12 3 19 6v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3m-3 6 6 6m0-6-6 6",
  "overload-motor": "M13 2 6 13h5l-1 9 8-12h-5V2",
  "safety-fuse": "M7 5h10v4l-2 2 2 2v6H7v-6l2-2-2-2V5"
};

export interface PartsBarProps {
  readonly state: RunState;
  readonly activePartId?: PartId | null;
  readonly presentedThroughSequence?: number | null | undefined;
}

function PartGlyph({ id }: { readonly id: PartId }): React.JSX.Element {
  return (
    <svg className="part-glyph" data-testid="part-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PART_GLYPHS[id]} />
    </svg>
  );
}

function currentPartStatus(currentImpact: string): string {
  return currentImpact.match(/(?:本转状态|当前状态)：[^。]+。/)?.[0] ?? "";
}

export function PartsBar({ state, activePartId = null, presentedThroughSequence }: PartsBarProps): React.JSX.Element {
  const [openSlot, setOpenSlot] = useState<number | null>(null);
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
  const inspectedPart = openSlot === null ? null : state.partSlots[openSlot] ?? null;
  const inspectedPresentation = inspectedPart === null ? null : describeEquippedPart(visibleState, inspectedPart);

  return (
    <section className="parts-panel" aria-label="部件栏">
      <header className="parts-heading">
        <h2>五槽部件架</h2>
        <p>本局全部部件贡献 ¥{state.attribution.part}</p>
      </header>
      <div className="parts-bar">
        {state.partSlots.map((part, slot) => {
          const presentation = part === null ? null : describeEquippedPart(visibleState, part);
          const active = slot === activeSlot;
          const disabled = disabledSlots.has(slot);
          const expanded = slot === openSlot;
          return (
            <div
              className={`part-slot ${part === null ? "is-empty" : "is-loaded"}${active ? " is-triggered" : ""}${disabled ? " is-disabled" : ""}`}
              data-testid="part-slot"
              data-active={active ? "true" : undefined}
              data-disabled={disabled ? "true" : undefined}
              key={slot}
            >
              <span className="part-slot-number" aria-hidden="true">{slot + 1}</span>
              {part !== null && <span className="part-trigger-lamp" aria-hidden="true" />}
              {part === null || presentation === null ? (
                <span className="empty-socket"><span className="sr-only">空部件槽 {slot + 1}</span></span>
              ) : (
                <button
                  className="part-socket-button"
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={expanded ? `part-detail-${slot}` : undefined}
                  onClick={() => setOpenSlot(expanded ? null : slot)}
                >
                  <PartGlyph id={part.id} />
                  <span className="part-socket-name">{presentation.name} · L{part.level}</span>
                  <span className="part-level-ring" aria-hidden="true">L{part.level}</span>
                  {!expanded && <span className="sr-only">{currentPartStatus(presentation.currentImpact)}</span>}
                </button>
              )}
              {disabled && <span className="part-disabled-label">本转失效</span>}
            </div>
          );
        })}
      </div>
      {openSlot !== null && inspectedPart !== null && inspectedPresentation !== null && (
        <div
          className="part-detail"
          id={`part-detail-${openSlot}`}
          role="group"
          aria-label={`${inspectedPresentation.name}部件详情`}
        >
          <div className="part-detail-title">
            <PartGlyph id={inspectedPart.id} />
            <h3>{inspectedPresentation.name} · L{inspectedPart.level}</h3>
          </div>
          <p><strong>完整触发规则：</strong>{inspectedPresentation.effect}</p>
          <p><strong>L1 → L2：</strong>{inspectedPresentation.levelTwoEffect?.replace(/^L2：/, "")}</p>
          <p><strong>当前进度／状态：</strong>{inspectedPresentation.currentImpact}</p>
          <p><strong>协同：</strong>{inspectedPresentation.synergy}</p>
          <p><strong>代价／风险：</strong>{inspectedPresentation.risk}</p>
        </div>
      )}
    </section>
  );
}
