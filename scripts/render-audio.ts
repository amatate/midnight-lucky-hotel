// Reproducible original audio assets. Node 24: node scripts/render-audio.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { renderMusic, renderSfx, SAMPLE_RATE, SFX_IDS } from "../src/presentation/audio-synthesis.ts";
function wav(data: Float32Array): Buffer {
  const result = Buffer.alloc(44 + data.length * 2);
  result.write("RIFF", 0); result.writeUInt32LE(result.length - 8, 4); result.write("WAVEfmt ", 8);
  result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22);
  result.writeUInt32LE(SAMPLE_RATE, 24); result.writeUInt32LE(SAMPLE_RATE * 2, 28);
  result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34); result.write("data", 36);
  result.writeUInt32LE(data.length * 2, 40);
  data.forEach((value, i) => result.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2));
  return result;
}
const root = new URL("../public/audio/", import.meta.url);
mkdirSync(root, { recursive: true });
writeFileSync(new URL("after-hours-v1.wav", root), wav(renderMusic()));
for (const id of SFX_IDS) writeFileSync(new URL(`${id}.wav`, root), wav(renderSfx(id)));
console.log("Rendered 16 original effects and After Hours, a seamless 48-second loop.");
