import { useRef, useState } from "react";
import { useLanguage } from "@/i18n/language";
import { AudioSettings } from "@/app/components/AudioSettings";
import { unlockAudio } from "@/presentation/audio";
import { PayoutTray, type CoinMode } from "./PayoutTray";
import { COIN_PRESETS, type CoinCue, type CoinTier } from "./coin-plan";

export function CoinDemo({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const english = useLanguage() === "en"; const t = (zh: string, en: string) => english ? en : zh;
  const [cue, setCue] = useState<CoinCue | null>(null); const sequence = useRef(0);
  const [three, setThree] = useState(true);
  const [reduced, setReduced] = useState(() => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false));
  const [mode, setMode] = useState<CoinMode>("loading");
  const run = (tier: CoinTier) => { unlockAudio(); setCue({ id: ++sequence.current, seed: 104729, tier }); };
  return <section className="classic-page coin-lab">
    <nav className="classic-navigation"><button type="button" onClick={onBack}>‹ {t("回到机台", "BACK TO MACHINE")}</button><span>MECHANICAL STUDIES · 01</span></nav>
    <div className="classic-cabinet coin-lab-cabinet">
      <header className="classic-marquee"><p>MIDNIGHT</p><h1>{t("接币盘 · 机械小样", "THE PAYOUT TRAY")}</h1><span>COIN DROP · PHYSICS STUDY</span></header>
      <p className="coin-lab-intro">{t("听金币落下，看它们翻滚、碰撞、停稳。", "Hear the drop. Watch coins tumble, collide and settle.")}</p>
      <PayoutTray cue={cue} three={three} reduced={reduced} warm large onMode={setMode} />
      <p className="coin-lab-status" role="status">{mode === "loading" ? t("正在准备 3D 接币盘…", "Preparing the 3D tray…") : mode === "3d" ? t("3D 物理 · 撞击驱动声音", "3D PHYSICS · CONTACT-DRIVEN SOUND") : mode === "still" ? t("减少动态已开启 · 静态接币盘", "REDUCED MOTION · STILL TRAY") : t("简化动画 · 无物理堆叠", "LIGHTWEIGHT ANIMATION · NO PHYSICAL STACKING")}</p>
      <div className="coin-lab-presets">{(["small", "medium", "large"] as const).map((tier, i) => <button key={tier} type="button" data-own-sound onClick={() => run(tier)} disabled={reduced}>
        <strong>{t(["少量落币", "一把金币", "满盘落币"][i]!, ["A FEW", "A HANDFUL", "A SHOWER"][i]!)}</strong><span>{COIN_PRESETS[tier].count} {t("枚演示币", "demo coins")}</span>
      </button>)}</div>
      <p className="coin-lab-note">{t("仅演示声画，不下注、不加钱，也不读取或修改机台进度。连点会替换上一轮演示，不会无限叠币。", "An audiovisual demo only: no wager, no credit award, no machine-save access. Replaying replaces the previous coins rather than accumulating them.")}</p>
      <div className="coin-lab-options">
        <label><input type="checkbox" checked={three} onChange={(event) => setThree(event.target.checked)} />{t("3D 金币碰撞", "3D coin collisions")}</label>
        <label><input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.target.checked)} />{t("减少动态", "Reduced motion")}</label>
      </div>
      <details className="coin-lab-audio"><summary>{t("音乐与音效音量", "Music & sound volume")}</summary><AudioSettings /></details>
      <p className="coin-lab-note">{t("金币数量只代表演出强度，不等于奖金。手机若卡顿，可关闭 3D 对比简化动画。", "Coin count represents effect intensity, not payout value. If your phone struggles, turn off 3D to compare the lightweight version.")}</p>
    </div>
  </section>;
}
