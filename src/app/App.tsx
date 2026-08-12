import { GameScreen } from "@/app/GameScreen";

const DEFAULT_SEED = 20_260_812;

export function parseSeed(search: string): number {
  const raw = new URLSearchParams(search).get("seed");
  if (raw === null || raw.trim() === "") return DEFAULT_SEED;
  const seed = Number(raw);
  return Number.isFinite(seed) && Number.isInteger(seed) ? seed : DEFAULT_SEED;
}

export function App({ seed }: { readonly seed?: number } = {}): React.JSX.Element {
  const resolvedSeed = seed !== undefined && Number.isFinite(seed) && Number.isInteger(seed)
    ? seed
    : parseSeed(globalThis.location?.search ?? "");
  return (
    <main className="app-shell">
      <GameScreen seed={resolvedSeed} />
    </main>
  );
}
