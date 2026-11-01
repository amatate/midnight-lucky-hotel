import { useState } from "react";
import "./concierge.css";

export const MIO_EXPRESSIONS = ["welcome", "smile", "thinking", "delighted"] as const;
export type MioExpression = typeof MIO_EXPRESSIONS[number];
export const mioImage = (expression: MioExpression) => `${import.meta.env.BASE_URL}art/concierge/mio-${expression}-v1.webp`;
export function MioPortrait({ expression = "welcome", framing = "bust", eager = false }: {
  readonly expression?: MioExpression; readonly framing?: "full" | "bust" | "avatar"; readonly eager?: boolean;
}): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  return <span className={`mio-portrait mio-${framing}`} data-expression={expression} aria-hidden="true">
    {failed ? <span className="mio-fallback">M</span> : <img src={mioImage(expression)} alt="" width="887" height="1774" loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />}
  </span>;
}
