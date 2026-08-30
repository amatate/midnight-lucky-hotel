import { coinBurstPaths } from "@/presentation/feedback";

export function CoinBurst({ count }: { readonly count: number }): React.JSX.Element | null {
  const paths = coinBurstPaths(count);
  if (paths.length === 0) return null;
  return (
    <div className="coin-burst" data-testid="coin-burst" aria-hidden="true">
      {paths.map((path) => (
        <span
          className="coin-particle"
          data-testid="coin-particle"
          key={path.index}
          style={{
            "--coin-x": `${path.x}px`,
            "--coin-y": `${path.y}px`,
            "--coin-rotation": `${path.rotation}deg`,
            "--coin-delay": `${path.delayMs}ms`
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
