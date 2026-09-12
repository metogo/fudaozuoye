// Synthetic local HTTP smoke test, including recognition; never calls statistics.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { readSseResponse } = require("../functions/learning-api/dist/lib/learning/client-sse.js");
const results = [], base = "http://localhost:9000/api", origin = "http://localhost:3000";
for (const [id, path] of [["l-shape", "outputs/visual-first-response/l-shape.png"], ["text-photo", "tests/fixtures/synthetic-homework.png"]]) {
  if (process.argv[2] && process.argv[2] !== id) continue;
  const signal = AbortSignal.timeout(120000);
  const consent = await fetch(`${base}/consent`, { method: "POST", headers: { Origin: origin }, signal });
  assert.ok(consent.ok);
  const cookie = consent.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const headers = { Origin: origin, Cookie: cookie };
  const bytes = await readFile(path), started = performance.now(), phases = [];
  const elapsed = () => Math.round(performance.now() - started);
  let problem, state, firstMs, text = "", completeMessage = false;
  async function analyze(stage, extra, accept) {
    const form = new FormData();
    form.set("stage", stage); form.set("provider", "doubao"); form.set("reasoningLevel", "light");
    for (const [key, value] of extra) form.set(key, value);
    await readSseResponse(await fetch(`${base}/learning/analyze`, { method: "POST", headers, body: form, signal }), accept);
  }
  try {
    await analyze("recognize", [["image", new File([bytes], "synthetic.png", { type: "image/png" })]], (event, data) => { if (event === "recognized") problem = data; });
    assert.ok(problem);
    const recognizedMs = elapsed();
    await analyze("full", [["problem", JSON.stringify(problem)]], (event, data) => { if (event === "graph") state = data; });
    assert.equal(state.session.mode, "live");
    const form = new FormData();
    form.set("stateToken", state.stateToken); form.set("input", JSON.stringify({ type: "start" }));
    if (problem.visualContext?.related) form.set("image", new File([bytes], "synthetic.png", { type: "image/png" }));
    const visual = problem.visualContext?.related;
    await readSseResponse(await fetch(`${base}/learning/turn`, { method: "POST", headers: visual ? headers : { ...headers, "Content-Type": "application/json" }, body: visual ? form : JSON.stringify({ stateToken: state.stateToken, input: { type: "start" } }), signal }), (event, data) => {
      if (event === "perf.phase") phases.push(data);
      if (event === "message.delta") { text += data.text; if (text.replace(/^### [^\n]*\n\n/, "").length > 30) firstMs ??= elapsed(); }
      if (event === "message.complete") completeMessage = true;
      if (event === "flow.update") { assert.ok(completeMessage); state = data; }
    });
    assert.ok(firstMs); assert.ok(state.session.flow.activeGate);
    results.push({ id, recognizedMs, firstMs, totalMs: elapsed(), phases, relatedImage: problem.visualContext?.related, text, problem, stage: state.session.flow.stage });
    console.log(JSON.stringify({ id, recognizedMs, firstMs, totalMs: elapsed(), phases, relatedImage: problem.visualContext?.related }));
  } catch (error) { results.push({ id, error: error.message, phases }); console.log(JSON.stringify(results.at(-1))); process.exitCode = 1; }
}
await mkdir("outputs/visual-first-response", { recursive: true });
assert.ok(results.length, "Unknown case");
await writeFile(`outputs/visual-first-response/http-${process.argv[2] ?? "all"}.json`, JSON.stringify(results, null, 2));
