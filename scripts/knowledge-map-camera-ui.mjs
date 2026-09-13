import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { MockProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/adapter.js");
const { understandingGate } = require("../functions/learning-api/dist/lib/learning/flow.js");
const adapter = new MockProviderAdapter("doubao");
const session = await adapter.analyzeProblem(await adapter.recognizeProblem("data:image/jpeg;base64,demo"));
session.flow.activeGate = understandingGate();
session.flow.stage = "core_explanation";
const snapshot = { session, stateToken: "test-state-token-".repeat(5), messages: [{ id: "intro", role: "assistant", kind: "assistant", text: "先理解速度与路程之间的关系。", status: "complete", createdAt: new Date().toISOString() }] };
const plan = { rootId: "core", nodes: [{ id: "core", parents: [] }, { id: "unit", parents: ["core"] }, { id: "multiply", parents: ["core"] }, { id: "divide", parents: ["core"] }] };
const titles = ["速度与路程", "单位量", "乘法的意义", "除法的意义"];
const evidence = session.problem.text.slice(0, 200);
const nodeEvent = index => ({ type: "node", node: { id: plan.nodes[index].id, title: titles[index], evidence, summary: "", application: "" }, edges: plan.nodes[index].parents.map(from => ({ from, to: plan.nodes[index].id, kind: "prerequisite", reason: "用每单位时间的路程建立总路程关系。" })) });
const cors = { "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "content-type,accept", "Access-Control-Allow-Methods": "POST,OPTIONS" };
let live, details = 0;
const server = createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  let raw = "";
  req.on("data", chunk => { raw += chunk; });
  req.on("end", () => {
    const body = JSON.parse(raw);
    if (body.nodeId) { details++; res.writeHead(200, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify({ detail: { summary: "速度是每单位时间走过的路程。", application: "把题目中的总路程分成相同的几份。" } })); return; }
    res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.flushHeaders();
    live = res;
  });
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
await mkdir("outputs/knowledge-map-camera", { recursive: true });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/consent", route => route.fulfill({ json: { statisticsEnabled: false, reasoningLevels: [{ id: "light", label: "轻度", available: true }] }, headers: cors }));
    await page.route("**/learning/knowledge-map", route => route.continue({ url: `http://127.0.0.1:${port}/learning/knowledge-map` }));
    await page.addInitScript(data => sessionStorage.setItem("education-chat-session-v3", JSON.stringify(data)), snapshot);
    live = null;
    await page.goto("http://localhost:3000/");
    await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
    await expect.poll(() => Boolean(live)).toBe(true);
    const send = (event, data) => live.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const canvas = page.getByLabel("可拖拽的知识图谱");
    const viewport = page.locator(".react-flow__viewport");
    const centered = async id => {
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      await expect(node.locator('[data-active="true"]')).toHaveCount(1);
      await expect.poll(async () => {
        const a = await node.boundingBox(), b = await canvas.boundingBox();
        return Math.abs(a.x + a.width / 2 - b.x - b.width / 2) + Math.abs(a.y + a.height / 2 - b.y - b.height / 2 - 12);
      }).toBeLessThan(3);
    };
    await centered("pending-core");
    send("map.root", { node: nodeEvent(0).node });
    await centered("core");
    await page.screenshot({ path: `outputs/knowledge-map-camera/${width}-root.png` });
    send("map.plan", { type: "plan", plan });
    send("map.node", nodeEvent(0));
    await centered("unit");
    const before = await viewport.getAttribute("style");
    send("map.node", nodeEvent(1));
    await expect(page.locator('.react-flow__node[data-id="multiply"] [data-active="true"]')).toHaveCount(1);
    await page.waitForTimeout(180);
    const middle = await viewport.getAttribute("style");
    expect(middle).not.toBe(before);
    await centered("multiply");
    expect(await viewport.getAttribute("style")).not.toBe(middle);
    await page.screenshot({ path: `outputs/knowledge-map-camera/${width}-following.png` });
    send("map.node", nodeEvent(2));
    await centered("divide");
    send("map.node", nodeEvent(3)); send("complete", { total: 4 }); live.end();
    await expect(page.getByRole("dialog").getByText("已全部生成", { exact: true })).toBeVisible();
    await expect(page.locator('[data-active="true"]')).toHaveCount(0);
    await expect.poll(async () => {
      const bounds = await canvas.boundingBox();
      const nodes = await page.locator(".react-flow__node").all();
      return (await Promise.all(nodes.map(async node => {
        const box = await node.boundingBox();
        return box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width && box.y >= bounds.y + 55 && box.y + box.height <= bounds.y + bounds.height - 20;
      }))).every(Boolean);
    }).toBe(true);
    await page.waitForTimeout(750);
    const arranged = await viewport.getAttribute("style");
    await page.getByRole("button", { name: "整理", exact: true }).click();
    await page.waitForTimeout(750);
    expect(await viewport.getAttribute("style")).toBe(arranged);
    await page.screenshot({ path: `outputs/knowledge-map-camera/${width}-complete.png` });
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ width, centeredRoot: true, animatedNodes: true, completedOverview: true }));
    await context.close();
  }
  expect(details).toBe(0);
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
