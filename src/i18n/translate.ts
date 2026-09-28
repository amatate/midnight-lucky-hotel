import sources from "./messages.json";
import english from "./en.json";
import { getLanguage } from "./language";

const han = /\p{Script=Han}/u;
const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();
const plainTerms = (text: string): string => text.replaceAll("专注", "干预点").replaceAll("字面", "实际").replaceAll("赔付", "奖金");
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = new Map<string, string>();
const templates: { pattern: RegExp; translation: string; slots: number[]; weight: number }[] = [];
for (const [id, source] of Object.entries(sources)) {
  const translation = (english as Record<string, string>)[id];
  if (!translation) continue;
  for (const variant of new Set([source, plainTerms(source)])) {
    const text = normalize(variant);
    if (!/\{\d+\}/.test(text)) { exact.set(text, translation); continue; }
    const slots: number[] = [];
    const parts = text.split(/(\{\d+\})/);
    const regex = parts.map((part, index) => {
      if (/^\{\d+\}$/.test(part)) {
        slots.push(Number(part.slice(1, -1)));
        const before = parts[index - 1] ?? "";
        const after = parts[index + 1] ?? "";
        // Numeric slots must not swallow another Chinese clause just because
        // the sentence happens to end in the same unit (e.g. shift vs spin).
        const numeric = /(?:第\s*|¥|\bL)$/.test(before)
          || (text.includes("总长度") && /→\s*$/.test(before))
          || /^\s*(?:[/%×]|轮|回合|转|条|个|层|格|点|份|次)/.test(after);
        return numeric ? "([\\d.,+−%-]+)" : "(.*?)";
      }
      return escape(part).replaceAll(" ", "\\s*");
    }).join("");
    templates.push({ pattern: new RegExp("^" + regex + "$", "u"), translation, slots, weight: text.replace(/\{\d+\}/g, "").length });
  }
}
// Additional sentence patterns for JSX that interleaves numbers as separate children.
for (const [source, translation] of Object.entries({
  "保修欺诈": "Warranty Fraud", "奉献箱": "Offering Box",
  "转轮": "reel", "回合": "round", "本班": "this shift", "本转": "this spin"
})) exact.set(source, translation);
templates.sort((a, b) => b.weight - a.weight);
const fragmentPattern = new RegExp([...exact.keys()].sort((a, b) => b.length - a.length).map(escape).join("|"), "gu");
const cache = new Map<string, string>();

/** Display-only. Never call from core, content, persistence, or RNG code. */
export function translate(text: string, depth = 0): string {
  if (getLanguage() !== "en" || !han.test(text)) return text;
  const normalized = normalize(text);
  const cached = cache.get(normalized);
  if (cached !== undefined) return cached;
  // A multi-reel preview concatenates complete sentences. Keep their template
  // boundaries so a final dynamic suffix cannot swallow the following reel.
  if (depth < 5 && /；(?=第\d+轮：)/.test(normalized)) {
    return normalized.split(/；(?=第\d+轮：)/).map((part) => translate(part, depth + 1)).join("; ");
  }
  let result = exact.get(normalized);
  if (result === undefined && depth < 5) {
    for (const entry of templates) {
      const match = entry.pattern.exec(normalized);
      if (!match) continue;
      const args = new Map(entry.slots.map((slot, index) => [slot, translate(match[index + 1] ?? "", depth + 1)]));
      result = entry.translation.replace(/\{(\d+)\}/g, (_, index: string) => args.get(Number(index)) ?? "");
      break;
    }
  }
  if (result === undefined) {
    // Legacy logs often compose sentences with + rather than templates. Translate
    // the longest known fragments; never rewrite identifiers or stored records.
    const numbered = normalized.replace(/第\s*(\d+)\s*(班|轮|转|回合)/g,
      (_, number: string, unit: string) => `${({ 班: "Shift", 轮: "Reel", 转: "Spin", 回合: "Round" } as Record<string, string>)[unit]} ${number}`);
    result = numbered.replace(fragmentPattern, (fragment) => ` ${exact.get(fragment)!} `)
      .replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  }
  if (cache.size >= 2000) cache.clear();
  cache.set(normalized, result);
  return result;
}

const DISPLAY_ATTRIBUTES = ["aria-label", "aria-description", "title", "alt", "placeholder"] as const;
/** Localize host-element text at JSX creation, before React owns the DOM.
 * Component props, keys, handlers, form values, IDs and saved data remain intact.
 * Raw debug blocks and player-authored text opt out with translate="no".
 */
export function localizedProps(type: unknown, props: unknown): unknown {
  if (getLanguage() !== "en" || props === null || typeof props !== "object") return props;
  if (type === Symbol.for("react.fragment")) {
    const fragment = props as Record<string, unknown>;
    return { ...fragment, children: localizedChildren(fragment.children) };
  }
  if (typeof type !== "string") return props;
  const original = props as Record<string, unknown>;
  if (original.translate === "no") return props;
  const next = { ...original };
  // Options without explicit values submit their labels. Keep the original value.
  if (type === "option" && next.value === undefined && typeof original.children === "string") next.value = original.children;
  for (const key of DISPLAY_ATTRIBUTES) if (typeof next[key] === "string") next[key] = translate(next[key]);
  if (!["pre", "code", "script", "style", "textarea"].includes(type) && "children" in next) next.children = localizedChildren(next.children);
  return next;
}

function localizedChildren(children: unknown): unknown {
  if (typeof children === "string") return translate(children);
  if (!Array.isArray(children)) return children;
  const result: unknown[] = [];
  let pending = "";
  let pieces: (string | number)[] = [];
  const flush = () => {
    if (pending !== "") {
      let translated = translate(pending);
      // A JSX sentence may contain a complete dynamic message between numeric
      // fragments. Preserve that boundary before falling back to fragments.
      if (han.test(translated)) translated = translate(pieces.map((piece) =>
        typeof piece === "string" && piece.trim().length > 3 ? ` ${translate(piece)} ` : String(piece)
      ).join(""));
      result.push(han.test(pending) ? ` ${translated} ` : translated);
      pending = "";
      pieces = [];
    }
  };
  for (const child of children) {
    if (typeof child === "string" || typeof child === "number") { pending += String(child); pieces.push(child); }
    else { flush(); result.push(Array.isArray(child) ? localizedChildren(child) : child); }
  }
  flush();
  return result;
}
