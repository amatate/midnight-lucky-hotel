import { useSyncExternalStore } from "react";

export type Language = "zh" | "en";
export const LANGUAGE_KEY = "midnight-lucky-hotel.language";
const listeners = new Set<() => void>();
export function initialLanguage(search = globalThis.location?.search ?? "", browserLanguage = globalThis.navigator?.language ?? "zh"): Language {
  const requested = new URLSearchParams(search).get("lang");
  if (requested === "en" || requested === "zh") return requested;
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch { /* A blocked preference store must not block playing. */ }
  return browserLanguage.toLowerCase().startsWith("zh") ? "zh" : "en";
}
// Initialize explicitly at the app entry point. Pure engine/component tests keep
// their original Chinese defaults and never read a real browser preference.
let language: Language = "zh";
export const getLanguage = (): Language => language;
export const subscribeLanguage = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const useLanguage = (): Language => useSyncExternalStore(subscribeLanguage, getLanguage, () => "zh");
export function setLanguage(next: Language, persist = true): void {
  if (persist) {
    try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* Session-only choice still works. */ }
    // Keep explicit share URLs consistent after the player switches languages.
    try {
      const url = new URL(location.href);
      url.searchParams.set("lang", next);
      history.replaceState(history.state, "", url);
    } catch { /* Not required outside the browser. */ }
  }
  language = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
    document.title = next === "en" ? "Midnight Lucky Hotel" : "午夜好运酒店";
  }
  listeners.forEach((listener) => listener());
}
