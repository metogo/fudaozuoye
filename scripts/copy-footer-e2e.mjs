// Exercise the real completion lifecycle and clipboard in an isolated browser.
import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { analyzeMock, recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const { understandingGate } = require("../functions/learning-api/dist/lib/learning/flow.js");
const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
session.flow = { ...session.flow, stage: "core_explanation", activeGate: understandingGate() };
const stateToken = "synthetic-copy-footer-token-".repeat(3);
const source = String.raw`先看题目给出的条件。有两个实数根时，判别式需要满足 $\Delta\geq0$。

代入系数，写出不等式，再求参数的范围。不要遗漏两个根相等的情况。`;
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const browser = await chromium.launch();
try {
  await mkdir("outputs/copy-footer", { recursive: true });
  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
    await context.addInitScript(({ session, stateToken }) => {
      if (sessionStorage.getItem("copy-seeded")) return;
      sessionStorage.setItem("copy-seeded", "1");
      sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken, messages: [] }));
    }, { session, stateToken });
    await context.route("**/consent", route => route.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] } }));
    await context.route("**/learning/emphasis", route => route.fulfill({ json: { marks: [] } }));
    await context.route("**/learning/turn", route => route.fulfill({ contentType: "text/event-stream", body:
      event("message.delta", { text: source }) + event("message.complete", { scopeLabel: "关键线索" }) + event("flow.update", { session, stateToken }) + event("complete", {}) }));
    const page = await context.newPage();
    await page.goto("http://localhost:3000/");
    await page.locator("textarea").fill("说明这一步的依据");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    const copy = page.getByRole("button", { name: "复制讲解", exact: true });
    await expect(page.locator('.streaming-indicator[data-phase="finishing"]')).toHaveCount(1);
    await expect(copy).toHaveCount(0);
    await expect(copy).toBeVisible();
    await expect(page.locator('.streaming-indicator[data-phase="finishing"]')).toHaveCount(0);
    const measure = async () => {
      const prose = await page.locator(".copyable-learning-text__prose").boundingBox();
      const button = await copy.boundingBox();
      if (button.y < prose.y + prose.height || button.x + button.width > prose.x + prose.width + 1 || button.width < 44 || button.height < 44) throw new Error("复制按钮未在正文下方或热区不足");
    };
    await measure();
    await copy.click();
    await expect(page.getByText("已复制文本", { exact: true })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    if (!copied.includes("判别式") || !copied.includes("相等的情况") || copied.includes("已复制") || copied.includes("轮到你了")) throw new Error("剪贴板正文不完整或包含其他UI内容");
    await page.locator(".copyable-learning-text").screenshot({ path: `outputs/copy-footer/copy-${width}.png` });
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("education-chat-session-v3") || "{}").messages?.some(m => m.status === "complete" && m.role === "assistant"))).toBe(true);
    await page.reload();
    await expect(copy).toBeVisible();
    await measure();
    console.log(`${width}px: 对勾切换、底部定位、真实复制与刷新恢复通过`);
    await context.close();
  }
} finally { await browser.close(); }
