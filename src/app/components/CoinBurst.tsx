import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { coinBurstPaths } from "@/presentation/feedback";

interface CoinGeometry {
  readonly width: number;
  readonly height: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
}

export interface CoinBurstProps {
  readonly count: number;
  readonly containerRef?: RefObject<HTMLElement | null>;
  readonly sourceRef?: RefObject<HTMLElement | null>;
  readonly destinationRef?: RefObject<HTMLElement | null>;
}

const COIN_RADIUS = 7;

function sameGeometry(left: CoinGeometry | null, right: CoinGeometry | null): boolean {
  if (left === null || right === null) return left === right;
  return left.width === right.width && left.height === right.height &&
    left.sourceX === right.sourceX && left.sourceY === right.sourceY &&
    left.targetX === right.targetX && left.targetY === right.targetY;
}

function coordinate(value: number, extent: number): number {
  return Math.round(Math.max(COIN_RADIUS, Math.min(extent - COIN_RADIUS, value)));
}

export function CoinBurst({
  count,
  containerRef,
  sourceRef,
  destinationRef
}: CoinBurstProps): React.JSX.Element | null {
  const paths = coinBurstPaths(count);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<CoinGeometry | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const overlay = overlayRef.current;
      const container = containerRef?.current ?? overlay?.closest<HTMLElement>("[data-coin-cabinet='true']") ?? null;
      const source = sourceRef?.current ?? container?.querySelector<HTMLElement>("[data-coin-source='true']") ?? null;
      const destination = destinationRef?.current ?? container?.querySelector<HTMLElement>("[data-coin-destination='true']") ?? null;
      if (container === null || source === null || destination === null) {
        setGeometry((current) => sameGeometry(current, null) ? current : null);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const destinationRect = destination.getBoundingClientRect();
      if (containerRect.width < COIN_RADIUS * 2 || containerRect.height < COIN_RADIUS * 2) {
        setGeometry((current) => sameGeometry(current, null) ? current : null);
        return;
      }
      const next: CoinGeometry = {
        width: containerRect.width,
        height: containerRect.height,
        sourceX: coordinate(sourceRect.left + sourceRect.width / 2 - containerRect.left, containerRect.width),
        sourceY: coordinate(sourceRect.top + sourceRect.height / 2 - containerRect.top, containerRect.height),
        targetX: coordinate(destinationRect.left + destinationRect.width / 2 - containerRect.left, containerRect.width),
        targetY: coordinate(destinationRect.top + destinationRect.height / 2 - containerRect.top, containerRect.height)
      };
      setGeometry((current) => sameGeometry(current, next) ? current : next);
    };

    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (observer !== null) {
      const container = containerRef?.current ?? overlayRef.current?.closest<HTMLElement>("[data-coin-cabinet='true']") ?? null;
      const source = sourceRef?.current ?? container?.querySelector<HTMLElement>("[data-coin-source='true']") ?? null;
      const destination = destinationRef?.current ?? container?.querySelector<HTMLElement>("[data-coin-destination='true']") ?? null;
      if (container !== null) observer.observe(container);
      if (source !== null) observer.observe(source);
      if (destination !== null) observer.observe(destination);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [containerRef, destinationRef, sourceRef]);

  if (paths.length === 0) return null;
  return (
    <div
      className="coin-burst"
      ref={overlayRef}
      data-testid="coin-burst"
      data-overlay-scope="cabinet"
      data-source-x={geometry?.sourceX}
      data-source-y={geometry?.sourceY}
      data-target-x={geometry?.targetX}
      data-target-y={geometry?.targetY}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
    >
      {geometry !== null && paths.map((path) => {
        const startX = coordinate(geometry.sourceX + path.startDx, geometry.width);
        const startY = coordinate(geometry.sourceY + path.startDy, geometry.height);
        const apexX = coordinate((geometry.sourceX + geometry.targetX) / 2 + path.apexDx, geometry.width);
        const apexY = coordinate(Math.min(geometry.sourceY, geometry.targetY) - path.apexLift, geometry.height);
        const endX = coordinate(geometry.targetX + path.endDx, geometry.width);
        const endY = coordinate(geometry.targetY + path.endDy, geometry.height);
        return (
          <span
            className="coin-particle"
            data-testid="coin-particle"
            key={path.index}
            style={{
              "--coin-start-x": `${startX}px`,
              "--coin-start-y": `${startY}px`,
              "--coin-apex-x": `${apexX}px`,
              "--coin-apex-y": `${apexY}px`,
              "--coin-end-x": `${endX}px`,
              "--coin-end-y": `${endY}px`,
              "--coin-mid-rotation": `${path.rotation * 0.45}deg`,
              "--coin-rotation": `${path.rotation}deg`,
              "--coin-delay": `${path.delayMs}ms`
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
