import type { PartInstance, RunState } from "@/core/types";

export function PartReadout({ part, state, disabled }: {
  readonly part: PartInstance; readonly state: RunState; readonly disabled: boolean;
}): React.JSX.Element | null {
  const resolving = state.phase === "RESOLVING_EFFECTS";
  let label: string;
  let value: number;
  let capacity: number;
  switch (part.id) {
    case "harvest-vat": label = "存酿"; value = state.counters.harvestCharge ?? 0; capacity = 3; break;
    case "votive-candle": label = "已存预兆"; value = state.counters.votiveCharge ?? 0; capacity = 3; break;
    case "blank-capacitor": label = "充能"; value = state.counters.blankCharge; capacity = 3; break;
    case "shock-absorber": label = "保护上限"; value = part.level; capacity = part.level; break;
    default: return null;
  }
  // These counters are committed before playback. Never expose a future reset or
  // increase; only effects with authoritative events get a live trigger light.
  const hidden = resolving && part.id !== "shock-absorber";
  return <span className="part-readout" data-part-readout={part.id} data-pending={hidden}>
    <span className="part-charge-lights" aria-hidden="true">
      {Array.from({ length: capacity }, (_, i) => <i key={i} data-lit={!hidden && !disabled && i < value} />)}
    </span>
    <span>{hidden ? "结算中" : part.id === "shock-absorber" ? `保护 ${value}` : `${value}/${capacity}`}</span>
    <span className="sr-only">{hidden ? "储量结算后更新" : `${label} ${value}，${part.id === "blank-capacitor" || part.id === "harvest-vat" ? "触发刻度" : "上限"} ${capacity}`}</span>
  </span>;
}
