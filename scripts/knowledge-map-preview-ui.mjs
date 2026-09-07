import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { MockProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/adapter.js");
const { understandingGate } = require("../functions/learning-api/dist/lib/learning/flow.js");
const adapter = new MockProviderAdapter("doubao");
const session = await adapter.analyzeProblem(await adapter.recognizeProblem("data:image/jpeg;base64,demo"));
const template = session.nodes.find(n => n.kind === "concept");
const titles = ["速度与路程", "单位量", "乘法的意义"];
session.nodes = [session.nodes.find(n => n.id === session.rootNodeId), ...titles.map((title, i) => ({ ...template, id: `lesson-${i}`, title, simplification: "每小时走的距离是一个单位量，把几个小时的距离合起来，就得到总路程。", teaching: { ...template.teaching, explanation: i === 1 ? "单位量就是每一份的数量。这里的一份是1小时，对应的量是这一小时走的距离。" : "速度告诉我们每小时走多远，把几个小时走的距离合起来，就是总路程。", example: "每小时走3千米，2小时就是两个3千米，合起来是6千米。" } }))];
session.edges = [{ from: "lesson-0", to: session.rootNodeId }, { from: "lesson-1", to: "lesson-0" }, { from: "lesson-2", to: "lesson-0" }].map(e => ({ ...e, reason: "先理解基础知识" }));
session.flow.activeGate = understandingGate(); session.flow.stage = "core_explanation"; session.flow.focus = { kind: "problem" };
session.currentNodeId = "lesson-0";
const snapshot = { session, stateToken: "test-state-token-".repeat(5), messages: [{ id: "intro", role: "assistant", kind: "assistant", scopeLabel: "速度与路程", text: "先看每小时走多少，再看走了几小时。每小时走的距离，就是这里的**单位量**。把几个小时走的距离合起来，就得到总路程。", status: "complete", createdAt: new Date().toISOString() }] };
const nodes = titles.map((title, i) => ({ id: `map-${i}`, title, evidence: session.problem.text.slice(0, 200), summary: "", application: "" }));
const edges = [1, 2].map(i => ({ from: "map-0", to: `map-${i}`, kind: "prerequisite", reason: "路程关系需要这个基础知识" }));
const plan = { rootId: "map-0", nodes: nodes.map(n => ({ id: n.id, parents: edges.filter(e => e.to === n.id).map(e => e.from) })) };
const frame = (type, data) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function verifyReturnedScroll(page, touch, exit) {
  await expect(page.locator("dialog")).toHaveCount(0);
  const scroll = page.locator(".chat-scroll");
  const box = await scroll.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const move = async delta => {
    if (touch) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let i = 1; i <= 6; i++) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - delta * i / 6 }] });
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, delta);
    }
  };
  await scroll.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const bottom = await scroll.evaluate(node => node.scrollTop);
  expect(bottom).toBeGreaterThan(150);
  await move(-130);
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeLessThan(bottom - 50);
  await scroll.evaluate(node => { node.scrollTop = 0; });
  await move(130);
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(50);
  console.log(`PASS: ${exit} → ${touch ? "touch swipe" : "mouse wheel"} up/down`);
}
await mkdir("outputs/knowledge-map-preview", { recursive: true });
const errors = [];
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 600 }, hasTouch: width < 800, isMobile: width < 800, reducedMotion: "reduce" });
    const page = await context.newPage();
    const touch = width < 800 ? await context.newCDPSession(page) : null;
    let mapRequests = 0;
    let releaseConnection;
    const connectionReady = new Promise(resolve => { releaseConnection = resolve; });
    const details = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/consent", route => route.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] } }));
    await page.route("**/learning/knowledge-connection", async route => {
      const { source, messageId } = route.request().postDataJSON();
      await connectionReady;
      return route.fulfill({ json: { messageId, connection: {
        version: 1, anchor: source, evidence: session.problem.text, kind: "prerequisite",
        foundation: { title: "单位量", explanation: "单位量就是每一份的数量。这里每一份对应1小时。", example: "每小时走3千米，就是每一份的数量。" },
        target: { title: "速度与路程", explanation: "把几个小时走的距离合起来，就是总路程。", example: "每小时走3千米，2小时就是两个3千米。" },
        reason: "每小时走的距离是一个单位量，把几个小时的距离合起来，就得到总路程。",
      } } });
    });
    await page.route("**/learning/knowledge-map", route => {
      const body = route.request().postDataJSON();
      if (body.nodeId) { details.push(body.nodeId); return route.fulfill({ json: { detail: { summary: "每一份对应的量。", application: "先弄清楚每小时走的距离。" } } }); }
      mapRequests++;
      return route.fulfill({ contentType: "text/event-stream", body: frame("map.plan", { type: "plan", plan }) + nodes.map(node => frame("map.node", { type: "node", node, edges: edges.filter(e => e.to === node.id) })).join("") + frame("complete", { total: 3 }) });
    });
    await page.addInitScript(data => { if (!sessionStorage.getItem("education-chat-session-v3")) sessionStorage.setItem("education-chat-session-v3", JSON.stringify(data)); }, snapshot);
    await page.goto("http://localhost:3000/");
    await expect(page.locator(".knowledge-connection-pending")).toBeVisible();
    const continueButton = page.getByRole("button", { name: "懂了，继续", exact: true });
    await expect(continueButton).toBeEnabled();
    await page.locator(".chat-scroll").evaluate(node => { node.scrollTop = node.scrollHeight; });
    const beforeConnection = await continueButton.boundingBox();
    releaseConnection();
    const preview = page.getByRole("complementary", { name: "本段知识连接" });
    await expect(preview).toBeVisible();
    await expect.poll(async () => Math.abs((await continueButton.boundingBox()).y - beforeConnection.y)).toBeLessThan(3);
    await page.setViewportSize({ width, height: 900 });
    await expect(preview.getByText("速度与路程", { exact: true })).toBeVisible();
    await expect(preview.getByText("单位量", { exact: true })).toBeVisible();
    await expect(preview.getByText("乘法的意义", { exact: true })).toHaveCount(0);
    await expect(preview.getByText("每小时走的距离是一个单位量，把几个小时的距离合起来，就得到总路程。", { exact: true })).toBeVisible();
    await expect(page.locator('.chat-message-entry').filter({ has: preview })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.getByRole("region", { name: "当前学习任务" }).getByRole("button", { name: "本题知识图谱" }).count()).toBe(0);
    expect(mapRequests).toBe(0); expect(details).toEqual([]);
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/knowledge-map-preview/${width}-entry.png` });
    await preview.getByRole("button", { name: "单位量", exact: true }).click();
    await expect(preview.getByRole("region", { name: "单位量的就地讲解" })).toBeVisible();
    expect(mapRequests).toBe(0); expect(details).toEqual([]);
    await page.screenshot({ path: `outputs/knowledge-map-preview/${width}-inline.png` });
    await preview.getByRole("button", { name: "单位量", exact: true }).click();
    await expect(preview.getByRole("region")).toHaveCount(0);
    await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
    await expect(page.getByText("已全部生成", { exact: true })).toBeVisible();
    expect(mapRequests).toBe(1); expect(details).toEqual([]);
    await page.getByRole("button", { name: "返回对话" }).click();
    await page.setViewportSize({ width, height: 600 });
    await verifyReturnedScroll(page, touch, "first map return");
    // Cached re-entry, canvas interaction and Escape must also release the modal.
    await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
    await expect(page.getByText("已全部生成", { exact: true })).toBeVisible();
    const canvas = await page.locator('.react-flow__pane').boundingBox();
    await page.mouse.move(canvas.x + 30, canvas.y + canvas.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 70, canvas.y + canvas.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press("Escape");
    await verifyReturnedScroll(page, touch, "cached map pan + Escape");
    await page.screenshot({ path: `outputs/knowledge-map-preview/${width}-returned.png` });
    // The existing cached graph can focus a known concept, even if all branches were saved collapsed.
    await page.evaluate(data => {
      const key = `problem-knowledge-map-v2:${data.session.requestId}`;
      const cached = JSON.parse(localStorage.getItem(key)); cached.expanded = []; localStorage.setItem(key, JSON.stringify(cached));
      data.session.flow.stage = "remediation"; data.session.flow.focus = { kind: "node", nodeId: "lesson-1" };
      sessionStorage.setItem("education-chat-session-v3", JSON.stringify(data));
    }, snapshot);
    await page.reload();
    await expect(page.getByRole("button", { name: "本题知识图谱", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
    await expect(page.getByRole("region", { name: "单位量的知识说明" })).toBeVisible();
    await expect.poll(() => details.includes("map-1")).toBe(true);
    expect(mapRequests).toBe(1);
    await expect(page.locator('.react-flow__node[data-id="map-1"]')).toBeVisible();
    await page.screenshot({ path: `outputs/knowledge-map-preview/${width}-focus.png` });
    await page.getByRole("button", { name: "返回对话" }).click();
    await verifyReturnedScroll(page, touch, "map detail return");
    await context.close();
  }
  expect(errors).toEqual([]);
  console.log("PASS: mobile/desktop contextual connection, actual explanation, inline expand/collapse without requests, independent entry, exact map focus through collapsed branches");
} finally { await browser.close(); }
