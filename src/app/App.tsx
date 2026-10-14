import { GameScreen } from "@/app/GameScreen";
import "@/app/archives.css";
import { lazy, Suspense, useEffect, useState } from "react";
import { installAudio } from "@/presentation/audio";
import { FrontDesk } from "@/app/components/FrontDesk";
import { UpdateNotice } from "@/app/components/UpdateNotice";
import { initializeLibrary, validSeed, type ArchiveLibrary } from "@/persistence/archives";
import { useLanguage } from "@/i18n/language";

const DEFAULT_SEED = 20_260_812;
const ClassicScreen = lazy(() => import("@/classic/ClassicScreen"));

export function parseSeed(search: string): number {
  const raw = new URLSearchParams(search).get("seed");
  if (raw === null || raw.trim() === "") return DEFAULT_SEED;
  const seed = Number(raw);
  return validSeed(seed) ? seed : DEFAULT_SEED;
}

export function App({ seed }: { readonly seed?: number } = {}): React.JSX.Element {
  useEffect(installAudio, []);
  const language = useLanguage();
  const resolvedSeed = seed !== undefined && Number.isFinite(seed) && Number.isInteger(seed)
    ? seed
    : parseSeed(globalThis.location?.search ?? "");
  const [playing, setPlaying] = useState(false);
  const [classic, setClassic] = useState(() => new URLSearchParams(globalThis.location?.search ?? "").get("mode") === "classic");
  const [loaded, setLoaded] = useState<{ library: ArchiveLibrary | null; error: string | null }>(() => {
    if (new URLSearchParams(globalThis.location?.search ?? "").get("mode") === "classic") return { library: null, error: null };
    try { return { library: initializeLibrary(), error: null }; }
    catch (cause) { return { library: null, error: cause instanceof Error ? cause.message : "读取存档失败。" }; }
  });
  const home = () => {
    try { setLoaded({ library: initializeLibrary(), error: null }); }
    catch (cause) { setLoaded({ library: null, error: cause instanceof Error ? cause.message : "读取存档失败。" }); }
    setPlaying(false);
    setClassic(false);
    const url = new URL(location.href); url.searchParams.delete("mode"); url.searchParams.delete("machine"); url.searchParams.delete("demo"); history.replaceState(history.state, "", url);
  };
  const openClassic = () => {
    setClassic(true);
    const url = new URL(location.href); url.searchParams.set("mode", "classic"); history.replaceState(history.state, "", url);
  };
  return (
    <main lang={language === "en" ? "en" : "zh-CN"} className={classic ? "app-shell classic-shell" : playing ? "app-shell" : "app-shell frontdesk-shell"}>
      <UpdateNotice playing={playing || classic} />
      {classic ? <Suspense fallback={<p role="status" style={{ padding: 32 }}>{language === "en" ? "Warming up the classic machine…" : "正在启动经典机台…"}</p>}><ClassicScreen onHome={home} /></Suspense> : playing ? <GameScreen seed={resolvedSeed} onHome={home} /> : <FrontDesk
        library={loaded.library} error={loaded.error} defaultSeed={resolvedSeed}
        onLibrary={(library) => setLoaded({ library, error: null })} onPlay={() => setPlaying(true)} onClassic={openClassic} />}
    </main>
  );
}
