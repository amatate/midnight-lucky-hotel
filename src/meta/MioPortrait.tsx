import { useState } from "react";
import "./concierge.css";

export const MIO_EXPRESSIONS = ["welcome", "smile", "thinking", "delighted", "concerned", "proud"] as const;
export type MioExpression = typeof MIO_EXPRESSIONS[number];
export const mioImage = (expression: MioExpression) => `${import.meta.env.BASE_URL}art/concierge/mio-${expression}-v2.webp`;
export function MioPortrait({ expression = "welcome", framing = "bust", eager = false }: {
  readonly expression?: MioExpression; readonly framing?: "full" | "bust" | "avatar"; readonly eager?: boolean;
}): React.JSX.Element {
  const [loaded, setLoaded] = useState<MioExpression | null>(null);
  const ready = loaded === expression;
  return <span className={`mio-portrait mio-${framing}`} data-expression={expression} data-ready={ready} aria-hidden="true">
    {!ready && <span className="mio-fallback">M</span>}
    <img key={expression} src={mioImage(expression)} alt="" width="360" height="724" loading={eager ? "eager" : "lazy"} decoding="async"
      onLoad={() => setLoaded(expression)} onError={() => setLoaded(null)} />
  </span>;
}
