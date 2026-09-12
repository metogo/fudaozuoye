// Isolated synthetic image comparison. No statistics or production requests.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { LiveProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/adapter.js");
const { getProviderConfig } = require("../functions/learning-api/dist/lib/learning/providers/config.js");
const { requestModelText } = require("../functions/learning-api/dist/lib/learning/providers/provider-text-request.js");
const { RequestControllerRegistry } = require("../functions/learning-api/dist/lib/learning/providers/request-controller-registry.js");
const { problemSolutionRequest } = require("../functions/learning-api/dist/lib/learning/providers/problem-image-analysis.js");
const { observeVisualAudit, earlyVisualInstruction } = require("../functions/learning-api/dist/lib/learning/providers/early-visual-audit.js");
const config = getProviderConfig("doubao");
assert.equal(config.mock, false);
assert.ok(config.apiKey);
const cases = [
  { id: "triangle", subject: "math", gradeBand: "junior", text: "如图，三角形ABC在C处为直角，两条直角边长度见图，求AB的长度，并说明理由。", facts: ["AC=3厘米", "BC=4厘米", "角ACB=90度"],
    svg: '<path d="M140 200 L140 410 L420 410 Z"/><path d="M140 390 H160 V410"/><text x="115" y="185">A</text><text x="100" y="445">C</text><text x="430" y="435">B</text><text x="35" y="310">3 cm</text><text x="240" y="455">4 cm</text>' },
  { id: "motion", subject: "physics", gradeBand: "senior", text: "某物体的速度随时间变化如图，求前6秒内的位移，并说明计算依据。", facts: ["0秒速度为0米每秒", "2秒速度为4米每秒", "2至6秒速度恒为4米每秒"],
    svg: '<path d="M100 430 H580 M100 430 V160 M100 430 L250 230 H550"/><path stroke-dasharray="5 5" d="M100 230 H250 V430 M550 230 V430"/><text x="50" y="155">v/(m/s)</text><text x="560" y="470">t/s</text><text x="70" y="460">0</text><text x="235" y="465">2</text><text x="535" y="465">6</text><text x="60" y="240">4</text>' },
  { id: "l-shape", subject: "math", gradeBand: "primary", text: "图中的L形地块，标注单位为米。求这块地的面积，并说明你的方法。", facts: ["L形最底边长12米", "最左侧整体高8米", "右上角缺口横向宽4米", "缺口纵向高3米"],
    svg: '<path d="M100 200 H340 V290 H460 V440 H100 Z"/><text x="230" y="480">12 m</text><text x="25" y="340">8 m</text><path stroke-dasharray="5 5" d="M340 200 H460 V290"/><text x="360" y="180">4 m</text><text x="475" y="255">3 m</text>' },
];
const output = [];
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 700, height: 530 } });
  await mkdir("outputs/visual-first-response", { recursive: true });
  for (const item of cases) {
    await page.setContent(`<body style="margin:0;background:white"><div style="font:24px sans-serif;padding:18px">${item.text}</div><svg style="position:absolute;top:0;pointer-events:none" width="700" height="530"><g fill="none" stroke="black" stroke-width="3">${item.svg.replaceAll("<text ", '<text fill="black" stroke="none" font-size="23" ')}</g></svg></body>`);
    const bytes = await page.screenshot({ path: `outputs/visual-first-response/${item.id}.png` });
    const image = `data:image/png;base64,${bytes.toString("base64")}`;
    const problem = { text: item.text, subject: item.subject, gradeBand: item.gradeBand, learnerBand: item.gradeBand, childWork: "", confidence: 1, visualContext: { related: true, affectsSolving: true, summary: item.facts.join("；"), confidence: 1, facts: item.facts.map(text => ({ text, source: "printed_label", confidence: 1 })) } };
    // Alternate order to reduce systematic warm-up advantage. This is not a statistical benchmark.
    for (const early of item.id === "motion" ? [true, false] : [false, true]) {
      const adapter = new LiveProviderAdapter(config, fetch, "light", AbortSignal.timeout(90000));
      const pending = await adapter.prepareChatSession(problem);
      const start = performance.now();
      let auditMs, firstMs, teaching = "", result;
      let lesson;
      const teach = (session) => adapter.streamTutorReply(session, { kind: "problem", section: "keyClue" }, "这是本题首次讲解。说明题目要解决什么、最关键的已知条件、第一突破口，不公布最终答案，结尾只问一个问题。", delta => { teaching += delta; if (teaching.length > 30) firstMs ??= Math.round(performance.now() - start); }, undefined, image, "problem");
      try {
        if (early) {
          const observer = observeVisualAudit(problem, visualContext => { auditMs = Math.round(performance.now() - start); lesson = teach({ ...pending, problem: { ...problem, visualContext } }); });
          const { system, prompt } = problemSolutionRequest(problem, true);
          const requests = new RequestControllerRegistry();
          try {
            const raw = await requestModelText({ config, fetcher: fetch, requests, signal: AbortSignal.timeout(60000) }, `${system}\n${earlyVisualInstruction}`, prompt, image, true, 60000, undefined, 3000, observer.delta);
            result = observer.complete(raw);
          } finally { requests.cancelAll(); }
        } else {
          const completed = await adapter.completeChatSession(pending, image);
          auditMs = Math.round(performance.now() - start);
          result = { solution: completed.nodes.find(n => n.id === completed.rootNodeId).check, visualContext: completed.problem.visualContext };
          lesson = teach(completed);
        }
        await lesson;
        const answer = result.solution.originalAnswer ?? result.solution.answer;
        const expected = { triangle: /5\s*(?:cm|厘|\\)/, motion: /20\s*(?:m|米|\\)/, "l-shape": /84\s*(?:平方|m|\\)/ };
        assert.match(answer, expected[item.id], "Synthetic numerical answer must remain correct; rationale still requires manual review");
        output.push({ id: item.id, early, auditMs, firstMs, totalMs: Math.round(performance.now() - start), result, teaching });
        console.log(JSON.stringify({ id: item.id, early, auditMs, firstMs }));
      } catch (error) { output.push({ id: item.id, early, error: error.message }); console.log(JSON.stringify(output.at(-1))); process.exitCode = 1; }
      finally { adapter.cancelPendingRequests(); await lesson?.catch(() => {}); }
    }
  }
} finally { await browser.close(); await writeFile("outputs/visual-first-response/comparison.json", JSON.stringify(output, null, 2)); }
