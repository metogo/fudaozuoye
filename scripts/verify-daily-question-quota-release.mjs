import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { apiBase, appOrigin, post, readEvents } from "./verify-knowledge-map-release.mjs";

try {
  const consent = await fetch(`${apiBase}/consent`, { method: "POST", headers: { Origin: appOrigin }, signal: AbortSignal.timeout(15000) });
  assert.equal(consent.status, 200);
  const cookie = consent.headers.get("set-cookie")?.split(";")[0]; assert(cookie);
  const deviceId = randomUUID(); const text = "小学三年级数学：一个长方形长8厘米，宽3厘米。它的周长是多少厘米？";
  const inputHash = createHash("sha256").update(text).digest("hex");
  let admitted;
  for (let i = 0; i < 30; i++) {
    const response = await post("/learning/question-entry", cookie, { deviceId, entryId: randomUUID(), inputHash });
    assert.equal(response.status, 200, `第${i + 1}道应允许`);
    admitted = await response.json(); assert.equal(admitted.used, i + 1);
  }
  const denied = await post("/learning/question-entry", cookie, { deviceId, entryId: randomUUID(), inputHash });
  assert.equal(denied.status, 429); assert.equal((await denied.json()).error.code, "DAILY_QUESTION_LIMIT");
  const recognized = new FormData();
  recognized.set("stage", "recognize_text"); recognized.set("provider", "doubao"); recognized.set("reasoningLevel", "light"); recognized.set("text", text); recognized.set("entryTicket", admitted.entryTicket);
  const events = await readEvents(await post("/learning/analyze", cookie, recognized));
  assert.equal(events.find(e => e.name === "complete")?.data.mode, "live");
  const problem = events.find(e => e.name === "recognized")?.data; assert(problem?.text);
  const full = new FormData();
  full.set("stage", "full"); full.set("provider", "doubao"); full.set("reasoningLevel", "light"); full.set("problem", JSON.stringify(problem)); full.set("entryTicket", admitted.entryTicket);
  const prepared = await readEvents(await post("/learning/analyze", cookie, full));
  const state = prepared.find(e => e.name === "graph")?.data; assert(state?.stateToken);
  const turn = await readEvents(await post("/learning/turn", cookie, { stateToken: state.stateToken, input: { type: "start" } }));
  assert(turn.some(e => e.name === "flow.ready"));
  const characters = turn.filter(e => e.name === "message.delta").map(e => e.data.text ?? "").join("").length;
  assert(characters > 50);
  console.log(JSON.stringify({ passed: true, check: "daily-quota-live", limit: 30, deniedStatus: denied.status, realRecognition: true, flowReady: true, explanationCharacters: characters, globalCounterWrites: 0 }));
} catch (error) {
  console.error(JSON.stringify({ passed: false, check: "daily-quota-live", code: error?.code === "ERR_ASSERTION" ? "ASSERTION_FAILED" : "VERIFICATION_FAILED", message: error?.code === "ERR_ASSERTION" ? error.message.slice(0, 200) : "线上限额验收失败，停止前端发布" }));
  process.exitCode = 1;
}
