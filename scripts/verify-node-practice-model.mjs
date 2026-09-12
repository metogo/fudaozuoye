import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { LiveProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/adapter.js");
const { getProviderConfig } = require("../functions/learning-api/dist/lib/learning/providers/config.js");
const { extractText } = require("../functions/learning-api/dist/lib/learning/providers/model-support.js");
const config = getProviderConfig("doubao");
if (config.mock || !config.apiKey) throw new Error("需要已配置的真实模型，不使用 mock 代替质量验收");
// Synthetic public study material only. Never call entry/statistics endpoints.
const cases = [
  { subject: "math", gradeBand: "primary", text: "甲乙合修360米公路，6天完成，甲每天比乙多修10米，求两队各自每天修多少米。", title: "工作总量、时间与效率", evidence: "6天完成" },
  { subject: "physics", gradeBand: "junior", text: "电阻两端电压为6伏，通过电流为0.3安，求电阻。", title: "欧姆定律", evidence: "电压为6伏" },
  { subject: "english", gradeBand: "junior", text: "Choose: She ___ to school every day. A. go B. goes C. going", title: "一般现在时第三人称单数", evidence: "every day" },
];
for (const [index, item] of cases.entries()) {
  const session = { problem: item };
  const concept = { id: "core", title: item.title, evidence: item.evidence, summary: "", application: "" };
  const previous = [];
  for (let attempt = 0; attempt < (index === 0 ? 2 : 1); attempt++) {
    const outputs = [], started = performance.now();
    const measuredFetch = async (...args) => {
      const response = await fetch(...args);
      if (response.ok) outputs.push(extractText(await response.clone().json(), config.protocol));
      return response;
    };
    const adapter = new LiveProviderAdapter(config, measuredFetch, "light", AbortSignal.timeout(45000));
    try {
      const practice = await adapter.generateNodePractice(session, concept, previous);
      console.log(JSON.stringify({ subject: item.subject, refresh: attempt > 0, elapsedMs: Math.round(performance.now() - started), practice }));
      previous.push(practice.question);
    } catch (error) {
      console.log(JSON.stringify({ subject: item.subject, refresh: attempt > 0, failed: error instanceof Error ? error.message : "failed", outputs }));
      process.exitCode = 1;
    } finally { adapter.cancelPendingRequests(); }
  }
}
