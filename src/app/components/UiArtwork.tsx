import { useId, useState } from "react";
import { CabinetPartArt } from "@/app/components/CabinetArtwork";
import { UI_ATLAS, uiArtFrame, uiArtViewBox, type UiArtId } from "@/app/ui-art-index";
import { UPGRADES } from "@/content/upgrades";
import type { PartId, UpgradeId, UpgradeRoute } from "@/core/types";
import type { QuestId } from "@/meta/guestbook";

/** All art is decorative: neighboring live text supplies names, status and hit targets. */
export function UiAtlasArt({ id, className = "" }: { readonly id: UiArtId; readonly className?: string }): React.JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const clip = useId();
  const [x, y, width, height] = uiArtFrame(id);
  return <span className={`ui-atlas-art ${className}`} data-ui-art={id} data-art-ready={loaded || undefined} aria-hidden="true">
    <span className="ui-art-fallback">◇</span>
    <svg viewBox={uiArtViewBox(id)} focusable="false" overflow="hidden">
      <defs><clipPath id={clip}><rect x={x} y={y} width={width} height={height} /></clipPath></defs>
      <image href={`${import.meta.env.BASE_URL}${UI_ATLAS.file}`}
        width={UI_ATLAS.columns * UI_ATLAS.cell} height={UI_ATLAS.rows * UI_ATLAS.cell}
        clipPath={`url(#${clip})`}
        onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
    </svg>
  </span>;
}

export function UpgradeArt({ id }: { readonly id: UpgradeId }): React.JSX.Element {
  return <span className="upgrade-art" data-upgrade-art={id} aria-hidden="true">
    {UPGRADES[id].kind === "part"
      ? <CabinetPartArt id={id as PartId} />
      : <UiAtlasArt key={id} id={id as Exclude<UpgradeId, PartId>} />}
  </span>;
}

export function RouteBadge({ route, label }: { readonly route: UpgradeRoute; readonly label: string }): React.JSX.Element {
  return <span className="route-art-badge" data-route={route}><UiAtlasArt key={route} id={`route-${route}`} /><span>{label}</span></span>;
}

export function KeepsakeArt({ id }: { readonly id: QuestId }): React.JSX.Element {
  return <UiAtlasArt key={id} id={`keepsake-${id}`} className="keepsake-art" />;
}
