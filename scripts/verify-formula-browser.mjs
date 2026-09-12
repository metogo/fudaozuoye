import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium, expect } from "@playwright/test";

// Deterministic browser regression: no production requests or shared counters.
const require = createRequire(import.meta.url);
const { MockProviderAdapter } = require("../functions/learning-api/dist/lib/learning/providers/adapter.js");
const { understandingGate } = require("../functions/learning-api/dist/lib/learning/flow.js");
const { parseJsonObject } = require("../functions/learning-api/dist/lib/learning/providers/model-support.js");
const adapter = new MockProviderAdapter("doubao");
const session = await adapter.analyzeProblem(await adapter.recognizeProblem("data:image/jpeg;base64,demo"));
session.problem.text = parseJsonObject(String.raw`{"text":"已知面积为 \frac{3\sqrt{3}}{2}，求边长。A. 3\sqrt{3} B. 2\sqrt{3} C. 3 D. \sqrt{3}"}`).text;
session.flow.activeGate = understandingGate();
session.flow.stage = "core_explanation";
const formula = String.raw`\frac{3\sqrt{3}}{2}`;
const lesson = `先看面积条件 $${formula}$，再使用面积公式。\n\n` + String.raw`角度为 $\angle ACB=90^{\circ}$。力与加速度满足 $\vec{F}=m\vec{a}$。化学式为 $\mathrm{H_2O}$。` + "\n\n继续阅读，先梳理题目已知条件，再找它们之间的联系。".repeat(12);
const snapshot = { session, stateToken: "browser-test-state-".repeat(8), messages: [{ id: "formula-intro", role: "assistant", kind: "assistant", text: lesson + "\n\n### 易错题型\n不要把两条边的乘积直接当作三角形面积。\n\n### 学习小结\n先明确条件再计算。", status: "complete", createdAt: new Date().toISOString() }] };
const concepts = ["三角恒等变换", "三角形面积"].map((title, i) => ({ id: i ? "area" : "core", title, summary: "", application: "", evidence: session.problem.text }));
const edge = { from: "core", to: "area", kind: "prerequisite", reason: `本题面积为 $${formula}$。` };
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const events = frame("map.plan", { type: "plan", plan: { rootId: "core", nodes: [{ id: "core", parents: [] }, { id: "area", parents: ["core"] }] } })
  + concepts.map((node, i) => frame("map.node", { type: "node", node, edges: i ? [edge] : [] })).join("") + frame("complete", { total: 2 });
const root = resolve("out");
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".txt": "text/plain" };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://local").pathname;
  const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(root + "/")) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" }); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  await mkdir("outputs/formula-browser", { recursive: true });
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, permissions: ["clipboard-read", "clipboard-write"], reducedMotion: "reduce" });
    const page = await context.newPage();
    let practiceCount = 0, detailCount = 0;
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/consent")) return route.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] } });
      if (path.endsWith("/statistics")) return route.fulfill({ json: { total: 10000 } });
      if (path.endsWith("/learning/node-practice")) {
        practiceCount++;
        if (practiceCount === 3) return route.fulfill({ status: 503, json: { error: { message: "test unavailable" } } });
        return route.fulfill({ json: { practice: { question: practiceCount === 1 ? "底边不变，高变为两倍，三角形面积怎样变化？" : "底和高都变为两倍，面积怎样变化？", options: ["两倍", "四倍", "不变"], correctIndex: practiceCount === 1 ? 0 : 1, explanation: "由 $S=\\frac{1}{2}ah$ 比较面积。", connection: "回到原题，面积条件可用于建立边与高之间的关系；练习中的变化不是原题新增条件。" } } });
      }
      if (path.endsWith("/learning/knowledge-map")) {
        if (route.request().postDataJSON()?.nodeId) {
          detailCount++;
          if (detailCount === 1) return route.fulfill({ status: 503, body: "synthetic detail unavailable" });
          return route.fulfill({ contentType: "text/event-stream", body: `event: detail.summary\ndata: ${JSON.stringify({ summary: `面积条件为 $${formula}$。` })}\n\nevent: complete\ndata: ${JSON.stringify({ detail: { summary: `面积条件为 $${formula}$。`, application: "根据面积公式建立边角关系。" } })}\n\n` });
        }
        return route.fulfill({ contentType: "text/event-stream", body: events });
      }
      if (route.request().url().startsWith(origin) && !path.startsWith("/api/")) return route.continue();
      return route.abort();
    });
    await page.addInitScript(data => sessionStorage.setItem("education-chat-session-v3", JSON.stringify(data)), snapshot);
    await page.goto(origin);
    const prose = page.locator(".copyable-learning-text__prose").first();
    await expect(prose.locator(".katex")).toHaveCount(4);
    const header = page.locator(".chat-header"), scrollArea = page.locator(".chat-scroll");
    await expect.poll(() => header.evaluate(el => getComputedStyle(el).position)).toBe("absolute");
    await scrollArea.evaluate(el => { el.scrollTop = 0; });
    await expect(header).toHaveAttribute("data-reading-hidden", "false");
    const beforeScrollBox = await scrollArea.boundingBox();
    await scrollArea.hover({ position: { x: 30, y: 300 } });
    await page.mouse.wheel(0, 360);
    await expect(header).toHaveAttribute("data-reading-hidden", "true");
    await expect.poll(() => header.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThan(0);
    assert.deepEqual(await scrollArea.boundingBox(), beforeScrollBox, "Header must not resize the reading viewport");
    await page.screenshot({ path: `outputs/formula-browser/${width}-header-hidden.png` });
    await page.mouse.wheel(0, -100);
    await expect(header).toHaveAttribute("data-reading-hidden", "false");
    await scrollArea.evaluate(el => { el.scrollTop = 0; });
    await page.getByRole("button", { name: "复制讲解", exact: true }).first().click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\(\(3√\(3\)\) \/ \(2\)\)/);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("不要把两条边的乘积直接当作三角形面积");
    const pitfalls = prose.locator("details.learning-pitfalls"), toggle = pitfalls.locator("summary");
    await expect(pitfalls).not.toHaveAttribute("open");
    await expect(pitfalls.locator(".learning-pitfalls-body")).not.toBeVisible();
    await toggle.click();
    await expect(pitfalls.locator(".learning-pitfalls-body")).toBeVisible();
    await toggle.click();
    await expect(pitfalls.locator(".learning-pitfalls-body")).not.toBeVisible();
    await page.screenshot({ path: `outputs/formula-browser/${width}-pitfalls-collapsed.png` });
    await prose.locator("p").first().scrollIntoViewIfNeeded();
    // Finish the test's preparatory scroll before tapping.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await prose.locator("p").first().click({ position: { x: 20, y: 12 } });
    await page.getByRole("button", { name: "针对选中文字问一问", exact: true }).click();
    const quote = page.getByLabel("正在引用的文字", { exact: true });
    await expect(quote.locator("annotation")).toHaveText(formula);
    await page.screenshot({ path: `outputs/formula-browser/${width}-quote.png` });
    await expect(quote).toBeVisible();
    await page.mouse.move(20, 200);
    await page.mouse.wheel(0, 80);
    await expect(quote).toHaveCount(0);
    await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("已全部生成", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "收起三角恒等变换的基础知识", exact: true }).click();
    await expect(page.locator('.react-flow__node[data-id="area"]')).toHaveCount(0);
    await dialog.getByRole("button", { name: "展开三角恒等变换的基础知识", exact: true }).click();
    await expect(page.locator('.react-flow__node[data-id="area"]')).toBeVisible();
    const rootNode = page.locator('.react-flow__node[data-id="core"]');
    const rootBox = await rootNode.boundingBox();
    const rootTransform = await rootNode.getAttribute("style");
    await page.mouse.move(rootBox.x + 30, rootBox.y + 25);
    await page.mouse.down();
    await page.mouse.move(rootBox.x + 70, rootBox.y + 45, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => rootNode.getAttribute("style")).not.toBe(rootTransform);
    await expect(page.getByRole("region", { name: "三角恒等变换的知识说明" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "查看全图", exact: true }).click();
    await page.locator('.react-flow__node[data-id="core"]').click({ position: { x: 40, y: 36 } });
    const card = page.getByRole("region", { name: "三角恒等变换的知识说明" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "重试说明", exact: true })).toBeVisible();
    await expect(dialog.getByText("已全部生成", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "重试说明", exact: true }).click();
    await expect(card.getByText("知识讲解已就绪", { exact: true })).toBeVisible();
    assert.equal(detailCount, 2);
    await expect(card.locator("blockquote .katex")).toHaveCount(4);
    assert.equal(await card.locator(".learning-math-error,.katex-error").count(), 0);
    assert.ok((await card.locator("annotation").allTextContents()).includes(formula));
    await card.locator("blockquote").scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `outputs/formula-browser/${width}-card.png` });
    await card.getByRole("button", { name: "练一道", exact: true }).click();
    const practice = card.getByRole("region", { name: "知识点小练习", exact: true });
    await expect(practice.getByRole("radio")).toHaveCount(3);
    await practice.getByRole("radio").first().check();
    await practice.getByRole("button", { name: "核对思路", exact: true }).click();
    await expect(practice.getByText("带回原题", { exact: true })).toBeVisible();
    await practice.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/formula-browser/${width}-practice.png` });
    await practice.getByRole("button", { name: "换一道练习", exact: true }).click();
    await expect(practice.getByText("底和高都变为两倍，面积怎样变化？", { exact: true })).toBeVisible();
    await expect(practice.getByText("带回原题", { exact: true })).toHaveCount(0);
    await practice.getByRole("radio").first().check();
    await practice.getByRole("button", { name: "核对思路", exact: true }).click();
    await expect(practice.getByText("再看这一步", { exact: true })).toBeVisible();
    await practice.getByRole("button", { name: "换一道练习", exact: true }).click();
    await expect(practice.getByRole("alert")).toBeVisible();
    await expect(practice.getByText("底和高都变为两倍，面积怎样变化？", { exact: true })).toBeVisible();
    await expect(practice.getByText("再看这一步", { exact: true })).toBeVisible();
    await practice.getByRole("button", { name: "重试练习", exact: true }).click();
    await expect(practice.getByRole("alert")).toHaveCount(0);
    await expect(practice.getByText("带回原题", { exact: true })).toHaveCount(0);
    await practice.getByRole("button", { name: "收起练习", exact: true }).click();
    await page.getByRole("button", { name: "关闭知识卡片", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出图片", exact: true }).click();
    const file = await download;
    assert.equal(await file.failure(), null);
    await file.saveAs(`outputs/formula-browser/${width}-map.png`);
    await page.getByRole("button", { name: "返回对话", exact: true }).click();
    await expect(prose).toBeVisible();
    await scrollArea.evaluate(el => { el.scrollTop = 0; });
    await scrollArea.hover({ position: { x: 20, y: 300 } });
    await page.mouse.wheel(0, 120);
    await expect.poll(() => scrollArea.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, readingHeader: true, formulas: 4, clipboard: true, quote: true, card: true, detailFailureRetry: true, practice: true, wrongAnswer: true, refresh: true, retryPreservesPractice: true, practiceRetry: true, mapDrag: true, mapCollapse: true, scrollRestored: true, export: true, errors: 0 }));
    await context.close();
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
