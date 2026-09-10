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
const styles = [...new Set([...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+\.css)"/g)].map(match => match[1]))].map(src => {
  const content = readFileSync(resolve(root, src.slice(src.indexOf("/_next/") + 1)));
  if (content.toString().includes("font-family:KaTeX")) throw new Error("Homepage must not eagerly load the formula stylesheet.");
  return { src, bytes: content.length, gzipBytes: gzipSync(content).length };
});
const cssBytes = styles.reduce((sum, file) => sum + file.bytes, 0);
const budget = { bytes: 800_000, gzipBytes: 250_000, cssBytes: 150_000 };
if (!html.includes('class="home-welcome"') || html.includes("正在准备学习空间")) throw new Error("Initial HTML must render the homepage, not a hydration loading screen.");
console.log(JSON.stringify({ metric: "HTML initial assets (including legacy nomodule script); gzip estimate, not measured transfer or model latency", total, cssBytes, budget, scripts, styles }, null, 2));
if (total.bytes > budget.bytes || total.gzipBytes > budget.gzipBytes || cssBytes > budget.cssBytes) {
  console.error("Initial JavaScript budget exceeded: check eager imports before accepting.");
  process.exitCode = 1;
}
