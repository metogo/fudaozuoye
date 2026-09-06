// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let latest: any;
let latestCrop: any;
let latestWhiteboard: any;
let latestIllustration: any;
vi.mock("@/components/learning-chat", () => ({
  LearningChat: (props: any) => {
    latest = props;
    return <main>
      <p data-testid="ready">{String(props.ready)}</p>
      <p data-testid="busy">{String(props.busy)}:{props.loadingLabel}</p>
      <p data-testid="notice">{props.notice}</p>
      <p data-testid="messages">{props.messages.map((m: any) => `${m.kind}:${m.text}:${m.status}`).join("|")}</p>
      <button onClick={() => void props.onSend("已知一元二次方程")}>发送题目</button>
      <button onClick={() => props.onReasoningLevel("high")}>高推理</button>
      <button onClick={() => props.onNewProblem()}>新题</button>
    </main>;
  },
}));
vi.mock("@/lib/learning/client-sse", () => ({ readSseResponse: vi.fn() }));
vi.mock("@/components/image-cropper", () => ({
  ImageCropper: (props: any) => { latestCrop = props; return <div data-testid="cropper"/>; },
}));
vi.mock("@/components/whiteboard-input", () => ({
  WhiteboardInput: (props: any) => { latestWhiteboard = props; return <div data-testid="whiteboard"/>; },
}));
vi.mock("@/components/learning-illustration", () => ({
  LearningIllustration: (props: any) => { latestIllustration = props; return <div data-testid="illustration"/>; },
}));

import { EducationChatApp } from "@/components/education-chat-app";
import { readSseResponse } from "@/lib/learning/client-sse";

const learnedSession = {
  schemaVersion: "1.1", requestId: "request-app", reasoningLevel: "light",
  problem: { text: "已知一元二次方程", visualContext: { summary: "", facts: [] } }, rootNodeId: "root",
  nodes: [{ id: "root", title: "原题", kind: "problem", difficulty: 0, state: "learning", atomic: false }], edges: [],
  flow: { activeGate: { id: "gate", kind: "understanding", title: "理解", prompt: "是否理解", options: [{ id: "continue", label: "继续" }] }, suggestedQuestions: [], viewedSolution: false },
};
const response = (stage: string, body: unknown = {}, ok = true) => ({ stage, ok, json: async () => body }) as Response & { stage: string };

describe("EducationChatApp", () => {
  beforeEach(() => {
    latest = undefined;
    latestCrop = undefined;
    latestWhiteboard = undefined;
    latestIllustration = undefined;
    sessionStorage.clear();
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-1234-1234-123456789012" });
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(readSseResponse).mockReset();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("从题目发送串联识别、分析和第一轮讲解，并可重置为新题", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }, { id: "medium", label: "中", available: false }, { id: "high", label: "高", available: true }], illustration: { available: true } }))
      .mockResolvedValueOnce(response("recognize"))
      .mockResolvedValueOnce(response("analyze"))
      .mockResolvedValueOnce(response("turn"));
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage === "recognize") { onEvent("phase", { label: "正在识别文字" }); onEvent("recognized", learnedSession.problem); }
      if (reply.stage === "analyze") { onEvent("phase", { label: "正在安排学习" }); onEvent("graph", { session: learnedSession, stateToken: "x".repeat(48) }); }
      if (reply.stage === "turn") {
        await onEvent("message.delta", { text: "先从判别式开始理解。" });
        await onEvent("message.complete", { scopeLabel: "关键线索" });
        await onEvent("flow.milestone", { label: "先抓条件" });
        await onEvent("flow.update", { session: learnedSession, stateToken: "y".repeat(48) });
        await onEvent("flow.ready", {});
      }
    });
    render(<EducationChatApp/>);
    expect((await screen.findByTestId("ready")).textContent).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "高推理" }));
    expect(screen.getByTestId("notice").textContent).toContain("推理强度已切换为「高」");
    fireEvent.click(screen.getByRole("button", { name: "发送题目" }));
    await waitFor(() => expect(screen.getByTestId("messages").textContent).toContain("assistant:先从判别式开始理解。:finishing"));
    expect(screen.getByTestId("messages").textContent).toContain("milestone:先抓条件:complete");
    expect(fetch).toHaveBeenCalledTimes(4);
    fireEvent.click(screen.getByRole("button", { name: "新题" }));
    expect(screen.getByTestId("messages").textContent).toBe("");
  });

  it("服务初始化失败会保留可见错误，而不把不可用强度设为可用", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response("consent", {}, false));
    render(<EducationChatApp/>);
    await waitFor(() => expect(screen.getByTestId("notice").textContent).toContain("服务暂时无法准备"));
    expect(screen.getByTestId("ready").textContent).toBe("false");
  });

  it("一轮学习流可处理路径、答案、转写、分支提示和恢复状态", async () => {
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session: learnedSession, stateToken: "x".repeat(48), messages: [] }));
    vi.mocked(fetch).mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } })).mockResolvedValueOnce(response("turn"));
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage !== "turn") return;
      await onEvent("message.delta", { text: "先写出判别式。" });
      await onEvent("flow.suggestions", { suggestions: [{ id: "s1", text: "为什么", scopeLabel: "判别式", sourceSummary: "题干" }] });
      await onEvent("flow.milestone", { label: "先找条件" });
      await onEvent("flow.resume", { label: "回到原题" });
      await onEvent("flow.progress", { label: "继续讲解" });
      await onEvent("path.updated", { labels: ["判别式", "不等式"] });
      await onEvent("answer.result", { passed: true, text: "回答正确" });
      await onEvent("input.transcribed", { text: "Δ≥0", needsConfirmation: true });
      await onEvent("flow.branch_error", { message: "分支暂不可用" });
      await onEvent("presentation.unavailable", { message: "板书暂不可用" });
      await onEvent("message.complete", {});
      await onEvent("flow.update", { session: learnedSession, stateToken: "z".repeat(48) });
      await onEvent("flow.ready", {});
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await act(async () => { await latest.onChoice(learnedSession.flow.activeGate, "continue"); });
    await waitFor(() => expect(screen.getByTestId("messages").textContent).toContain("回答正确"));
    expect(screen.getByTestId("messages").textContent).toContain("AI 读到的作答：Δ≥0");
    expect(screen.getByTestId("messages").textContent).toContain("原题步骤 → 判别式 → 不等式");
  });

  it("已开始学习时，追问、猜你想问、重做和转移练习都会回到同一学习流", async () => {
    const session = {
      ...learnedSession,
      flow: {
        ...learnedSession.flow,
        activeGate: {
          id: "gate", kind: "understanding", title: "理解", prompt: "是否理解",
          options: [{ id: "continue", label: "继续" }],
        },
        suggestedQuestions: [{ id: "s1", text: "为什么要这样做", scopeLabel: "关键线索", sourceSummary: "题干" }],
      },
    };
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken: "x".repeat(48), messages: [] }));
    vi.mocked(fetch).mockResolvedValue(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }));
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage !== "turn") return;
      await onEvent("message.delta", { text: "继续理解。" });
      await onEvent("message.complete", {});
      await onEvent("flow.update", { session, stateToken: "y".repeat(48) });
      await onEvent("flow.ready", {});
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await waitFor(() => expect(latest.session?.requestId).toBe("request-app"));
    await act(async () => { await latest.onQuestion("为什么", "关键线索"); });
    await act(async () => { await latest.onSuggestion(session.flow.suggestedQuestions[0]); });
    await act(async () => { await latest.onRetryOriginal(); });
    await act(async () => { await latest.onRequestTransfer(); });
    await act(async () => { await latest.onSend("懂了"); });
    expect(screen.getByTestId("messages").textContent).toContain("user:为什么");
    expect(screen.getByTestId("messages").textContent).toContain("user:再练一道同知识点题");
  });

  it("确认题目后会分析并开始讲解；手写转写能够回填结果", async () => {
    const problem = { text: "图片中的题目", visualContext: { summary: "图形", facts: [] }, subject: "math" };
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValueOnce(response("analyze"))
      .mockResolvedValueOnce(response("turn"))
      .mockResolvedValueOnce(response("turn"));
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage === "analyze") await onEvent("graph", { session: learnedSession, stateToken: "x".repeat(48) });
      if (reply.stage === "turn") {
        await onEvent("message.delta", { text: "开始讲解。" });
        await onEvent("message.complete", {});
        await onEvent("flow.update", { session: learnedSession, stateToken: "y".repeat(48) });
        await onEvent("flow.ready", {});
      }
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await latest.onConfirmProblem(problem);
    await waitFor(() => expect(screen.getByTestId("messages").textContent).toContain("assistant:开始讲解"));
    vi.mocked(readSseResponse).mockImplementationOnce(async (_reply: any, onEvent: any) => { await onEvent("input.transcribed", { text: "x=3", confidence: 0.95 }); });
    await expect(latest.onTranscribeStep("gate", new Blob(["ink"]), new AbortController().signal)).resolves.toEqual({ text: "x=3", confidence: 0.95 });
  });

  it("图片与白板入口会复用识别、人工确认和图片追问流程", async () => {
    const visualProblem = { text: "看图作答", childWork: "", subject: "math", gradeBand: "junior", visualContext: { related: true, summary: "需要确认图形", facts: [{ text: "AB=3", source: "printed_label", confidence: 0.5 }], affectsSolving: true, confidence: 0.5 } };
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValueOnce(response("recognize"))
      .mockResolvedValueOnce(response("analyze"))
      .mockResolvedValue(response("turn"));
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage === "recognize") await onEvent("recognized", visualProblem);
      if (reply.stage === "analyze") await onEvent("graph", { session: learnedSession, stateToken: "x".repeat(48) });
      if (reply.stage === "turn") { await onEvent("message.delta", { text: "图形讲解。" }); await onEvent("flow.update", { session: learnedSession, stateToken: "y".repeat(48) }); await onEvent("flow.ready", {}); }
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    latest.onFile(new File(["image"], "q.png", { type: "image/png" }));
    await screen.findByTestId("cropper");
    await act(async () => { await latestCrop.onConfirm(new Blob(["image"]), "blob:question"); });
    await waitFor(() => expect(latest.reviewProblem?.text).toBe("看图作答"));
    await act(async () => { await latest.onConfirmProblem(visualProblem); });
    await waitFor(() => expect(latest.session?.requestId).toBe("request-app"));
    latest.onWhiteboard("question");
    await screen.findByTestId("whiteboard");
    expect(latestWhiteboard.title).toBe("白板作答");
    await act(async () => { await latestWhiteboard.onConfirm(new Blob(["ink"]), "blob:whiteboard"); });
    latest.onResponsePhoto(new File(["image"], "answer.png", { type: "image/png" }), "answer");
    await screen.findByTestId("cropper");
    await act(async () => { await latestCrop.onConfirm(new Blob(["image"]), "blob:answer"); });
    expect(screen.getByTestId("messages").textContent).toContain("请看我拍下的这一步");
    latest.onNewProblem();
    await waitFor(() => expect(screen.getByTestId("messages").textContent).toBe(""));
    expect(latest.session).toBeNull();
  });

  it("插画选择会显示逐帧进度，完成后把可复用课程交给独立页面", async () => {
    const session = {
      ...learnedSession,
      flow: { ...learnedSession.flow, activeGate: { id: "gate", kind: "understanding", title: "理解", prompt: "是否理解", options: [{ id: "view_illustration", label: "插画演示" }] } },
    };
    const frame = { id: "f1", index: 0, title: "第一步", imageUrl: "data:image/svg+xml,frame", narration: "看条件" };
    const lesson = { requestId: "request-app", title: "图示", frames: [frame], frameCount: 1, receipt: "receipt" };
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken: "x".repeat(48), messages: [] }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValueOnce(response("turn"));
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage !== "turn") return;
      await onEvent("illustration.progress", { requestId: "request-app", label: "正在画第一步" });
      await onEvent("illustration.frame", { requestId: "request-app", frameCount: 1, frame });
      await onEvent("illustration.complete", lesson);
      await onEvent("flow.update", { session, stateToken: "y".repeat(48) });
      await onEvent("flow.ready", {});
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await waitFor(() => expect(latest.session?.requestId).toBe("request-app"));
    await act(async () => { await latest.onChoice(session.flow.activeGate, "view_illustration"); });
    expect(await screen.findByTestId("illustration")).not.toBeNull();
    expect(latestIllustration.lesson).toEqual(lesson);
    expect(latestIllustration.expectedCount).toBe(1);
  });

  it("读题中断时保留重试入口，重试不会清掉用户的原始提问", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValue(response("recognize"));
    vi.mocked(readSseResponse).mockRejectedValue(new Error("识别服务暂不可用"));
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await act(async () => { await latest.onSend("请讲这道题"); });
    expect(latest.retryLabel).toBe("重新识别");
    expect(screen.getByTestId("messages").textContent).toContain("user:请讲这道题");
    await act(async () => { await latest.onRetry(); });
    expect(vi.mocked(readSseResponse)).toHaveBeenCalledTimes(2);
  });

  it("恢复本地板书缓存时会先向服务核验，核验失败也不阻断原对话", async () => {
    const lesson = { title: "条件关系", subtitle: "板书", returnLabel: "回到对话", layout: "steps", blocks: [{ id: "a", label: "条件", content: "先看已知条件", tone: "plain" }], annotations: [] };
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session: learnedSession, stateToken: "x".repeat(48), messages: [], boardCache: { version: 2, requestId: "request-app", lesson } }));
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("board-cache")) return { ok: false, status: 400, json: async () => ({}) } as Response;
      return response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } });
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("board-cache"))).toBe(true));
    expect(latest.session?.requestId).toBe("request-app");
  });

  it("普通任务失败会留下可重试入口，而可选同类练习不会锁住当前任务", async () => {
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session: learnedSession, stateToken: "x".repeat(48), messages: [] }));
    vi.mocked(fetch).mockResolvedValue(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }));
    vi.mocked(readSseResponse).mockRejectedValue(new Error("模型暂时不可用"));
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await act(async () => { await latest.onChoice(learnedSession.flow.activeGate, "continue"); });
    await waitFor(() => expect(latest.retryLabel).toBe("重试这一步"));
    expect(screen.getByTestId("notice").textContent).toContain("模型暂时不可用");
    await act(async () => { await latest.onRequestTransfer(); });
    expect(latest.retryLabel).toBe("");
    expect(screen.getByTestId("notice").textContent).toContain("同类练习暂时没有生成成功");
  });

  it("流式正文重置与可选强调失败都不影响完整讲解和后续任务", async () => {
    const longText = "这是足够长的一段讲解文字，用于触发重点标记的可选请求，同时仍然要保证主讲解流程不受影响。";
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session: learnedSession, stateToken: "x".repeat(48), messages: [] }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValueOnce(response("turn"))
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as Response);
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage !== "turn") return;
      await onEvent("message.delta", { text: "旧草稿" });
      await onEvent("message.reset", { reason: "重新组织讲解" });
      await onEvent("message.delta", { text: longText });
      await onEvent("message.complete", { scopeLabel: "原题完整讲解" });
      await onEvent("flow.update", { session: learnedSession, stateToken: "y".repeat(48) });
      await onEvent("flow.ready", {});
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await act(async () => { await latest.onChoice(learnedSession.flow.activeGate, "full_solution"); });
    await waitFor(() => expect(screen.getByTestId("messages").textContent).toContain(longText));
    expect(screen.getByTestId("messages").textContent).not.toContain("旧草稿");
    expect(latest.retryLabel).toBe("");
  });
});
