import { useSyncExternalStore } from "react";
export const AUDIO_KEY = "midnight-lucky-hotel.audio.v1";
export const MUTE_KEY = "midnight-lucky-hotel.muted";
export interface AudioSettings { readonly music: number; readonly sfx: number; readonly muted: boolean }
export const DEFAULT_AUDIO: AudioSettings = { music: .28, sfx: .72, muted: false };
export const volume = (value: unknown, fallback: number): number => typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
export function readAudioSettings(): AudioSettings {
  let saved: Partial<AudioSettings> = {};
  try { const raw: unknown = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? "{}"); if (raw && typeof raw === "object") saved = raw; } catch { /* Optional preference. */ }
  let muted = saved.muted === true;
  try { const legacy = localStorage.getItem(MUTE_KEY); if (legacy !== null) muted = legacy === "1"; } catch { /* Session-only. */ }
  return { music: volume(saved.music, .28), sfx: volume(saved.sfx, .72), muted };
}
let current: AudioSettings = DEFAULT_AUDIO;
const listeners = new Set<() => void>();
export const getAudioSettings = () => current;
export const subscribeAudio = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useAudioSettings = () => useSyncExternalStore(subscribeAudio, getAudioSettings, () => DEFAULT_AUDIO);
export function loadAudioSettings(): void { current = readAudioSettings(); listeners.forEach((listener) => listener()); }
export function setAudioSettings(patch: Partial<AudioSettings>): void {
  current = { music: volume(patch.music, current.music), sfx: volume(patch.sfx, current.sfx), muted: patch.muted ?? current.muted };
  try { localStorage.setItem(AUDIO_KEY, JSON.stringify(current)); localStorage.setItem(MUTE_KEY, current.muted ? "1" : "0"); } catch { /* Still applies in this tab. */ }
  listeners.forEach((listener) => listener());
}
