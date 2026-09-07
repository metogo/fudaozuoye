// Deterministic UI regressions; model quality is exercised separately by the live regression.
import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { MockProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/adapter.js");
const { understandingGate } = require("../functions/learning-api/dist/lib/learning/flow.js");
const adapter = new MockProviderAdapter("doubao");
const session = await adapter.analyzeProblem(await adapter.recognizeProblem("data:image/jpeg;base64,demo"));
session.flow.activeGate = understandingGate();
session.flow.stage = "core_explanation";
const snapshot = { session, stateToken: "test-state-token-".repeat(5), messages: [{ id: "intro", role: "assistant", kind: "assistant", text: "先理解速度与路程之间的关系。\n".repeat(45), status: "complete", createdAt: new Date().toISOString() }] };
const evidence = session.problem.text.slice(0, 200);
const map = { version: 1, overviewOnly: true, rootId: "core", nodes: [
  { id: "core", title: "速度与路程", summary: "速度表示每单位时间走过的路程。", application: "用题目中的时间和路程计算单位速度。", evidence },
  { id: "unit", title: "单位量", summary: "每一份的数量。", application: "先求每小时的路程。", evidence },
  { id: "multiply", title: "乘法的意义", summary: "相同加数求和。", application: "用每小时路程乘时间。", evidence },
  { id: "divide", title: "除法的意义", summary: "把总量平均分。", application: "支撑单位量的计算。", evidence: "" },
], edges: [{ from: "core", to: "unit", kind: "prerequisite", reason: "速度就是单位时间的路程。" }, { from: "core", to: "multiply", kind: "application", reason: "单位速度乘时间得到路程。" }, { from: "unit", to: "divide", kind: "prerequisite", reason: "用总路程除以时间。" }] };
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const cors = { "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "content-type" };
let requests = 0, detailRequests = 0, failNext = true, failDetail = true, hold = false;
await page.route("**/consent", route => route.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] }, headers: cors }));
await page.route("**/learning/knowledge-map", async route => {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const body = route.request().postDataJSON();
  if (body.nodeId) {
    detailRequests++;
    if (failDetail) { failDetail = false; return route.fulfill({ status: 503, json: { error: { message: "详情暂未加载" } }, headers: cors }); }
    return route.fulfill({ json: { detail: { summary: "补充说明：每一份的数量。", application: "补充说明：利用路程与时间求每小时的路程。" } }, headers: cors });
  }
  requests++;
  if (hold) await new Promise(resolve => setTimeout(resolve, 15000));
  if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: { message: "测试中的可恢复错误" } }, headers: cors }); }
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const plan = { rootId: map.rootId, nodes: map.nodes.map(n => ({ id: n.id, parents: map.edges.filter(e => e.to === n.id).map(e => e.from) })) };
  return route.fulfill({ contentType: "text/event-stream", body: frame("map.plan", { type: "plan", plan }) + map.nodes.map(node => frame("map.node", { type: "node", node, edges: map.edges.filter(e => e.to === node.id) })).join("") + frame("complete", { total: map.nodes.length }), headers: cors });
});
await page.addInitScript(data => { if (!sessionStorage.getItem("education-chat-session-v3")) sessionStorage.setItem("education-chat-session-v3", JSON.stringify(data)); }, snapshot);
await mkdir("outputs/knowledge-map", { recursive: true });
try {
  await page.goto("http://localhost:3000/");
  await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
  await expect(page.getByText("测试中的可恢复错误")).toBeVisible();
  await page.getByRole("button", { name: "重试生成" }).click();
  await expect(page.locator('.react-flow__node[data-id="core"]')).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  expect(detailRequests).toBe(0);
  const core = page.locator('.react-flow__node[data-id="core"]');
  const original = await core.boundingBox();
  await page.mouse.move(original.x + original.width / 2, original.y + 30);
  await page.mouse.down();
  await page.mouse.move(original.x + original.width / 2 + 42, original.y - 25, { steps: 14 });
  await page.mouse.up();
  await expect(page.getByRole("region", { name: /的知识说明/ })).toHaveCount(0);
  const moved = await core.boundingBox();
  expect(Math.abs(moved.x - original.x)).toBeGreaterThan(20);
  const movedTransform = await core.evaluate(e => e.style.transform);
  await page.getByRole("button", { name: "返回对话" }).click();
  const chat = page.getByLabel("对话内容", { exact: true });
  const previousScroll = await chat.evaluate(e => e.scrollTop);
  await chat.hover(); await page.mouse.wheel(0, -400);
  await expect.poll(() => chat.evaluate(e => e.scrollTop)).toBeLessThan(previousScroll);
  await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
  await expect.poll(() => core.evaluate(e => e.style.transform)).toBe(movedTransform);
  expect(requests).toBe(2);
  await page.getByRole("button", { name: "收起单位量的基础知识" }).click();
  await page.getByRole("button", { name: "展开单位量的基础知识" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByRole("button", { name: "查看全图" }).click();
  const unit = page.locator('.react-flow__node[data-id="unit"]');
  await unit.click({ position: { x: 50, y: 35 } });
  const detail = page.getByRole("region", { name: "单位量的知识说明" });
  await expect(detail).toBeVisible();
  await page.getByRole("button", { name: "重试说明" }).click();
  await expect(detail.getByText("补充说明：每一份的数量。", { exact: true })).toBeVisible();
  expect(detailRequests).toBe(2);
  await expect.poll(async () => { const n = await unit.boundingBox(), d = await detail.boundingBox(); return n.y + n.height < d.y; }).toBe(true);
  await page.screenshot({ path: "outputs/knowledge-map/mobile-card.png" });
  await page.getByRole("button", { name: "关闭知识卡片" }).click();
  await page.getByRole("button", { name: "查看全图" }).click();
  await unit.click({ position: { x: 50, y: 35 } });
  await expect(detail.getByText("补充说明：每一份的数量。", { exact: true })).toBeVisible();
  expect(detailRequests).toBe(2);
  await page.getByRole("button", { name: "关闭知识卡片" }).click();
  // Actual two-finger touch gesture, independent of desktop mouse dragging.
  const cdp = await context.newCDPSession(page);
  const viewport = page.locator(".react-flow__viewport");
  const beforePinch = await viewport.getAttribute("style");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 155, y: 300, id: 1 }, { x: 235, y: 300, id: 2 }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 155 - i * 5, y: 300, id: 1 }, { x: 235 + i * 5, y: 300, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(viewport).not.toHaveAttribute("style", beforePinch);
  // No transient measurement loss may persist after repeated controlled updates.
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "整理", exact: true }).click();
    await expect(core).toBeVisible();
    await page.getByRole("button", { name: "收起单位量的基础知识" }).click();
    await page.getByRole("button", { name: "展开单位量的基础知识" }).click();
    await expect.poll(() => page.locator(".react-flow__node").evaluateAll(ns => ns.every(n => getComputedStyle(n).visibility === "visible"))).toBe(true);
    const box = await core.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + 50, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => page.locator(".react-flow__node").evaluateAll(ns => ns.every(n => getComputedStyle(n).visibility === "visible"))).toBe(true);
  }
  // Move the entire graph well outside the screen; each recovery button alone works.
  for (const name of ["整理", "查看全图"]) {
    await page.mouse.move(12, 400); await page.mouse.wheel(7000, 7000);
    await expect.poll(async () => (await core.boundingBox()).x).toBeLessThan(-500);
    await page.getByRole("button", { name, exact: true }).click();
    await expect.poll(async () => {
      const n = await core.boundingBox(), c = await page.locator(".react-flow").boundingBox();
      return n.x >= c.x && n.x + n.width <= c.x + c.width && n.y >= c.y && n.y + n.height <= c.y + c.height;
    }).toBe(true);
  }
  await page.getByRole("button", { name: "整理", exact: true }).click();
  await page.getByRole("button", { name: "查看全图" }).click();
  await page.screenshot({ path: "outputs/knowledge-map/mobile-map.png" });
  await page.getByRole("button", { name: "返回对话" }).click();
  await page.reload();
  await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  expect(requests).toBe(2);
  // A malformed local layout must not crash the graph.
  await page.getByRole("button", { name: "返回对话" }).click();
  await page.evaluate(() => { for (const key of Object.keys(localStorage).filter(k => k.startsWith("problem-knowledge-map-v2:"))) { const value = JSON.parse(localStorage.getItem(key)); value.positions = { core: { x: "oops", y: null } }; value.expanded = "damaged"; localStorage.setItem(key, JSON.stringify(value)); } });
  await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
  await expect(core).toBeVisible();
  await page.getByRole("button", { name: "返回对话" }).click();
  // Closing in flight must not reopen the page or block scrolling.
  await page.evaluate(() => { for (const key of Object.keys(localStorage).filter(k => k.startsWith("problem-knowledge-map-v2:"))) localStorage.removeItem(key); });
  hold = true;
  await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
  await expect(page.getByText("正在梳理本题知识")).toBeVisible();
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect(page.getByLabel("可拖拽的知识图谱")).toBeVisible();
  await expect(page.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  await page.screenshot({ path: "outputs/knowledge-map/planning-canvas.png" });
  await page.setViewportSize({ width: 320, height: 700 });
  const titleBox = await page.getByRole("heading", { name: "本题知识图谱", exact: true }).boundingBox();
  const backBox = await page.getByRole("button", { name: "返回对话" }).boundingBox();
  expect(titleBox.x).toBeGreaterThan(backBox.x + backBox.width);
  expect(Math.abs(titleBox.x + titleBox.width / 2 - 160)).toBeLessThan(2);
  await page.getByRole("button", { name: "返回对话" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("education-chat-session-v3")));
  expect(stored.session.flow.activeGate.id).toBe(session.flow.activeGate.id);
  expect(stored.session.evidence).toEqual(session.evidence);
  expect(errors).toEqual([]);
  console.log("PASS: error/retry, drag without click, persistence/reload, branch expansion, card visibility, pinch zoom, arrange, cancel, chat scrolling and unchanged learning gate");
} catch (error) { await page.screenshot({ path: "outputs/knowledge-map/ui-failure.png" }); console.error(error); throw error; }
finally { await context.close(); await browser.close(); }
