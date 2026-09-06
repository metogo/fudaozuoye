// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boardCacheCandidate,
  choiceLabel,
  isAbortError,
  isReasoningLevel,
  isStoredChatState,
  labelOf,
  messageOf,
  reasoningLabel,
  turnLoadingLabel,
  understandingChoiceFromText,
  validateStoredBoardLesson,
  canReuseIllustration,
} from "@/components/education-chat-app";
import { illustrationFingerprint } from "@/lib/learning/illustration-fingerprint";

const state = {
  stateToken: "x".repeat(48),
  reasoningLevel: "light",
  session: {
    schemaVersion: "1.1", rootNodeId: "root", problem: { text: "求解方程" }, flow: {},
    nodes: [{ id: "root", kind: "problem" }], edges: [],
  },
  messages: [{ id: "m", text: "讲解", role: "assistant" }],
};

describe("对话编排器的恢复与文案守卫", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("只恢复结构完整、推理强度合法的本地会话", () => {
    expect(isStoredChatState(state)).toBe(true);
    expect(isStoredChatState({ ...state, stateToken: "short" })).toBe(false);
    expect(isStoredChatState({ ...state, reasoningLevel: "ultra" })).toBe(false);
    expect(isStoredChatState({ ...state, messages: [{ id: "m", text: 1, role: "assistant" }] })).toBe(false);
    expect(isStoredChatState({ ...state, session: { ...state.session, nodes: [] } })).toBe(false);
  });

  it("缓存候选必须对应当前题目，错误文案不会泄露解析诊断", () => {
    expect(boardCacheCandidate({ requestId: "r", lesson: { title: "板书" } }, "r")).toEqual({ lesson: { title: "板书" } });
    expect(boardCacheCandidate({ requestId: "other", lesson: {} }, "r")).toBeNull();
    expect(boardCacheCandidate([], "r")).toBeNull();
    expect(messageOf(new Error("unexpected token at position 1"))).toContain("格式异常");
    expect(messageOf("bad")).toBe("操作失败，请重试");
    expect(labelOf({}, "默认")).toBe("默认");
    expect(labelOf({ label: "读取中" }, "默认")).toBe("读取中");
  });

  it("所有交互输入都有明确的学习状态文案", () => {
    expect(isReasoningLevel("high")).toBe(true);
    expect(isReasoningLevel("max")).toBe(false);
    expect(reasoningLabel("medium")).toBe("中");
    expect(choiceLabel("view_illustration")).toBe("插画演示");
    expect(turnLoadingLabel({ type: "image_answer", gateId: "g" })).toContain("作答");
    expect(turnLoadingLabel({ type: "choose", gateId: "g", choice: "view_board" })).toContain("板书");
    expect(turnLoadingLabel({ type: "choose", gateId: "g", choice: "not_understood" })).toContain("换一种");
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("aborted"))).toBe(false);
  });

  it("恢复守卫与所有学习动作都会走到可理解的兜底文案", () => {
    expect(isStoredChatState(null)).toBe(false);
    expect(isStoredChatState("not-a-session")).toBe(false);
    expect(isStoredChatState({ ...state, session: { ...state.session, schemaVersion: "1.0" } })).toBe(false);
    expect(isStoredChatState({ ...state, session: { ...state.session, flow: null } })).toBe(false);
    expect(isStoredChatState({ ...state, session: { ...state.session, problem: {} } })).toBe(false);
    expect(isStoredChatState({ ...state, messages: [{ id: "m", text: "讲解", role: "forged" }] })).toBe(false);
    expect(boardCacheCandidate(null, "r")).toBeNull();
    expect(boardCacheCandidate("cache", "r")).toBeNull();
    expect(boardCacheCandidate({ requestId: "r" }, "r")).toBeNull();
    expect(messageOf(new Error("ordinary failure"))).toBe("ordinary failure");
    expect(labelOf({ label: 12 }, "默认")).toBe("12");
    expect(reasoningLabel("light")).toBe("轻度");
    expect(reasoningLabel("high")).toBe("高");
    for (const [choice, label] of [
      ["view_step_answer", "查看这个空的答案"], ["full_solution", "看完整讲解"],
      ["continue", "懂了，继续"], ["try", "这一步我来做"],
      ["view_board", "用板书讲清楚"], ["start_recall", "我看完了，收起讲解"],
      ["retry_original", "遮住讲解，重做原题"], ["practice_similar", "换一道同知识点题"],
      ["finish_review", "先结束，稍后再练"], ["not_understood", "这一步没懂"],
    ] as const) expect(choiceLabel(choice)).toBe(label);
    for (const [input, expected] of [
      [{ type: "choose_suggestion", suggestionId: "s" }, "选中的问题"],
      [{ type: "question", text: "为什么" }, "刚才的问题"],
      [{ type: "image_question" }, "标出的疑问"],
      [{ type: "answer", gateId: "g", answer: "x" }, "判断"],
      [{ type: "retry_original" }, "重新打开"],
      [{ type: "request_transfer" }, "同知识点"],
      [{ type: "acknowledge_illustration", gateId: "g", receipt: "r" }, "关键步骤"],
      [{ type: "choose", gateId: "g", choice: "view_illustration" }, "演算步骤"],
      [{ type: "choose", gateId: "g", choice: "full_solution" }, "完整讲解"],
      [{ type: "choose", gateId: "g", choice: "start_recall" }, "关键步骤"],
      [{ type: "choose", gateId: "g", choice: "practice_similar" }, "同知识点"],
      [{ type: "choose", gateId: "g", choice: "continue" }, "继续讲解"],
    ] as const) expect(turnLoadingLabel(input as never)).toContain(expected);
  });

  it("板书缓存服务能区分有效、失效、暂不可用三种恢复结果", async () => {
    const lesson = { title: "板书", subtitle: "说明", returnLabel: "返回", layout: "steps", blocks: [{ id: "a", label: "条件", content: "看条件", tone: "plain" }], annotations: [] };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { lesson } }) })
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockRejectedValueOnce(new Error("offline")));
    await expect(validateStoredBoardLesson("token", lesson)).resolves.toEqual({ status: "valid", lesson });
    await expect(validateStoredBoardLesson("token", lesson)).resolves.toEqual({ status: "invalid" });
    await expect(validateStoredBoardLesson("token", lesson)).resolves.toEqual({ status: "unavailable" });
    await expect(validateStoredBoardLesson("token", lesson)).resolves.toEqual({ status: "unavailable" });
  });

  it("将自然语言选择精确映射为下一步，并拒绝不明确的输入", () => {
    expect(understandingChoiceFromText(" 我懂了！ ")).toBe("continue");
    expect(understandingChoiceFromText("这一步我来做")).toBe("try");
    expect(understandingChoiceFromText("还是不懂。")).toBe("not_understood");
    expect(understandingChoiceFromText("能不能再讲一点")).toBeNull();
  });

  it("只复用与当前题目严格绑定、帧序完整且资源安全的插画", () => {
    const session = {
      requestId: "illustration-request",
      problem: { text: "x² - 6x + k = 0", visualContext: { summary: "", facts: [] } },
    };
    const lesson = {
      receipt: "receipt-1",
      requestId: session.requestId,
      problemFingerprint: illustrationFingerprint(session as never),
      frameCount: 2,
      frames: [
        { id: "frame-1", index: 1, imageUrl: "data:image/svg+xml;base64,PHN2Zy8+" },
        { id: "frame-2", index: 2, imageUrl: "https://images.example/frame-2.svg" },
      ],
    };
    expect(canReuseIllustration(lesson as never, session as never)).toBe(true);
    expect(canReuseIllustration({ ...lesson, receipt: "" } as never, session as never)).toBe(false);
    expect(canReuseIllustration({ ...lesson, requestId: "other" } as never, session as never)).toBe(false);
    expect(canReuseIllustration({ ...lesson, problemFingerprint: "stale" } as never, session as never)).toBe(false);
    expect(canReuseIllustration({ ...lesson, frameCount: 3 } as never, session as never)).toBe(false);
    expect(canReuseIllustration({ ...lesson, frames: [{ ...lesson.frames[0], id: "wrong" }, lesson.frames[1]] } as never, session as never)).toBe(false);
    expect(canReuseIllustration({ ...lesson, frames: [lesson.frames[0], { ...lesson.frames[1], imageUrl: "https://user:pass@images.example/a.svg" }] } as never, session as never)).toBe(false);
    expect(canReuseIllustration({ ...lesson, frames: [lesson.frames[0], { ...lesson.frames[1], imageUrl: "not a URL" }] } as never, session as never)).toBe(false);
  });
});
