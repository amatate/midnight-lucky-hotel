import { useLayoutEffect, useRef, useState } from "react";
import { safeMoney } from "@/core/money";

export interface AnimatedMoneyProps {
  readonly target: number;
  readonly durationMs: number;
  readonly resetKey: string;
  readonly animationKey: string;
  readonly reducedMotion: boolean;
  readonly signed?: boolean;
  readonly accessibleLabel?: string;
  readonly className?: string;
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function moneyText(value: number, signed: boolean): string {
  const money = safeMoney(value);
  return `${signed && money > 0 ? "+" : ""}${money}`;
}

export function AnimatedMoney({
  target,
  durationMs,
  resetKey,
  animationKey,
  reducedMotion,
  signed = false,
  accessibleLabel,
  className
}: AnimatedMoneyProps): React.JSX.Element {
  const normalizedTarget = safeMoney(target);
  const [displayed, setDisplayed] = useState(normalizedTarget);
  const displayedRef = useRef(normalizedTarget);
  const resetKeyRef = useRef(resetKey);
  const animationKeyRef = useRef(animationKey);
  const targetRef = useRef(normalizedTarget);
  const frameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const cancelFrame = () => {
      if (frameRef.current === null) return;
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
    cancelFrame();

    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      animationKeyRef.current = animationKey;
      targetRef.current = normalizedTarget;
      displayedRef.current = normalizedTarget;
      setDisplayed(normalizedTarget);
      return cancelFrame;
    }

    if (reducedMotion || durationMs <= 0) {
      animationKeyRef.current = animationKey;
      targetRef.current = normalizedTarget;
      displayedRef.current = normalizedTarget;
      setDisplayed(normalizedTarget);
      return cancelFrame;
    }

    const changed = animationKeyRef.current !== animationKey || targetRef.current !== normalizedTarget;
    if (!changed) return cancelFrame;
    animationKeyRef.current = animationKey;
    targetRef.current = normalizedTarget;

    const startedAt = performance.now();
    const from = displayedRef.current;
    const renderFrame = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
      const next = progress >= 1
        ? normalizedTarget
        : safeMoney(from + (normalizedTarget - from) * easeOutCubic(progress));
      displayedRef.current = next;
      setDisplayed(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(renderFrame);
      else frameRef.current = null;
    };
    frameRef.current = requestAnimationFrame(renderFrame);
    return cancelFrame;
  }, [animationKey, durationMs, normalizedTarget, reducedMotion, resetKey]);

  return (
    <>
      <span aria-hidden="true" className={className} data-testid="animated-money">
        {moneyText(displayed, signed)}
      </span>
      {accessibleLabel !== undefined && <span className="sr-only">{accessibleLabel}</span>}
    </>
  );
}
