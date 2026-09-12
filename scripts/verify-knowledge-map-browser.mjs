import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { appOrigin, apiBase, post, readEvents } from "./verify-knowledge-map-release.mjs";

export async function verifyKnowledgeMapBrowser({ state, cookie }) {
  const events = await readEvents(await post("/learning/turn", cookie, { stateToken: state.stateToken, input: { type: "start" } }));
  const current = events.findLast(e => e.name === "flow.update")?.data;
  assert.ok(current?.stateToken && current.session.flow.activeGate, "真实讲解未完成，不能进入图谱验收");
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const split = cookie.indexOf("=");
    await context.addCookies([{ name: cookie.slice(0, split), value: cookie.slice(split + 1), url: apiBase }]);
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    // Reopen the actual server-issued lesson, never alter its learning state or seed map cache.
    await page.addInitScript(snapshot => sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ ...snapshot, messages: [] })), current);
    await page.goto(appOrigin);
    // CloudBase's test-domain interstitial is outside the product; do not change domain settings.
    if (await page.getByText("页面访问提示", { exact: true }).count()) {
      const proceed = page.getByText("确定访问", { exact: true });
      await expect(proceed).toBeVisible({ timeout: 15000 });
      await Promise.all([page.waitForNavigation(), proceed.click()]);
    }
    const response = page.waitForResponse(r => r.url().endsWith("/learning/knowledge-map") && r.request().postDataJSON()?.stream === true, { timeout: 30000 });
    await page.getByRole("button", { name: "本题知识图谱", exact: true }).click();
    const graphResponse = await response;
    assert.ok(graphResponse.ok());
    assert.match(graphResponse.headers()["content-type"], /text\/event-stream/);
    const graph = page.getByRole("dialog");
    await expect(graph.getByText("已全部生成", { exact: true })).toBeVisible({ timeout: 175000 });
    const progress = graph.getByRole("progressbar"), total = Number(await progress.getAttribute("aria-valuemax"));
    assert.ok(total >= 2);
    assert.equal(Number(await progress.getAttribute("aria-valuenow")), total);
    await page.getByRole("button", { name: "查看全图", exact: true }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(total);
    // Wait for the viewport animation, then verify the actual geometry rather than DOM count alone.
    await expect.poll(() => page.locator(".react-flow").evaluate(canvas => {
      const bounds = canvas.getBoundingClientRect();
      return [...canvas.querySelectorAll(".react-flow__node")].every(node => {
        const box = node.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
      });
    })).toBe(true);
    assert.ok(await page.locator(".react-flow__edge-path").count() > 0, "画布连线缺失");
    await mkdir("outputs/knowledge-map-release", { recursive: true });
    await page.screenshot({ path: "outputs/knowledge-map-release/online-complete.png" });
    const download = page.waitForEvent("download", { timeout: 40000 });
    await page.getByRole("button", { name: "导出图片", exact: true }).click();
    const file = await download;
    assert.equal(await file.failure(), null);
    await file.saveAs("outputs/knowledge-map-release/online-export.png");
    await page.getByRole("button", { name: "返回对话", exact: true }).click();
    await expect(page.getByRole("button", { name: "本题知识图谱", exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ check: "online-browser", passed: true, nodes: total, exported: true }));
  } finally { await browser.close(); }
}
