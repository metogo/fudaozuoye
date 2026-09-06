import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { analyzeMock, recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const { getProviderConfig } = require("../functions/learning-api/dist/lib/learning/providers/config.js");
const { sealSession } = require("../functions/learning-api/dist/lib/learning/server-state.js");
const config = getProviderConfig("doubao", "light");
if (config.mock) throw new Error("此验证需要真实模型配置");
const sample = JSON.parse(await readFile("outputs/emphasis/quality-samples.json", "utf8"))[0];
const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
session.problem.text = sample.problem;
session.mode = "live"; session.modelId = config.modelId;
const origin = process.env.PUBLIC_APP_ORIGIN || "http://localhost:3000";
const consent = await fetch("http://localhost:9000/api/consent", { method: "POST", headers: { origin } });
const cookie = consent.headers.get("set-cookie")?.split(";")[0] || "";
const response = await fetch("http://localhost:9000/api/learning/emphasis", {
  method: "POST", headers: { origin, cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ stateToken: sealSession(session), source: sample.source, context: sample.context }),
  signal: AbortSignal.timeout(25000),
});
if (!response.ok) throw new Error(`独立接口验证失败：HTTP ${response.status}`);
const result = await response.json();
console.log(JSON.stringify({ status: response.status, marks: result.marks }));
