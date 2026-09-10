// Local real-model probe. Same response measures root preview vs the old
// full-plan barrier, avoiding an unfair comparison between two model runs.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { readMapStream, applyMapEvent, finishMapDraft } = require("../functions/learning-api/dist/lib/learning/knowledge-map-stream.js");
const { mapEvidence, parseKnowledgeMap } = require("../functions/learning-api/dist/lib/learning/knowledge-map.js");
const base = process.env.ROOT_PROBE_API_BASE ?? "http://localhost:9000/api";
const origin = process.env.ROOT_PROBE_ORIGIN ?? "http://localhost:3000";
const problems = [
  { subject: "math", gradeBand: "primary", text: "一个长方形长8厘米，宽3厘米。求它的周长。" },
  { subject: "physics", gradeBand: "junior", text: "一个电阻两端电压为6V，通过的电流为0.3A。求电阻；电压变为9V且电阻不变时，电流是多少？" },
  { subject: "chemistry", gradeBand: "senior", text: "25摄氏度时，将0.1mol/L盐酸与0.1mol/L氢氧化钠溶液等体积混合，写出离子方程式并判断酸碱性。" },
];
let phase = "consent", subject;
try {
  for (const problem of problems) {
    subject = problem.subject; phase = "consent";
    const consent = await fetch(`${base}/consent`, { method: "POST", headers: { Origin: origin }, signal: AbortSignal.timeout(15000) });
    assert.equal(consent.status, 200);
    const cookie = consent.headers.get("set-cookie")?.split(";")[0]; assert.ok(cookie);
    const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { Origin: origin, Cookie: cookie, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(180000) });
    const form = new FormData();
    form.set("stage", "full"); form.set("provider", "doubao"); form.set("reasoningLevel", "light");
    form.set("problem", JSON.stringify({ ...problem, childWork: "", confidence: 1, userRevised: true }));
    let state; phase = "session";
    await readMapStream(await post("/learning/analyze", form), (name, data) => { if (name === "graph") state = data; });
    assert.equal(state?.session.mode, "live", "LIVE_SESSION_REQUIRED"); assert.ok(state.stateToken, "STATE_REQUIRED");
    const evidence = mapEvidence(state.session), started = performance.now();
    let draft = { plan: null, map: null }, rootMs = null, planMs = null, finalMap;
    phase = "map";
    await readMapStream(await post("/learning/knowledge-map", { stateToken: state.stateToken, stream: true, earlyRoot: true }), (name, data) => {
      if (name === "map.start") return;
      if (name === "map.root") {
        if (data.node === null) { rootMs = null; return; }
        parseKnowledgeMap({ version: 1, overviewOnly: true, rootId: data.node.id, nodes: [data.node], edges: [] }, evidence, true);
        rootMs = Math.round(performance.now() - started); return;
      }
      if (name === "complete") { finalMap = finishMapDraft(draft, evidence); assert.equal(data.total, finalMap.nodes.length); return; }
      assert.ok(name === "map.plan" || name === "map.node");
      draft = applyMapEvent(draft, data, evidence);
      if (name === "map.plan") planMs = Math.round(performance.now() - started);
    });
    assert.ok(finalMap?.edges.length > 0, "MAP_REQUIRED");
    console.log(JSON.stringify({ subject: problem.subject, rootMs, previousBarrierMs: planMs, savedMs: rootMs === null || planMs === null ? null : planMs - rootMs, totalMs: Math.round(performance.now() - started), nodes: finalMap.nodes.length, edges: finalMap.edges.length, validated: true }));
    assert.ok(rootMs !== null && planMs !== null, "ROOT_PREVIEW_MISSING");
  }
} catch (error) {
  // Never print session state, cookies, tokens or raw provider errors.
  console.error(JSON.stringify({ passed: false, subject, phase, code: /^[A-Z_]+$/.test(error.message) ? error.message : "ROOT_PROBE_FAILED", kind: error.name })); process.exitCode = 1;
}
