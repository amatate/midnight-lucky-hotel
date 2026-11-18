import { SERVICE_PRESENTATIONS } from "@/app/player-copy";
import { ROUTE_KITS } from "@/content/route-kits";
import { UPGRADES } from "@/content/upgrades";
import type { RunState, ServiceId } from "@/core/types";
import type { GameCommand } from "@/core/commands";
import { UiAtlasArt } from "@/app/components/UiArtwork";
import { SERVICE_ART_ROUTE } from "@/app/ui-art-index";
import { getLanguage } from "@/i18n/language";

const TERMS: Record<ServiceId, string> = {
  repair: "每班 3 干预点；重转不保证更好。",
  kitchen: "餐费为标准下注的 75%；没中奖也消耗加成。",
  chapel: "祈祷花 1 干预点；这转不能再重转。",
  security: "每班可免费踹一次；留下 1 个永久裂纹。"
};
export function ServiceChoices({ state, onCommand }: { readonly state: RunState; readonly onCommand: (command: GameCommand) => void }): React.JSX.Element {
  return <div className="service-chooser" role="group" aria-label="选择服务">
    <h2>{state.stay ? getLanguage() === "en" ? "Which service shall I arrange?" : "想让我安排哪种服务？" : "今夜与谁合作？"}</h2><p>选一种操作风格。部件还可以在途中改变。</p>
    <div className="service-list">{state.serviceCandidates.map((id) => <article className="service-contract" key={id}>
      <button type="button" className="service-choice" data-service={id} onClick={() => onCommand({ type: "SELECT_SERVICE", serviceId: id })}>
        <span className="service-seal" aria-hidden="true"><UiAtlasArt id={`route-${SERVICE_ART_ROUTE[id]}`} /></span>
        <strong>{SERVICE_PRESENTATIONS[id].name}<span className="service-enter" aria-hidden="true">↗</span></strong>
        <span>{SERVICE_PRESENTATIONS[id].identity}</span><small>{TERMS[id]}</small>
        {state.routeKits && <span className="service-starter">附送 · {UPGRADES[ROUTE_KITS[id].part].name}</span>}
      </button>
      <details className="service-contract-details"><summary>开局配置与用法</summary>
        {state.routeKits && <p>{ROUTE_KITS[id].summary}</p>}
        <p><b>定位</b> {SERVICE_PRESENTATIONS[id].identity}</p>
        <p><b>行动</b> {SERVICE_PRESENTATIONS[id].action}</p>
        <p><b>协同</b> {SERVICE_PRESENTATIONS[id].synergies}</p>
        <p><b>代价／风险</b> {SERVICE_PRESENTATIONS[id].risk}</p>
      </details>
    </article>)}</div>
  </div>;
}
