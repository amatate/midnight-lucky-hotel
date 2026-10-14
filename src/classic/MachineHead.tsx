import { useEffect, useId, useRef } from "react";
import { playSfx } from "@/presentation/audio";
import { MACHINE_INFO, POOL_SEED, POOL_STEP, WHEEL_PRIZES, isFeatureState, money, type MachineId, type MachineState } from "./machines";
import { wheelAngle, wheelDuration, wheelRestAngle, type WheelMotion } from "./feature-motion";

export const DIAMOND_CREST = `${import.meta.env.BASE_URL}assets/classic/diamond-crest-v1.webp`;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
function BonusWheel({ index, motion, ready }: { readonly index: number; readonly motion: WheelMotion | null; readonly ready: boolean }): React.JSX.Element {
  const disk = useRef<SVGGElement>(null); const pointer = useRef<SVGPathElement>(null);
  const paintId = useId().replaceAll(":", "");
  useEffect(() => {
    let frame = 0; let lastDetent = -1; let lastSound = 0;
    const draw = () => {
      const elapsed = motion ? performance.now() - motion.startedAt : 0;
      const angle = motion ? wheelAngle(motion, elapsed) : wheelRestAngle(index);
      disk.current?.setAttribute("transform", `rotate(${angle} 100 100)`);
      const detent = Math.floor((angle + 22.5) / 45);
      if (motion && !motion.reduced && detent !== lastDetent && elapsed < wheelDuration(false) - 180) {
        if (lastDetent !== -1 && performance.now() - lastSound > 85 && !document.hidden) { playSfx("stop", 1.45); lastSound = performance.now(); }
        pointer.current?.animate?.([{ transform: "rotate(-9deg)" }, { transform: "rotate(0deg)" }], { duration: 95, easing: "ease-out" });
      }
      lastDetent = detent;
      if (motion && elapsed < wheelDuration(motion.reduced)) frame = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(frame);
  }, [motion, index]);
  const point = (angle: number) => `${100 + 88 * Math.cos(angle * Math.PI / 180)},${100 + 88 * Math.sin(angle * Math.PI / 180)}`;
  return <div className={"family-wheel" + (ready ? " is-ready" : "")} data-testid="bonus-wheel" data-sector={index} aria-hidden="true">
    <svg viewBox="-5 -12 210 217">
      <defs><linearGradient id={paintId}><stop stopColor="#6b5b38" /><stop offset=".23" stopColor="#ffedbf" /><stop offset=".48" stopColor="#ac9259" /><stop offset=".77" stopColor="#eddaad" /><stop offset="1" stopColor="#79633d" /></linearGradient></defs>
      <circle cx="100" cy="100" r="100" fill={`url(#${paintId})`} stroke="#f6e6bc" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="97" fill="none" stroke="#4d482f" strokeWidth="1" />
      <circle cx="100" cy="100" r="94" fill="#08130e" stroke="#f4dfaf" strokeWidth="1" />
      <g ref={disk} transform={`rotate(${wheelRestAngle(index)} 100 100)`}>{WHEEL_PRIZES.map((prize, i) => <g key={i}>
        <path d={`M100,100 L${point(-112.5 + i * 45)} A88,88 0 0,1 ${point(-67.5 + i * 45)} Z`} fill={i % 2 ? "#152f25" : "#e3d09e"} stroke="#a58a51" strokeWidth="1.5" />
        <text x="100" y="40" transform={`rotate(${i * 45} 100 100)`} textAnchor="middle" fill={i % 2 ? "#f0ddb0" : "#183027"} fontFamily="Barlow Condensed, sans-serif" fontSize="20" fontWeight="600">×{prize}</text>
      </g>)}</g>
      <circle cx="100" cy="100" r="89" fill="none" stroke="#645536" strokeWidth="2" />
      {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={100 + 95 * Math.cos(i * Math.PI / 4)} cy={100 + 95 * Math.sin(i * Math.PI / 4)} r="1.8" fill="#fff0c3" stroke="#625333" strokeWidth=".8" />)}
      <circle cx="100" cy="100" r="21" fill={`url(#${paintId})`} stroke="#ffedbf" strokeWidth="2" /><circle cx="100" cy="100" r="15" fill={`url(#${paintId})`} stroke="#6e613f" />
      <circle cx="100" cy="100" r="9" fill="none" stroke="#f6e5b6" strokeWidth=".7" /><path d="M97 97L103 103" stroke="#736241" strokeWidth="1.5" />
      <path ref={pointer} className="family-wheel-pointer" d="M89,-4 L100,25 L111,-4 L100,-10Z" fill={`url(#${paintId})`} stroke="#ffefc6" strokeWidth="1.5" />
      <circle cx="100" cy="-2" r="3" fill="#775b36" />
    </svg>
  </div>;
}

export function MachineHead({ machine, state, english, multiplier, wheelIndex, wheelMotion, wheelReady, jackpotLit, wonPool }: {
  readonly machine: MachineId; readonly state: MachineState | undefined; readonly english: boolean; readonly multiplier: number;
  readonly wheelIndex: number; readonly wheelMotion: WheelMotion | null; readonly wheelReady: boolean; readonly jackpotLit: boolean;
  readonly wonPool: { readonly multiplier: number; readonly amount: number } | null;
}): React.JSX.Element {
  const info = MACHINE_INFO[machine];
  if (machine === "original") return <header className="classic-marquee"><p>MIDNIGHT</p><h1>{english ? "THE ORIGINAL" : "经典机台"}</h1><span>MECHANICAL REEL CLUB</span></header>;
  const pool = wonPool?.multiplier ?? (state && isFeatureState(state) ? state.pending?.poolBefore !== undefined ? state.pending.poolBefore + POOL_STEP : state.pool : POOL_SEED);
  return <header className={"family-head family-head-" + machine}>
    {machine === "diamond" && <div className="family-diamond-crown"><span className={multiplier === 2 ? "is-lit" : ""}>2×</span><img src={DIAMOND_CREST} width="88" height="88" alt="" /><span className={multiplier === 4 ? "is-lit" : ""}>4×</span></div>}
    {machine === "wheel" && <BonusWheel index={wheelIndex} motion={wheelMotion} ready={wheelReady} />}
    <h1>{english ? info.en : info.zh}</h1><p>{english ? "MIDNIGHT · MECHANICAL REEL CLUB" : info.en}</p>
    {machine === "vault" && <div className={"family-vault-meter" + (jackpotLit ? " is-lit" : "")}>
      <div><span>{wonPool !== null ? "JACKPOT WON" : "JACKPOT"} <i /></span><strong key={pool} data-testid="vault-pool">{fmt(wonPool?.amount ?? money(pool / 100 * (state?.bet ?? 10)))}</strong><small>{english ? "Pool ×" : "奖池 ×"}{fmt(pool / 100)}{wonPool !== null ? english ? " · paid, resetting" : " · 已领取，随后重置" : english ? " · scales with bet" : " · 随注额换算"}</small></div>
      <aside><span>{english ? "MINI · TWO 7s" : "双 7 小奖"}</span><strong>{(state?.bet ?? 10) * 10}</strong><small>×10</small></aside>
    </div>}
  </header>;
}
