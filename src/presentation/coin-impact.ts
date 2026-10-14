import { SAMPLE_RATE } from "./audio-synthesis";

/** Three original short metal contacts: rim tick, face clink and tray knock. */
export function renderCoinImpact(variant: number): Float32Array<ArrayBuffer> {
  const kind = Math.abs(Math.trunc(variant)) % 3;
  const fundamental = [2300, 1740, 1180][kind]!;
  const duration = [.13, .19, .23][kind]!;
  const result = new Float32Array(Math.ceil(duration * SAMPLE_RATE));
  let random = 371 + kind; let previous = 0;
  for (let i = 0; i < result.length; i++) {
    const t = i / SAMPLE_RATE;
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const noise = random / 0x80000000 - 1;
    const click = (noise - previous) * Math.exp(-t * 430) * .17; previous = noise;
    const attack = Math.min(1, t / .0008);
    const ring = Math.sin(t * Math.PI * 2 * fundamental) * .27 * Math.exp(-t * 38)
      + Math.sin(t * Math.PI * 2 * fundamental * 1.57) * .18 * Math.exp(-t * 53)
      + Math.sin(t * Math.PI * 2 * fundamental * 2.31) * .1 * Math.exp(-t * 70);
    const body = Math.sin(t * Math.PI * 2 * (kind === 2 ? 260 : 610)) * .2 * Math.exp(-t * 65);
    result[i] = Math.tanh((ring + body + click) * attack) * Math.min(1, (duration - t) / .012);
  }
  return result;
}
