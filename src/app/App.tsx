import { GameScreen } from "@/app/GameScreen";
import "@/app/archives.css";
import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { installAudio } from "@/presentation/audio";
import { FrontDesk } from "@/app/components/FrontDesk";
import { UpdateNotice } from "@/app/components/UpdateNotice";
import { activeRecord, initializeLibrary, validSeed, type ArchiveLibrary } from "@/persistence/archives";
import { useLanguage } from "@/i18n/language";
import type { MachineId } from "@/classic/machines";

const ClassicScreen = lazy(() => import("@/classic/ClassicScreen"));

export function parseSeed(search: string): number | null {
  const raw = new URLSearchParams(search).get("seed");
  if (raw === null || raw.trim() === "") return null;
  const seed = Number(raw);
  return validSeed(seed) ? seed : null;
}

export function App({ seed }: { readonly seed?: number } = {}): React.JSX.Element {
  useEffect(installAudio, []);
  const language = useLanguage();
  const resolvedSeed = seed !== undefined && validSeed(seed)
    ? seed
    : parseSeed(globalThis.location?.search ?? "");
  const [playing, setPlaying] = useState<false | "new" | "resume">(false);
  const [classic, setClassic] = useState(() => new URLSearchParams(globalThis.location?.search ?? "").get("mode") === "classic");
  useLayoutEffect(() => {
    // Reception can be long. Do not carry its scroll into a small-screen cabinet.
    if (window.scrollX || window.scrollY) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [playing, classic]);
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
    const url = new URL(location.href); url.searchParams.delete("mode"); url.searchParams.delete("machine"); url.searchParams.delete("demo"); url.searchParams.delete("welcome");
    if (playing) url.searchParams.delete("seed"); // A shared seed applies to that stay, not every future night.
    history.replaceState(history.state, "", url);
  };
  const openClassic = (options: { machine?: MachineId; welcome?: "lesson" | "ledger" } = {}) => {
    setClassic(true);
    const url = new URL(location.href); url.searchParams.set("mode", "classic");
    if (options.machine && options.machine !== "original") url.searchParams.set("machine", options.machine); else url.searchParams.delete("machine");
    if (options.welcome) url.searchParams.set("welcome", options.welcome); else url.searchParams.delete("welcome");
    history.replaceState(history.state, "", url);
  };
  const active = loaded.library && activeRecord(loaded.library);
  return (
    <main lang={language === "en" ? "en" : "zh-CN"} className={classic ? "app-shell classic-shell" : playing ? "app-shell" : "app-shell frontdesk-shell"}>
      <UpdateNotice playing={!!playing || classic} />
      {classic ? <Suspense fallback={<p role="status" style={{ padding: 32 }}>{language === "en" ? "Warming up the classic machine…" : "正在启动经典机台…"}</p>}><ClassicScreen onHome={home} /></Suspense> : playing && active ? <GameScreen seed={active.snapshot.initialSeed} entry={playing} onHome={home} /> : <FrontDesk
        library={loaded.library} error={loaded.error} defaultSeed={resolvedSeed}
        onLibrary={(library) => setLoaded({ library, error: null })} onPlay={setPlaying} onClassic={openClassic} />}
    </main>
  );
}
