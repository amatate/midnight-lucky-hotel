import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("unlocks on gesture, routes independent buses, limits voices and pauses in the background", async () => {
  vi.resetModules(); localStorage.clear();
  const gains: { gain: { setTargetAtTime: ReturnType<typeof vi.fn>; cancelScheduledValues: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn> }[] = [];
  const sources: { loop: boolean; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; playbackRate: { value: number }; onended?: () => void }[] = [];
  let clock = 1;
  let resumes = 0, suspends = 0;
  class FakeContext {
    state = "suspended";
    get currentTime() { return clock; }
    destination = {};
    resume() { resumes++; this.state = "running"; return Promise.resolve(); }
    suspend() { suspends++; this.state = "suspended"; return Promise.resolve(); }
    createGain() {
      const gain = { gain: { setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn() }; gains.push(gain); return gain;
    }
    createDynamicsCompressor() { return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, connect: vi.fn() }; }
    createBuffer() { return { copyToChannel: vi.fn() }; }
    decodeAudioData() { return Promise.resolve({ duration: 48 }); }
    createBufferSource() {
      const source = { loop: false, start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), playbackRate: { value: 1 } }; sources.push(source); return source;
    }
  }
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const audio = await import("@/presentation/audio");
  const prefs = await import("@/presentation/audio-settings");
  const cleanup = audio.installAudio();
  expect(gains).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  document.dispatchEvent(new Event("pointerdown"));
  await vi.waitFor(() => expect(sources.filter((source) => source.loop)).toHaveLength(1));
  expect(resumes).toBe(1);
  expect(audio.playSfx("kick")).toBe(true);
  expect(sources.at(-1)!.connect).toHaveBeenCalledWith(gains[0]);
  const effectTarget = gains[0]!.gain.setTargetAtTime.mock.lastCall![0];
  prefs.setAudioSettings({ music: .5 });
  expect(gains[0]!.gain.setTargetAtTime.mock.lastCall![0]).toBe(effectTarget);
  expect(gains[1]!.gain.setTargetAtTime.mock.lastCall![0]).toBe(.375);
  prefs.setAudioSettings({ sfx: 0 }); expect(audio.playSfx("win")).toBe(false);
  expect(sources.filter((source) => source.loop)).toHaveLength(1);
  prefs.setAudioSettings({ sfx: .7, muted: true });
  expect(sources[0]!.stop).toHaveBeenCalled(); expect(audio.playSfx("win")).toBe(false);
  prefs.setAudioSettings({ muted: false });
  expect(sources.filter((source) => source.loop)).toHaveLength(2);
  clock += 2;
  expect(audio.playSfx("coin")).toBe(true); expect(audio.playSfx("coin")).toBe(false);
  for (let i = 0; i < 12; i++) { clock += 1; audio.playSfx("coin"); }
  expect(sources.filter((source) => !source.loop)).toHaveLength(8);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(suspends).toBe(1); expect(audio.playSfx("kick")).toBe(false);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve();
  expect(resumes).toBe(2);
  cleanup(); const count = resumes; document.dispatchEvent(new Event("pointerdown")); expect(resumes).toBe(count);
});
