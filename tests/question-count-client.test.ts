// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQuestionEntryReporter, QUESTION_ENTRY_QUEUE_KEY, readQuestionTotal } from "@/lib/learning/question-count-client";

describe("不阻塞解题的统计上报", () => {
  beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const setup = (send = vi.fn(async (id: string) => { expect(id).toHaveLength(36); })) => {
    const warn = vi.fn();
    return { send, warn, reporter: createQuestionEntryReporter({ storage: () => sessionStorage, send, warn }) };
  };
  it("先持久化新题，再异步上报；重复启动不重复上报", async () => {
    const { reporter, send } = setup();
    reporter.enqueue(); expect(send).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(QUESTION_ENTRY_QUEUE_KEY)!)).toHaveLength(1);
    reporter.start(); reporter.start(); await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1); expect(sessionStorage.getItem(QUESTION_ENTRY_QUEUE_KEY)).toBe("[]");
    reporter.enqueue(); await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2); expect(send.mock.calls[0][0]).not.toBe(send.mock.calls[1][0]); reporter.stop();
  });
  it("响应丢失、刷新后仍使用同一提交 ID 重试，停止后不再自动发送", async () => {
    const first = setup(vi.fn(async (id: string) => { expect(id).toHaveLength(36); throw new Error("lost response"); }));
    first.reporter.enqueue(); first.reporter.start(); await vi.advanceTimersByTimeAsync(0);
    const id = first.send.mock.calls[0][0]; first.reporter.stop();
    await vi.advanceTimersByTimeAsync(60_000); expect(first.send).toHaveBeenCalledTimes(1);
    const second = setup(); second.reporter.start(); await vi.advanceTimersByTimeAsync(0);
    expect(second.send).toHaveBeenCalledWith(id); expect(sessionStorage.getItem(QUESTION_ENTRY_QUEUE_KEY)).toBe("[]"); second.reporter.stop();
  });
  it("自动退避重试成功后清除待报，不生成新的提交 ID", async () => {
    const send = vi.fn(async (id: string) => { expect(id).toHaveLength(36); }).mockRejectedValueOnce(new Error("offline"));
    const { reporter } = setup(send); reporter.start(); reporter.enqueue();
    await vi.advanceTimersByTimeAsync(4000); expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBe(send.mock.calls[1][0]); reporter.stop();
  });
  it("连续失败最多尝试三次，新题和重复启动不能绕过退避；恢复网络后沿用原 ID", async () => {
    const send = vi.fn(async (id: string): Promise<void> => { expect(id).toHaveLength(36); throw new Error("503"); });
    const { reporter, warn } = setup(send);
    reporter.start(); reporter.enqueue(); await vi.advanceTimersByTimeAsync(0);
    reporter.enqueue(); reporter.resume(); reporter.start(); await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(send).toHaveBeenCalledTimes(3); expect(warn).toHaveBeenCalledTimes(1);
    reporter.enqueue(); reporter.start(); reporter.resume();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(send).toHaveBeenCalledTimes(3);
    const pending = JSON.parse(sessionStorage.getItem(QUESTION_ENTRY_QUEUE_KEY)!);
    expect(pending).toHaveLength(3);
    send.mockResolvedValue(undefined);
    reporter.resume(); await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls.slice(3).map(call => call[0])).toEqual(pending);
    expect(sessionStorage.getItem(QUESTION_ENTRY_QUEUE_KEY)).toBe("[]"); reporter.stop();
  });
  it("暂停再启动仍遵守剩余退避时间且不会遗失重试", async () => {
    const send = vi.fn(async (id: string) => { expect(id).toHaveLength(36); }).mockRejectedValueOnce(new Error("503"));
    const { reporter } = setup(send); reporter.start(); reporter.enqueue();
    await vi.advanceTimersByTimeAsync(1000); reporter.stop(); reporter.start();
    await vi.advanceTimersByTimeAsync(2999); expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(send).toHaveBeenCalledTimes(2); reporter.stop();
  });
  it("浏览器禁止存储时仍可正常解题并上报，明确记录持久化失败", async () => {
    const send = vi.fn(async () => {}); const warn = vi.fn();
    const reporter = createQuestionEntryReporter({ storage: () => { throw new Error("blocked"); }, send, warn });
    expect(() => { reporter.start(); reporter.enqueue(); }).not.toThrow();
    await vi.advanceTimersByTimeAsync(0); expect(send).toHaveBeenCalledOnce(); expect(warn).toHaveBeenCalled(); reporter.stop();
  });
  it("坏缓存不能被当成新的题目计数", async () => {
    sessionStorage.setItem(QUESTION_ENTRY_QUEUE_KEY, "{bad"); const { reporter, send, warn } = setup();
    reporter.start(); await vi.advanceTimersByTimeAsync(0); expect(send).not.toHaveBeenCalled(); expect(warn).toHaveBeenCalled(); reporter.stop();
  });
  it("读取失败或错误数字不能回退成10000", async () => {
    for (const result of [new Response("{}", { status: 503 }), Response.json({}), Response.json({ total: -1 }), Response.json({ total: "10000" })]) {
      vi.stubGlobal("fetch", vi.fn(async () => result)); await expect(readQuestionTotal()).rejects.toThrow();
    }
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ total: 10003 })));
    await expect(readQuestionTotal()).resolves.toBe(10003);
  });
});
