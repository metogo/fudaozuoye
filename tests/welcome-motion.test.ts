import { describe, expect, it } from "vitest";
import { createWelcomeVisitGuard, welcomeKeyframes, welcomePlacement, WELCOME_STORAGE_KEY } from "@/lib/learning/welcome-motion";

describe("首页小顿号迎接", () => {
  it.each([320, 390, 834, 1440])("%d宽度留在文字右侧，不挤动内容，归位到实际品牌坐标", width => {
    const left = Math.max(32, (width - 768) / 2 + 32);
    const hero = { left, top: 150, width: Math.min(width - 64, 576), height: 125 };
    const title = { left, top: 192, width: width === 320 ? 172 : 208, height: 44 };
    const dock = { left: left - 5, top: 28, width: width === 320 ? 34 : 42, height: 42 };
    const p = welcomePlacement(hero, title, dock, { width, height: 844 })!;
    expect(p).not.toBeNull();
    expect(p.x).toBeGreaterThanOrEqual(title.left + title.width + 12);
    expect(p.x + p.size).toBeLessThanOrEqual(width);
    const last = welcomeKeyframes(p).at(-1)!;
    expect(last.transform).toContain(`translate3d(${dock.left}px, ${dock.top}px, 0)`);
    expect(p.size * p.scale).toBe(dock.width);
  });
  it("大字号或小空间宁可不播放，也不覆盖题目和按钮", () => {
    expect(welcomePlacement({ left: 32, top: 100, width: 256, height: 120 }, { left: 32, top: 140, width: 240, height: 60 }, { left: 27, top: 28, width: 34, height: 34 }, { width: 320, height: 568 })).toBeNull();
  });
  it("320px窄屏改在标题上方迎接，保留字号而非挤进文字", () => {
    const title = { left: 28, top: 194, width: 208.5, height: 42.5 };
    const p = welcomePlacement({ left: 28, top: 154, width: 264, height: 125 }, title, { left: 27, top: 28, width: 34, height: 34 }, { width: 320, height: 844 })!;
    expect(p).not.toBeNull();
    expect(p.size).toBe(64);
    expect(p.y + p.size).toBeLessThan(title.top);
  });
  it("同一访问只迎接一次，重建组件或刷新也不反复播放", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const first = createWelcomeVisitGuard(() => storage);
    expect(first.hasSeen()).toBe(false);
    first.markSeen();
    expect(data.get(WELCOME_STORAGE_KEY)).toBe("1");
    expect(first.hasSeen()).toBe(true);
    expect(createWelcomeVisitGuard(() => storage).hasSeen()).toBe(true);
  });
  it("禁用存储也不会抛错或不断迎接", () => {
    const gate = createWelcomeVisitGuard(() => { throw new Error("blocked"); });
    expect(gate.hasSeen()).toBe(false);
    gate.markSeen();
    expect(gate.hasSeen()).toBe(true);
  });
});
