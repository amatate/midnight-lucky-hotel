/** Original procedural instruments. No samples, network, game RNG or game state. */
export const SAMPLE_RATE = 22_050;
export const SFX_IDS = ["ui", "lever", "spin", "stop", "reroll", "hold", "kick", "prayer", "meal", "part", "coin", "win", "big-win", "upgrade", "room-clear", "run-end"] as const;
export type SfxId = typeof SFX_IDS[number];
type Voice = "felt" | "bell" | "bass" | "metal" | "brush";
type Note = { at: number; hz: number; duration: number; gain: number; voice: Voice; endHz?: number };
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
function mix(data: Float32Array, note: Note, loop = false): void {
  const start = Math.round(note.at * SAMPLE_RATE);
  const count = Math.round(note.duration * SAMPLE_RATE);
  let phase = 0;
  let noise = 0x9137 + start;
  let smooth = 0;
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    phase += 2 * Math.PI * (note.hz + ((note.endHz ?? note.hz) - note.hz) * i / count) / SAMPLE_RATE;
    const envelope = Math.min(1, t / (note.voice === "felt" ? .012 : .003)) * Math.min(1, (note.duration - t) / .025)
      * Math.exp(-t * (note.voice === "bass" ? 3 : 5) / note.duration);
    let value: number;
    switch (note.voice) {
      case "felt": value = Math.sin(phase + .8 * Math.exp(-t * 9) * Math.sin(phase * 2)) * .75 + Math.sin(phase * 3) * .07 * Math.exp(-t * 12); break;
      case "bell": value = Math.sin(phase) * .62 + Math.sin(phase * 2.76) * .22 * Math.exp(-t * 5) + Math.sin(phase * 4.07) * .08 * Math.exp(-t * 16); break;
      case "bass": value = Math.sin(phase) * .8 + Math.sin(phase * 2) * .12; break;
      case "metal": value = Math.sin(phase) * .45 + Math.sin(phase * 1.47) * .26 + Math.sin(phase * 3.31) * .15; break;
      case "brush": {
        noise ^= noise << 13; noise ^= noise >>> 17; noise ^= noise << 5;
        const white = (noise >>> 0) / 0x80000000 - 1;
        smooth += .16 * (white - smooth);
        value = white * .3 + smooth * .7;
        break;
      }
    }
    const index = start + i;
    if (loop || index < data.length) data[index % data.length]! += value * envelope * note.gain;
  }
}
export function renderSfx(id: SfxId): Float32Array<ArrayBuffer> {
  const notes: Note[] = [];
  const n = (at: number, frequency: number, duration: number, gain: number, voice: Voice = "bell", endHz?: number) =>
    notes.push({ at, hz: frequency, duration, gain, voice, ...(endHz === undefined ? {} : { endHz }) });
  const chime = (pitches: number[], step = .07, gain = .24) => pitches.forEach((midi, i) => n(i * step, hz(midi), .55, gain));
  switch (id) {
    case "ui": n(0, 760, .045, .19, "felt"); n(0, 100, .018, .12, "brush"); break;
    case "lever": n(0, 180, .09, .35, "metal", 100); n(.02, 65, .1, .3, "bass"); n(0, 100, .027, .3, "brush"); break;
    case "spin": n(0, 90, .4, .2, "bass", 170); n(0, 100, .35, .2, "brush"); for (let i = 0; i < 9; i++) n(i * .055, 300 + i * 17, .035, .11, "metal"); break;
    case "stop": n(0, 240, .085, .34, "metal", 145); n(.012, 85, .12, .3, "bass"); n(0, 100, .018, .3, "brush"); break;
    case "reroll": n(0, 200, .25, .28, "felt", 660); for (let i = 0; i < 5; i++) n(i * .047, 410, .04, .13, "metal"); break;
    case "hold": n(0, 145, .1, .3, "metal"); n(.07, 520, .16, .2, "felt"); break;
    case "kick": n(0, 95, .26, .55, "bass", 42); n(0, 100, .15, .5, "brush"); n(.04, 150, .23, .24, "metal", 95); break;
    case "prayer": chime([72, 79, 83, 86], .12, .18); n(.1, hz(60), .9, .13, "felt"); break;
    case "meal": n(0, 1450, .3, .2, "bell"); n(.06, 800, .35, .16, "bell"); n(.01, 100, .14, .14, "brush"); break;
    case "part": n(0, 330, .05, .2, "metal"); chime([67, 74], .06, .16); break;
    case "coin": [0, .04, .105].forEach((at, i) => n(at, 1350 + i * 137, .18, .18, "metal")); break;
    case "win": chime([67, 71, 74], .065, .24); n(.13, hz(55), .38, .2, "felt"); break;
    case "big-win": chime([67, 71, 74, 79, 83, 86], .085, .22); n(.28, hz(43), .65, .35, "bass"); n(.37, hz(62), .7, .18, "felt"); break;
    case "upgrade": n(0, 160, .12, .3, "metal"); chime([62, 69, 74], .1, .21); break;
    case "room-clear": chime([67, 71, 74, 78, 79], .13, .22); n(.4, hz(43), .8, .3, "bass"); break;
    case "run-end": [62, 59, 55].forEach((midi, i) => n(i * .16, hz(midi), .65, .23, "felt")); break;
  }
  const duration = Math.max(...notes.map((note) => note.at + note.duration)) + .03;
  const data = new Float32Array(Math.ceil(duration * SAMPLE_RATE));
  notes.forEach((note) => mix(data, note));
  for (let i = 0; i < data.length; i++) data[i] = Math.tanh(data[i]! * 1.2) * .72;
  return data;
}
export const MUSIC_SECONDS = 48; // 16 bars, 80 BPM, 4/4. Exact loop including wrapped tails.
export function renderMusic(): Float32Array<ArrayBuffer> {
  const data = new Float32Array(SAMPLE_RATE * MUSIC_SECONDS);
  const beat = .75;
  // Gmaj9 → Em9 → Am9 → D13. Original sparse melody, not an existing recording.
  const chords = [[55, 59, 62, 66, 69], [52, 55, 59, 62, 66], [57, 60, 64, 67, 71], [50, 57, 60, 64, 71]];
  const roots = [43, 40, 45, 38];
  const melodies = [[74, 71, 69], [71, 67, 66], [72, 71, 67], [69, 66, 62]];
  const add = (at: number, midi: number, duration: number, gain: number, voice: Voice) => mix(data, { at, hz: hz(midi), duration, gain, voice }, true);
  for (let bar = 0; bar < 16; bar++) {
    const chord = chords[bar % 4]!;
    const root = roots[bar % 4]!;
    const at = bar * 4 * beat;
    chord.forEach((midi, i) => { add(at + i * .018, midi, 2.5, .085, "felt"); add(at + 2.65 * beat + i * .012, midi, 1.05, .035, "felt"); });
    [root, root + 7, root + 12, root + (bar % 4 === 3 ? 8 : 7)].forEach((midi, i) => add(at + i * beat, midi, .65, .17, "bass"));
    for (let b = 0; b < 4; b++) {
      add(at + b * beat, 40, .11, .085, "brush"); add(at + (b + .66) * beat, 40, .055, .04, "brush");
      if (b % 2 === 1) add(at + b * beat, 40, .18, .08, "brush");
    }
    if (bar % 2 === 0 || bar >= 12) melodies[bar % 4]!.forEach((midi, i) => add(at + (.5 + i * .82) * beat, midi + (bar >= 8 ? -12 : 0), 1.2, .08, "bell"));
  }
  const dry = data.slice();
  for (let i = 0; i < data.length; i++) {
    const value = dry[i]! + dry[(i + data.length - 1808) % data.length]! * .17 + dry[(i + data.length - 4079) % data.length]! * .1;
    data[i] = Math.tanh(value * 1.6) * .68;
  }
  return data;
}
