import { afterEach, describe, expect, it, vi } from "vitest";
import { analysisMessageOf, apiUrl, isAbortError, isProviderId, isRestorableState, messageOf, readSseResponse } from "@/components/learning-app";

function stream(parts: string[]) {
  return new Response(new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(new TextEncoder().encode(part)); controller.close(); } }), { status: 200 });
}

describe("学习应用的请求与恢复守卫", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("按部署地址构造接口，并仅接受允许的服务商与完整会话", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example/");
    expect(apiUrl("/learning/analyze")).toBe("https://api.example/learning/analyze");
    expect(isProviderId("doubao")).toBe(true);
    expect(isProviderId("other")).toBe(false);
    const state = { stateToken: "x".repeat(48), session: { schemaVersion: "1.1", rootNodeId: "root", nodes: [{ id: "root" }], edges: [], problemGuide: { goal: "g", keyClue: "k", approach: "a", firstQuestion: "f" } } };
    expect(isRestorableState(state)).toBe(true);
    expect(isRestorableState({ ...state, session: { ...state.session, problemGuide: { ...state.session.problemGuide, goal: "" } } })).toBe(false);
  });

  it("正确解析分块 SSE，并拒绝错误、未完成与空响应", async () => {
    const events: string[] = [];
    await readSseResponse(stream(["event: phase\ndata: {\"label\":\"识别\"}\n\n", "event: complete\ndata: {}\n\n"]), (event) => events.push(event));
    expect(events).toEqual(["phase", "complete"]);
    await expect(readSseResponse(stream(["event: error\ndata: {\"message\":\"模型失败\"}\n\n"]), vi.fn())).rejects.toThrow("模型失败");
    await expect(readSseResponse(stream(["event: phase\ndata: {}\n\n"]), vi.fn())).rejects.toThrow("意外中断");
    await expect(readSseResponse(new Response("bad", { status: 500 }), vi.fn())).rejects.toThrow("bad");
  });

  it("将可靠性、通用错误与取消分别保留为可行动文案", () => {
    expect(analysisMessageOf(new Error("知识关系没有通过可靠性检查"))).toContain("不够可靠");
    expect(messageOf("bad")).toBe("操作失败，请重试");
    expect(isAbortError(new DOMException("cancel", "AbortError"))).toBe(true);
  });
});
