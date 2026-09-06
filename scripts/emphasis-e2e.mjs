// Real UI in an isolated browser; deterministic deferred annotation responses.
import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { analyzeMock, recognizeMock } = require("../functions/learning-api/dist/lib/learning/mock-engine.js");
const { understandingGate } = require("../functions/learning-api/dist/lib/learning/flow.js");
const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
session.flow = { ...session.flow, stage: "core_explanation", activeGate: understandingGate() };
const stateToken = "synthetic-emphasis-token-".repeat(3);
const source = String.raw`**先抓条件**：题目说明有两个实数根，因此第一步判断根是否存在，不必分别求出两个根。

用根的判别式写成 $\Delta=b^2-4ac\geq0$，把根的条件转为参数的不等式，再代入系数求参数范围。注意相等的两根也满足题意。

这样便把原题条件与下一步的操作联系起来，先弄清楚判断依据，再进行计算。`;
const marks = [{ kind: "text", target: "有两个实数根", reason: "这个条件决定使用判别式判断根的存在。" }, { kind: "math", target: String.raw`\Delta=b^2-4ac\geq0`, reason: "把根的存在转换为参数需要满足的不等式。" }];
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const browser = await chromium.launch();
await mkdir("outputs/emphasis", { recursive: true });
try {
  for (const scenario of ["success", "failure", "new-problem"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(({ session, stateToken }) => {
      if (sessionStorage.getItem("emphasis-seeded")) return;
      sessionStorage.setItem("emphasis-seeded", "true");
      sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken, messages: [] }));
    }, { session, stateToken });
    await context.route("**/consent", (route) => route.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] } }));
    await context.route("**/learning/turn", (route) => route.fulfill({ contentType: "text/event-stream", body: event("message.delta", { text: source + "\n" }) + event("message.complete", { scopeLabel: "关键线索" }) + event("flow.update", { session, stateToken }) + event("complete", {}) }));
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    let count = 0;
    await context.route("**/learning/emphasis", async (route) => {
      count++;
      const payload = route.request().postDataJSON();
      if (payload.source !== source || !payload.context.includes("为什么要用判别式")) throw new Error("划线没有绑定准确的讲解和问题");
      await barrier;
      await route.fulfill({ status: scenario === "failure" ? 503 : 200, json: { marks } }).catch(() => {});
    });
    const page = await context.newPage();
    await page.goto("http://localhost:3000/");
    await page.locator("textarea").fill("为什么要用判别式？");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect(page.getByRole("button", { name: "这一步我来做", exact: true })).toBeEnabled();
    await expect.poll(() => count).toBe(1);
    await expect(page.locator(".katex")).toHaveCount(1);
    await expect(page.locator(".learning-emphasis")).toHaveCount(0);
    const measure = () => page.locator(".chat-message--teacher").evaluate((node) => ({ height: node.getBoundingClientRect().height, text: node.textContent }));
    const before = await measure();
    if (scenario === "new-problem") await page.getByRole("button", { name: "开始新题", exact: true }).click();
    release();
    if (scenario === "success") {
      await expect(page.locator(".learning-emphasis")).toHaveCount(2);
      await expect(page.locator(".learning-emphasis--text")).toHaveCSS("text-decoration-line", "underline");
      await expect(page.locator(".learning-emphasis--text")).toHaveCSS("text-decoration-color", "rgb(57, 136, 109)");
      await expect(page.locator(".learning-emphasis--text")).toHaveCSS("text-decoration-thickness", "2px");
      await expect(page.locator(".learning-emphasis--math .learning-math")).toHaveCSS("box-shadow", "rgb(57, 136, 109) 0px -2px 0px 0px inset");
      const after = await measure();
      if (Math.abs(before.height - after.height) > 1 || before.text !== after.text) throw new Error("划线改变内容或导致布局跳动");
      await expect(page.locator(".learning-emphasis--math .katex-mathml")).toHaveCount(1);
      await page.screenshot({ path: "outputs/emphasis/chat-390.png", animations: "disabled" });
      await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("education-chat-session-v3") || "{}").messages?.some((m) => m.emphasis?.length === 2))).toBe(true);
      await page.reload();
      await expect(page.locator(".learning-emphasis")).toHaveCount(2);
      if (count !== 1) throw new Error("刷新重复请求模型");
      await page.setViewportSize({ width: 320, height: 740 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw new Error("窄屏横向溢出");
      await page.screenshot({ path: "outputs/emphasis/chat-320.png", animations: "disabled" });
      await page.locator(".learning-emphasis--text").evaluate((element) => {
        const range = document.createRange(); range.selectNodeContents(element);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      });
      if (await page.evaluate(() => getSelection()?.toString()) !== "有两个实数根") throw new Error("划线影响文字选择");
      await expect(page.getByRole("button", { name: "针对选中文字问一问", exact: true })).toBeVisible();
    } else {
      await expect(page.locator(".learning-emphasis")).toHaveCount(0);
      if (scenario === "failure") await expect(page.getByRole("button", { name: "这一步我来做", exact: true })).toBeEnabled();
      else await expect(page.getByText("来一起解题吧", { exact: true })).toBeVisible();
    }
    console.log(`${scenario}: 通过`);
    await context.close();
  }
} finally { await browser.close(); }
