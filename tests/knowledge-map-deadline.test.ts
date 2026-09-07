import { afterEach, describe, expect, it, vi } from "vitest";
import { createMapDeadline } from "@/lib/learning/knowledge-map-deadline";
import { knowledgeMapResponse } from "@/lib/learning/http/knowledge-map-stream";
import { streamKnowledgeMap } from "@/lib/learning/providers/knowledge-map-stream";
import type { ProviderAdapter } from "@/lib/learning/providers/adapter";
import type { LearningSession } from "@/lib/learning/types";

describe("图谱按清单分配生成预算", () => {
  afterEach(() => vi.useRealTimers());
  it("16个节点每次请求正常耗时6秒，超过45秒仍能完整返回", async () => {
    vi.useFakeTimers();
    const session = { problem: { text: "求长方形的周长", subject: "math", gradeBand: "primary" }, nodes: [] } as unknown as LearningSession;
    const plan = { rootId: "core", nodes: Array.from({ length: 16 }, (_, i) => ({ id: i ? `k${i}` : "core", title: `知识${i}`, evidenceId: "e1", parents: i ? ["core"] : [] })) };
    let calls = 0;
    const adapter = {
      streamKnowledgeMap: (_session: LearningSession, emit: Parameters<typeof streamKnowledgeMap>[2]) => streamKnowledgeMap(session, async () => {
        await new Promise(resolve => setTimeout(resolve, 6000));
        return JSON.stringify(calls++ ? { relations: [{ kind: "prerequisite", reason: "计算周长需要先理解边长关系" }] } : plan);
      }, emit),
      cancelPendingRequests: vi.fn(),
    };
    const response = knowledgeMapResponse(adapter as unknown as ProviderAdapter, session, new AbortController().signal);
    const result = response.text();
    await vi.advanceTimersByTimeAsync(54000);
    const text = await result;
    expect(text.match(/event: map.node/g)).toHaveLength(16);
    expect(text).toContain('event: complete\ndata: {"total":16}');
    expect(text).not.toContain("event: error");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("清单大小决定后续预算，浏览器留出接收服务端超时消息的余量", async () => {
    vi.useFakeTimers();
    const small = createMapDeadline(), large = createMapDeadline(), client = createMapDeadline(3000);
    await vi.advanceTimersByTimeAsync(6000);
    small.planned(2); large.planned(16); client.planned(16);
    await vi.advanceTimersByTimeAsync(35000);
    expect(small.signal.aborted).toBe(true);
    expect(large.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(129000);
    expect(large.signal.reason.name).toBe("TimeoutError");
    expect(client.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(client.signal.reason.name).toBe("TimeoutError");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("预算耗尽主动停止模型，并以超时事件结束流而不是无限等待", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const cancelPendingRequests = vi.fn(release);
    const adapter = {
      streamKnowledgeMap: async (_session: unknown, emit: Parameters<typeof streamKnowledgeMap>[2]) => {
        emit({ type: "plan", plan: { rootId: "core", nodes: [{ id: "core", parents: [] }, { id: "base", parents: ["core"] }] } });
        await held;
        throw new Error("取消");
      }, cancelPendingRequests,
    };
    const result = knowledgeMapResponse(adapter as unknown as ProviderAdapter, {} as LearningSession, new AbortController().signal).text();
    await vi.advanceTimersByTimeAsync(35000);
    const text = await result;
    expect(text).toContain("这次整理超时了");
    expect(text).not.toContain("event: complete");
    expect(cancelPendingRequests).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("未收到清单也有超时；完成或退出清理定时器", async () => {
    vi.useFakeTimers();
    const waiting = createMapDeadline(), finished = createMapDeadline();
    finished.planned(16); finished.clear();
    await vi.advanceTimersByTimeAsync(45000);
    expect(waiting.signal.reason.name).toBe("TimeoutError");
    expect(finished.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
