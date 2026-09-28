import { useId, useState, type ReactNode } from "react";
import type { PartId, RoomTier } from "@/core/types";

/** Coordinates belong to art, never to rules or saves. Each physical slot stays independent. */
export const PART_ART_INDEX: Readonly<Record<PartId, number>> = {
  "harvest-vat": 0, "votive-candle": 1, "shock-absorber": 2, "cherry-press": 3,
  "salad-dressing": 4, "lemon-infection": 5, "jam-jar": 6, "fruit-salad": 7,
  leftovers: 8, "omen-collector": 9, "triple-blessing": 10, "midnight-bell": 11,
  "martyr-coin": 12, "scrap-magnet": 13, "loose-spring": 14, "blank-capacitor": 15,
  "warranty-fraud": 16, "overload-motor": 17, "safety-fuse": 18
};
const PART_ROWS = [[0, 296], [300, 265], [568, 255], [824, 290]] as const;

export function CabinetPartArt({ id, fallback }: {
  readonly id: PartId | "room-service"; readonly fallback?: ReactNode;
}): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const clip = useId();
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

// The generator left a soft halo. A native SVG silhouette clips it out without
// altering the raster source or baking any text/goal indicators into the asset.
const CROWNS: Readonly<Record<RoomTier, { box: string; outline: string }>> = {
  1: { box: "10 170 492 210", outline: "10,377 10,356 20,356 20,308 35,284 62,284 62,264 96,264 105,244 147,244 188,223 245,204 268,207 295,224 342,235 380,259 426,279 454,283 487,308 496,354 502,354 502,377" },
  2: { box: "522 170 492 210", outline: "522,378 522,358 531,358 531,285 550,282 577,302 580,264 599,264 599,240 683,240 711,223 739,223 740,207 770,188 797,205 797,230 827,230 854,240 937,240 937,264 960,264 960,300 985,283 1001,284 1001,356 1014,356 1014,378" },
  3: { box: "1034 170 492 210", outline: "1034,378 1034,358 1046,358 1046,313 1057,286 1075,286 1075,272 1128,270 1130,242 1194,242 1194,216 1230,216 1230,198 1258,198 1258,178 1278,175 1299,187 1300,207 1330,207 1330,219 1367,219 1367,242 1395,242 1395,267 1470,267 1489,287 1495,305 1514,313 1519,356 1526,356 1526,378" },
  4: { box: "10 637 492 200", outline: "10,835 10,816 17,816 17,758 32,722 62,702 87,702 130,677 196,653 255,650 298,652 351,677 404,702 449,714 480,738 497,776 497,817 502,817 502,835" },
  5: { box: "522 637 492 200", outline: "522,833 522,814 530,814 535,761 557,741 589,738 623,707 680,682 717,677 738,653 768,647 798,653 819,680 867,693 911,718 944,738 981,742 1005,765 1009,812 1014,812 1014,833" },
  6: { box: "1034 637 492 200", outline: "1034,833 1034,814 1044,814 1046,778 1060,738 1104,711 1159,687 1210,672 1244,648 1280,646 1316,655 1338,676 1391,692 1446,714 1486,740 1508,777 1517,814 1526,814 1526,833" }
};

export function RoomCrown({ tier }: { readonly tier: RoomTier }): React.JSX.Element {
  const clip = useId();
  const art = CROWNS[tier];
  return <svg className="room-crown-art" viewBox={art.box} preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false" data-room-crown={tier}>
    <defs><clipPath id={clip}><polygon points={art.outline} /></clipPath></defs>
    <image href={`${import.meta.env.BASE_URL}art/room-crowns-v1.png`} width="1536" height="1024" clipPath={`url(#${clip})`} />
  </svg>;
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
