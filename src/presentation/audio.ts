import type { GameEvent } from "@/core/events";
import type { GameCommand } from "@/core/commands";
import type { FeedbackPlan } from "@/presentation/feedback";
import { getAudioSettings, loadAudioSettings, subscribeAudio, AUDIO_KEY, MUTE_KEY } from "./audio-settings";
import { renderSfx, SAMPLE_RATE, type SfxId } from "./audio-synthesis";

let context: AudioContext | null = null;
let effects: GainNode | null = null;
let music: GainNode | null = null;
let musicSource: AudioBufferSourceNode | null = null;
let musicBuffer: AudioBuffer | null = null;
let loading: Promise<void> | null = null;
let musicFailed = false;
let startedAt = 0;
let offset = 0;
let unlocked = false;
const buffers = new Map<SfxId, AudioBuffer>();
const voices = new Set<AudioBufferSourceNode>();
const lastPlayed = new Map<SfxId, number>();
const MAX_VOICES = 8;

function ramp(node: GainNode | null, value: number, seconds = .04): void {
  if (!context || !node) return;
  node.gain.cancelScheduledValues(context.currentTime);
  node.gain.setTargetAtTime(value, context.currentTime, seconds);
}
function stopMusic(): void {
  if (!musicSource || !context) return;
  offset = (offset + context.currentTime - startedAt) % (musicBuffer?.duration ?? 48);
  musicSource.stop(); musicSource.disconnect(); musicSource = null;
}
function syncMix(): void {
  const settings = getAudioSettings();
  ramp(effects, settings.muted ? 0 : settings.sfx * settings.sfx * .8);
  ramp(music, settings.muted ? 0 : settings.music * .75, .12);
  if (settings.muted || settings.music === 0 || document.hidden) stopMusic(); else startMusic();
}
function startMusic(): void {
  if (!context || !music || !unlocked || context.state !== "running" || document.hidden || musicSource) return;
  const settings = getAudioSettings();
  if (settings.muted || settings.music === 0) return;
  if (!musicBuffer) {
    if (loading || musicFailed) return;
    const owner = context;
    loading = fetch(`${import.meta.env.BASE_URL}audio/after-hours-v1.wav`)
      .then((response) => { if (!response.ok) throw new Error("Music unavailable"); return response.arrayBuffer(); })
      .then((bytes) => owner.decodeAudioData(bytes))
      .then((buffer) => { if (context === owner) { musicBuffer = buffer; startMusic(); } })
      .catch(() => { musicFailed = true; })
      .finally(() => { loading = null; });
    return;
  }
  musicSource = context.createBufferSource();
  musicSource.buffer = musicBuffer; musicSource.loop = true;
  musicSource.connect(music); startedAt = context.currentTime;
  musicSource.start(0, offset % musicBuffer.duration);
}

/** Call only from a player gesture; never autoplay on page load. */
export function unlockAudio(): boolean {
  if (typeof window === "undefined") return false;
  const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return false;
  try {
    if (!context || context.state === "closed") {
      const next = new Constructor();
      const sfxBus = next.createGain(); const musicBus = next.createGain();
      const limiter = next.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 8;
      sfxBus.connect(limiter); musicBus.connect(limiter); limiter.connect(next.destination);
      context = next; effects = sfxBus; music = musicBus; buffers.clear(); lastPlayed.clear();
      context.onstatechange = () => { if (context?.state === "running") syncMix(); };
    }
    unlocked = true; musicFailed = false;
    if (context.state !== "running") void context.resume().then(syncMix).catch(() => undefined);
    syncMix(); return true;
  } catch { return false; }
}
export function playSfx(id: SfxId, rate = 1): boolean {
  const settings = getAudioSettings();
  if (!context || !effects || context.state !== "running" || settings.muted || settings.sfx === 0 || document.hidden) return false;
  const now = context.currentTime;
  const gap = id === "coin" || id === "part" ? .09 : id === "ui" ? .06 : .025;
  if (now - (lastPlayed.get(id) ?? -Infinity) < gap || voices.size >= MAX_VOICES) return false;
  try {
    let buffer = buffers.get(id);
    if (!buffer) {
      const data = renderSfx(id);
      buffer = context.createBuffer(1, data.length, SAMPLE_RATE); buffer.copyToChannel(data, 0); buffers.set(id, buffer);
    }
    const source = context.createBufferSource(); source.buffer = buffer;
    source.playbackRate.value = Math.max(.8, Math.min(1.2, rate)); source.connect(effects);
    source.onended = () => { source.disconnect(); voices.delete(source); };
    source.start(); voices.add(source); lastPlayed.set(id, now);
    if (id === "big-win" || id === "room-clear") {
      ramp(music, settings.music * .22, .02);
      music?.gain.setTargetAtTime(settings.music * .75, now + .8, .3);
    }
    return true;
  } catch { return false; }
}
export const playLeverDetentTone = () => playSfx("lever");
export function commandSound(command: GameCommand): SfxId | null {
  switch (command.type) {
    case "SPIN": return "spin";
    case "RESPIN_REEL": return "reroll";
    case "LOCK_AND_RESPIN_OTHERS": return "hold";
    case "KICK_REEL": return "kick";
    case "PRAY": case "LIGHT_CANDLE": case "ENABLE_MARTYR": return "prayer";
    case "BUY_FOOD": return "meal";
    case "CHOOSE_UPGRADE": case "UPGRADE_PART": return "upgrade";
    default: return null;
  }
}
export function playCommandSound(command: GameCommand): void { const id = commandSound(command); if (id) playSfx(id); }
export function eventSound(event: GameEvent, tone: FeedbackPlan["tone"] = "none"): SfxId | null {
  if (tone === "runaway" && event.type === "PAYOUT_COMPLETE" && event.total > 0) return "big-win";
  switch (event.type) {
    case "LINE_WIN": case "PATTERN_LINE_WIN": return "win";
    case "PART_TRIGGERED": case "SYMBOL_CHANGED": return "part";
    case "PAYOUT_ADDED": return event.amount > 0 ? "coin" : null;
    case "FOOD_CONSUMED": return "meal";
    case "PAYOUT_COMPLETE": return event.total > 0 ? "coin" : null;
    case "ROOM_COMPLETED": return event.cleared ? "room-clear" : "run-end";
    case "RUN_ENDED": return event.outcome === "won" ? "room-clear" : "run-end";
    default: return null;
  }
}
export function playEventTone(event: GameEvent, tone: FeedbackPlan["tone"] = "none"): boolean {
  const id = eventSound(event, tone); return id === null ? false : playSfx(id);
}
export function installAudio(): () => void {
  loadAudioSettings();
  const unsubscribe = subscribeAudio(syncMix);
  const gesture = () => { unlockAudio(); };
  const click = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest("button, summary") : null;
    if (button && !button.hasAttribute("disabled") && !button.closest(".pull-control, .audio-settings")) playSfx("ui");
  };
  const pause = () => {
    stopMusic(); voices.forEach((voice) => { voice.stop(); voice.disconnect(); }); voices.clear();
    void context?.suspend().catch(() => undefined);
  };
  const visibility = () => {
    if (document.hidden) pause();
    else if (unlocked && context) void context.resume().then(syncMix).catch(() => undefined);
  };
  const storage = (event: StorageEvent) => { if (event.key === AUDIO_KEY || event.key === MUTE_KEY || event.key === null) loadAudioSettings(); };
  document.addEventListener("pointerdown", gesture, { passive: true }); document.addEventListener("keydown", gesture);
  document.addEventListener("click", click); document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", pause); window.addEventListener("pageshow", visibility); window.addEventListener("storage", storage);
  return () => {
    unsubscribe(); document.removeEventListener("pointerdown", gesture); document.removeEventListener("keydown", gesture);
    document.removeEventListener("click", click); document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", pause); window.removeEventListener("pageshow", visibility); window.removeEventListener("storage", storage);
    unlocked = false; pause();
  };
}
