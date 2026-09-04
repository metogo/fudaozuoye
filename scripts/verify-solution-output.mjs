import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { LiveProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/adapter.js");
const { getProviderConfig } = require("../functions/learning-api/dist/lib/learning/providers/config.js");

const config = getProviderConfig("doubao");
if (!config.apiKey || !config.modelId) throw new Error("需要本地已配置的豆包服务");
const problem = {
  text: "设多项式 P(x)=x³-3x+1。（1）证明 P(x)=0 有三个互不相同的实数根，分别记为 a、b、c。（2）对非负整数 n，定义 S_n=a^n+b^n+c^n，推导其递推关系。（3）计算 (S_11-S_8)/S_5。",
  childWork: "", subject: "math", gradeBand: "senior", confidence: 1, userRevised: true,
};
const requests = [];
const observedFetch = async (input, init) => {
  const body = JSON.parse(init.body);
  requests.push({ explicitOutputLimit: Object.hasOwn(body, "max_tokens") || Object.hasOwn(body, "max_output_tokens") });
  return fetch(input, init);
};
let output = "";
let resets = 0;
const started = Date.now();
await new LiveProviderAdapter(config, observedFetch).streamSolution(problem,
  (text) => { output += text; }, () => { resets += 1; output = ""; }, AbortSignal.timeout(240_000));
if (requests.some((request) => request.explicitOutputLimit)) throw new Error("完整讲解仍携带本地输出额度");
if (!output.includes("### 易错提醒")) throw new Error("完整讲解缺少末尾结构");
console.log(JSON.stringify({ passed: true, requests: requests.length, explicitOutputLimit: false, resets, characters: output.length, elapsedMs: Date.now() - started }));
