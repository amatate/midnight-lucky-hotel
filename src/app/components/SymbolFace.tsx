import { SYMBOL_LABELS } from "@/app/labels";
import type { SymbolId } from "@/core/types";

export interface SymbolFaceProps {
  readonly symbol: SymbolId;
  readonly decorative?: boolean;
}

function SymbolArtwork({ symbol }: { readonly symbol: SymbolId }): React.JSX.Element {
  switch (symbol) {
    case "cherry":
      return (
        <>
          <path className="symbol-ink" d="M31 31C32 18 39 11 48 8M33 30C27 20 22 15 15 13" />
          <path className="symbol-leaf" d="M44 10C48 4 57 6 58 12C52 15 47 14 44 10Z" />
          <circle className="symbol-red" cx="22" cy="42" r="11" />
          <circle className="symbol-red" cx="43" cy="40" r="12" />
          <path className="symbol-shine" d="M17 37C19 34 22 33 25 34" />
        </>
      );
    case "lemon":
      return (
        <>
          <path className="symbol-yellow" d="M12 36C16 22 29 13 44 16C51 18 56 24 55 31C53 45 40 54 25 51C18 50 11 43 12 36Z" />
          <path className="symbol-ink" d="M14 30L8 25M52 38L59 43" />
          <path className="symbol-shine" d="M22 27C28 21 36 20 42 22" />
        </>
      );
    case "bell":
      return (
        <>
          <path className="symbol-gold" d="M13 44H51L46 37V27C46 18 40 12 32 12C24 12 18 18 18 27V37L13 44Z" />
          <path className="symbol-ink" d="M10 45H54M26 49C27 55 37 55 38 49" />
          <path className="symbol-shine" d="M24 24C25 20 28 18 32 18" />
        </>
      );
    case "seven":
      return (
        <>
          <path className="symbol-red-fill" d="M12 12H53V23C43 29 36 39 32 54H17C20 41 27 31 38 23H12V12Z" />
          <path className="symbol-gold-stroke" d="M15 17H47M24 49C28 36 36 27 47 21" />
        </>
      );
    case "wild":
      return (
        <>
          <path className="symbol-red-fill" d="M32 6L39 23L58 24L43 36L48 55L32 44L16 55L21 36L6 24L25 23L32 6Z" />
          <path className="symbol-gold-stroke" d="M32 16L37 28L49 29L39 37L42 47L32 40L22 47L25 37L15 29L27 28L32 16Z" />
        </>
      );
    case "blank":
      return (
        <>
          <rect className="symbol-blank-plate" x="13" y="18" width="38" height="28" rx="7" />
          <path className="symbol-blank-mark" d="M22 32H42" />
        </>
      );
    case "food":
      return (
        <>
          <path className="symbol-food" d="M12 42C14 29 22 22 32 22C42 22 50 29 52 42H12Z" />
          <path className="symbol-ink" d="M8 43H56M26 18C26 12 38 12 38 18" />
          <path className="symbol-shine" d="M20 35C23 29 28 27 33 27" />
        </>
      );
    case "crack":
      return (
        <>
          <path className="symbol-crack-main" d="M38 5L27 23L36 29L22 44L30 48L22 59" />
          <path className="symbol-crack-branch" d="M28 23L17 20M35 29L49 23M23 44L11 48M30 48L43 54" />
        </>
      );
  }
}

export function SymbolFace({ symbol, decorative = false }: SymbolFaceProps): React.JSX.Element {
  const accessibility = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": SYMBOL_LABELS[symbol] };

  return (
    <span className={`symbol-face symbol-face-${symbol}`} data-symbol={symbol} {...accessibility}>
      <svg viewBox="0 0 64 64" focusable="false" aria-hidden="true" data-symbol-art={symbol}>
        <SymbolArtwork symbol={symbol} />
      </svg>
    </span>
  );
}
