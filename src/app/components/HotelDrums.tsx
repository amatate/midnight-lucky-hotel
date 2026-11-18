import { useEffect, useLayoutEffect, useRef } from "react";
import type { HotelDrumFrame, HotelDrumScene } from "@/presentation/hotel-drum-scene";

export function HotelDrums({ frame, reducedMotion, onReady }: {
  readonly frame: HotelDrumFrame; readonly reducedMotion: boolean; readonly onReady: (ready: boolean) => void;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null), scene = useRef<HotelDrumScene | null>(null);
  const latest = useRef(frame); latest.current = frame;
  useEffect(() => {
    onReady(false);
    if (reducedMotion || (typeof WebGLRenderingContext === "undefined" && typeof WebGL2RenderingContext === "undefined")) return;
    let cancelled = false;
    const fail = () => { if (cancelled) return; scene.current?.dispose(); scene.current = null; onReady(false); };
    void import("@/presentation/hotel-drum-scene").then(async module => {
      const art = await module.loadDrumArt();
      if (cancelled || !host.current) return;
      scene.current = module.createHotelDrumScene(host.current, art, fail);
      scene.current.show(latest.current);
      if (scene.current) onReady(true);
    }).catch(fail);
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, [reducedMotion, onReady]);
  useLayoutEffect(() => { scene.current?.show(frame); }, [frame]);
  return <div className="hotel-drums-webgl" ref={host} aria-hidden="true" />;
}
