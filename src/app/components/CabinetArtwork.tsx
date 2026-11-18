import { useId, useState, type ReactNode } from "react";
import type { PartId, RoomTier } from "@/core/types";

/** Coordinates belong to art, never to rules or saves. Each physical slot stays independent. */
export const PART_ART_INDEX: Readonly<Record<PartId, number>> = {
  "harvest-vat": 0, "votive-candle": 1, "shock-absorber": 2, "cherry-press": 3,
  "salad-dressing": 4, "lemon-infection": 5, "jam-jar": 6, "fruit-salad": 7,
  leftovers: 8, "omen-collector": 9, "triple-blessing": 10, "midnight-bell": 11,
  "martyr-coin": 12, "scrap-magnet": 13, "loose-spring": 14, "blank-capacitor": 15,
  "warranty-fraud": 16, "overload-motor": 17, "safety-fuse": 18,
  "intervention-relay": 20, "blank-dividend": 21
};
const PART_ROWS = [[0, 296], [300, 265], [568, 255], [824, 290]] as const;

export function CabinetPartArt({ id, fallback }: {
  readonly id: PartId | "room-service"; readonly fallback?: ReactNode;
}): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const clip = useId();
  // The newer parts have their own enamel badges instead of reusing the motor and capacitor.
  if (id === "intervention-relay" || id === "blank-dividend") return <span className="installed-part-art" data-art-ready="true" data-part-art={id} aria-hidden="true">
    <svg viewBox="0 0 52 52" focusable="false" fill="none" strokeLinejoin="round">
      <rect x="4" y="6" width="44" height="41" rx="7" fill="#302f27" stroke="#bb9b62" strokeWidth="2" />
      {id === "intervention-relay" ? <g stroke="#e9c789" strokeWidth="3"><path d="M8 32h8m21 0h7M16 31l18-13" />
        <circle cx="16" cy="32" r="3" fill="#a35b45"/><circle cx="36" cy="32" r="3" fill="#a35b45"/><path d="M17 40h18" stroke="#8e7052"/></g>
        : <><rect x="12" y="13" width="17" height="20" rx="3" stroke="#d7ceb0" strokeWidth="2" strokeDasharray="4 2" />
          <g fill="#b18c45" stroke="#f5dc9a" strokeWidth="2"><ellipse cx="31" cy="36" rx="10" ry="4"/><ellipse cx="31" cy="32" rx="10" ry="4"/><ellipse cx="31" cy="28" rx="10" ry="4"/></g></>}
    </svg></span>;
  const index = id === "room-service" ? 19 : PART_ART_INDEX[id];
  const [y, height] = id === "room-service" ? [863, 240] : PART_ROWS[Math.floor(index / 5)]!;
  const x = index % 5 * 280;
  return <span className="installed-part-art" data-art-ready={ready} data-part-art={id} aria-hidden="true">
    <span className="part-art-fallback">{fallback ?? "◇"}</span>
    <svg viewBox={`${x} ${y} 280 ${height}`} focusable="false">
      <defs><clipPath id={clip}><rect x={x} y={y} width="280" height={height} /></clipPath></defs>
      <image href={`${import.meta.env.BASE_URL}art/installed-parts-v1.png`} width="1402" height="1122"
        clipPath={`url(#${clip})`}
        onLoad={() => setReady(true)} onError={() => setReady(false)} />
    </svg>
  </span>;
}

export function RoomCrown({ tier }: { readonly tier: RoomTier }): React.JSX.Element {
  return <img className="room-crown-art" src={`${import.meta.env.BASE_URL}art/crowns/room-${tier}-v1.webp`}
    alt="" aria-hidden="true" draggable={false} data-room-crown={tier} />;
}

export function RoomBackdrop({ tier }: { readonly tier: RoomTier }): React.JSX.Element {
  const clip = useId();
  const index = tier - 1;
  const x = index % 3 * 512 + 8;
  const y = Math.floor(index / 3) * 512 + 8;
  // Inset avoids the atlas seams; slice keeps room proportions on tall phones.
  return <div className="room-backdrop" aria-hidden="true" data-room-backdrop={tier}>
    <svg viewBox={`${x} ${y} 496 488`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs><clipPath id={clip}><rect x={x} y={y} width="496" height="488" /></clipPath></defs>
      <image href={`${import.meta.env.BASE_URL}art/hotel-rooms-v1.png`} width="1536" height="1024" clipPath={`url(#${clip})`} />
    </svg>
  </div>;
}
