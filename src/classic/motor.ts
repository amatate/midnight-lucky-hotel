import { SAMPLE_RATE } from "@/presentation/audio-synthesis";
import { STOP_TIMES } from "./motion";

let cached: Float32Array<ArrayBuffer> | null = null;
/** Quiet rotating teeth underneath the individual brake/clutch impacts; no game RNG. */
export function renderClassicMotor(): Float32Array<ArrayBuffer> {
  if (cached) return cached;
  const data = new Float32Array(Math.ceil(STOP_TIMES[2] / 1_000 * SAMPLE_RATE));
  let noise = 717;
  for (let reel = 0; reel < 3; reel++) {
    const duration = STOP_TIMES[reel]! / 1_000;
    let phase = 0;
    for (let i = 0; i < Math.floor(duration * SAMPLE_RATE); i++) {
      const t = i / SAMPLE_RATE;
      const speed = Math.min(1, t / .16) * Math.min(1, (duration - t) / .7);
      phase += (11 + speed * 22 + reel * 2) / SAMPLE_RATE;
      const tooth = Math.exp(-(phase % 1) * 34);
      noise = (Math.imul(noise, 1664525) + 1013904223) | 0;
      const grit = (noise >>> 0) / 0x80000000 - 1;
      const envelope = Math.min(1, t / .04) * Math.min(1, (duration - t) / .08);
      const rattle = Math.sin(t * (1_700 + reel * 130) * Math.PI * 2) * .10 + grit * .15;
      data[i]! += envelope * speed * (tooth * rattle + Math.sin(t * 2 * Math.PI * (82 + reel * 7)) * .02);
    }
  }
  cached = data; return data;
}
