import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { waitForKnowledgeMapBackend } from "./knowledge-map-release-gate.mjs";
const require = createRequire(import.meta.url);
const { readMapStream, applyMapEvent, finishMapDraft } = require("../functions/learning-api/dist/lib/learning/knowledge-map-stream.js");
const { mapEvidence } = require("../functions/learning-api/dist/lib/learning/knowledge-map.js");
const config = JSON.parse(await readFile(new URL("../cloudbaserc.json", import.meta.url), "utf8"));
export const apiBase = process.env.RELEASE_API_BASE ?? config.app.envVariables.NEXT_PUBLIC_API_BASE_URL;
export const appOrigin = process.env.RELEASE_APP_ORIGIN ?? config.functions[0].envVariables.PUBLIC_APP_ORIGIN;
const problems = [
  { subject: "math", gradeBand: "primary", text: "一块正方形草地的左右两侧铺了石子路，整体为长方形。左侧石子路宽与正方形边长合计15米，正方形边长与右侧石子路宽合计12米。求整块长方形地的周长。" },
  { subject: "physics", gradeBand: "junior", text: "一个电阻两端电压为6V，通过的电流为0.3A。求它的电阻；若电压变为9V且电阻不变，电流是多少？" },
  { subject: "chemistry", gradeBand: "senior", text: "25摄氏度时，把0.1 mol/L的盐酸和0.1 mol/L的氢氧化钠溶液等体积混合。写出反应的离子方程式，并判断混合后溶液的酸碱性。" },
];

export async function readEvents(response) {
  const events = [];
  await readMapStream(response, (name, data) => events.push({ name, data }));
  return events;
}

export async function post(path, cookie, body) {
  const form = body instanceof FormData;
  return fetch(`${apiBase}${path}`, { method: "POST", headers: { Origin: appOrigin, Cookie: cookie,
    ...(form ? {} : { "Content-Type": "application/json" }) }, body: form ? body : JSON.stringify(body), signal: AbortSignal.timeout(180000) });
}

/** No mock responses, local signing keys or cached maps can satisfy this gate. */
export async function verifyKnowledgeMaps() {
  await waitForKnowledgeMapBackend(apiBase);
  const cases = [];
  for (const problem of problems) {
    const consent = await fetch(`${apiBase}/consent`, { method: "POST", headers: { Origin: appOrigin }, signal: AbortSignal.timeout(15000) });
    assert.equal(consent.status, 200);
    const cookie = consent.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "线上同意接口没有返回凭证");
    const form = new FormData();
    form.set("stage", "full"); form.set("provider", "doubao"); form.set("reasoningLevel", "light");
    form.set("problem", JSON.stringify({ ...problem, childWork: "", confidence: 1, userRevised: true }));
    const events = await readEvents(await post("/learning/analyze", cookie, form));
    const state = events.find(e => e.name === "graph")?.data;
    assert.ok(state?.stateToken && state.session, "线上题目未建立真实会话");
    assert.equal(state.session.mode, "live", "演示模式不能通过发布验收");
    let draft = { plan: null, map: null }, map, firstNodeMs;
    const started = Date.now(), evidence = mapEvidence(state.session);
    await readMapStream(await post("/learning/knowledge-map", cookie, { stateToken: state.stateToken, stream: true }), (name, data) => {
      if (name === "map.start") return;
      if (name === "complete") {
        map = finishMapDraft(draft, evidence);
        assert.equal(data.total, map.nodes.length);
        return;
      }
      assert.ok(["map.plan", "map.node"].includes(name));
      assert.equal(name, `map.${data.type}`);
      draft = applyMapEvent(draft, data, evidence);
      if (data.type === "node" && firstNodeMs === undefined) firstNodeMs = Date.now() - started;
    });
    assert.ok(map && map.edges.length > 0, "图谱必须完整且包含连线");
    const detail = await post("/learning/knowledge-map", cookie, { stateToken: state.stateToken, map, nodeId: map.rootId });
    assert.equal(detail.status, 200);
    const content = (await detail.json()).detail;
    assert.ok(content?.summary?.trim() && content.application?.trim(), "节点详情不可用");
    console.log(JSON.stringify({ check: "online-knowledge-map", subject: problem.subject, passed: true,
      nodes: map.nodes.length, edges: map.edges.length, firstNodeMs, elapsedMs: Date.now() - started }));
    // Credentials are kept in memory only for the browser acceptance step.
    cases.push({ state, cookie });
  }
  return cases;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await verifyKnowledgeMaps(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
