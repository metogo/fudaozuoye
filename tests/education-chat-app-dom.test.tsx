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
import { illustrationFingerprint } from "@/lib/learning/illustration-fingerprint";

const learnedSession = {
  schemaVersion: "1.1", requestId: "request-app", reasoningLevel: "light",
  problem: { text: "已知一元二次方程", visualContext: { summary: "", facts: [] } }, rootNodeId: "root",
  nodes: [{ id: "root", title: "原题", kind: "problem", difficulty: 0, state: "learning", atomic: false }], edges: [],
  flow: { activeGate: { id: "gate", kind: "understanding", title: "理解", prompt: "是否理解", options: [{ id: "continue", label: "继续" }] }, suggestedQuestions: [], viewedSolution: false },
};
const restorableBoardLesson = {
  title: "条件关系", subtitle: "板书", returnLabel: "回到对话", layout: "steps", annotations: [],
  blocks: [
    { id: "orient", label: "找到条件", content: "先看题干条件。", tone: "plain" },
    { id: "reason", label: "建立关系", content: "再用关系求解。", tone: "key" },
  ],
  plan: {
    version: 2, contentRevision: 2, subject: "math", discipline: "math", thesis: "先抓住题干中的数量关系再列式求解。", learningGoal: "理解数量关系", sourceMessageIds: ["m1"],
    scenes: [
      { id: "orient", label: "找到条件", title: "找到条件", content: "先看题干条件。", tone: "plain", intent: "extract", sourceMessageIds: ["m1"], role: "orient", purpose: "定位本题需要使用的已知条件", why: "已知条件决定后续如何建立数量关系。", selfCheck: "能说出题干给了什么。", move: "提取条件" },
      { id: "reason", label: "建立关系", title: "建立关系", content: "再用关系求解。", tone: "key", intent: "derive", sourceMessageIds: ["m1"], role: "reason", purpose: "把已知条件连接成可计算的关系", why: "关系建立后才能按照同一规则完成推导。", selfCheck: "能写出对应关系。", move: "建立关系" },
    ],
  },
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
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValue(response("turn"));
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

  it("插画生成失败只在插画页给出可重试反馈，不会让主学习任务失效", async () => {
    const session = {
      ...learnedSession,
      flow: { ...learnedSession.flow, activeGate: { id: "gate", kind: "understanding", title: "理解", prompt: "是否理解", options: [{ id: "view_illustration", label: "插画演示" }] } },
    };
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken: "x".repeat(48), messages: [] }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValueOnce(response("turn"));
    vi.mocked(readSseResponse).mockRejectedValue(new Error("图解服务暂不可用"));
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await act(async () => { await latest.onChoice(session.flow.activeGate, "view_illustration"); });
    await waitFor(() => expect(latestIllustration.error).toContain("图解服务暂不可用"));
    expect(latest.session.flow.activeGate.id).toBe("gate");
    expect(latest.retryLabel).toBe("");
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

  it("恢复已核验的本地板书缓存时会编译工作区，且不影响对话恢复", async () => {
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session: learnedSession, stateToken: "x".repeat(48), messages: [], boardCache: { version: 2, requestId: "request-app", lesson: restorableBoardLesson } }));
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("board-cache")) return { ok: true, status: 200, json: async () => ({ data: { lesson: restorableBoardLesson } }) } as Response;
      return response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } });
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("board-cache"))).toBe(true));
    await waitFor(() => expect(latest.session?.requestId).toBe("request-app"));
  });

  it("恢复页面后能用已保存的安全重试动作继续同一个学习任务", async () => {
    const stateToken = "x".repeat(48);
    const failed = { id: "failed-answer", role: "assistant", kind: "assistant", text: "刚才的讲解未完成", status: "error", createdAt: new Date().toISOString() };
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({
      session: learnedSession, stateToken, messages: [failed],
      pendingRetry: { version: 1, requestId: "request-app", stateToken, messageId: "failed-answer", input: { type: "choose", gateId: "gate", choice: "continue" } },
    }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValueOnce(response("turn"));
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage !== "turn") return;
      await onEvent("message.delta", { text: "已从原来的步骤继续。" });
      await onEvent("flow.update", { session: learnedSession, stateToken: "y".repeat(48) });
      await onEvent("flow.ready", {});
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await waitFor(() => expect(latest.retryLabel).toBe("重试这一步"));
    await act(async () => { await latest.onRetry(); });
    const input = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body)).input;
    expect(input).toEqual({ type: "choose", gateId: "gate", choice: "continue" });
    expect(latest.retryLabel).toBe("");
  });

  it("普通任务失败会留下可重试入口，而可选同类练习不会锁住当前任务", async () => {
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session: learnedSession, stateToken: "x".repeat(48), messages: [] }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValue(response("turn"));
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

  it("没有可用推理服务时保持不可发送，并说明下一步", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: false }], illustration: { available: false, reason: "未配置" } }));
    render(<EducationChatApp/>);
    await waitFor(() => expect(screen.getByTestId("notice").textContent).toContain("AI 服务暂不可用"));
    expect(screen.getByTestId("ready").textContent).toBe("false");
    await act(async () => { latest.onReasoningLevel("medium"); });
    expect(screen.getByTestId("notice").textContent).toContain("中推理尚未配置");
  });

  it("图片识别失败会标记原图片消息并保留重新识别操作", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValueOnce(response("recognize"));
    vi.mocked(readSseResponse).mockRejectedValue(new Error("照片太模糊"));
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    latest.onFile(new File(["image"], "blur.png", { type: "image/png" }));
    await screen.findByTestId("cropper");
    await act(async () => { await latestCrop.onConfirm(new Blob(["image"]), "blob:blur"); });
    await waitFor(() => expect(latest.retryLabel).toBe("重新识别"));
    expect(screen.getByTestId("messages").textContent).toContain("这道题我不会，想把它学懂。:error");
    expect(screen.getByTestId("notice").textContent).toContain("照片太模糊");
  });

  it("题目分析要求重拍时不会误给旧题的重新分析入口", async () => {
    const recognized = { text: "题目", childWork: "", subject: "math", gradeBand: "junior", visualContext: { related: false, affectsSolving: false, confidence: 1, facts: [], summary: "" } };
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValueOnce(response("recognize"))
      .mockResolvedValueOnce(response("analyze"));
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage === "recognize") await onEvent("recognized", recognized);
      if (reply.stage === "analyze") throw new Error("请重新拍摄，关键条件仍不清楚");
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await act(async () => { await latest.onSend("这道题"); });
    await waitFor(() => expect(screen.getByTestId("notice").textContent).toContain("用下方相机或相册换一张"));
    expect(latest.retryLabel).toBe("");
  });

  it("选中文字追问携带引用；无效的猜你想问不会抢走当前学习任务", async () => {
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session: learnedSession, stateToken: "x".repeat(48), messages: [] }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValue(response("turn"));
    const requests: any[] = [];
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage !== "turn") return;
      requests.push(reply);
      await onEvent("flow.update", { session: learnedSession, stateToken: "y".repeat(48) });
      await onEvent("flow.ready", {});
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await act(async () => { await latest.onQuestion("这句话为什么重要？", "有两个实数根"); });
    await act(async () => { await latest.onSuggestion({ id: "forged", text: "伪造问题", scopeLabel: "无", sourceSummary: "无" }); });
    expect(requests).toHaveLength(1);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body));
    expect(body.input).toEqual({ type: "question", text: "这句话为什么重要？", quote: "有两个实数根" });
    expect(screen.getByTestId("messages").textContent).toContain("user:这句话为什么重要？");
  });

  it("插画完成后关闭会确认已看过，并在同题内复用已生成的插画", async () => {
    const session = {
      ...learnedSession,
      flow: { ...learnedSession.flow, activeGate: { id: "gate", kind: "understanding", title: "理解", prompt: "是否理解", options: [{ id: "view_illustration", label: "插画演示" }] } },
    };
    const lesson = {
      requestId: session.requestId,
      problemFingerprint: illustrationFingerprint(session as any),
      receipt: "receipt-1",
      title: "看清关系",
      frameCount: 1,
      frames: [{ id: "frame-1", index: 1, title: "第一步", imageUrl: "data:image/svg+xml;base64,PHN2Zy8+", narration: "先看条件" }],
    };
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken: "x".repeat(48), messages: [] }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValue(response("turn"));
    const turnInputs: any[] = [];
    vi.mocked(readSseResponse).mockImplementation(async (reply: any, onEvent: any) => {
      if (reply.stage !== "turn") return;
      turnInputs.push(JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body)).input);
      if (turnInputs.length === 1) await onEvent("illustration.complete", lesson);
      await onEvent("flow.update", { session, stateToken: "y".repeat(48) });
      await onEvent("flow.ready", {});
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await act(async () => { await latest.onChoice(session.flow.activeGate, "view_illustration"); });
    await waitFor(() => expect(latestIllustration.lesson).toEqual(lesson));
    await act(async () => { await latestIllustration.onClose(); });
    await waitFor(() => expect(turnInputs).toHaveLength(2));
    expect(turnInputs[1]).toEqual({ type: "acknowledge_illustration", gateId: "gate", receipt: "receipt-1" });
    await act(async () => { await latest.onChoice(session.flow.activeGate, "view_illustration"); });
    expect(turnInputs).toHaveLength(2);
    expect(latestIllustration.lesson).toEqual(lesson);
  });

  it("根据当前任务把文字、拍照与白板输入分别路由为作答或提问", async () => {
    const answerSession = {
      ...learnedSession,
      flow: {
        ...learnedSession.flow,
        activeGate: { id: "answer-gate", kind: "original_answer", title: "独立作答", prompt: "写答案", options: [] },
      },
    };
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session: answerSession, stateToken: "x".repeat(48), messages: [] }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValue(response("turn"));
    vi.mocked(readSseResponse).mockImplementation(async (_reply: any, onEvent: any) => {
      await onEvent("flow.update", { session: answerSession, stateToken: "y".repeat(48) });
      await onEvent("flow.ready", {});
    });
    render(<EducationChatApp/>);
    await screen.findByTestId("ready");
    await act(async () => { await latest.onSend("42"); });
    const textBody = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body));
    expect(textBody.input).toEqual({ type: "answer", gateId: "answer-gate", answer: "42" });

    latest.onResponsePhoto(new File(["photo"], "answer.png", { type: "image/png" }), "answer");
    await screen.findByTestId("cropper");
    await act(async () => { await latestCrop.onConfirm(new Blob(["photo"], { type: "image/png" }), "blob:answer"); });
    const imageBody = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body as FormData;
    expect(JSON.parse(String(imageBody.get("input")))).toEqual({ type: "image_answer", gateId: "answer-gate" });

    latest.onWhiteboard("question");
    await screen.findByTestId("whiteboard");
    await act(async () => { await latestWhiteboard.onConfirm(new Blob(["ink"], { type: "image/png" }), "blob:ink"); });
    const questionBody = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body as FormData;
    expect(JSON.parse(String(questionBody.get("input")))).toEqual({ type: "image_question" });
  });
});
