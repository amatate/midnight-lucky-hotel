import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CabinetPartArt } from "@/app/components/CabinetArtwork";
import { describeEquippedPart } from "@/app/player-copy";
import { changedPart } from "@/presentation/part-feedback";
import { UPGRADES } from "@/content/upgrades";
import type { RunState } from "@/core/types";
import { getLanguage } from "@/i18n/language";

export type InstallOrigin = { readonly x: number; readonly y: number };
export function captureInstallOrigin(): InstallOrigin | null {
  const art = document.querySelector(".upgrade-confirm-art .upgrade-art");
  const rect = art?.getBoundingClientRect();
  return rect && rect.width > 0 ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
}

/** Transient visual observation only: no commands, timers in saves, or extra clicks. */
export function PartInstallFeedback({ state, origin, reducedMotion, paused }: {
  readonly state: RunState; readonly origin: RefObject<InstallOrigin | null>;
  readonly reducedMotion: boolean; readonly paused: boolean;
}): React.JSX.Element | null {
  const previous = useRef(state);
  const [arrival, setArrival] = useState<(NonNullable<ReturnType<typeof changedPart>> & {
    readonly from: InstallOrigin | null; readonly to: InstallOrigin | null;
  }) | null>(null);
  useLayoutEffect(() => {
    const change = changedPart(previous.current, state);
    previous.current = state;
    if (!change) return;
    const target = document.querySelector(`[data-part-id="${change.part.id}"] .installed-part-art`)?.getBoundingClientRect();
    setArrival({ ...change, from: origin.current, to: target && target.width > 0 ? { x: target.x + target.width / 2, y: target.y + target.height / 2 } : null });
    origin.current = null;
  }, [state, origin]);
  useLayoutEffect(() => {
    if (!arrival) return;
    const timer = setTimeout(() => setArrival(null), 2_800);
    const clear = () => setArrival(null);
    // Do not replay a stale flight after the phone rotates, scrolls or backgrounds.
    window.addEventListener("resize", clear); window.addEventListener("scroll", clear, true);
    return () => { clearTimeout(timer); window.removeEventListener("resize", clear); window.removeEventListener("scroll", clear, true); };
  }, [arrival]);
  if (!arrival || paused) return null;
  const english = getLanguage() === "en";
  const details = describeEquippedPart(state, arrival.part);
  return <>
    <aside className="part-install-note" role="status" data-slot={arrival.slot}>
      <strong>{english ? (arrival.upgraded ? "UPGRADED" : "INSTALLED") : arrival.upgraded ? "部件升级" : "部件就位"} · {UPGRADES[arrival.part.id].name} L{arrival.part.level}</strong>
      <span>{details.decisionEffect}</span>
    </aside>
    {!reducedMotion && arrival.from && arrival.to && createPortal(<div className="part-install-flight" aria-hidden="true" style={{
      "--flight-x": `${arrival.from.x - 28}px`, "--flight-y": `${arrival.from.y - 28}px`,
      "--flight-dx": `${arrival.to.x - arrival.from.x}px`, "--flight-dy": `${arrival.to.y - arrival.from.y}px`
    } as CSSProperties}><CabinetPartArt id={arrival.part.id} /></div>, document.body)}
  </>;
}
