import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
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
await mkdir("outputs/knowledge-map-stream", { recursive: true });
const errors = [];
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/consent", route => route.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] }, headers: cors }));
    await page.route("**/learning/knowledge-map", route => route.continue({ url: `http://127.0.0.1:${port}/learning/knowledge-map` }));
    await page.addInitScript(data => sessionStorage.setItem("education-chat-session-v3", JSON.stringify(data)), snapshot);
    await page.goto("http://localhost:3000/");
    live = null;
    await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
    await expect(page.getByLabel("可拖拽的知识图谱")).toBeVisible();
    await expect(page.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    await expect(page.getByRole("timer")).toHaveCount(0);
    await expect.poll(() => Boolean(live)).toBe(true);
    await expect(page.getByText("正在整理本题核心", { exact: true })).toBeVisible();
    await page.screenshot({ path: `outputs/knowledge-map-stream/${width}-planning.png` });
    const send = (name, value) => live.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
    send("map.plan", { type: "plan", plan });
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    send("map.node", nodeEvent(0));
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    const root = page.locator('.react-flow__node[data-id="core"]');
    await expect(root).toBeVisible();
    const initial = await root.getAttribute("style");
    const view = page.locator(".react-flow__viewport");
    const initialViewport = await view.getAttribute("style");
    // An independent later sibling must appear without replacing the earlier pending slot.
    send("map.node", nodeEvent(2));
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    await expect(page.locator('.react-flow__node[data-id="multiply"]')).toHaveCount(1);
    await expect(page.locator('.react-flow__node[data-id="unit"]')).toHaveCount(1);
    await expect(page.getByLabel("正在补充知识点", { exact: true })).toBeVisible();
    await expect(root).toHaveAttribute("style", initial);
    await expect(view).toHaveAttribute("style", initialViewport);
    await page.screenshot({ path: `outputs/knowledge-map-stream/${width}-streaming.png` });
    await root.click({ position: { x: 40, y: 36 } });
    await expect(page.getByRole("region", { name: "速度与路程的知识说明" })).toBeVisible();
    await expect(page.getByText("速度是每单位时间走过的路程。", { exact: true })).toBeVisible();
    const beforeDetails = details;
    send("map.node", nodeEvent(1)); send("map.node", nodeEvent(3));
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
    send("complete", { total: 4 }); live.end();
    await expect(page.getByText("已全部生成", { exact: true })).toBeVisible();
    expect(details).toBe(beforeDetails);
    await page.getByRole("button", { name: "关闭知识卡片" }).click();
    await page.getByRole("button", { name: "查看全图" }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(4);
    const geometry = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll(".react-flow__node")].map(node => ({ id: node.getAttribute("data-id"), box: node.getBoundingClientRect() }));
      const siblings = boxes.filter(n => n.id !== "core");
      const crossings = [];
      for (const path of document.querySelectorAll(".react-flow__edge-path")) {
        const id = path.closest(".react-flow__edge").getAttribute("data-id");
        const endpoints = id.split(":");
        const matrix = path.getScreenCTM();
        for (let i = 1; i < 100; i++) {
          const point = path.getPointAtLength(path.getTotalLength() * i / 100).matrixTransform(matrix);
          for (const node of boxes) {
            const b = node.box;
            if (!endpoints.includes(node.id) && point.x > b.left + 2 && point.x < b.right - 2 && point.y > b.top + 2 && point.y < b.bottom - 2) crossings.push([id, node.id]);
          }
        }
      }
      return { rows: new Set(siblings.map(n => Math.round(n.box.y))).size, crossings };
    });
    expect(geometry).toEqual({ rows: 1, crossings: [] });
    await page.screenshot({ path: `outputs/knowledge-map-stream/${width}-complete.png` });
    // Export is a full snapshot even when the live canvas has collapsed children.
    await page.getByRole("button", { name: "收起速度与路程的基础知识" }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(1);
    const collapsedView = await view.getAttribute("style");
    const downloaded = page.waitForEvent("download", { timeout: 40000 });
    void downloaded.catch(() => undefined);
    await page.getByRole("button", { name: "导出图片", exact: true }).click();
    const download = await downloaded.catch(async error => { console.error(await page.locator(".knowledge-map-export-notice").allTextContents()); throw error; });
    const pngPath = `outputs/knowledge-map-stream/${width}-export.png`;
    await download.saveAs(pngPath);
    expect(await download.failure()).toBe(null);
    const png = await readFile(pngPath);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    const pixels = await page.evaluate(async data => {
      const img = new Image(); img.src = data; await img.decode();
      const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
      let connectorPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - 146) < 3 && Math.abs(pixels[i + 1] - 175) < 3 && Math.abs(pixels[i + 2] - 164) < 3) connectorPixels++;
      return { width: img.width, height: img.height, connectorPixels };
    }, `data:image/png;base64,${png.toString("base64")}`);
    expect(pixels.width).toBeGreaterThan(1000);
    expect(pixels.connectorPixels).toBeGreaterThan(200);
    await expect(page.locator(".knowledge-map-export-sheet")).toHaveCount(0);
    await expect(page.locator(".react-flow__node")).toHaveCount(1);
    await expect(view).toHaveAttribute("style", collapsedView);
    await page.getByRole("button", { name: "展开速度与路程的基础知识" }).click();
    const box = await root.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 30); await page.mouse.down();
    await page.mouse.move(box.x + 82, box.y + 60, { steps: 8 }); await page.mouse.up();
    const dragged = await root.getAttribute("style");
    await page.getByRole("button", { name: "返回对话" }).click();
    await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
    await expect(root).toHaveAttribute("style", dragged);
    // Failed generation retains ready content and truthful count.
    await page.getByRole("button", { name: "返回对话" }).click();
    await page.evaluate(() => localStorage.clear());
    live = null;
    await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
    await expect.poll(() => Boolean(live)).toBe(true);
    send("map.plan", { type: "plan", plan }); send("map.node", nodeEvent(0));
    send("error", { message: "连接中断，已显示的知识点仍可查看。" }); live.end();
    await expect(page.getByText("连接中断，已显示的知识点仍可查看。", { exact: true })).toBeVisible();
    await expect(root).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    await page.screenshot({ path: `outputs/knowledge-map-stream/${width}-interrupted.png` });
    await context.close();
  }
  expect(errors).toEqual([]);
  console.log("PASS: mobile/desktop out-of-order nodes, stable view, complete PNG download including collapsed branches and connectors, live details, cache, interruption");
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
