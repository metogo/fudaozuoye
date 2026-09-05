import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { analyzeMock, recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const { understandingGate } = require("../functions/learning-api/dist/lib/learning/flow.js");
const { toClientState } = require("../functions/learning-api/dist/lib/learning/server-state.js");
const { getProviderConfig } = require("../functions/learning-api/dist/lib/learning/providers/config.js");
const origin = process.env.ILLUSTRATION_APP_ORIGIN || "http://localhost:3000";
const freshInput = process.env.ILLUSTRATION_FRESH_INPUT === "true";
const output = freshInput ? "outputs/illustration-e2e-fresh" : "outputs/illustration-e2e";
const cases = [
  ["rectangle", "一个长方形菜园，长18米，宽12米。如果长增加4米，宽不变。新菜园的周长是多少米？面积比原来增加多少平方米？", "68米，48平方米"],
  ["groups", "每盒有6支铅笔，4盒一共有多少支？", "24支"],
  ["sharing", "24本书平均分给6人，每人多少本？", "4本"],
  ["rate", "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", "300千米"],
  ["comparison", "小明有12本书，小红有8本书，两人相差多少本？", "4本"],
  ["fraction", "有24个苹果，其中的3/4是多少个？", "18个"],
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
    // Seed an already-solved session to isolate illustration quality from OCR/solution quality.
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const config = getProviderConfig("doubao");
    const session = {
      ...base, requestId: `illustration-e2e-${template}-${Date.now()}`, modelId: config.mock ? base.modelId : config.modelId, mode: config.mock ? "demo" : "live",
      problem: { ...base.problem, text, visualContext: undefined },
      nodes: base.nodes.map((node) => node.id === base.rootNodeId ? { ...node, check: { ...node.check, answer, explanation: `根据题目条件计算，${answer}。` } } : node),
      flow: { ...base.flow, stage: "core_explanation", activeGate: understandingGate("核心思路听懂了吗？") },
    };
    const stored = { ...toClientState(session), messages: [{ id: "problem", role: "user", text }], reasoningLevel: "light" };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    if (!freshInput) await page.addInitScript((state) => sessionStorage.setItem("education-chat-session-v3", JSON.stringify(state)), stored);
    let generations = 0;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
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
      await page.getByRole("textbox", { name: "输入题目或问题" }).fill(text);
      await page.getByRole("button", { name: "发送", exact: true }).click();
      process.stdout.write(`${template}: submitted fresh question\n`);
    }
    const button = page.getByRole("button", { name: "插画演示", exact: true });
    try {
      await button.waitFor({ timeout: 180_000 });
    } catch (error) {
      await page.screenshot({ path: `${output}/${template}-intake-failure.png`, fullPage: true });
      process.stderr.write((await page.locator("body").innerText()).slice(-1500));
      throw error;
    }
    await page.waitForFunction(() => !document.querySelector('button[disabled]')?.textContent?.includes("插画演示"));
    const start = Date.now();
    await button.click();
    const dialog = page.getByRole("dialog", { name: "原题分步插画演示" });
    try {
      await dialog.getByRole("heading", { name: "跟着图形，一步一步理解" }).waitFor({ timeout: freshInput ? 180_000 : 25_000 });
    } catch (error) {
      await page.screenshot({ path: `${output}/${template}-failure.png`, fullPage: true });
      process.stderr.write((await dialog.innerText()).slice(-1000));
      throw error;
    }
    const elapsedMs = Date.now() - start;
    const steps = dialog.getByRole("navigation", { name: "插画步骤" }).getByRole("button").filter({ hasText: /^\d+\./ });
    const count = await steps.count();
    assert(count >= 2 && count <= 6);
    const stageKeys = [];
    for (let i = 0; i < count; i++) {
      await steps.nth(i).click();
      const drawing = dialog.locator(`[data-teaching-template="${template}"]`);
      await drawing.locator("svg").waitFor();
      await page.waitForFunction(() => {
        const host = document.querySelector("[data-teaching-template] > div");
        return host && getComputedStyle(host).visibility === "visible";
      });
      stageKeys.push(await drawing.getAttribute("data-teaching-stages"));
      await page.screenshot({ path: `${output}/${template}-${i + 1}.png`, fullPage: true });
    }
    assert.equal(new Set(stageKeys).size, count);
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: "完整讲解已经准备好" }).waitFor({ timeout: 15_000 });
    const reopen = Date.now();
    await button.click();
    await dialog.getByRole("heading", { name: "跟着图形，一步一步理解" }).waitFor();
    assert.equal(generations, 1, "reopening must reuse the same result");
    assert.deepEqual(errors, []);
    results.push({ template, steps: count, elapsedMs, reopenMs: Date.now() - reopen, generations, mode: session.mode, passed: true });
    process.stdout.write(`${template}: ${count} steps, ${elapsedMs} ms, cached reopen passed\n`);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ note: freshInput ? "Fresh question typed in browser; real recognition, solution, HTTP, model planning, JSXGraph and cache." : "Already-solved fixtures; actual HTTP, configured model planning, JSXGraph rendering and UI cache.", results }, null, 2));
}
