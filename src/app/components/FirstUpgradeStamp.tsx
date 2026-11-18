import { useState } from "react";
import type { UpgradeNote } from "@/app/first-upgrade";
import { UPGRADES } from "@/content/upgrades";
import { getLanguage } from "@/i18n/language";

export function FirstUpgradeStamp({ note }: { readonly note: UpgradeNote }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return <aside className="console-discovery first-effect-banner">
    <div role="status"><strong>{note.stamp} · {UPGRADES[note.id].name}</strong><span>{note.body}</span></div>
    <button type="button" aria-label={getLanguage() === "en" ? "Dismiss upgrade slip" : "收起强化小票"} onClick={() => setClosed(true)}>×</button>
  </aside>;
}
