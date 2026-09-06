import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

// Run after `npm run build`. Measure shipped production artifacts, not Next dev.
const root = resolve("out");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const sources = [...new Set([...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)].map((match) => match[1]))];
if (!sources.length) throw new Error("No initial scripts found; build the static export first.");
const scripts = sources.map((src) => {
  const relative = src.slice(src.indexOf("/_next/") + 1);
  if (!relative.startsWith("_next/")) throw new Error(`Unexpected script: ${src}`);
  const bytes = readFileSync(resolve(root, relative));
  return { src, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
});
const total = scripts.reduce((sum, file) => ({ bytes: sum.bytes + file.bytes, gzipBytes: sum.gzipBytes + file.gzipBytes }), { bytes: 0, gzipBytes: 0 });
const budget = { bytes: 850_000, gzipBytes: 260_000 };
console.log(JSON.stringify({ metric: "HTML initial JavaScript; gzip estimate, not measured transfer or model latency", total, budget, scripts }, null, 2));
if (total.bytes > budget.bytes || total.gzipBytes > budget.gzipBytes) {
  console.error("Initial JavaScript budget exceeded: check eager imports before accepting.");
  process.exitCode = 1;
}
