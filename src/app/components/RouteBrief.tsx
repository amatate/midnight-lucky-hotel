import { routeReadiness } from "@/app/route-readiness";
import type { RunState } from "@/core/types";

export function RouteBrief({ state }: { readonly state: RunState }): React.JSX.Element {
  const route = routeReadiness(state);
  return <section className="route-brief" aria-label="构筑进度">
    <h3>{route.badge}</h3><p>{route.next}</p><p>{route.loop}</p>
    <details><summary>触发条件与限制</summary><p>{route.detail}</p></details>
  </section>;
}
