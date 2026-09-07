import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("outputs/home-companion-refresh", { recursive: true });
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let release;
    const prepared = new Promise(resolve => { release = resolve; });
    await page.route("**/consent", async route => {
      await prepared;
      await route.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] } });
    });
    await page.addInitScript(() => sessionStorage.setItem("home-comma-push-introduced-v1", "1"));
    await page.goto("http://localhost:3000/");
    const hero = page.locator(".home-companion");
    // 旧访问标记存在、服务接口仍未返回，也必须主动欢迎。
    await expect(hero).toHaveAttribute("data-interacting", "introduce", { timeout: 5000 });
    await expect(page.getByText("AI 服务正在准备", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "和小逗号打招呼", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `outputs/home-companion-refresh/${width}-welcome.png` });
    release();
    await expect(page.getByText("AI 服务正在准备", { exact: true })).toHaveCount(0);
    for (let refresh = 0; refresh < 2; refresh++) {
      await page.reload();
      await expect(hero).toHaveAttribute("data-interacting", "introduce", { timeout: 5000 });
    }
    // 输入立即结束动画，不遮挡输入，也不丢字。
    const input = page.getByRole("textbox", { name: "输入题目或问题" });
    await input.fill("一道测试题");
    await expect(hero).not.toHaveAttribute("data-interacting", /.+/);
    await expect(input).toHaveValue("一道测试题");
    await page.getByRole("button", { name: "和小逗号打招呼", exact: true }).click();
    await expect(hero).toHaveAttribute("data-interacting", "nudge");
    expect(errors).toEqual([]);
    console.log(`PASS ${width}px：旧标记、慢接口、连续刷新、输入暂停、点击互动`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.route("**/consent", route => route.fulfill({ json: { reasoningLevels: [{ id: "light", label: "轻度", available: true }] } }));
  await page.goto("http://localhost:3000/");
  await expect(page.getByRole("button", { name: "和小逗号打招呼", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "和小逗号打招呼", exact: true }).click();
  await expect(page.locator(".home-companion")).not.toHaveAttribute("data-interacting", /.+/);
  console.log("PASS：减少动态效果时保持静态");
  await context.close();
} finally { await browser.close(); }
