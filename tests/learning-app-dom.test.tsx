// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningApp } from "@/components/learning-app";

vi.mock("@/components/capture-step", () => ({ CaptureStep: ({ ready, onFile }: { ready: boolean; onFile: (file: File) => void }) => <div><p>capture:{String(ready)}</p><button onClick={() => onFile(new File(["x"], "q.png", { type: "image/png" }))}>上传题目</button></div> }));
vi.mock("@/components/image-cropper", () => ({ ImageCropper: ({ onConfirm, onCancel }: { onConfirm: (blob: Blob, url: string) => void; onCancel: () => void }) => <div><button onClick={() => onConfirm(new Blob(["x"]), "blob:q")}>确认裁剪</button><button onClick={onCancel}>取消裁剪</button></div> }));
vi.mock("@/components/review-step", () => ({ PreparationStep: ({ phase, onConfirm, onCancel }: { phase: string; onConfirm: () => void; onCancel: () => void }) => <div><p>prepare:{phase}</p><button onClick={onConfirm}>开始学习</button><button onClick={onCancel}>停止</button></div> }));
vi.mock("@/components/learning-workspace", () => ({ LearningWorkspace: ({ onReset }: { onReset: () => void }) => <div><p>learning</p><button onClick={onReset}>新题</button></div> }));

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
});
