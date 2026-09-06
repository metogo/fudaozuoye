import { afterEach, describe, expect, it, vi } from "vitest";
import { createTextBatcher } from "@/lib/learning/text-batcher";
import { createDeferredTask } from "@/lib/learning/deferred-task";
import { readFileSync } from "node:fs";

afterEach(() => vi.useRealTimers());
describe("流式与持久化调度", () => {
  it("主页不直接引入公式渲染库，长对话列表独立记忆，滚动测量按帧合并", () => {
    const chat = readFileSync("components/learning-chat.tsx", "utf8");
    expect(chat).toContain('from "./lazy-rich-learning-text"');
    expect(chat).not.toContain('from "./rich-learning-text"');
    expect(chat).toContain("const MessageList = memo(");
    expect(chat).toContain("if (!showSuggestions) return;");
    expect(chat).toContain("if (frame !== undefined) return;");
    const app = readFileSync("components/education-chat-app.tsx", "utf8");
    expect(app).not.toMatch(/from ["']@\/lib\/learning\/board-experience["']/);
    expect(app).toContain('await import("@/lib/learning/board-experience")');
  });
  it("高频长流完整结束，合并后更新次数受限且末尾完整", () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const batch = createTextBatcher((text) => chunks.push(text));
    const tokens = Array.from({ length: 2000 }, (_, i) => `条件${i}：$x^2$\n`);
    for (const token of tokens) { batch.push(token); vi.advanceTimersByTime(1); }
    batch.flush();
    expect(chunks.join("")).toBe(tokens.join(""));
    expect(chunks.length).toBeLessThanOrEqual(51);
    vi.runAllTimers();
    expect(chunks.join("")).toBe(tokens.join(""));
  });
  it("合并碎片但不丢字、不改变顺序", () => {
    vi.useFakeTimers();
    const append = vi.fn(); const batch = createTextBatcher(append);
    batch.push("第一"); batch.push("步："); batch.push("$x^2$");
    expect(append).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(append).toHaveBeenCalledExactlyOnceWith("第一步：$x^2$");
    batch.push("末尾"); batch.flush();
    expect(append).toHaveBeenLastCalledWith("末尾");
    vi.runAllTimers(); expect(append).toHaveBeenCalledTimes(2);
  });
  it("重置先清空缓冲，旧请求取消后不能再写入", () => {
    vi.useFakeTimers();
    const append = vi.fn(); const batch = createTextBatcher(append);
    batch.push("旧内容"); batch.discard(); vi.runAllTimers();
    expect(append).not.toHaveBeenCalled();
    batch.push("新内容"); batch.flush(); expect(append).toHaveBeenCalledExactlyOnceWith("新内容");
  });
  it("持续输出仍定时保存最新快照，离开页面立即保存", () => {
    vi.useFakeTimers(); const write = vi.fn(); const writer = createDeferredTask();
    for (let i = 0; i < 7; i++) { writer.schedule(() => write(i)); vi.advanceTimersByTime(50); }
    expect(write).toHaveBeenCalledExactlyOnceWith(6);
    writer.schedule(() => write(7)); writer.flush(); expect(write).toHaveBeenLastCalledWith(7);
    vi.runAllTimers(); expect(write).toHaveBeenCalledTimes(2);
  });
  it("开始新题取消待保存内容，不能重新写回旧会话", () => {
    vi.useFakeTimers(); const write = vi.fn(); const writer = createDeferredTask();
    writer.schedule(write); writer.cancel(); writer.flush(); vi.runAllTimers();
    expect(write).not.toHaveBeenCalled();
  });
});
