import type { ReelSymbol } from "./machines";

const shapes = {
  cherry: [
    { d: "M28 34Q28 19 46 8M35 34Q29 20 16 14", fill: "none", stroke: "#344234", width: 3 },
    { d: "M43 11Q48 3 57 10Q54 17 43 11Z", fill: "#477c6b", stroke: "#344234", width: 1.5 },
    { d: "M32 44A12 12 0 1 1 8 44A12 12 0 1 1 32 44M55 42A13 13 0 1 1 29 42A13 13 0 1 1 55 42", fill: "#a63746", stroke: "#6c2430", width: 2 },
    { d: "M15 39Q18 35 22 36M37 36Q40 32 44 34", fill: "none", stroke: "#e5a4a0", width: 2.5 }
  ],
  lemon: [
    { d: "M10 40Q8 18 34 13Q42 10 48 18Q59 22 55 39Q49 56 27 55Q17 54 10 40Z", fill: "#e4c574", stroke: "#aa914d", width: 2 },
    { d: "M12 36L7 32M51 43L58 47", fill: "none", stroke: "#414737", width: 3 },
    { d: "M21 27Q26 20 35 20", fill: "none", stroke: "#fff0bc", width: 3 }
  ],
  bell: [
    { d: "M26 49Q25 59 33 58Q41 57 39 49", fill: "none", stroke: "#47442c", width: 3 },
    { d: "M12 47L19 37V26C19 5 47 5 47 26V37L54 47Z", fill: "#c2a75f", stroke: "#786839", width: 2 },
    { d: "M12 48H54", fill: "none", stroke: "#363929", width: 4 },
    { d: "M25 25Q25 17 32 17", fill: "none", stroke: "#f7e5a8", width: 3 }
  ],
  seven: [
    { d: "M12 10H54V22Q39 34 32 56H17Q22 34 38 23H12Z", fill: "#a63746", stroke: "#6c2430", width: 2 },
    { d: "M17 15H48M20 38L42 31", fill: "none", stroke: "#ebce88", width: 2 }
  ],
  bar: [
    { d: "M6 19H58V46H6Z", fill: "#193c32", stroke: "#a99456", width: 2 },
    { d: "M8 14H56M8 51H56", fill: "none", stroke: "#a99456", width: 2 }
  ],
  blank: [{ d: "M23 32H41", fill: "none", stroke: "#c7bc9a", width: 2 }],
  diamond: [
    { d: "M7 23L18 10H46L57 23L32 57Z", fill: "#e6e4d6", stroke: "#6d796f", width: 2 },
    { d: "M7 23H57M18 10L24 23L32 57L40 23L46 10M24 23L32 10L40 23", fill: "none", stroke: "#949d8d", width: 1.5 },
    { d: "M18 11L24 22L32 11ZM25 24H39L32 52Z", fill: "#fffdf0", stroke: "#fff9dc", width: 1 }
  ],
  wheel: [
    { d: "M32 6A26 26 0 1 1 31.99 6Z", fill: "#1e4134", stroke: "#a18a4f", width: 3 },
    { d: "M32 8V56M8 32H56M15 15L49 49M15 49L49 15", fill: "none", stroke: "#cfb977", width: 2 },
    { d: "M32 23A9 9 0 1 1 31.99 23Z", fill: "#e2c781", stroke: "#9f874b", width: 2 },
    { d: "M26 3H38L32 15Z", fill: "#a63746", stroke: "#6c2430", width: 1.5 }
  ]
} as const;

export function ClassicIcon({ symbol }: { readonly symbol: ReelSymbol }): React.JSX.Element {
  return <svg viewBox="0 0 64 64" className="classic-icon" aria-hidden="true">
    {shapes[symbol].map((shape, index) => <path key={index} d={shape.d} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.width} strokeLinecap="round" strokeLinejoin="round" />)}
    {symbol === "bar" && <text x="32" y="39" textAnchor="middle" fill="#efdeb0" fontFamily="Georgia, serif" fontWeight="bold" fontSize="17">BAR</text>}
  </svg>;
}

/** Reuses the exact icon paths in the DOM paytable and on the physical reel surfaces. */
export function paintSymbol(context: CanvasRenderingContext2D, symbol: ReelSymbol): void {
  for (const shape of shapes[symbol]) {
    const path = new Path2D(shape.d);
    context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = shape.width;
    if (shape.fill !== "none") { context.fillStyle = shape.fill; context.fill(path); }
    context.strokeStyle = shape.stroke; context.stroke(path);
  }
  if (symbol === "bar") {
    context.fillStyle = "#efdeb0"; context.font = "bold 17px Georgia, serif"; context.textAlign = "center";
    context.fillText("BAR", 32, 39);
  }
}
