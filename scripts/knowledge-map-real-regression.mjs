import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { getProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/index.js");
const cases = [
  { subject: "physics", text: "一个电阻两端电压为6V，通过的电流为0.3A。求它的电阻；若电压变为9V且电阻不变，电流是多少？", expected: /欧姆|电阻|电流/ },
  { subject: "chemistry", text: "铁在氧气中燃烧生成四氧化三铁，写出反应的化学方程式，并说明配平前后原子的种类和数目有什么关系。", expected: /守恒|方程式|配平/ },
];
for (const item of cases) {
  const start = Date.now();
  const adapter = getProviderAdapter("doubao", "light", AbortSignal.timeout(45000));
  const session = await adapter.prepareChatSession({ text: item.text, subject: item.subject, gradeBand: "junior", childWork: "", confidence: 1, userRevised: true });
  const before = JSON.stringify(session);
  const mapStart = Date.now();
  const map = await adapter.generateKnowledgeMap(session);
  const mapMs = Date.now() - mapStart;
  if (!item.expected.test(map.nodes.map(n => n.title).join(" "))) throw new Error(`${item.subject}: 未关联核心知识`);
  if (before !== JSON.stringify(session)) throw new Error("图谱改变了学习会话");
  const detailStart = Date.now();
  const detail = await adapter.generateKnowledgeDetail(session, map, map.rootId);
  if (!detail.summary || !detail.application) throw new Error("所选知识点详情缺失");
  console.log(JSON.stringify({ subject: item.subject, ms: Date.now() - start, mapMs, detailMs: Date.now() - detailStart, root: map.nodes.find(n => n.id === map.rootId)?.title, nodes: map.nodes.map(n => n.title), edges: map.edges, detail }));
}
