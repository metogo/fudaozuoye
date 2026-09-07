import { describe, expect, it, vi } from "vitest";
import { knowledgeMapResponse } from "@/lib/learning/http/knowledge-map-stream";
import type { ProviderAdapter } from "@/lib/learning/providers/adapter";
import type { LearningSession } from "@/lib/learning/types";

describe("图谱SSE响应与取消", () => {
  it("节点先于完整生成返回，错误后不发送完成事件", async () => {
    let fail!: () => void;
    const held = new Promise<void>((_resolve, reject) => { fail = () => reject(new Error("生成中断")); });
    const adapter = { streamKnowledgeMap: async (_session: unknown, emit: (data: unknown) => void) => { emit({ type: "plan", plan: { rootId: "core", nodes: [{ id: "core", parents: [] }, { id: "base", parents: ["core"] }] } }); await held; }, cancelPendingRequests: vi.fn() };
    const response = knowledgeMapResponse(adapter as unknown as ProviderAdapter, {} as LearningSession, new AbortController().signal);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("map.start");
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("map.plan");
    fail();
    const error = new TextDecoder().decode((await reader.read()).value);
    expect(error).toContain("event: error");
    expect(error).not.toContain("event: complete");
    expect((await reader.read()).done).toBe(true);
  });
  it("关闭画布的请求会停止下游模型", async () => {
    let stop!: () => void;
    const held = new Promise<void>(resolve => { stop = resolve; });
    const cancelPendingRequests = vi.fn(() => stop());
    const adapter = { streamKnowledgeMap: async () => { await held; throw new DOMException("取消", "AbortError"); }, cancelPendingRequests };
    const response = knowledgeMapResponse(adapter as unknown as ProviderAdapter, {} as LearningSession, new AbortController().signal);
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(cancelPendingRequests).toHaveBeenCalledTimes(1);
  });
  it("服务截止时返回明确超时状态，不误称用户取消，也不丢失已发送节点", async () => {
    const deadline = new AbortController();
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const cancelPendingRequests = vi.fn(release);
    const adapter = { streamKnowledgeMap: async () => { await waiting; throw new Error("取消"); }, cancelPendingRequests };
    const response = knowledgeMapResponse(adapter as unknown as ProviderAdapter, {} as LearningSession, deadline.signal);
    const reader = response.body!.getReader();
    await reader.read();
    deadline.abort(new DOMException("deadline", "TimeoutError"));
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("这次整理超时了");
    expect((await reader.read()).done).toBe(true);
    expect(cancelPendingRequests).toHaveBeenCalledTimes(1);
  });
});
