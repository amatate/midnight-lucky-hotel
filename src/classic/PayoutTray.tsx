import { useEffect, useRef, useState, type CSSProperties } from "react";
import { playCoinImpact } from "@/presentation/audio";
import { COIN_PRESETS, type CoinCue } from "./coin-plan";
import type { CoinScene } from "./coin-scene";
import "./coins.css";

export type CoinMode = "loading" | "3d" | "2d" | "still";
export function PayoutTray({ cue, three, reduced, warm = false, large = false, onMode }: {
  readonly cue: CoinCue | null; readonly three: boolean; readonly reduced: boolean; readonly warm?: boolean; readonly large?: boolean;
  readonly onMode?: (mode: CoinMode) => void;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null); const scene = useRef<CoinScene | null>(null); const consumed = useRef<number | null>(null);
  const [requested, setRequested] = useState(warm || cue !== null);
  const [mode, setMode] = useState<CoinMode>(reduced ? "still" : three ? "loading" : "2d");
  const [flat, setFlat] = useState<CoinCue | null>(null);
  useEffect(() => { if (cue) setRequested(true); }, [cue]);
  useEffect(() => { onMode?.(mode); }, [mode, onMode]);
  useEffect(() => {
    if (reduced || !three || typeof WebGL2RenderingContext === "undefined") { setMode(reduced ? "still" : "2d"); return; }
    if (!requested || !host.current) return;
    let cancelled = false; const controller = new AbortController();
    setMode("loading");
    const failed = () => {
      if (cancelled) return;
      controller.abort(); scene.current?.dispose(); scene.current = null; setMode("2d");
    };
    const timeout = window.setTimeout(failed, 8_000);
    void import("./coin-scene").then((module) => {
      if (cancelled || controller.signal.aborted || !host.current) return null;
      return module.createCoinScene(host.current, (impact) => { playCoinImpact(impact.strength, impact.pan, impact.variant); }, failed, controller.signal);
    }).then((next) => {
      clearTimeout(timeout);
      if (!next) return;
      if (cancelled || controller.signal.aborted) { next.dispose(); return; }
      scene.current = next; setMode("3d");
    }).catch(() => { clearTimeout(timeout); failed(); });
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); scene.current?.dispose(); scene.current = null; };
  }, [three, reduced, requested]);
  useEffect(() => {
    if (!cue) { consumed.current = null; scene.current?.clear(); setFlat(null); return; }
    if (mode === "loading" || consumed.current === cue.id) return;
    consumed.current = cue.id;
    if (document.hidden || mode === "still") return;
    if (mode === "3d") scene.current?.play(cue); else setFlat(cue);
  }, [cue, mode]);
  useEffect(() => {
    if (!flat) return;
    const timer = window.setTimeout(() => setFlat(null), 2_600);
    return () => clearTimeout(timer);
  }, [flat]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) { setFlat(null); scene.current?.clear(); } };
    document.addEventListener("visibilitychange", hidden); return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  return <div className={"payout-tray" + (large ? " payout-tray-large" : "")} data-testid="payout-tray" data-mode={mode} aria-hidden="true">
    <div className="payout-tray-fallback"><div className="payout-mouth" /><div className="payout-bowl" /></div>
    <div ref={host} className="payout-canvas" />
    {mode === "2d" && flat && <div className="payout-flat-coins" key={flat.id}>{Array.from({ length: Math.min(12, COIN_PRESETS[flat.tier].count) }, (_, i) => <i key={i} style={{ "--coin-x": (i * 53 % 150) - 75, "--coin-delay": `${i * .065}s`, "--coin-turn": `${180 + i * 71}deg` } as CSSProperties}>M</i>)}</div>}
  </div>;
}
