import type { GameEvent } from "@/core/events";
import type { FeedbackPlan } from "@/presentation/feedback";

let context: AudioContext | null = null;

export function unlockAudio(): boolean {
  if (typeof window === "undefined") return false;
  const AudioConstructor = window.AudioContext;
  if (AudioConstructor === undefined) return false;
  try {
    context ??= new AudioConstructor();
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export function playLeverDetentTone(): boolean {
  if (context === null || context.state === "closed") return false;
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 210;
    gain.gain.setValueAtTime(0.022, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.035);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.035);
    return true;
  } catch {
    return false;
  }
}

function eventFrequency(event: GameEvent): number {
  const positive = event.type === "LINE_WIN" || event.type === "PAYOUT_ADDED" || event.type === "PAYOUT_COMPLETE";
  const warning = event.type === "OVERLOAD" || event.type === "RUN_ENDED";
  return positive ? 660 : warning ? 180 : 360;
}

function chordFrequencies(tone: FeedbackPlan["tone"], fallback: number): readonly number[] {
  switch (tone) {
    case "win": return [fallback, fallback * 1.25, fallback * 1.5];
    case "chain": return [440, 554, 660];
    case "runaway": return [180, 360, 540, 720];
    case "none": return [fallback];
  }
}

export function playEventTone(event: GameEvent, tone: FeedbackPlan["tone"] = "none"): boolean {
  if (context === null || context.state === "closed") return false;
  try {
    const gain = context.createGain();
    const frequencies = chordFrequencies(tone, eventFrequency(event));
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.08);
    gain.connect(context.destination);
    frequencies.forEach((frequency, index) => {
      const oscillator = context!.createOscillator();
      oscillator.type = index === 0 && tone === "runaway" ? "square" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start();
      oscillator.stop(context!.currentTime + 0.08);
    });
    return true;
  } catch {
    return false;
  }
}
