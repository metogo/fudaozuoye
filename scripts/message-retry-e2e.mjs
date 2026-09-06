// Isolated browser, synthetic session and intercepted API: no real model calls or user data.
import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { analyzeMock, recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const { understandingGate } = require("../functions/learning-api/dist/lib/learning/flow.js");
const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
session.flow = { ...session.flow, stage: "core_explanation", activeGate: understandingGate() };
const stateToken = "synthetic-retry-test-token-".repeat(3);
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const browser = await chromium.launch({ headless: true });
try {
  for (const fullSolution of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(({ session, stateToken }) => {
      if (!sessionStorage.getItem("retry-test-seeded")) {
        sessionStorage.setItem("retry-test-seeded", "true");
        sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken, messages: [{ id: "initial", role: "assistant", kind: "assistant", text: "先看关键条件，再完成这一步。", status: "complete", createdAt: new Date().toISOString() }] }));
      }
    }, { session, stateToken });
    const attempts = [];
    await context.route("**/consent", (route) => route.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] } }));
    await context.route("**/learning/turn", async (route) => {
      attempts.push(route.request().postDataJSON());
      const attempt = attempts.length;
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ contentType: "text/event-stream", body: attempt === 1
        ? event("message.delta", { text: "这是已经返回的一部分讲解。" }) + event("error", { message: "测试：连接中断" })
        : event("message.delta", { text: "重试成功，讲解已完整返回。" }) + event("message.complete", { scopeLabel: fullSolution ? "原题完整讲解" : "关键线索" }) + event("flow.update", { session, stateToken }) + event("complete", {}) });
    });
    const page = await context.newPage();
    await page.goto("http://localhost:3000/");
    if (fullSolution) await page.getByRole("button", { name: "看完整讲解", exact: true }).click();
    else {
      await page.locator("textarea").fill("这一步为什么这样做？");
      await page.getByRole("button", { name: "发送", exact: true }).click();
    }
    const retry = page.getByRole("button", { name: "重试这条消息", exact: true });
    await expect(retry).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(JSON.parse(sessionStorage.getItem("education-chat-session-v3") || "{}").pendingRetry?.messageId))).toBe(true);
    await page.reload();
    await expect(retry).toBeVisible();
    await retry.scrollIntoViewIfNeeded();
    const box = await retry.boundingBox();
    if (!box || box.height < 44 || box.width < 44) throw new Error("重试按钮触控面积不足");
    await mkdir("outputs/message-retry", { recursive: true });
    await page.screenshot({ path: `outputs/message-retry/${fullSolution ? "solution" : "inline"}.png` });
    // Two synchronous clicks exercise the retry ref's immediate consumption, before rerender.
    await retry.evaluate((button) => { button.click(); button.click(); });
    await expect(page.getByText("重试成功，讲解已完整返回。", { exact: true })).toBeVisible();
    await expect(retry).toHaveCount(0);
    if (attempts.length !== 2 || JSON.stringify(attempts[0]) !== JSON.stringify(attempts[1])) throw new Error("重试请求重复或原请求发生变化");
    await page.getByRole("button", { name: "开始新题", exact: true }).click();
    await expect(page.getByText("来一起解题吧", { exact: true })).toBeVisible();
    await expect(retry).toHaveCount(0);
    console.log(`${fullSolution ? "完整讲解" : "普通问答"}: 失败后刷新恢复重试、原请求保留、防重复、成功恢复、新题清理均通过`);
    await context.close();
  }
  const legacy = analyzeMock(recognizeMock("math", "junior"), "doubao");
  legacy.flow = { ...legacy.flow, stage: "intake", activeGate: null };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ session, stateToken }) => {
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken, messages: [{ id: "legacy-error", role: "assistant", kind: "assistant", text: "关键线索\n\n先看已知条件，方程有两个实数根，根的判别式需要满足", status: "error", createdAt: "2026-09-06T02:53:54Z" }] }));
  }, { session: legacy, stateToken });
  await context.route("**/consent", (route) => route.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] } }));
  let legacyInput;
  await context.route("**/learning/turn", (route) => {
    legacyInput = route.request().postDataJSON();
    return route.fulfill({ contentType: "text/event-stream", body: event("message.delta", { text: "旧记录重试成功。" }) + event("message.complete", { scopeLabel: "关键线索" }) + event("flow.update", { session, stateToken }) + event("complete", {}) });
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3000/");
  const retry = page.getByRole("button", { name: "重试这条消息", exact: true });
  await expect(retry).toBeVisible();
  await page.screenshot({ path: "outputs/message-retry/legacy-restored.png" });
  await retry.click();
  await expect(page.getByText("旧记录重试成功。", { exact: true })).toBeVisible();
  if (legacyInput?.input.type !== "start" || legacyInput.stateToken !== stateToken) throw new Error("旧记录没有正确重试首次讲解");
  console.log("旧版首次讲解失败记录：恢复后显示图标，点击重试首次讲解通过");
  await context.close();
} finally { await browser.close(); }
