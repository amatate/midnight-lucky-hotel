import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { playLeverDetentTone, unlockAudio } from "@/presentation/audio";
import { vibrateLeverDetent } from "@/presentation/haptics";

const TRAVEL_PX = 120;
const DETENT_PROGRESS = 0.72;
const TRIGGER_PROGRESS = 0.82;

type LeverMotion = "idle" | "dragging" | "impact" | "returning";
type Actuation = "pointer" | "button";

interface Gesture {
  readonly pointerId: number;
  readonly startY: number;
  readonly target: HTMLDivElement;
  detentFired: boolean;
}

interface LeverVisual {
  readonly progress: number;
  readonly motion: LeverMotion;
  readonly actuation: Actuation;
}

export interface PullLeverProps {
  readonly disabled?: boolean;
  readonly reducedMotion: boolean;
  readonly onPull: () => void;
}

function clampProgress(distance: number): number {
  return Math.min(1, Math.max(0, distance / TRAVEL_PX));
}

function displayedProgress(progress: number): number {
  return Math.round(progress * 1_000) / 1_000;
}

function releaseCapture(gesture: Gesture): void {
  try {
    gesture.target.releasePointerCapture?.(gesture.pointerId);
  } catch {
    // Capture can already be released by the browser during cancellation.
  }
}

function emitDetent(gesture: Gesture): void {
  if (gesture.detentFired) return;
  gesture.detentFired = true;
  playLeverDetentTone();
  vibrateLeverDetent();
}

export function PullLever({ disabled = false, reducedMotion, onPull }: PullLeverProps): React.JSX.Element {
  const gestureRef = useRef<Gesture | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busyRef = useRef(false);
  const [visual, setVisual] = useState<LeverVisual>({ progress: 0, motion: "idle", actuation: "pointer" });

  const clearTimers = (): void => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
  };

  const beginReturn = (actuation: Actuation): void => {
    const returnDuration = reducedMotion ? 110 : actuation === "button" ? 140 : 210;
    setVisual({ progress: 0, motion: "returning", actuation });
    timersRef.current.push(setTimeout(() => {
      busyRef.current = false;
      setVisual({ progress: 0, motion: "idle", actuation });
    }, returnDuration));
  };

  const triggerPull = (actuation: Actuation): void => {
    if (disabled || busyRef.current) return;
    busyRef.current = true;
    clearTimers();
    unlockAudio();
    setVisual({ progress: 1, motion: "impact", actuation });
    onPull();

    const impactDuration = reducedMotion ? 50 : actuation === "button" ? 45 : 70;
    timersRef.current.push(setTimeout(() => beginReturn(actuation), impactDuration));
  };

  const updateProgress = (event: ReactPointerEvent<HTMLDivElement>): number | null => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return null;
    const exactProgress = clampProgress(event.clientY - gesture.startY);
    if (exactProgress >= DETENT_PROGRESS) emitDetent(gesture);
    setVisual({ progress: displayedProgress(exactProgress), motion: "dragging", actuation: "pointer" });
    return exactProgress;
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const progress = cancelled ? 0 : clampProgress(event.clientY - gesture.startY);
    if (!cancelled && progress >= DETENT_PROGRESS) emitDetent(gesture);
    releaseCapture(gesture);
    gestureRef.current = null;
    if (!cancelled && progress >= TRIGGER_PROGRESS) triggerPull("pointer");
    else beginReturn("pointer");
  };

  useLayoutEffect(() => {
    if (!disabled || busyRef.current || gestureRef.current === null) return;
    const gesture = gestureRef.current;
    gestureRef.current = null;
    releaseCapture(gesture);
    clearTimers();
    beginReturn("pointer");
  }, [disabled]);

  useEffect(() => () => {
    clearTimers();
    if (gestureRef.current !== null) releaseCapture(gestureRef.current);
    gestureRef.current = null;
  }, []);

  const progressText = String(visual.progress);
  const style = { "--pull-progress": progressText } as CSSProperties;
  const inputDisabled = disabled || busyRef.current;

  return (
    <section className={`pull-control${reducedMotion ? " reduce-motion" : ""}`} aria-label="拉杆控制">
      <div
        className="lever-track"
        data-testid="pull-gesture"
        data-pull-progress={progressText}
        data-lever-state={visual.motion}
        data-actuation={visual.actuation}
        data-reduced-motion={reducedMotion}
        aria-label="向下拉动区域"
        aria-disabled={inputDisabled}
        style={style}
        onPointerDown={(event) => {
          if (inputDisabled || gestureRef.current !== null) return;
          clearTimers();
          unlockAudio();
          const gesture: Gesture = {
            pointerId: event.pointerId,
            startY: event.clientY,
            target: event.currentTarget,
            detentFired: false
          };
          gestureRef.current = gesture;
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
          } catch {
            // Pointer capture is optional; pointer identity still guards the gesture.
          }
          setVisual({ progress: 0, motion: "dragging", actuation: "pointer" });
        }}
        onPointerMove={updateProgress}
        onPointerUp={(event) => endGesture(event, false)}
        onPointerCancel={(event) => endGesture(event, true)}
      >
        <span aria-hidden="true" className="lever-slot" />
        <span aria-hidden="true" className="lever-detent" />
        <span aria-hidden="true" className="lever-shaft" />
        <span aria-hidden="true" className="lever-knob" />
        <small>向下拉到底</small>
      </div>
      <button
        className="pull-button"
        type="button"
        aria-label="拉动老虎机"
        data-thumb-control="true"
        disabled={inputDisabled}
        onClick={() => triggerPull("button")}
      >
        <span aria-hidden="true">PULL</span>
        拉动老虎机
      </button>
    </section>
  );
}
