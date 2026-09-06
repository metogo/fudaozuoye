// Isolated UI test with synthetic SSE responses; no real model or user data.
import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { analyzeMock, recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
const stateToken = "thinking-test-token-".repeat(5);
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const cors = { "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "content-type" };
const browser = await chromium.launch({ headless: true });
await mkdir("outputs/chat-thinking", { recursive: true });
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/consent", r => r.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] }, headers: cors }));
    await page.route("**/learning/analyze", async r => {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
      const recognizing = r.request().postData()?.includes("recognize_text");
      await new Promise(resolve => setTimeout(resolve, 1800));
      await r.fulfill({ contentType: "text/event-stream", headers: cors, body: recognizing ? event("recognized", session.problem) + event("complete", {}) : event("graph", { session, stateToken }) + event("complete", {}) });
    });
    await page.route("**/learning/turn", async r => {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
      await new Promise(resolve => setTimeout(resolve, 1000));
      await r.fulfill({ contentType: "text/event-stream", headers: cors, body: event("message.delta", { text: "先找出题目中的已知条件，再建立数量关系。" }) + event("message.complete", { scopeLabel: "关键线索" }) + event("flow.update", { session, stateToken }) + event("complete", {}) });
    });
    await page.goto("http://localhost:3000/");
    await page.locator("textarea").fill("一个长方形菜园，长18米、宽12米，长增加4米，求新周长。");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    const waiting = page.getByRole("status", { name: "小逗号正在思考" });
    await expect(waiting).toBeVisible();
    await expect(waiting.getByRole("heading")).toHaveText("正在读懂这道题");
    const quote = waiting.getByLabel("学习寄语");
    await expect(quote).toBeVisible();
    const originalQuote = await quote.textContent();
    expect(originalQuote).toContain("《");
    await expect(page.locator(".loading-whisper")).toHaveCount(0);
    if (reducedMotion === "reduce") expect(await waiting.locator(".comma-companion").evaluate(e => getComputedStyle(e).animationName)).toBe("none");
    await page.screenshot({ path: `outputs/chat-thinking/${reducedMotion}.png` });
    await expect(waiting.getByRole("heading")).toHaveText("正在梳理解题思路");
    await expect(quote).toHaveText(originalQuote);
    await expect(page.getByText("先找出题目中的已知条件，再建立数量关系。", { exact: true })).toBeVisible();
    await expect(waiting).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
  }
  console.log("PASS: real phase labels, no quote card, response handoff, reduced motion, no page errors");
} finally { await browser.close(); }
