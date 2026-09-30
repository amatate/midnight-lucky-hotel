import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AudioSettings } from "@/app/components/AudioSettings";
import { AUDIO_KEY, MUTE_KEY, DEFAULT_AUDIO, loadAudioSettings, readAudioSettings, setAudioSettings, getAudioSettings } from "@/presentation/audio-settings";
import { renderMusic, renderSfx, MUSIC_SECONDS, SAMPLE_RATE, SFX_IDS } from "@/presentation/audio-synthesis";
import { commandSound, eventSound } from "@/presentation/audio";
import { ARCHIVE_KEY } from "@/persistence/archives";
import { setLanguage } from "@/i18n/language";

beforeEach(() => { localStorage.clear(); loadAudioSettings(); setLanguage("zh", false); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage("zh", false); });
it("renders 16 distinct finite, bounded original sounds and a seamless loop", () => {
  const signatures = new Set<string>();
  for (const id of SFX_IDS) {
    const data = renderSfx(id);
    let energy = 0, peak = 0;
    for (const value of data) { expect(Number.isFinite(value)).toBe(true); peak = Math.max(peak, Math.abs(value)); energy += value * value; }
    expect(peak).toBeGreaterThan(.03); expect(peak).toBeLessThan(.9);
    expect(data.length / SAMPLE_RATE).toBeLessThan(1.5);
    expect(data.at(-1)).toBe(0);
    signatures.add(`${data.length}:${energy.toFixed(6)}`);
  }
  expect(signatures.size).toBe(16);
  const loop = renderMusic();
  expect(loop.length).toBe(SAMPLE_RATE * MUSIC_SECONDS);
  expect(Math.abs(loop[0]! - loop.at(-1)!)).toBeLessThan(.02);
  let energy = 0, peak = 0;
  for (const value of loop) { energy += value * value; peak = Math.max(peak, Math.abs(value)); }
  expect(peak).toBeLessThan(.8); expect(Math.sqrt(energy / loop.length)).toBeGreaterThan(.025);
});
it("migrates mute and validates damaged or blocked preferences", () => {
  localStorage.setItem(MUTE_KEY, "1");
  localStorage.setItem(AUDIO_KEY, '{"music":2,"sfx":"loud"}');
  expect(readAudioSettings()).toEqual({ music: 1, sfx: .72, muted: true });
  localStorage.setItem(AUDIO_KEY, "broken"); expect(readAudioSettings().music).toBe(.28);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(readAudioSettings()).toEqual(DEFAULT_AUDIO);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(() => setAudioSettings({ music: .1 })).not.toThrow(); expect(getAudioSettings().music).toBe(.1);
});
it("has independent persisted bilingual sliders and preserves the game archive", () => {
  localStorage.setItem(ARCHIVE_KEY, "untouched player data");
  const { rerender } = render(<AudioSettings />);
  fireEvent.change(screen.getByRole("slider", { name: /音乐音量/ }), { target: { value: "15" } });
  expect(getAudioSettings()).toEqual({ music: .15, sfx: .72, muted: false });
  fireEvent.change(screen.getByRole("slider", { name: /音效音量/ }), { target: { value: "0" } });
  expect(getAudioSettings().music).toBe(.15);
  fireEvent.click(screen.getByLabelText("静音"));
  expect(JSON.parse(localStorage.getItem(AUDIO_KEY)!)).toEqual({ music: .15, sfx: 0, muted: true });
  expect(localStorage.getItem(MUTE_KEY)).toBe("1");
  loadAudioSettings(); expect(getAudioSettings().music).toBe(.15);
  expect(localStorage.getItem(ARCHIVE_KEY)).toBe("untouched player data");
  setLanguage("en", false); rerender(<AudioSettings />);
  expect(screen.getByRole("slider", { name: /Music volume/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Preview sound" })).toBeDisabled();
});
it("maps successful actions and meaningful settlement events, leaving bookkeeping silent", () => {
  expect(commandSound({ type: "KICK_REEL", reelIndex: 0 })).toBe("kick");
  expect(commandSound({ type: "PRAY", symbol: "seven" })).toBe("prayer");
  expect(commandSound({ type: "PRESENTATION_COMPLETE" })).toBeNull();
  expect(eventSound({ sequence: 1, type: "PAYOUT_COMPLETE", total: 0 }, "runaway")).toBeNull();
  expect(eventSound({ sequence: 1, type: "PAYOUT_COMPLETE", total: 100 }, "runaway")).toBe("big-win");
  expect(eventSound({ sequence: 1, type: "RESOURCE_CHANGED", resource: "tips", delta: 1 })).toBeNull();
});
