// Three synthetic real-model journeys; no statistics, production writes or user photos.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { readSseResponse } = require("../functions/learning-api/dist/lib/learning/client-sse.js");
const { readMapStream, applyMapEvent, finishMapDraft } = require("../functions/learning-api/dist/lib/learning/knowledge-map-stream.js");
const { mapEvidence, parseKnowledgeDetail } = require("../functions/learning-api/dist/lib/learning/knowledge-map.js");
const { assertBalancedLearningMarkup } = require("../functions/learning-api/dist/lib/learning/presentation.js");
const origin = "http://localhost:3000", base = "http://localhost:9000/api";
const cases = [
  ["math-primary", "甲乙合修360米公路，6天完成，甲每天比乙多修10米，求甲乙两队各每天修多少米。"],
  ["physics-junior", "定值电阻两端电压为6伏，通过它的电流为0.3安，求电阻的阻值。"],
  ["english-junior", "选择正确选项：She ___ to school every day. A. go B. goes C. going，并说明理由。"],
];
const results = [];
const selected = process.argv[2];
assert.ok(!selected || cases.some(([id]) => id === selected), "Unknown synthetic case");
for (const [id, text] of cases.filter(([id]) => !selected || id === selected)) {
  const times = {}, started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]);
  try {
    const consent = await fetch(`${base}/consent`, { method: "POST", headers: { Origin: origin }, signal });
    assert.ok(consent.ok);
    const cookie = consent.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    const headers = { Origin: origin, Cookie: cookie };
    const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    async function analyze(stage, values) {
      const form = new FormData();
      for (const [key, value] of Object.entries({ stage, provider: "doubao", reasoningLevel: "light", ...values })) form.set(key, value);
      let result;
      await readSseResponse(await fetch(`${base}/learning/analyze`, { method: "POST", headers, body: form, signal }), (event, data) => { if (event === "recognized" || event === "graph") result = data; });
      assert.ok(result);
      return result;
    }
    const problem = await analyze("recognize_text", { text });
    times.recognizedMs = elapsed();
    let state = await analyze("full", { problem: JSON.stringify(problem) });
    assert.equal(state.session.mode, "live");
    let first = "";
    await readSseResponse(await post("/learning/turn", { stateToken: state.stateToken, input: { type: "start" } }), (event, data) => {
      if (event === "message.delta") { first += data.text; if (first.replace(/^\s*#[^\n]*\n/, "").trim().length > 30) times.firstBodyMs ??= elapsed(); }
      if (event === "flow.update") state = data;
    });
    times.firstCompleteMs = elapsed();
    assert.ok(first.length > 50);
    assertBalancedLearningMarkup(first, "首轮讲解");
    const mapStart = elapsed();
    let draft = { map: null, plan: null };
    await readMapStream(await post("/learning/knowledge-map", { stateToken: state.stateToken, stream: true, earlyRoot: true }), (event, data) => {
      if (event === "map.root" && data.node) times.rootMs ??= elapsed() - mapStart;
      if (event === "map.plan" || event === "map.node") draft = applyMapEvent(draft, data, mapEvidence(state.session));
    });
    const map = finishMapDraft(draft, mapEvidence(state.session));
    times.mapMs = elapsed() - mapStart;
    const detailStart = elapsed();
    let detail;
    await readMapStream(await post("/learning/knowledge-map", { stateToken: state.stateToken, map, nodeId: map.rootId, stream: true }), (event, data) => {
      if (event === "detail.summary") times.detailSummaryMs = elapsed() - detailStart;
      if (event === "complete") detail = parseKnowledgeDetail(data.detail);
    });
    assert.ok(detail);
    times.detailMs = elapsed() - detailStart;
    let solution = "";
    await readSseResponse(await post("/learning/turn", { stateToken: state.stateToken, input: { type: "choose", gateId: state.session.flow.activeGate.id, choice: "full_solution" } }), (event, data) => {
      if (event === "message.delta") solution += data.text;
    });
    assert.ok(solution.includes("结论"));
    assertBalancedLearningMarkup(solution, "完整讲解");
    const conclusion = solution.split(/###\s*结论/)[1]?.split(/###/)[0];
    assert.ok(conclusion, "Must inspect the actual conclusion, not just the presence of a heading");
    const expected = {
      "math-primary": [/甲[^。\n]{0,60}35/, /乙[^。\n]{0,60}25/],
      "physics-junior": [/20/],
      "english-junior": [/\bB\b/],
    };
    for (const answer of expected[id]) assert.match(conclusion, answer, "Synthetic answer mismatch; explanation still needs manual review");
    if (id === "english-junior") assert.match(solution, /\bgoes\b/, "Must explain the selected verb form, not only its letter");
    results.push({ id, passed: true, contentReview: "manual-required", times, first, nodes: map.nodes.map(n => n.title), detail, solution });
    console.log(JSON.stringify({ id, passed: true, contentReview: "manual-required", times, nodes: map.nodes.length }));
  } catch (error) {
    results.push({ id, passed: false, times, error: error.message });
    console.log(JSON.stringify(results.at(-1))); process.exitCode = 1;
  } finally { controller.abort(); }
}
await mkdir("outputs/model-journey-qa", { recursive: true });
await writeFile(`outputs/model-journey-qa/${selected ?? "results"}.json`, JSON.stringify(results, null, 2));
