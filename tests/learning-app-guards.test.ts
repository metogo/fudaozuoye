import { afterEach, describe, expect, it, vi } from "vitest";
import { analysisMessageOf, apiUrl, isAbortError, isProviderId, isRestorableState, messageOf, readSseResponse } from "@/components/learning-app";

const session = {
  schemaVersion: "1.1", rootNodeId: "root", nodes: [{ id: "root" }], edges: [],
  problemGuide: { goal: "目标", keyClue: "条件", approach: "方法", firstQuestion: "问题" },
};

describe("学习应用的传输与恢复守卫", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("只恢复有完整令牌、根节点和题目引导的会话", () => {
    expect(isRestorableState({ stateToken: "x".repeat(48), session })).toBe(true);
    expect(isRestorableState({ stateToken: "short", session })).toBe(false);
    expect(isRestorableState({ stateToken: "x".repeat(48), session: { ...session, problemGuide: { ...session.problemGuide, goal: "" } } })).toBe(false);
    expect(isProviderId("doubao")).toBe(true);
    expect(isProviderId("other")).toBe(false);
  });

  it("错误提示和 API 前缀对异常与生产配置保持可理解", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/");
    expect(apiUrl("/learning/verify")).toBe("https://api.example.com/learning/verify");
    expect(messageOf("bad")).toBe("操作失败，请重试");
    expect(analysisMessageOf(new Error("知识关系没有通过可靠性检查"))).toContain("再次点击");
    expect(isAbortError(new DOMException("stop", "AbortError"))).toBe(true);
  });

  it("SSE 可读取分块事件，并拒绝错误事件、非完整流和空响应", async () => {
    const received: string[] = [];
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: phase\ndata: {"label":"读题"}\n\n'));
        controller.enqueue(new TextEncoder().encode('event: complete\ndata: {}\n\n'));
        controller.close();
      },
    });
    await readSseResponse(new Response(stream), (event) => received.push(event));
    expect(received).toEqual(["phase", "complete"]);
    await expect(readSseResponse(new Response('event: error\ndata: {"message":"失败"}\n\n'), () => undefined)).rejects.toThrow("失败");
    await expect(readSseResponse(new Response('event: phase\ndata: {}\n\n'), () => undefined)).rejects.toThrow("意外中断");
    await expect(readSseResponse(new Response(null, { status: 503 }), () => undefined)).rejects.toThrow("流式请求失败");
  });
});
