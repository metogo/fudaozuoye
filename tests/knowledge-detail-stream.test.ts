import { describe, expect, it, vi } from "vitest";
import { knowledgeDetailPrompt, observeKnowledgeSummary } from "@/lib/learning/providers/knowledge-detail-stream";
import { knowledgeDetailResponse } from "@/lib/learning/http/knowledge-detail-stream";
import { readMapStream } from "@/lib/learning/knowledge-map-stream";
import type { ProviderAdapter } from "@/lib/learning/providers/provider-contract";
import type { LearningSession } from "@/lib/learning/types";
import type { ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";
const map = { rootId: "core", nodes: [{ id: "core", title: "面积", evidence: "长8宽3" }], edges: [] } as unknown as ProblemKnowledgeMap;
const session = { problem: { text: "长8宽3", subject: "math", gradeBand: "primary" }, nodes: [{ title: "无关章节" }] } as LearningSession;
describe("知识卡模型正文提前交付", () => {
  it("保留完整原题及题图事实，不携带无关的全局概念", () => {
    const prompt = JSON.parse(knowledgeDetailPrompt(session, map, "core"));
    expect(prompt.original).toBe("长8宽3"); expect(prompt.node.title).toBe("面积");
    expect(JSON.stringify(prompt)).not.toContain("无关章节");
    expect(() => knowledgeDetailPrompt(session, map, "missing")).toThrow();
  });
  it("逐字接收，只在完整字符串闭合且公式完整时显示，转义引号不截断", () => {
    const emit = vi.fn(), observe = observeKnowledgeSummary(emit);
    const summary = '说明“面积” $\\frac{1}{2}$ 和 "单位"';
    const prefix = `{"summary":${JSON.stringify(summary)}`;
    for (const char of prefix.slice(0, -1)) observe(char);
    expect(emit).not.toHaveBeenCalled(); observe(prefix.at(-1)!);
    expect(emit).toHaveBeenCalledExactlyOnceWith(summary);
    observe(',"application":"本题使用"}'); expect(emit).toHaveBeenCalledTimes(1);
  });
  it.each(['{"summary":"$x"', '{"application":"先写用途","summary":"说明"', '{"summary":"rac{1}{2}"'])("异常或非标准顺序不发布不完整预览 %s", prefix => {
    const emit = vi.fn(); observeKnowledgeSummary(emit)(prefix); expect(emit).not.toHaveBeenCalled();
  });
  it("第一段立即可读，不等待后续生成；完整结束才能完成", async () => {
    let finish!: (value: { summary: string; application: string }) => void;
    const pending = new Promise<{ summary: string; application: string }>(resolve => { finish = resolve; });
    const adapter = { streamKnowledgeDetail: async (_s: unknown, _m: unknown, _n: unknown, emit: (s: string) => void) => { emit("先到的说明"); return pending; }, cancelPendingRequests: vi.fn() } as unknown as ProviderAdapter;
    const events: string[] = [];
    const response = knowledgeDetailResponse(adapter, session, map, "core", new AbortController().signal);
    const reading = readMapStream(response, event => events.push(event));
    await vi.waitFor(() => expect(events).toContain("detail.summary"));
    expect(events).not.toContain("complete");
    finish({ summary: "先到的说明", application: "后到的用法" }); await reading;
    expect(events.at(-1)).toBe("complete");
  });
  it("关闭读取取消模型工作，失败不伪装完成", async () => {
    const cancelPendingRequests = vi.fn();
    const adapter = { streamKnowledgeDetail: () => new Promise(() => {}), cancelPendingRequests } as unknown as ProviderAdapter;
    await knowledgeDetailResponse(adapter, session, map, "core", new AbortController().signal).body!.cancel();
    expect(cancelPendingRequests).toHaveBeenCalledOnce();
    const failed = { ...adapter, streamKnowledgeDetail: async () => { throw new Error("failure"); } };
    await expect(readMapStream(knowledgeDetailResponse(failed, session, map, "core", new AbortController().signal), () => {})).rejects.toThrow("未完整生成");
  });
});
