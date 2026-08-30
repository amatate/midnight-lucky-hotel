import { describeEquippedPart } from "@/content/player-copy";
import type { RunState } from "@/core/types";

export function PartsBar({ state }: { readonly state: RunState }): React.JSX.Element {
  return (
    <section className="parts-panel" aria-label="部件栏">
      <h2>部件</h2>
      <p>本局全部部件贡献 ¥{state.attribution.part}</p>
      <div className="parts-bar">
        {state.partSlots.map((part, slot) => {
          const presentation = part === null ? null : describeEquippedPart(state, part);
          return (
            <div className={`part-slot ${part === null ? "is-empty" : ""}`} data-testid="part-slot" key={slot}>
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
