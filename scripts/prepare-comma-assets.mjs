// Extract generated brand poses from a chroma backdrop; never redraw the mark.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const source = process.argv[2];
if (!source) throw new Error("Pass the generated three-pose source PNG.");
const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let pixel = 0; pixel < info.width * info.height; pixel++) {
  const r = data[pixel * 3], g = data[pixel * 3 + 1], b = data[pixel * 3 + 2];
  const excess = Math.max(0, g - Math.max(r, b));
  const keyedAlpha = Math.max(0, Math.min(1, (1 - excess / 235 - .035) / .965));
  // Chroma compression leaves a faint low-alpha rectangle unless fully keyed.
  const alpha = keyedAlpha < .12 ? 0 : keyedAlpha;
  const target = pixel * 4;
  rgba[target] = alpha ? Math.min(255, r / alpha) : 0;
  rgba[target + 1] = alpha ? Math.max(0, Math.min(255, (g - 245 * (1 - alpha)) / alpha)) : 0;
  rgba[target + 2] = alpha ? Math.min(255, b / alpha) : 0;
  rgba[target + 3] = Math.round(alpha * 255);
}
const poses = [];
for (let frame = 0; frame < 3; frame++) {
  const start = Math.floor(frame * info.width / 3), end = Math.floor((frame + 1) * info.width / 3);
  let left = end, right = start, top = info.height, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = start; x < end; x++) {
    if (rgba[(y * info.width + x) * 4 + 3] > 60) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right <= left || bottom <= top) throw new Error("No opaque character in frame");
  poses.push({ left: left - 2, top: top - 2, width: right - left + 5, height: bottom - top + 5 });
}
const size = Math.ceil(Math.max(...poses.map(p => Math.max(p.width, p.height))) * 1.10);
await mkdir("public/brand", { recursive: true });
for (const [index, name] of ["idle", "thinking", "ready"].entries()) {
  const pose = poses[index];
  const cropped = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).extract(pose).png().toBuffer();
  const canvas = await sharp({ create: { width: size, height: size, channels: 4, background: "#00000000" } })
    .composite([{ input: cropped, left: Math.floor((size - pose.width) / 2), top: Math.floor((size - pose.height) / 2) }])
    .png().toBuffer();
  // Sharp resizes before compositing in a single pipeline. Materialize the
  // full-size composition first so the pose is never larger than its canvas.
  await sharp(canvas).resize(192, 192).webp({ lossless: true }).toFile(`public/brand/comma-${name}.webp`);
}
console.log({ source, output: "public/brand/comma-{idle,thinking,ready}.webp", size: 192, poses });
