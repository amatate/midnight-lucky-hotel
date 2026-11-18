// Mechanical asset packaging only: preserve generated pixels/alpha, shared portrait scale.
// NODE_PATH may point to a bundled sharp installation; no network or image-generation API.
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
async function main() {
  const [portraits, symbols] = process.argv.slice(2);
  if (!portraits || !symbols) throw Error("Usage: node scripts/prepare-stay-art.cjs MIO_ATLAS SYMBOL_ATLAS");
  const out = "public/art/concierge";
  await fs.mkdir(out, { recursive: true }); await fs.mkdir("public/art/reels", { recursive: true });
  const { data, info } = await sharp(portraits).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Generator spacing is not exactly equal: gutters are inspected in the master.
  const columns = [0, 440, 744, info.width];
  const bounds = [];
  for (let i = 0; i < 6; i++) {
    const left = columns[i % 3], right = columns[i % 3 + 1];
    const top = Math.floor(i / 3) * (info.height / 2), bottom = top + info.height / 2;
    let x0 = right, x1 = left, y0 = bottom, y1 = top;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (data[(y * info.width + x) * 4 + 3] > 32) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    bounds.push({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
  }
  const scale = Math.min(344 / Math.max(...bounds.map(b => b.width)), 708 / Math.max(...bounds.map(b => b.height)));
  const names = ["welcome", "smile", "thinking", "delighted", "concerned", "proud"];
  for (let i = 0; i < 6; i++) {
    const width = Math.round(bounds[i].width * scale), height = Math.round(bounds[i].height * scale);
    const sprite = await sharp(portraits).extract(bounds[i]).resize(width, height, { kernel: "nearest" }).png().toBuffer();
    await sharp({ create: { width: 360, height: 724, channels: 4, background: "#00000000" } })
      .composite([{ input: sprite, left: Math.floor((360 - width) / 2), top: 716 - height }]).webp({ lossless: true }).toFile(path.join(out, `mio-${names[i]}-v2.webp`));
  }
  const meta = await sharp(symbols).metadata();
  const ids = ["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"];
  for (let i = 0; i < 8; i++) {
    const left = Math.floor((i % 4) * meta.width / 4), top = Math.floor(Math.floor(i / 4) * meta.height / 2);
    const width = Math.floor((i % 4 + 1) * meta.width / 4) - left;
    const height = Math.floor((Math.floor(i / 4) + 1) * meta.height / 2) - top;
    await sharp(symbols).extract({ left, top, width, height }).resize(256, 256).webp({ quality: 90, alphaQuality: 100 }).toFile(`public/art/reels/${ids[i]}-v2.webp`);
  }
  console.log(JSON.stringify({ portraitBounds: bounds, sharedScale: scale, portraits: 6, symbols: 8 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
