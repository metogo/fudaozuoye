import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { supportsRectangleExperiment, experimentQuestion } = require("../functions/learning-api/dist/lib/learning/rectangle-experiment.js");
const { readMapStream } = require("../functions/learning-api/dist/lib/learning/knowledge-map-stream.js");
const api = "http://localhost:9000/api", origin = "http://localhost:3000";
// 合成验收题；不调用统计接口，不输出或保存会话凭据。不自动重试掩盖首轮失败。
const cases = [
  { id: "perimeter", text: "长方形长8厘米，宽3厘米，求周长。", eligible: true, observation: "周长不变时面积变了，是不是说明原题的周长也等于12厘米？" },
  { id: "area", text: "一块长方形纸板长12厘米，宽5厘米，它的面积是多少平方厘米？", eligible: true, observation: "面积是把边长相加吗？实验变成5和1，所以原题答案是6平方厘米？" },
  { id: "decimal", text: "一块长方形地毯长2.5米，宽1.2米，求面积。", eligible: true, observation: "实验里的平方厘米和原题的平方米有什么区别？原题可以照着数格子理解吗？", free: true },
  { id: "english", text: "A rectangle has length 9 cm and width 4 cm. Find its area in square centimeters.", eligible: true, question: "为什么这里不能用9+4来计算面积？" },
  { id: "inverse", text: "一个长方形的周长是24厘米，长8厘米，求宽。", eligible: false, question: "我用24减8得到16厘米，为什么不对？" },
  { id: "compound", text: "一块正方形草地的左右两侧铺石子路，整体为长方形。左侧路宽与正方形边长合计15米，正方形边长与右侧路宽合计12米，求整块长方形地的周长。", eligible: false, question: "不知道正方形的边长，怎么还能求大长方形的周长？", full: true },
  { id: "triangle", text: "直角三角形的两条直角边分别是3厘米和4厘米，求斜边长。", gradeBand: "junior", eligible: false, question: "为什么不是3加4等于7？可以解释一下三个边上正方形面积的关系吗？", full: true },
  { id: "physics", text: "一个电阻两端电压为6伏，通过的电流为0.3安，求电阻。保持电阻不变，把电压改成9伏，电流是多少？", subject: "physics", gradeBand: "junior", eligible: false, question: "电压增大后是不是电阻也会增大？为什么？", full: true },
  { id: "quadratic", text: "已知函数f(x)=x²-4x+3，求它在实数范围内的最小值以及取得最小值时的x。", gradeBand: "senior", eligible: false, question: "为什么配方时要先加4再减4？最小值为什么不是3？", full: true },
  { id: "chinese", text: "诗句‘飞流直下三千尺，疑是银河落九天’运用了哪些修辞手法？结合诗句解释表达效果。", subject: "chinese", gradeBand: "junior", eligible: false, question: "三千尺和银河都是夸张吗？我怎么区分比喻和夸张？", full: true },
];
const selected = process.env.EXPERIMENT_CASES?.split(",");
const jobs = cases.filter(c => !selected || selected.includes(c.id));
assert.ok(jobs.length, "没有选中的验收题");
const results = [];
let cursor = 0;
await Promise.all(Array.from({ length: 2 }, async () => {
  while (cursor < jobs.length) {
    const test = jobs[cursor++], started = Date.now();
    const result = { id: test.id, problem: test.text, expectedExperiment: test.eligible, timings: {}, outputs: {} };
    try {
      const consent = await fetch(`${api}/consent`, { method: "POST", headers: { Origin: origin }, signal: AbortSignal.timeout(15000) });
      assert.equal(consent.status, 200);
      const cookie = consent.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie, "本地会话凭据缺失");
      const problem = { text: test.text, subject: test.subject || "math", gradeBand: test.gradeBand || "primary", childWork: "", confidence: 1, userRevised: true };
      const form = new FormData();
      form.set("stage", "full"); form.set("provider", "doubao"); form.set("reasoningLevel", "light");
      form.set("problem", JSON.stringify(problem));
      const analysis = await request("/learning/analyze", cookie, form);
      result.timings.analysis = analysis.ms;
      let state = latest(analysis.events, "graph");
      assert.equal(state.session.mode, "live", "模拟模式不能通过验收");
      result.experimentShown = supportsRectangleExperiment(state.session.problem);
      result.eligibilityMatches = result.experimentShown === test.eligible;
      const first = await turn(state, cookie, { type: "start" });
      result.timings.start = first.ms; result.outputs.start = text(first.events);
      assert.ok(result.outputs.start, "首轮讲解为空");
      state = latest(first.events);
      const originalText = state.session.problem.text, gate = state.session.flow.activeGate.id;
      const before = { length: 4, width: 2 }, after = test.free ? { length: 4, width: 3 } : { length: 5, width: 1 };
      const question = result.experimentShown ? experimentQuestion(before, after, test.free ? null : 6, test.observation || "这个变化和原题有什么关系？") : test.question;
      assert.ok(question, "未提供本题追问");
      result.question = question;
      const answer = await turn(state, cookie, { type: "question", text: question });
      result.timings.question = answer.ms; result.outputs.question = text(answer.events);
      assert.ok(result.outputs.question, "追问回答为空");
      state = latest(answer.events);
      assert.equal(state.session.problem.text, originalText, "追问污染原题");
      assert.equal(state.session.flow.activeGate.id, gate, "观察被当成通过关卡");
      assert.equal(state.session.flow.pathNodeIds.length, 0, "观察被当成已掌握");
      if (test.full) {
        assert.ok(state.session.flow.activeGate.options?.some(o => o.id === "full_solution"), "缺少完整讲解入口");
        const solution = await turn(state, cookie, { type: "choose", gateId: state.session.flow.activeGate.id, choice: "full_solution" });
        result.timings.solution = solution.ms; result.outputs.solution = text(solution.events);
        state = latest(solution.events);
        assert.equal(state.session.flow.activeGate.kind, "solution_review", "完整讲解没有进入阅读确认");
        assert.ok(result.outputs.solution, "完整讲解为空");
      }
      result.flowPassed = true;
    } catch (error) { result.flowPassed = false; result.error = error.message; }
    result.elapsedMs = Date.now() - started;
    results.push(result);
    console.log(JSON.stringify({ type: "case", ...result }));
  }
}));
console.log(JSON.stringify({ type: "summary", total: results.length, flowPassed: results.filter(r => r.flowPassed).length, eligibilityMismatches: results.filter(r => r.eligibilityMatches === false).map(r => r.id), quality: "学习解释需逐题人工审核，成功响应不等于教学有效" }));
if (results.some(r => !r.flowPassed || !r.eligibilityMatches)) process.exitCode = 1;

async function request(path, cookie, body) {
  const started = Date.now(), events = [];
  const response = await fetch(`${api}${path}`, { method: "POST", headers: { Origin: origin, Cookie: cookie, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  await readMapStream(response, (name, data) => events.push({ name, data }));
  return { ms: Date.now() - started, events };
}
function turn(state, cookie, input) { return request("/learning/turn", cookie, { stateToken: state.stateToken, input }); }
function latest(events, name = "flow.update") {
  const value = events.findLast(e => e.name === name)?.data;
  assert.ok(value?.session && value.stateToken, `缺少 ${name} 会话状态`);
  return value;
}
function text(events) { return events.reduce((value, e) => e.name === "message.reset" ? "" : e.name === "message.delta" ? value + (e.data.text || "") : value, ""); }
