// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/use-question-entry-reporting", () => ({ useQuestionEntryReporting: () => () => {} }));

import type { LearningChat } from "@/components/learning-chat";
let chat: ComponentProps<typeof LearningChat> | undefined;
import type { LearningBoard } from "@/components/learning-board";
let board: ComponentProps<typeof LearningBoard> | undefined;

// The board is deliberately hidden in production. This integration harness keeps
// its dormant recovery path executable without changing the shipped flag.
vi.mock("@/lib/learning/ui-features", () => ({ BOARD_UI_ENABLED: true }));
vi.mock("@/components/learning-chat", () => ({
  LearningChat: (props: ComponentProps<typeof LearningChat>) => { chat = props; return <div data-testid="chat"/>; },
}));
vi.mock("@/components/learning-board", () => ({
  LearningBoard: (props: ComponentProps<typeof LearningBoard>) => { board = props; return <section data-testid="board"/>; },
}));
vi.mock("@/components/image-cropper", () => ({ ImageCropper: () => null }));
vi.mock("@/components/whiteboard-input", () => ({ WhiteboardInput: () => null }));
vi.mock("@/components/learning-illustration", () => ({ LearningIllustration: () => null }));
vi.mock("@/lib/learning/client-sse", () => ({ readSseResponse: vi.fn() }));

import { EducationChatApp } from "@/components/education-chat-app";
import { readSseResponse } from "@/lib/learning/client-sse";

const stateToken = "x".repeat(48);
const session = {
  schemaVersion: "1.1", requestId: "board-request", reasoningLevel: "light",
  problem: { text: "总量180千米，3小时行驶完，求每小时行驶多少千米。", subject: "math", gradeBand: "primary", visualContext: { summary: "", facts: [] } },
  rootNodeId: "root", nodes: [{ id: "root", title: "原题", kind: "problem", difficulty: 0, state: "learning", atomic: false, check: { id: "root-check", conceptId: "root", type: "short_text", prompt: "求每小时行驶多少千米", answer: "60千米", explanation: "总量除以时间。" } }], edges: [],
  flow: { stage: "core_explanation", viewedSolution: false, suggestedQuestions: [], activeGate: { id: "gate", kind: "understanding" as const, title: "理解", prompt: "是否理解", options: [{ id: "view_board" as const, emphasis: "primary" as const, label: "看板书" }, { id: "continue" as const, emphasis: "primary" as const, label: "继续" }] } },
};
const lesson = {
  title: "数量关系", subtitle: "板书", returnLabel: "回到对话", layout: "steps", annotations: [],
  blocks: [
    { id: "orient", label: "找到条件", content: "总量180千米，3小时行驶完。定位本题需要使用的已知条件", tone: "plain" },
    { id: "reason", label: "建立关系", content: "把已知条件连接成可计算的关系。把总量除以时间。", tone: "key" },
  ],
  plan: {
    version: 2, contentRevision: 2, subject: "math", discipline: "math", thesis: "先抓住题干中的数量关系再列式求解。", learningGoal: "理解数量关系", sourceMessageIds: [],
    scenes: [
      { id: "orient", label: "找到条件", title: "找到条件", content: "总量180千米，3小时行驶完。定位本题需要使用的已知条件", tone: "plain", intent: "extract", sourceMessageIds: [], role: "orient", move: "提取条件", purpose: "定位本题需要使用的已知条件", evidence: "总量180千米", why: "已知条件决定后续如何建立数量关系。", selfCheck: "能说出题干给了什么。" },
      { id: "reason", label: "建立关系", title: "建立关系", content: "把已知条件连接成可计算的关系。把总量除以时间。", tone: "key", intent: "derive", sourceMessageIds: [], role: "reason", move: "建立关系", purpose: "把已知条件连接成可计算的关系", evidence: "3小时行驶完", why: "关系建立后才能按照同一规则完成推导。", selfCheck: "能写出对应关系。" },
    ],
  },
};
const response = (stage: string, body: unknown = {}) => ({ stage, ok: true, json: async () => body }) as Response & { stage: string };

describe("隐藏板书的恢复路径", () => {
  beforeEach(() => {
    chat = undefined;
    board = undefined;
    sessionStorage.clear();
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-1234-1234-123456789012" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response("consent", { reasoningLevels: [{ id: "light", label: "轻度", available: true }], illustration: { available: true } }))
      .mockResolvedValue(response("turn")));
    vi.mocked(readSseResponse).mockReset();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("可打开、校验、提问、收起并重新打开一份生成好的板书", async () => {
    sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken, messages: [{ id: "m1", role: "assistant", kind: "assistant", text: "先看总量180千米。", status: "complete", createdAt: new Date().toISOString() }] }));
    vi.mocked(readSseResponse).mockImplementation(async (reply, onEvent) => {
      if ((reply as Response & { stage: string }).stage !== "turn") return;
      await onEvent("board.lesson", lesson);
      await onEvent("flow.update", { session, stateToken: "y".repeat(48) });
      await onEvent("flow.ready", {});
    });
    render(<EducationChatApp/>);
    await waitFor(() => expect(chat?.session?.requestId).toBe("board-request"));
    await act(async () => { await chat!.onChoice(session.flow.activeGate, "view_board"); });
    await waitFor(() => expect(chat!.notice || board).toBeTruthy());
    expect(chat!.notice).toBe("");
    await screen.findByTestId("board");
    expect(board!.document).toBeTruthy();
    // Deliberately inject corrupted persisted state to exercise runtime validation.
    board!.onWorkspaceChange({ invalid: true } as unknown as ComponentProps<typeof LearningBoard>["workspaceState"]);
    await waitFor(() => expect(chat!.notice).toContain("主动回忆状态异常"));
    await act(async () => { await board!.onAsk("为什么要除以时间？"); });
    expect(chat!.messages.some((message) => message.surface === "board")).toBe(true);
    await act(async () => { await board!.onClose(); });
    await waitFor(() => expect(screen.queryByTestId("board")).toBeNull());
    await act(async () => { await chat!.onReopenBoard!(); });
    await screen.findByTestId("board");
  });
});
