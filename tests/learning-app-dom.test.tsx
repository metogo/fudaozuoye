// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningApp } from "@/components/learning-app";

let latestWorkspace: any;

vi.mock("@/components/capture-step", () => ({ CaptureStep: ({ ready, onFile }: { ready: boolean; onFile: (file: File) => void }) => <div><p>capture:{String(ready)}</p><button onClick={() => onFile(new File(["x"], "q.png", { type: "image/png" }))}>上传题目</button></div> }));
vi.mock("@/components/image-cropper", () => ({ ImageCropper: ({ onConfirm, onCancel }: { onConfirm: (blob: Blob, url: string) => void; onCancel: () => void }) => <div><button onClick={() => onConfirm(new Blob(["x"]), "blob:q")}>确认裁剪</button><button onClick={onCancel}>取消裁剪</button></div> }));
vi.mock("@/components/review-step", () => ({ PreparationStep: ({ phase, onConfirm, onCancel }: { phase: string; onConfirm: () => void; onCancel: () => void }) => <div><p>prepare:{phase}</p><button onClick={onConfirm}>开始学习</button><button onClick={onCancel}>停止</button></div> }));
vi.mock("@/components/learning-workspace", () => ({ LearningWorkspace: (props: any) => {
  latestWorkspace = props;
  return <div><p>learning</p><p data-testid="workspace-notice">{props.notice}</p><button onClick={props.onReset}>新题</button></div>;
} }));

function sse(events: Array<[string, unknown]>) {
  const text = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  return new Response(text, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("学习应用状态机", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

  it("从服务准备、裁剪识别、确认分析到学习空间，并可回到新题", async () => {
    const session = { schemaVersion: "1.1", requestId: "r", provider: "doubao", rootNodeId: "root", currentNodeId: "root", nodes: [{ id: "root" }], edges: [], problemGuide: { goal: "g", keyClue: "k", approach: "a", firstQuestion: "f" } };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ providers: [{ id: "doubao", label: "豆包", available: true, mode: "mock" }] }), { status: 200 }))
      .mockResolvedValueOnce(sse([["recognized", { text: "题目", childWork: "", subject: "math", gradeBand: "junior" }], ["complete", {}]]))
      .mockResolvedValueOnce(sse([["graph", { session, stateToken: "x".repeat(48) }], ["complete", {}]]));
    vi.stubGlobal("fetch", fetch);
    render(<LearningApp/>);
    await screen.findByText("capture:true");
    fireEvent.click(screen.getByRole("button", { name: "上传题目" }));
    expect(screen.getByRole("button", { name: "确认裁剪" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "确认裁剪" }));
    await screen.findByText("prepare:review");
    fireEvent.click(screen.getByRole("button", { name: "开始学习" }));
    await screen.findByText("learning");
    fireEvent.click(screen.getByRole("button", { name: "新题" }));
    await screen.findByText("capture:true");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("服务准备失败时回到可拍题界面并显示可理解提示", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<LearningApp/>);
    await screen.findByText("capture:false");
    expect(screen.getByText("服务暂时无法准备，请刷新后重试。")).not.toBeNull();
  });

  it("题目识别失败会回到上传入口并保留可行动提示", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ providers: [{ id: "doubao", label: "豆包", available: true, mode: "mock" }] }), { status: 200 }))
      .mockRejectedValueOnce(new Error("图片模糊"));
    vi.stubGlobal("fetch", fetch);
    render(<LearningApp/>);
    await screen.findByText("capture:true");
    fireEvent.click(screen.getByRole("button", { name: "上传题目" }));
    fireEvent.click(screen.getByRole("button", { name: "确认裁剪" }));
    await screen.findByText("capture:true");
    expect(screen.getByText("图片模糊")).not.toBeNull();
  });

  it("只恢复结构完整的本地学习会话，损坏记录会被安全清除", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ providers: [{ id: "doubao", label: "豆包", available: true, mode: "mock" }] }), { status: 200 })));
    sessionStorage.setItem("guided-learning-session-v2", JSON.stringify({ stateToken: "short", session: {} }));
    const first = render(<LearningApp/>);
    await screen.findByText("capture:true");
    expect(sessionStorage.getItem("guided-learning-session-v2")).toBeNull();
    first.unmount();
    const session = { schemaVersion: "1.1", requestId: "resume", provider: "openai", rootNodeId: "root", currentNodeId: "root", nodes: [{ id: "root" }], edges: [], problemGuide: { goal: "g", keyClue: "k", approach: "a", firstQuestion: "f" } };
    sessionStorage.setItem("guided-learning-session-v2", JSON.stringify({ stateToken: "x".repeat(48), session, displayProvider: "openai" }));
    render(<LearningApp/>);
    await screen.findByText("learning");
  });

  it("学习空间的拆解、验证、同类题、讲解与追问都会保持会话可继续", async () => {
    const session = {
      schemaVersion: "1.1", requestId: "actions", provider: "doubao", rootNodeId: "root", currentNodeId: "root",
      nodes: [{ id: "root", title: "根知识", atomic: false }], edges: [],
      problemGuide: { goal: "g", keyClue: "k", approach: "a", firstQuestion: "f" }, stage: "learning",
    };
    const next = { ...session, currentNodeId: "child", nodes: [...session.nodes, { id: "child", title: "前置知识", atomic: true }] };
    sessionStorage.setItem("guided-learning-session-v2", JSON.stringify({ stateToken: "x".repeat(48), session }));
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ providers: [{ id: "doubao", label: "豆包", available: true, mode: "mock" }] }), { status: 200 }))
      .mockResolvedValueOnce(sse([["phase", { label: "向下拆解" }], ["graph", { session: next, stateToken: "y".repeat(48) }], ["complete", {}]]))
      .mockResolvedValueOnce(sse([["phase", { label: "生成同类题" }], ["graph", { session, stateToken: "z".repeat(48) }], ["complete", {}]]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { session, stateToken: "a".repeat(48), assessment: { passed: true, explanation: "回答正确" } } }), { status: 200 }))
      .mockResolvedValueOnce(sse([["delta", { text: "完整解答" }], ["complete", {}]]))
      .mockResolvedValueOnce(sse([["delta", { text: "追问回答" }], ["complete", {}]]));
    vi.stubGlobal("fetch", fetch);
    render(<LearningApp/>);
    await screen.findByText("learning");
    await latestWorkspace.onExpand("root");
    await waitFor(() => expect(screen.getByTestId("workspace-notice").textContent).toContain("已向下拆到"));
    await latestWorkspace.onSimilar("root");
    await waitFor(() => expect(screen.getByTestId("workspace-notice").textContent).toContain("同知识点新题"));
    await latestWorkspace.onVerify("root", "42");
    await waitFor(() => expect(screen.getByTestId("workspace-notice").textContent).toBe("回答正确"));
    const solution = vi.fn();
    await latestWorkspace.onSolution(solution);
    expect(solution).toHaveBeenCalledWith("完整解答");
    const tutor = vi.fn();
    await latestWorkspace.onTutor("node", "为什么", tutor);
    expect(tutor).toHaveBeenCalledWith("追问回答");
  });

  it("原子知识点会直接标记不会，并在迁移阶段自动生成同类题", async () => {
    const session = {
      schemaVersion: "1.1", requestId: "atomic", provider: "doubao", rootNodeId: "root", currentNodeId: "root",
      nodes: [{ id: "root", title: "最小知识点", atomic: true }], edges: [], problemGuide: { goal: "g", keyClue: "k", approach: "a", firstQuestion: "f" }, stage: "learning",
    };
    const transferSession = { ...session, stage: "transfer_check", transferCheck: undefined };
    sessionStorage.setItem("guided-learning-session-v2", JSON.stringify({ stateToken: "x".repeat(48), session }));
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ providers: [{ id: "doubao", label: "豆包", available: true, mode: "mock" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { session: transferSession, stateToken: "y".repeat(48), assessment: { passed: false, explanation: "先补基础" } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { session: { ...transferSession, transferCheck: { text: "同类题" } }, stateToken: "z".repeat(48) } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(<LearningApp/>);
    await screen.findByText("learning");
    await latestWorkspace.onExpand("root");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(String(fetch.mock.calls[1][0])).toContain("/learning/verify");
    expect(String(fetch.mock.calls[2][0])).toContain("/learning/transfer");
    expect(JSON.parse(fetch.mock.calls[1][1].body).action).toBe("mark_unknown");
  });

  it("学习请求失败不会清空已恢复的会话，并把操作错误留在当前界面", async () => {
    const session = { schemaVersion: "1.1", requestId: "errors", provider: "doubao", rootNodeId: "root", currentNodeId: "root", nodes: [{ id: "root", title: "根", atomic: false }], edges: [], problemGuide: { goal: "g", keyClue: "k", approach: "a", firstQuestion: "f" }, stage: "learning" };
    sessionStorage.setItem("guided-learning-session-v2", JSON.stringify({ stateToken: "x".repeat(48), session }));
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ providers: [{ id: "doubao", label: "豆包", available: true, mode: "mock" }] }), { status: 200 }))
      .mockRejectedValueOnce(new Error("拆解失败"))
      .mockRejectedValueOnce(new Error("同类题失败"))
      .mockRejectedValueOnce(new Error("讲解失败"));
    vi.stubGlobal("fetch", fetch);
    render(<LearningApp/>);
    await screen.findByText("learning");
    await latestWorkspace.onExpand("root");
    await waitFor(() => expect(screen.getByTestId("workspace-notice").textContent).toBe("拆解失败"));
    await latestWorkspace.onSimilar("root");
    await waitFor(() => expect(screen.getByTestId("workspace-notice").textContent).toBe("同类题失败"));
    const delta = vi.fn();
    await latestWorkspace.onSolution(delta);
    expect(delta).toHaveBeenCalledWith("答案生成失败，请稍后重试。");
    expect(screen.getByText("learning")).not.toBeNull();
  });
});
