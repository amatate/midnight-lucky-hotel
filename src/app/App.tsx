import { GameScreen } from "@/app/GameScreen";
import "@/app/archives.css";
import { useState } from "react";
import { FrontDesk } from "@/app/components/FrontDesk";
import { UpdateNotice } from "@/app/components/UpdateNotice";
import { initializeLibrary, validSeed, type ArchiveLibrary } from "@/persistence/archives";

const DEFAULT_SEED = 20_260_812;

export function parseSeed(search: string): number {
  const raw = new URLSearchParams(search).get("seed");
  if (raw === null || raw.trim() === "") return DEFAULT_SEED;
  const seed = Number(raw);
  return validSeed(seed) ? seed : DEFAULT_SEED;
}

export function App({ seed }: { readonly seed?: number } = {}): React.JSX.Element {
  const resolvedSeed = seed !== undefined && Number.isFinite(seed) && Number.isInteger(seed)
    ? seed
    : parseSeed(globalThis.location?.search ?? "");
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState<{ library: ArchiveLibrary | null; error: string | null }>(() => {
    try { return { library: initializeLibrary(), error: null }; }
    catch (cause) { return { library: null, error: cause instanceof Error ? cause.message : "读取存档失败。" }; }
  });
  const home = () => {
    try { setLoaded({ library: initializeLibrary(), error: null }); }
    catch (cause) { setLoaded({ library: null, error: cause instanceof Error ? cause.message : "读取存档失败。" }); }
    setPlaying(false);
  };
  return (
    <main className={playing ? "app-shell" : "app-shell frontdesk-shell"}>
      <UpdateNotice playing={playing} />
      {playing ? <GameScreen seed={resolvedSeed} onHome={home} /> : <FrontDesk
        library={loaded.library} error={loaded.error} defaultSeed={resolvedSeed}
        onLibrary={(library) => setLoaded({ library, error: null })} onPlay={() => setPlaying(true)} />}
    </main>
  );
}
