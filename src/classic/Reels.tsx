import { useEffect, useRef, useState } from "react";
import { type Stops } from "./engine";
import { machineReels, machineSymbolAt, type MachineId } from "./machines";
import { ClassicIcon } from "./symbols";
import type { ReelMotion } from "./motion";
import type { ReelScene } from "./reel-scene";

export function Reels({ stops, motion, stopped, onRenderer, machine = "original" }: {
  readonly stops: Stops; readonly motion: ReelMotion | null; readonly stopped: number;
  readonly onRenderer: (renderer: "3d" | "2d") => void;
  readonly machine?: MachineId;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReelScene | null>(null);
  const latest = useRef({ stops, motion }); latest.current = { stops, motion };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const fail = () => { scene.current?.dispose(); scene.current = null; if (!cancelled) { setReady(false); onRenderer("2d"); } };
    void import("./reel-scene").then(({ createReelScene }) => {
      if (cancelled || host.current === null) return;
      try {
        scene.current = createReelScene(host.current, fail, machineReels(machine));
        scene.current.show(latest.current.stops, latest.current.motion);
        setReady(true); onRenderer("3d");
      } catch { fail(); }
    }).catch(fail);
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, [onRenderer, machine]);
  useEffect(() => { scene.current?.show(stops, motion); }, [stops, motion]);
  return <div className="classic-reel-window" data-renderer={ready ? "3d" : "2d"} aria-hidden="true">
    <div ref={host} className="classic-webgl" />
    {!ready && <div className="classic-flat-reels">{[0, 1, 2].map((reel) => {
      const spin = motion !== null && reel >= stopped;
      const stop = motion !== null && !spin ? motion.to[reel]! : stops[reel]!;
      return <div key={reel} className={"classic-flat-reel" + (spin && !motion.reduced ? " is-spinning" : "")}>
        {[1, 0, -1].map((offset) => <div key={offset}><ClassicIcon symbol={machineSymbolAt(machine, reel, stop + offset)} /></div>)}
      </div>;
    })}</div>}
    <div className="classic-glass" /><div className="classic-payline"><i /><i /></div><div className="classic-glass-reflection" />
  </div>;
}
