import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { getProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/index.js");
const { createMapDeadline } = require("../functions/learning-api/dist/lib/learning/knowledge-map-deadline.js");
const cases = [
  { subject: "math", gradeBand: "primary", text: "一块正方形草地的左右两侧铺了石子路，整体为长方形。图上左侧石子路宽与正方形边长合计15米，正方形边长与右侧石子路宽合计12米。求整块长方形地的周长。" },
  { subject: "physics", gradeBand: "junior", text: "一个电阻两端电压为6V，通过的电流为0.3A。求它的电阻；若电压变为9V且电阻不变，电流是多少？" },
  { subject: "chemistry", gradeBand: "senior", text: "25摄氏度时，把0.1 mol/L的盐酸和0.1 mol/L的氢氧化钠溶液等体积混合。写出反应的离子方程式，并判断混合后溶液的酸碱性。" },
];
for (const item of cases) {
  if (process.argv[2] && process.argv[2] !== item.subject) continue;
  const deadline = createMapDeadline();
  const adapter = getProviderAdapter("doubao", "light", deadline.signal);
  if (!adapter.streamKnowledgeMap) throw new Error("未配置真实模型");
  const session = { problem: { ...item, childWork: "", confidence: 1, userRevised: true }, nodes: [] };
  const started = Date.now();
  const events = [];
  const map = await adapter.streamKnowledgeMap(session, event => {
    if (event.type === "plan") deadline.planned(event.plan.nodes.length);
    const entry = { type: event.type, ms: Date.now() - started, ...(event.type === "plan" ? { total: event.plan.nodes.length } : { title: event.node.title }) };
    events.push(entry);
    console.log(JSON.stringify({ subject: item.subject, ...entry }));
  }).finally(() => deadline.clear());
  if (events.filter(e => e.type === "node").length !== events[0].total) throw new Error("真实输出数量与计划不同");
  console.log(JSON.stringify({ subject: item.subject, passed: true, nodes: map.nodes.length, elapsedMs: Date.now() - started }));
}
