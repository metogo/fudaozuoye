/** Local-only UI acceptance backend. No model, credentials or shared statistics.
 * Build frontend with NEXT_PUBLIC_API_BASE_URL=http://localhost:9101/api.
 * Serve out/ on 3101. Submit any synthetic text, then enter stages on stdin:
 * recognize, root, lesson, related, finish (root/lesson may arrive in either order).
 */
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
const require = createRequire(import.meta.url);
process.env.AI_MOCK_MODE = "true";
process.env.SESSION_STATE_SECRET = "isolated-reading-transition-fixture-only";
process.env.PUBLIC_APP_ORIGIN = "http://localhost:3101";
const { MockProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/mock-adapter.js");
const { recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const { sse } = require("../functions/learning-api/dist/lib/learning/http/sse.js");
const released = new Set();
const waiters = new Map();
function stage(name) {
  if (released.has(name)) return Promise.resolve();
  return new Promise(resolve => {
    const queue = waiters.get(name) || [];
    queue.push(resolve); waiters.set(name, queue);
  });
}
createInterface({ input: process.stdin }).on("line", name => {
  if (!["recognize", "root", "lesson", "related", "finish"].includes(name)) return;
  released.add(name);
  for (const resolve of waiters.get(name) || []) resolve();
  waiters.delete(name);
  process.stdout.write(`Released: ${name}\n`);
});
MockProviderAdapter.prototype.recognizeTextProblem = async () => {
  await stage("recognize");
  return recognizeMock("math", "primary");
};
MockProviderAdapter.prototype.streamTutorReply = async (_session, _scope, _question, onDelta) => {
  await stage("lesson");
  onDelta("先看每小时走多少，再看走了几小时。\n\n");
  await stage("finish");
  onDelta("3 小时行驶 180 千米，先用 180 ÷ 3 找到每小时的路程。\n\n每小时走的路程相同，把 5 小时的路程合起来，就能回答原题。你能先算出每小时走多少千米吗？");
};
const mapRoute = require("../functions/learning-api/dist/lib/learning/http/knowledge-map.js");
mapRoute.postKnowledgeMap = async () => sse(async send => {
  const evidence = recognizeMock("math", "primary").text;
  const longTitle = process.env.FIXTURE_LONG_TITLE === "true";
  const root = { id: "root", title: longTitle ? "等腰直角三角形性质与全等证明综合应用" : "速度与路程", summary: "", application: "", evidence };
  const related = { id: "unit", title: longTitle ? "全等三角形判定定理（AAS）" : "每小时的路程", summary: "", application: "", evidence };
  await stage("root");
  send("map.root", { node: root });
  send("map.plan", { type: "plan", plan: { rootId: "root", nodes: [{ id: "root", parents: [] }, { id: "unit", parents: ["root"] }] } });
  send("map.node", { type: "node", node: root, edges: [] });
  await stage("related");
  send("map.node", { type: "node", node: related, edges: [{ from: "root", to: "unit", kind: "prerequisite", reason: "先找到每小时的路程。" }] });
  send("complete", { total: 2 });
});
const statistics = require("../functions/learning-api/dist/lib/learning/http/question-statistics.js");
statistics.getQuestionStatistics = async () => Response.json({ total: 10000 });
statistics.postQuestionEntry = async () => Response.json({ total: 10000 });
const { main } = require("../functions/learning-api/dist/functions/learning-api/src/index.js");
main.listen(9101, "127.0.0.1", () => process.stdout.write("Isolated reading fixture: localhost:9101\n"));
