// Diagnostic harness: real configured model, no credentials or session tokens are persisted.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { getProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/index.js");
const { analyzeMock, recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const output = process.env.ILLUSTRATION_OUTPUT_DIR || "outputs/general-teaching-probe";
await mkdir(output, { recursive: true });
const originalFetch = globalThis.fetch;
let responses = 0;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const payload = await response.clone().json();
  // Model output only, never request headers, configuration or encrypted sessions.
  await writeFile(`${output}/response-${++responses}.json`, JSON.stringify({ choices: payload.choices, output: payload.output, error: payload.error }, null, 2));
  return response;
};
const adapter = getProviderAdapter("doubao", "light");
if (adapter.mode !== "live") throw Error("Probe requires a live configured model");
const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
session.problem = { ...session.problem, text: "已知关于x的一元二次方程x^2-6x+k=0有两个实数根。(1)求实数k的取值范围；(2)若两根x1,x2满足x1^2+x2^2=24，求k；(3)在(2)条件下，以两根为直角三角形两条直角边长，求斜边长。", visualContext: undefined };
session.nodes.find(n => n.id === session.rootNodeId).check = { prompt: session.problem.text, answer: "k≤9；k=6；斜边2√6", explanation: "判别式36-4k≥0，故k≤9；根之和6、积k，平方和36-2k=24，故k=6。两根3±√3均为正，斜边√24=2√6。" };
let calls = 0;
for (const method of ["textRequest", "toolRequest"]) {
const original = adapter[method].bind(adapter);
adapter[method] = async (...args) => {
  const call = ++calls, start = Date.now();
  if (call > 1) process.stdout.write(`Repair diagnostic: ${args[1].match(/错误：([^\n]+)/)?.[1] || "unknown"}\n`);
  try {
    const raw = await original(...args);
    await writeFile(`${output}/model-${call}.json`, raw);
    process.stdout.write(`Model call ${call}: ${Date.now() - start}ms, ${raw.length} chars\n`);
    return raw;
  } catch (error) { process.stdout.write(`Model call ${call}: ${Date.now() - start}ms, failed ${error.message}\n`); throw error; }
};
}
try {
  const lesson = await adapter.generateIllustrationLesson(session, () => {});
  await writeFile(`${output}/lesson.json`, JSON.stringify(lesson, null, 2));
  process.stdout.write(`Completed: ${lesson.frameCount} frames, ${JSON.stringify(lesson.generationMetrics)}\n`);
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
