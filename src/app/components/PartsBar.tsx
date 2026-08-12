import { UPGRADES } from "@/content/upgrades";
import type { RunState } from "@/core/types";

export function PartsBar({ state }: { readonly state: RunState }): React.JSX.Element {
  return (
    <section className="parts-panel" aria-label="部件栏">
      <h2>部件</h2>
      <div className="parts-bar">
        {state.partSlots.map((part, slot) => (
          <div className={`part-slot ${part === null ? "is-empty" : ""}`} data-testid="part-slot" key={slot}>
            {part === null ? (
              <span aria-label={`空部件槽 ${slot + 1}`}>空</span>
            ) : (
              <details>
                <summary>{UPGRADES[part.id].name}</summary>
                <p>等级 {part.level} · {UPGRADES[part.id].tags.join(" / ")}</p>
              </details>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
