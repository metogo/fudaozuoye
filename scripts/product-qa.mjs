// Production UI + real local HTTP handlers; only the model and statistics are isolated.
// Never load .env.local here or forward a request to a live API.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

process.env.AI_MOCK_MODE = "true";
process.env.NODE_ENV = "test";
process.env.SESSION_STATE_SECRET = "isolated-product-qa-only-32-characters";
const require = createRequire(import.meta.url);
const { main: api } = require("../functions/learning-api/dist/functions/learning-api/src/index.js");
const { recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const root = resolve("out");
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".txt": "text/plain" };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path.startsWith("/api/")) return api.emit("request", req, res);
  const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
  if (!file.startsWith(root + "/")) return res.writeHead(403).end();
  try { res.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, "localhost", done));
const origin = `http://localhost:${server.address().port}`;
process.env.PUBLIC_APP_ORIGIN = origin;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const cases = [["math", "primary"], ["math", "senior"], ["physics", "junior"], ["chemistry", "senior"], ["biology", "junior"], ["chinese", "primary"], ["english", "junior"], ["history", "senior"], ["geography", "junior"], ["politics", "senior"]];
try {
  await mkdir("outputs/product-qa", { recursive: true });
  for (const [index, [subject, band]] of cases.entries()) {
    console.log(`START ${subject}/${band}`);
    const width = index % 2 ? 1280 : 390;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [], calls = [];
    let entries = 0, interruptNext = false;
    let failMap = index === 1;
    let recoveringPhoto = false;
    const problem = recognizeMock(subject, band);
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.endsWith("/statistics")) {
        if (request.method() === "POST") entries++;
        return route.fulfill({ json: { total: 10000 + entries, counted: true } });
      }
      if (url.pathname.startsWith("/api/")) {
        calls.push(url.pathname);
        if (failMap && url.pathname.endsWith("/knowledge-map")) {
          failMap = false;
          return route.fulfill({ status: 503, body: "synthetic map unavailable" });
        }
        if (index === 1 && url.pathname.endsWith("/knowledge-map")) {
          // The demo adapter intentionally has no map generator. Supply the
          // model's deterministic stream, not a fake successful UI state.
          const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          const nodes = ["二次函数顶点坐标", "配方法"].map((title, i) => ({ id: `qa-${i}`, title, summary: "", application: "", evidence: problem.text }));
          const plan = { rootId: "qa-0", nodes: [{ id: "qa-0", parents: [] }, { id: "qa-1", parents: ["qa-0"] }] };
          const edge = { from: "qa-0", to: "qa-1", kind: "prerequisite", reason: "将二次函数配方后读出顶点坐标。" };
          const body = frame("map.plan", { type: "plan", plan }) + nodes.map((node, i) => frame("map.node", { type: "node", node, edges: i ? [edge] : [] })).join("") + frame("complete", { total: 2 });
          return route.fulfill({ contentType: "text/event-stream", body });
        }
        if (recoveringPhoto && url.pathname.endsWith("/analyze") && /name="stage"\r\n\r\nrecognize\r\n/.test(request.postData() ?? "")) {
          return route.fulfill({ contentType: "text/event-stream", body: `event: recognized\ndata: ${JSON.stringify(problem)}\n\nevent: complete\ndata: {}\n\n` });
        }
        if (interruptNext && url.pathname.endsWith("/turn")) {
          interruptNext = false;
          return route.fulfill({ contentType: "text/event-stream", body: 'event: message.delta\ndata: {"text":"中断中的部分正文"}\n\n' });
        }
        const response = await route.fetch({ url: origin + url.pathname, headers: { ...request.headers(), origin }, timeout: 30000 });
        return route.fulfill({ response });
      }
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    await page.goto(origin);
    console.log("  home");
    await expect(page.getByRole("heading", { name: "Hey，小逗号陪你一起解题。" })).toBeVisible();
    await expect(page.getByLabel("从相册选择题目")).toBeEnabled();
    if (index === 0) {
      const draft = page.getByRole("textbox");
      await draft.fill("保留草稿");
      await page.getByRole("button", { name: "English interface" }).click();
      await expect(draft).toHaveValue("保留草稿");
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await page.getByRole("button", { name: "中文界面" }).click();
      await page.getByRole("button", { name: "白板写题", exact: true }).click();
      await expect(page.getByRole("button", { name: "识别这道题" })).toBeVisible();
      await page.getByRole("button", { name: "取消", exact: true }).click();
    }
    await page.getByRole("textbox").fill(problem.text);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    console.log("  submitted");
    const body = page.locator(".copyable-learning-text__prose");
    await expect(body.first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("button", { name: "看完整讲解", exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("button", { name: "English interface" })).toHaveCount(0);
    if (index === 1) {
      await expect(page.getByRole("button", { name: "重试生成", exact: true })).toBeVisible();
      await expect(page.getByRole("textbox")).toBeEnabled();
      await expect(body.first()).toBeVisible();
      await page.getByRole("button", { name: "重试生成", exact: true }).click();
      await expect(page.getByText("已全部生成", { exact: true })).toBeVisible();
    }
    await expect.poll(() => entries).toBe(1);
    await page.getByRole("button", { name: "查看原题", exact: true }).click();
    await expect(page.locator(".original-question")).toContainText(problem.text);
    await page.getByRole("button", { name: "收起原题", exact: true }).click();
    const initialCount = await body.count();
    await page.getByRole("textbox").fill("为什么要先看这个条件？");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect(body).toHaveCount(initialCount + 1, { timeout: 30000 });
    await expect(page.getByRole("button", { name: "复制讲解", exact: true }).last()).toBeVisible();
    if (index === 0) {
      interruptNext = true;
      await page.getByRole("textbox").fill("再解释一下");
      await page.getByRole("button", { name: "发送", exact: true }).click();
      const retry = page.getByRole("button", { name: "重试这条消息", exact: true });
      await expect(retry).toBeVisible();
      await page.reload();
      await expect(retry).toBeVisible();
      await retry.click();
      await expect(retry).toHaveCount(0, { timeout: 30000 });
      await page.getByRole("button", { name: "这一步我来做", exact: true }).click();
      const blank = page.getByRole("region", { name: "当前步骤填空" });
      await expect(blank).toBeVisible({ timeout: 30000 });
      await blank.getByRole("button", { name: "也可以用键盘填写 / 修改" }).click();
      await blank.getByRole("textbox", { name: "修改填空答案" }).fill("先试写，不自动提交");
      const count = calls.length;
      await expect(blank.getByRole("textbox")).toHaveValue("先试写，不自动提交");
      assert.equal(calls.length, count);
      await blank.getByRole("button", { name: "显示答案", exact: true }).click();
      await expect(blank.getByRole("button", { name: "看懂了，继续", exact: true })).toBeEnabled({ timeout: 30000 });
      await blank.getByRole("button", { name: "看懂了，继续", exact: true }).click();
      await expect(page.getByRole("button", { name: "看完整讲解", exact: true })).toBeVisible({ timeout: 30000 });
    }
    await page.getByRole("button", { name: "看完整讲解", exact: true }).click();
    await expect(page.getByText("解题思路", { exact: true }).last()).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("button", { name: "复制讲解", exact: true }).last()).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: `outputs/product-qa/${subject}-${band}.png` });
    assert.equal(await page.locator(".katex-error").count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator(".chat-scroll").evaluate(el => { el.scrollTop = 0; });
    if (index === 0) {
      await page.getByRole("button", { name: "导出 PDF", exact: true }).click();
      const preview = page.getByRole("dialog", { name: "导出对话 PDF" });
      await expect(preview.getByRole("button", { name: "保存为 PDF" })).toBeEnabled();
      await expect(preview.getByLabel("完整对话导出内容")).toContainText("解题思路");
      await page.screenshot({ path: "outputs/product-qa/export-preview.png" });
      await preview.getByRole("button", { name: "关闭导出预览" }).click();
      const image = `data:image/png;base64,${(await readFile("tests/fixtures/synthetic-homework.png")).toString("base64")}`;
      const damaged = await page.evaluate(image => {
        const saved = JSON.parse(sessionStorage.getItem("education-chat-session-v3"));
        saved.session.problem.text = "损坏面积 rac{3 oot{3}{}}{2}";
        saved.messages[0].imageUrl = image;
        return saved;
      }, image);
      // Seed before hydration: pagehide correctly flushes the current healthy
      // snapshot, so mutating storage before reload would not model legacy data.
      await page.addInitScript(saved => {
        if (sessionStorage.getItem("qa-legacy-seeded")) return;
        sessionStorage.setItem("education-chat-session-v3", JSON.stringify(saved));
        sessionStorage.setItem("qa-legacy-seeded", "yes");
      }, damaged);
      await page.reload();
      const repair = page.getByRole("button", { name: "用原图重新识别" });
      await repair.click();
      await page.getByRole("button", { name: "确认重新识别", exact: true }).click();
      await expect(page.getByRole("button", { name: "裁剪并识别" })).toBeEnabled();
      await page.locator(".cropper-panel").getByRole("button", { name: "取消" }).click();
      await expect(page.getByText("解题思路", { exact: true }).last()).toBeAttached();
      recoveringPhoto = true;
      await page.getByRole("button", { name: "确认重新识别", exact: true }).click();
      await page.getByRole("button", { name: "裁剪并识别" }).click();
      await expect(page.getByRole("button", { name: "看完整讲解", exact: true })).toBeVisible({ timeout: 30000 });
      await expect(repair).toHaveCount(0);
      await expect(page.locator(".original-question").getByRole("button")).toContainText("查看原题");
      assert.equal(entries, 1, "repair/retry/reload must not count as a new question");
      await page.screenshot({ path: "outputs/product-qa/recovered-original.png" });
      await page.locator(".chat-scroll").evaluate(el => { el.scrollTop = 0; });
    }
    await page.getByRole("button", { name: "开始新题", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hey，小逗号陪你一起解题。" })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ subject, band, width, entries, calls: calls.length, normal: true, ask: true, solution: true, reset: true, errors: 0 }));
    await context.close();
  }
} finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
