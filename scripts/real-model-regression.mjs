import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const baseUrl = process.env.REAL_MODEL_BASE_URL ?? "http://localhost:3000";
const rounds = Number(process.env.REAL_MODEL_ROUNDS ?? 50);
const concurrency = Number(process.env.REAL_MODEL_CONCURRENCY ?? 3);
const provider = process.env.REAL_MODEL_PROVIDER ?? "doubao";

if (!Number.isInteger(rounds) || rounds < 1) throw new Error("REAL_MODEL_ROUNDS 必须是正整数");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) throw new Error("REAL_MODEL_CONCURRENCY 必须是 1 到 5 的整数");
if (!new Set(["doubao", "openai", "xai"]).has(provider)) throw new Error("REAL_MODEL_PROVIDER 不合法");

const problems = [
  ["长方形长8厘米、宽5厘米，面积是多少平方厘米？", "8+5=13", "math", "primary", ["math.geometry.rectangle-area"]],
  ["一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", "180÷5×3=108", "math", "primary", ["math.ratio.proportional", "math.rate.unit-rate"]],
  ["20个苹果的四分之三是多少个？", "20÷4=5，接下来不会", "math", "primary", ["math.fraction.meaning", "math.fraction.operation"]],
  ["一件原价200元的衣服打八折，现价多少元？", "200-80=120", "math", "primary", ["math.percent.meaning"]],
  ["小明三次成绩是80、90、100分，平均成绩是多少？", "80+90+100=270", "math", "primary", ["math.statistics.mean", "math.arithmetic.division"]],
  ["解方程：3(x-2)=18。", "3x-2=18", "math", "junior", ["math.algebra.linear-equation", "math.algebra.equivalent-transform", "math.algebra.expression", "math.arithmetic.order"]],
  ["解方程组：x+y=7，x-y=1。", "不知道怎样消元", "math", "junior", ["math.algebra.linear-system"]],
  ["直角三角形两直角边为3和4，求斜边。", "3+4=7", "math", "junior", ["math.geometry.pythagorean"]],
  ["袋中有3个红球和2个白球，随机摸一个，摸到红球的概率是多少？", "3÷2", "math", "junior", ["math.probability.classical"]],
  ["已知二次函数y=x²-4x+3，求顶点坐标。", "不知道怎样配方", "math", "junior", ["math.function.quadratic", "math.algebra.quadratic-expression"]],
  ["已知2^x=8，求x。", "2×x=8", "math", "senior", ["math.power.meaning", "math.function.exponential"]],
  ["解方程log₂x=3。", "不知道对数和指数的关系", "math", "senior", ["math.function.logarithmic", "math.function.exponential"]],
  ["汽车5秒内匀速行驶50米，它的速度是多少？", "50×5=250", "physics", "junior", ["physics.motion.speed"]],
  ["某物体质量540克、体积200立方厘米，密度是多少？", "540+200", "physics", "junior", ["physics.matter.density"]],
  ["10牛的力作用在2平方米面积上，压强是多少？", "10×2", "physics", "junior", ["physics.force.pressure"]],
  ["电阻两端电压6伏，通过电流0.3安，电阻是多少？", "6×0.3", "physics", "junior", ["physics.electric.ohm-law"]],
  ["质量2千克的物体受到10牛合力，加速度是多少？", "写出F=ma但不会代入", "physics", "senior", ["physics.newton.second-law"]],
  ["一个小球从高处落下，不计阻力，说明动能和势能怎样变化。", "不知道哪种能量增加", "physics", "senior", ["physics.energy.mechanical", "physics.energy.conservation"]],
  ["配平：H₂+O₂→H₂O。", "H₂+O₂→2H₂O", "chemistry", "junior", ["chemistry.equation.balance", "chemistry.equation.conservation"]],
  ["100克溶液中含20克溶质，溶质质量分数是多少？", "100÷20=5", "chemistry", "junior", ["chemistry.solution.concentration"]],
  ["某溶液pH=3，它显酸性还是碱性？", "3小所以是碱性", "chemistry", "junior", ["chemistry.acid-base.ph"]],
  ["2 mol O₂含有多少个氧分子？", "2×22.4", "chemistry", "senior", ["chemistry.mole.amount"]],
  ["反应2H₂+O₂→2H₂O中，4 mol H₂完全反应需要多少mol O₂？", "4 mol", "chemistry", "senior", ["chemistry.mole.stoichiometry", "chemistry.mole.amount"]],
  ["反应中铁元素化合价从0升到+3，铁被氧化还是还原？", "化合价升高所以被还原", "chemistry", "senior", ["chemistry.redox.valence"]],
  ["可逆反应达到化学平衡后，正反应是否停止？", "停止了", "chemistry", "senior", ["chemistry.equilibrium"]],
].map(([text, childWork, subject, gradeBand, expected]) => ({ text, childWork, subject, gradeBand, expected, confidence: 1, userRevised: true }));

const jobs = Array.from({ length: rounds }, (_, index) => ({ index, problem: problems[index % problems.length] }));
const results = [];
let cursor = 0;

await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
  const cookie = await consent();
  while (true) {
    const position = cursor++;
    if (position >= jobs.length) return;
    const job = jobs[position];
    const startedAt = Date.now();
    try {
      const analyzed = await analyze(cookie, job.problem);
      const concepts = analyzed.session.nodes.filter((node) => node.kind === "concept");
      const errors = validateAnalysis(job.problem, concepts, analyzed.session);
      let expansion = { attempted: false, passed: true, error: "" };
      const current = analyzed.session.nodes.find((node) => node.id === analyzed.session.currentNodeId);
      if (job.index % 5 === 0 && current?.kind === "concept" && !current.atomic) {
        expansion = await validateExpansion(cookie, analyzed, current);
        if (!expansion.passed) errors.push(expansion.error);
      }
      const ok = errors.length === 0;
      results.push({ index: job.index, ok, problem: job.problem.text, concepts: concepts.map((node) => node.conceptId), checks: concepts.map((node) => node.check.prompt), elapsedMs: Date.now() - startedAt, error: errors.join("；"), expansion, modelId: analyzed.session.modelId });
      process.stdout.write(`round ${job.index + 1}/${rounds} worker=${worker + 1} ${ok ? "ok" : "invalid"} ${Date.now() - startedAt}ms${errors.length ? ` ${errors.join("；")}` : ""}\n`);
    } catch (error) {
      results.push({ index: job.index, ok: false, problem: job.problem.text, concepts: [], checks: [], elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error), expansion: { attempted: false, passed: false, error: "" } });
      process.stdout.write(`round ${job.index + 1}/${rounds} worker=${worker + 1} failed ${Date.now() - startedAt}ms ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}));

results.sort((a, b) => a.index - b.index);
const successful = results.filter((item) => item.ok);
if (!successful.length) throw new Error("真实模型回归没有任何成功样本");
const signatureCounts = countBy(successful.map((item) => item.concepts.slice().sort().join("|")));
const conceptCounts = countBy(successful.flatMap((item) => item.concepts));
const repeatedCheckCount = crossProblemDuplicateCount(successful);
const consistencyRate = withinProblemConsistency(successful);
const expansions = results.filter((item) => item.expansion.attempted);
const elapsed = successful.map((item) => item.elapsedMs).sort((a, b) => a - b);
const summary = {
  runAt: new Date().toISOString(), implementationFingerprint: fingerprint(), provider,
  modelIds: [...new Set(successful.map((item) => item.modelId).filter(Boolean))], rounds,
  passed: successful.length, failed: rounds - successful.length, passRate: successful.length / rounds,
  uniqueTopologySignatures: Object.keys(signatureCounts).length,
  mostCommonTopologyShare: maxCount(signatureCounts) / successful.length,
  mostCommonConceptShare: maxCount(conceptCounts) / successful.reduce((sum, item) => sum + item.concepts.length, 0),
  repeatedCheckCount, withinProblemConsistencyRate: consistencyRate,
  expansion: { attempted: expansions.length, passed: expansions.filter((item) => item.expansion.passed).length },
  latencyMs: { p50: percentile(elapsed, 0.5), p95: percentile(elapsed, 0.95), max: elapsed.at(-1) ?? 0 },
  failures: results.filter((item) => !item.ok).map((item) => ({ round: item.index + 1, problem: item.problem, error: item.error })),
  topConcepts: Object.entries(conceptCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
};
process.stdout.write(`REAL_MODEL_SUMMARY ${JSON.stringify(summary)}\n`);
const expansionRate = expansions.length ? summary.expansion.passed / expansions.length : 0;
if (!Number.isFinite(summary.passRate) || summary.passRate < 0.9 || summary.uniqueTopologySignatures < Math.min(12, Math.ceil(rounds / 2)) || summary.mostCommonTopologyShare > 0.25 || summary.mostCommonConceptShare > 0.15 || repeatedCheckCount > 0 || consistencyRate < 0.6 || expansions.length < Math.max(1, Math.floor(rounds / 10)) || expansionRate < 0.9) process.exitCode = 1;

async function consent() {
  const response = await fetch(`${baseUrl}/api/consent`, { method: "POST", headers: { Origin: baseUrl } });
  if (!response.ok) throw new Error(`监护人同意接口失败：${response.status}`);
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error("监护人同意接口没有返回凭证");
  return raw.split(";")[0];
}

async function analyze(cookie, problem) {
  const form = new FormData();
  form.set("stage", "full"); form.set("provider", provider); form.set("problem", JSON.stringify(problem));
  const response = await fetch(`${baseUrl}/api/learning/analyze`, { method: "POST", headers: { Origin: baseUrl, Cookie: cookie }, body: form, signal: AbortSignal.timeout(260_000) });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  let graph;
  for (const block of text.split(/\n\n/)) {
    const event = block.match(/^event: (.+)$/m)?.[1];
    const raw = block.match(/^data: (.+)$/m)?.[1];
    if (!event || !raw) continue;
    const data = JSON.parse(raw);
    if (event === "error") throw new Error(data.message ?? "分析失败");
    if (event === "graph") graph = data;
  }
  if (!graph?.session || !graph.stateToken) throw new Error("SSE 未返回完整知识图状态");
  return graph;
}

async function validateExpansion(cookie, analyzed, target) {
  try {
    const response = await fetch(`${baseUrl}/api/learning/expand`, {
      method: "POST", headers: { Origin: baseUrl, Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ stateToken: analyzed.stateToken, targetNodeId: target.id }), signal: AbortSignal.timeout(260_000),
    });
    if (!response.ok) throw new Error(`展开失败（${response.status}）`);
    const envelope = await readSseGraph(response);
    if (!envelope?.session) throw new Error("展开 SSE 未返回完整知识图状态");
    const before = new Set(analyzed.session.nodes.map((node) => node.id));
    const added = envelope.session.nodes.filter((node) => !before.has(node.id));
    if (!added.length) throw new Error("展开没有新增知识节点");
    if (added.some((node) => node.kind !== "concept" || node.difficulty >= target.difficulty || !node.diagnosticEvidence || !node.check?.prompt || !node.teaching?.explanation)) throw new Error("展开节点没有严格简化或内容不完整");
    if (new Set(added.map((node) => node.conceptId)).size !== added.length) throw new Error("展开产生重复概念");
    if (!isAcyclic(envelope.session)) throw new Error("展开后的知识图存在循环");
    return { attempted: true, passed: true, error: "" };
  } catch (error) { return { attempted: true, passed: false, error: error instanceof Error ? error.message : String(error) }; }
}

async function readSseGraph(response) {
  const text = await response.text();
  let graph;
  for (const block of text.split(/\n\n/)) {
    const event = block.match(/^event: (.+)$/m)?.[1];
    const raw = block.match(/^data: (.+)$/m)?.[1];
    if (!event || !raw) continue;
    const data = JSON.parse(raw);
    if (event === "error") throw new Error(data.message ?? "展开失败");
    if (event === "graph") graph = data;
  }
  return graph;
}

function validateAnalysis(problem, concepts, session) {
  const errors = [];
  if (concepts.length < 1 || concepts.length > 4) errors.push("节点数量不在1到4之间");
  if (!concepts.some((node) => problem.expected.includes(node.conceptId))) errors.push(`没有命中预期核心概念(${problem.expected.join(",")})，实际=${concepts.map((node) => node.conceptId).join(",")}`);
  if (concepts.some((node) => !node.conceptId.startsWith(`${problem.subject}.`) || !node.diagnosticEvidence || !node.diagnosticEvidenceSource || !node.check?.prompt || !node.teaching?.explanation)) errors.push("节点结构或学科不合法");
  if (new Set(concepts.map((node) => node.conceptId)).size !== concepts.length) errors.push("同一会话出现重复概念");
  if (new Set(concepts.map((node) => normalize(node.check.prompt))).size !== concepts.length) errors.push("同一会话出现重复检查题");
  for (const node of concepts) {
    const source = node.diagnosticEvidenceSource === "child_work" ? problem.childWork : problem.text;
    if (!normalize(source).includes(normalize(node.diagnosticEvidence))) errors.push(`${node.conceptId} 的证据无法落到标注来源`);
  }
  if (!isAcyclic(session)) errors.push("知识图存在循环");
  return errors;
}

function isAcyclic(session) {
  const outgoing = new Map();
  for (const edge of session.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  const visiting = new Set(); const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    if (!(outgoing.get(id) ?? []).every(visit)) return false;
    visiting.delete(id); visited.add(id); return true;
  };
  return session.nodes.every((node) => visit(node.id));
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/平方厘米/g, "cm2").replace(/平方米/g, "m2").replace(/立方厘米/g, "cm3").replace(/立方米/g, "m3").replace(/千米|公里/g, "km").replace(/厘米/g, "cm").replace(/小时/g, "h").replace(/千克|公斤/g, "kg").replace(/[^\p{L}\p{N}]+/gu, "");
}

function countBy(values) { return values.reduce((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {}); }
function maxCount(counts) { return Math.max(0, ...Object.values(counts)); }
function percentile(values, ratio) { return values.length ? values[Math.min(values.length - 1, Math.floor(values.length * ratio))] : 0; }

function crossProblemDuplicateCount(items) {
  const owners = new Map(); let duplicates = 0;
  for (const item of items) for (const check of item.checks) {
    const signature = normalize(check); const previous = owners.get(signature);
    if (previous && previous !== item.problem) duplicates += 1;
    else owners.set(signature, item.problem);
  }
  return duplicates;
}

function withinProblemConsistency(items) {
  const groups = Map.groupBy(items, (item) => item.problem);
  const repeated = [...groups.values()].filter((group) => group.length > 1);
  if (!repeated.length) return 1;
  return repeated.filter((group) => group.slice(1).every((item) => item.concepts.some((concept) => group[0].concepts.includes(concept)))).length / repeated.length;
}

function fingerprint() {
  const hash = createHash("sha256");
  for (const file of ["lib/learning/providers/adapter.ts", "lib/learning/providers/blueprint.ts", "lib/learning/curriculum-data.ts", "scripts/real-model-regression.mjs"]) hash.update(readFileSync(new URL(`../${file}`, import.meta.url)));
  return hash.digest("hex").slice(0, 16);
}
