import type { GameEvent } from "@/core/events";

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

export function playEventTone(event: GameEvent): boolean {
  if (context === null || context.state === "closed") return false;
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const positive = event.type === "LINE_WIN" || event.type === "PAYOUT_ADDED" || event.type === "PAYOUT_COMPLETE";
    const warning = event.type === "OVERLOAD" || event.type === "RUN_ENDED";
    oscillator.frequency.value = positive ? 660 : warning ? 180 : 360;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.08);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
    return true;
  } catch {
    return false;
  }
}
