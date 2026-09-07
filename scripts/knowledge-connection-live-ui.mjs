// Real first explanation and real connection model; no injected knowledge nodes or connection prose.
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const api = "http://localhost:9000/api", origin = "http://localhost:3000";
const cases = [
  { id: "primary-math", subject: "math", gradeBand: "primary", text: "甲乙两个修路队合修360米公路，6天修完。甲每天比乙多修10米，甲乙每天各修多少米？" },
  { id: "junior-physics", subject: "physics", gradeBand: "junior", text: "两个电阻串联接在6伏电源两端，电阻分别为10欧和20欧，求电路中的电流。" },
  { id: "senior-chinese", subject: "chinese", gradeBand: "senior", text: "阅读句子“羁鸟恋旧林，池鱼思故渊”，分析这两句诗运用了什么表现手法，表达了诗人怎样的思想感情。" },
];
async function events(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  const result = text.split(/\n\n/).flatMap(block => {
    const name = block.match(/^event: (.+)$/m)?.[1], raw = block.match(/^data: (.+)$/m)?.[1];
    return name && raw ? [{ name, data: JSON.parse(raw) }] : [];
  });
  const error = result.find(e => e.name === "error");
  if (error) throw new Error(error.data.message);
  if (!result.some(e => e.name === "complete")) throw new Error("主讲解未完整结束");
  return result;
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("outputs/knowledge-connection-live", { recursive: true });
try {
  for (const item of cases) {
    const consent = await fetch(`${api}/consent`, { method: "POST", headers: { Origin: origin } });
    const cookie = consent.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("缺少同意凭证");
    const headers = { Origin: origin, Cookie: cookie };
    const form = new FormData();
    form.set("stage", "full"); form.set("provider", "doubao"); form.set("reasoningLevel", "light");
    form.set("problem", JSON.stringify({ ...item, childWork: "", confidence: 1, userRevised: true }));
    const analysis = await events(await fetch(`${api}/learning/analyze`, { method: "POST", headers, body: form }));
    let state = analysis.findLast(e => e.name === "graph").data;
    expect(state.session.nodes.filter(n => n.kind === "concept")).toHaveLength(0);
    const turn = await events(await fetch(`${api}/learning/turn`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ stateToken: state.stateToken, input: { type: "start" } }), signal: AbortSignal.timeout(180000) }));
    state = turn.findLast(e => e.name === "flow.update").data;
    const source = turn.filter(e => e.name === "message.delta").map(e => e.data.text).join("");
    const scopeLabel = turn.findLast(e => e.name === "message.complete")?.data.scopeLabel;
    expect(source.length).toBeGreaterThan(30);
    expect(state.session.nodes.filter(n => n.kind === "concept")).toHaveLength(0);
    const snapshot = { ...state, messages: [{ id: "real-first-explanation", role: "assistant", kind: "assistant", status: "complete", createdAt: new Date().toISOString(), text: source, scopeLabel }] };
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
    const split = cookie.indexOf("=");
    await context.addCookies([{ name: cookie.slice(0, split), value: cookie.slice(split + 1), url: origin }]);
    await context.addInitScript(data => sessionStorage.setItem("education-chat-session-v3", JSON.stringify(data)), snapshot);
    const page = await context.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    const responsePromise = page.waitForResponse(r => r.url().endsWith("/learning/knowledge-connection"));
    const started = Date.now();
    await page.goto(origin);
    await expect(page.getByRole("button", { name: "懂了，继续", exact: true })).toBeEnabled();
    await expect(page.locator(".streaming-indicator")).toHaveCount(0);
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`${item.id} 知识连接 HTTP ${response.status()}: ${(await response.json()).error?.message}`);
    const { connection } = await response.json();
    if (connection) {
      const card = page.getByRole("complementary", { name: "本段知识连接" });
      await expect(card).toBeVisible();
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `outputs/knowledge-connection-live/${item.id}.png` });
      await card.getByRole("button", { name: connection.foundation.title, exact: true }).click();
      await expect(card.getByRole("region", { name: `${connection.foundation.title}的就地讲解` })).toBeVisible();
      await page.screenshot({ path: `outputs/knowledge-connection-live/${item.id}-expanded.png` });
      expect(source).toContain(connection.anchor);
      console.log(JSON.stringify({ case: item.id, conceptNodesBefore: 0, elapsedMs: Date.now() - started, titles: [connection.foundation.title, connection.target.title], reason: connection.reason, explanations: [connection.foundation.explanation, connection.target.explanation], namesAbsentInSource: !source.includes(connection.foundation.title) && !source.includes(connection.target.title), mainGateEnabled: true }));
    } else console.log(JSON.stringify({ case: item.id, connection: null, note: "模型明确判断当前首讲不需要补充关系", source }));
    expect(errors).toEqual([]);
    await context.close();
  }
} finally { await browser.close(); }
