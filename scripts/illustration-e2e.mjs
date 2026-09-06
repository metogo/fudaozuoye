import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { analyzeMock, recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const { understandingGate } = require("../functions/learning-api/dist/lib/learning/flow.js");
const { toClientState } = require("../functions/learning-api/dist/lib/learning/server-state.js");
const { getProviderConfig } = require("../functions/learning-api/dist/lib/learning/providers/config.js");
const origin = process.env.ILLUSTRATION_APP_ORIGIN || "http://localhost:3000";
const imagePath = process.env.ILLUSTRATION_IMAGE_PATH;
const freshInput = !!imagePath || process.env.ILLUSTRATION_FRESH_INPUT === "true";
const output = process.env.ILLUSTRATION_OUTPUT_DIR || (freshInput ? "outputs/illustration-e2e-fresh" : "outputs/illustration-e2e");
const revision = createHash("sha256");
for (const path of ["package-lock.json", "lib/learning/teaching-program.ts", "lib/learning/teaching-audit.ts", "lib/learning/teaching-verifier.ts", "lib/learning/teaching-worker.ts", "lib/learning/providers/general-teaching.ts", "lib/learning/providers/adapter.ts", "lib/learning/teaching-scene.ts", "lib/learning/http/turn.ts", "components/learning-illustration.tsx", "components/teaching-scene.tsx", "components/education-chat-app.tsx", "scripts/illustration-e2e.mjs"]) revision.update(path).update(await readFile(path));
const buildId = revision.digest("hex");
const cases = [
  ["rectangle", "一个长方形菜园，长18米，宽12米。如果长增加4米，宽不变。新菜园的周长是多少米？面积比原来增加多少平方米？", "68米，48平方米"],
  ["groups", "每盒有6支铅笔，4盒一共有多少支？", "24支"],
  ["sharing", "24本书平均分给6人，每人多少本？", "4本"],
  ["rate", "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", "300千米"],
  ["comparison", "小明有12本书，小红有8本书，两人相差多少本？", "4本"],
  ["fraction", "有24个苹果，其中的3/4是多少个？", "18个"],
  ["quadratic", "已知关于x的一元二次方程x^2-6x+k=0有两个实数根。(1)求实数k的取值范围；(2)若两根x1,x2满足x1^2+x2^2=24，求k；(3)在(2)条件下，以两根为直角三角形两条直角边长，求斜边长。", "k≤9；k=6；斜边2√6"],
  ["geometry", "直角三角形ABC，∠C=90°，AC=3，BC=4，求斜边AB及面积。", "AB=5，面积6"],
  ["physics", "一个质量2kg的物体在光滑水平面受到6N恒力，从静止开始运动4s，求加速度、末速度和位移。", "加速度3m/s²，末速度12m/s，位移24m"],
  ["chemistry", "氢气与氧气反应生成水。写出配平的化学方程式，并计算4g氢气完全反应需要多少克氧气，生成多少克水。相对原子质量H=1，O=16。", "2H2+O2=2H2O，需要32g氧气，生成36g水"],
];
await mkdir(output, { recursive: true });
// npm's preceding function build triggers the dev watcher's debounced restart.
// Let it settle before opening the first real recognition stream.
await new Promise((resolve) => setTimeout(resolve, 3000));
const browser = await chromium.launch({ headless: true, ...(process.env.ILLUSTRATION_BROWSER_CHANNEL ? { channel: process.env.ILLUSTRATION_BROWSER_CHANNEL } : {}) });
const results = [];
try {
  for (const [template, text, answer] of cases) {
    if (process.env.ILLUSTRATION_CASES && !process.env.ILLUSTRATION_CASES.split(",").includes(template)) continue;
    if (imagePath && !process.env.ILLUSTRATION_CASES && template !== "quadratic") continue;
    let caseContext;
    try {
    // Seed an already-solved session to isolate illustration quality from OCR/solution quality.
    const subject = ["physics", "chemistry"].includes(template) ? template : "math";
    const band = template === "physics" ? "senior" : ["quadratic", "geometry", "chemistry"].includes(template) ? "junior" : "primary";
    const base = analyzeMock(recognizeMock(subject, band), "doubao");
    const config = getProviderConfig("doubao");
    const session = {
      ...base, requestId: `illustration-e2e-${template}-${Date.now()}`, modelId: config.mock ? base.modelId : config.modelId, mode: config.mock ? "demo" : "live",
      problem: { ...base.problem, text, subject, gradeBand: band, learnerBand: band, visualContext: undefined },
      nodes: base.nodes.map((node) => node.id === base.rootNodeId ? { ...node, check: { ...node.check, prompt: text, answer, explanation: `根据题目条件计算，${answer}。` } } : node),
      flow: { ...base.flow, stage: "core_explanation", activeGate: understandingGate("核心思路听懂了吗？") },
    };
    const stored = { ...toClientState(session), messages: [{ id: "problem", role: "user", text }], reasoningLevel: "light" };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    caseContext = context;
    const page = await context.newPage();
    await page.addInitScript(() => {
      const original = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (String(args[0]).includes("/learning/")) void response.clone().text().then(body => {
          for (const block of body.split("\n\n")) {
            const data = block.match(/^data: (.+)$/m)?.[1];
            if (!data) continue;
            if (block.startsWith("event: recognized\n")) window.__illustrationInput = JSON.parse(data).text;
            if (block.startsWith("event: illustration.complete\n")) {
              const { title, frames, frameCount, generationMetrics } = JSON.parse(data);
              // Deliberately exclude receipts, state tokens and provider config.
              window.__illustrationEvidence = { title, frames, frameCount, generationMetrics };
            }
          }
        }).catch(() => {});
        return response;
      };
    });
    if (!freshInput) await page.addInitScript((state) => sessionStorage.setItem("education-chat-session-v3", JSON.stringify(state)), stored);
    let generations = 0;
    let generationMetrics;
    let firstFrameMs;
    let start;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", async response => {
      if (!response.url().includes("/learning/turn")) return;
      try {
        const body = await response.text();
        const block = body.split("\n\n").find(item => item.startsWith("event: illustration.complete\n"));
        if (block) generationMetrics = JSON.parse(block.match(/^data: (.+)$/m)[1]).generationMetrics;
      } catch { /* Never persist raw responses or encrypted session state. */ }
    });
    if (freshInput) page.on("response", async (response) => {
      if (!response.url().includes("/learning/")) return;
      try {
        const body = await response.text();
        const failure = body.split("\n\n").find((block) => block.startsWith("event: error\n"));
        process.stdout.write(`${template}: ${new URL(response.url()).pathname} ${response.status()}${failure ? ` ${failure.slice(0, 350)}` : " finished"}\n`);
      } catch { /* Some streamed responses are not retained by Chromium; UI assertions are authoritative. */ }
    });
    page.on("request", (request) => { if (request.url().includes("/learning/turn") && request.postData()?.includes('"view_illustration"')) generations++; });
    await page.goto(origin);
    if (freshInput) {
      if (imagePath) {
        await page.locator('input[type="file"][accept="image/*"]:not([capture]):not([disabled])').first().setInputFiles(imagePath);
        const nw = page.getByRole("button", { name: "拖动左上角调整裁剪范围" });
        const se = page.getByRole("button", { name: "拖动右下角调整裁剪范围" });
        for (let i = 0; i < 10; i++) {
          await nw.press("Shift+ArrowLeft"); await nw.press("Shift+ArrowUp");
          await se.press("Shift+ArrowRight"); await se.press("Shift+ArrowDown");
        }
        await page.screenshot({ path: `${output}/${template}-input.png`, fullPage: true });
        await page.getByRole("button", { name: "裁剪并识别", exact: true }).click();
      }
      else {
        await page.getByRole("textbox", { name: "输入题目或问题" }).fill(text);
        await page.getByRole("button", { name: "发送", exact: true }).click();
      }
      process.stdout.write(`${template}: submitted fresh question\n`);
    }
    const button = page.getByRole("button", { name: "插画演示", exact: true });
    try {
      await button.waitFor({ timeout: 180_000 });
    } catch (error) {
      await page.screenshot({ path: `${output}/${template}-intake-failure.png`, fullPage: true });
      process.stderr.write((await page.locator("body").innerText()).slice(-1500));
      results.push({ template, passed: false, stage: "intake", error: String(error).slice(0, 500) });
      throw error;
    }
    await page.waitForFunction(() => !document.querySelector('button[disabled]')?.textContent?.includes("插画演示"));
    if (imagePath && template === "quadratic") {
      const recognized = await page.evaluate(() => window.__illustrationInput || "");
      assert(recognized.includes("24") && recognized.includes("斜边") && recognized.includes("k"), "OCR must retain all three subquestions");
    }
    start = Date.now();
    await button.click();
    process.stdout.write(`${template}: illustration requested\n`);
    const dialog = page.getByRole("dialog", { name: "原题分步插画演示" });
    try {
      await Promise.race([
        dialog.getByRole("navigation", { name: "插画步骤" }).waitFor({ timeout: freshInput ? 180_000 : 40_000 }),
        dialog.getByRole("alert").waitFor({ timeout: freshInput ? 180_000 : 40_000 }).then(async () => { throw Error(await dialog.getByRole("alert").innerText()); }),
      ]);
      firstFrameMs = Date.now() - start;
      await dialog.getByRole("button", { name: "重新生成", exact: true }).waitFor();
    } catch (error) {
      await page.screenshot({ path: `${output}/${template}-failure.png`, fullPage: true });
      process.stderr.write((await dialog.innerText()).slice(-1000));
      results.push({ template, passed: false, stage: "illustration", elapsedMs: Date.now() - start, error: (await dialog.innerText()).slice(-1000) });
      throw error;
    }
    const elapsedMs = Date.now() - start;
    await page.waitForFunction(() => !!window.__illustrationEvidence, undefined, { timeout: 5000 });
    const evidence = await page.evaluate(() => window.__illustrationEvidence);
    generationMetrics = evidence.generationMetrics;
    await writeFile(`${output}/${template}-lesson.json`, JSON.stringify(evidence, null, 2));
    const steps = dialog.getByRole("navigation", { name: "插画步骤" }).getByRole("button").filter({ hasText: /^\d+\./ });
    const count = await steps.count();
    assert(count >= 1 && count <= 10);
    const stageKeys = [];
    for (let i = 0; i < count; i++) {
      await steps.nth(i).click();
      await dialog.locator("main").evaluate(element => { element.scrollTop = 0; });
      const drawing = dialog.locator("[data-teaching-template]");
      if (await drawing.count()) {
        await drawing.locator("svg").waitFor();
        await page.waitForFunction(() => {
          const host = document.querySelector("[data-teaching-template] > div");
          return host && getComputedStyle(host).visibility === "visible";
        });
        stageKeys.push(await drawing.getAttribute("data-teaching-stages"));
      } else stageKeys.push(`formula-${i}`);
      if (session.mode === "live") assert(evidence.frames[i].verification?.length > 0, "background verification must be retained");
      assert.equal(await dialog.getByLabel("核验范围").count(), 0, "internal checks must not be student-facing");
      assert.equal(await dialog.getByRole("button", { name: /想一想|试一试|我来试试|懂了/ }).count(), 0, "illustration is explanation-only");
      // These regression problems contain no learner prompts; inspect content too,
      // since a model can put an exercise in prose or a diagram without a button.
      const learnerPrompt = /想一想|试一试|你来算|请你计算|请你作答|听懂了吗|等你回答/;
      const f = evidence.frames[i];
      const studentContent = [f.title, f.calculation, ...(f.scene?.shapes ?? []).filter(s => s.kind === "label").map(s => s.text)].join("\n");
      assert(!learnerPrompt.test(studentContent), "generated content must explain, not ask the learner to respond");
      assert(!learnerPrompt.test(await dialog.locator("article").innerText()), "visible explanation must not contain learner prompts");
      assert.equal(await dialog.locator(".katex-error").count(), 0, "math rendering must not contain errors");
      await page.screenshot({ path: `${output}/${template}-${i + 1}.png`, fullPage: true });
    }
    assert.equal(new Set(stageKeys).size, count);
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: "完整讲解已经准备好" }).waitFor({ timeout: 15_000 });
    const reopen = Date.now();
    await button.click();
    await dialog.getByRole("navigation", { name: "插画步骤" }).waitFor();
    assert.equal(generations, 1, "reopening must reuse the same result");
    assert.deepEqual(errors, []);
    results.push({ template, steps: count, firstFrameMs, elapsedMs, generationMetrics, reopenMs: Date.now() - reopen, generations, mode: session.mode, imageInput: !!imagePath, passed: true });
    process.stdout.write(`${template}: ${count} steps, ${elapsedMs} ms, cached reopen passed\n`);
    } catch (error) {
      if (results.at(-1)?.template !== template) results.push({ template, passed: false, stage: "render-or-cache", error: String(error).slice(0, 500) });
      process.stderr.write(`${template}: failed; continuing remaining cases\n`);
      process.exitCode = 1;
    } finally { await caseContext?.close(); }
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ buildId, visualReview: "Not automated; passed means workflow assertions, not mathematical or visual correctness.", note: freshInput ? "Fresh text/image browser input; actual recognition, solution, model protocol, worker verification, rendering and cache. UI timings start at illustration click and may include pending solution preparation; generationMetrics excludes that preparation." : "Already-solved fixtures; actual HTTP, configured model, isolated math worker, rendering and UI cache. No topic-specific code.", results }, null, 2));
}
