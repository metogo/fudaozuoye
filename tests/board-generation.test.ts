import { describe, expect, it, vi } from "vitest";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { createSafeBoardLesson } from "@/lib/learning/providers/board";
import { generateContextualBoardLesson, type BoardGenerationClient } from "@/lib/learning/providers/board-generation";
import type { BoardSuggestion, LearningSession, TutorScope } from "@/lib/learning/types";

const suggestion: BoardSuggestion = { recommended: true, reason: "把条件与关系放在一起更容易核对。", layout: "relation" };
const scope: TutorScope = { kind: "problem", section: "keyClue" };

function session(): LearningSession {
  return analyzeMock(recognizeMock("math", "primary"), "doubao");
}

function candidate(current: LearningSession) {
  const lesson = createSafeBoardLesson(current, scope, suggestion);
  return {
    title: lesson.title,
    blocks: lesson.blocks.map((block, index) => ({
      move: lesson.plan!.scenes[index].move,
      label: block.label,
      evidence: lesson.plan!.scenes[index].evidence,
      content: block.content,
      sourceMessageIds: [],
      tone: block.tone,
    })),
  };
}

const passedAudit = JSON.stringify({
  correct: true, grounded: true, noAnswerLeak: true, markingRelevant: true,
  visualCorrect: true, visualGrounded: true, contentDistinct: true,
  teachingComplete: true, aidUseful: true, reason: "所有内容均来自题干并保留了教学顺序。",
});

function client(overrides: Partial<BoardGenerationClient> = {}): BoardGenerationClient {
  return {
    protocol: "chat-completions",
    toolRequest: vi.fn(),
    textRequest: vi.fn(),
    ...overrides,
  };
}

describe("板书生成编排", () => {
  it("候选与审校均通过时保留模型正文并补入本地重点标记", async () => {
    const current = session();
    const api = client();
    const request = api.toolRequest as ReturnType<typeof vi.fn>;
    request.mockResolvedValueOnce(JSON.stringify(candidate(current))).mockResolvedValueOnce(passedAudit);

    const lesson = await generateContextualBoardLesson(api, current, scope, suggestion, []);

    expect(lesson.quality).toBeUndefined();
    expect(lesson.annotations).toHaveLength(Math.min(3, lesson.blocks.length));
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][3]).toBe(2400);
    expect(request.mock.calls[1][3]).toBe(320);
  });

  it("首个候选结构不合法时只做一次定向修复，再走独立审校", async () => {
    const current = session();
    const api = client();
    const request = api.toolRequest as ReturnType<typeof vi.fn>;
    request
      .mockResolvedValueOnce("{not-json")
      .mockResolvedValueOnce(JSON.stringify(candidate(current)))
      .mockResolvedValueOnce(passedAudit);

    const lesson = await generateContextualBoardLesson(api, current, scope, suggestion, []);

    expect(lesson.quality).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1][1]).toContain("上一次板书未通过验收");
    expect(request.mock.calls[1][4]).toBe(18_000);
  });

  it("独立审校拒绝候选时，返回带原因的安全板书", async () => {
    const current = session();
    const api = client();
    const request = api.toolRequest as ReturnType<typeof vi.fn>;
    request.mockResolvedValueOnce(JSON.stringify(candidate(current))).mockResolvedValueOnce(JSON.stringify({
      correct: false, grounded: true, noAnswerLeak: true, markingRelevant: true,
      visualCorrect: true, visualGrounded: true, contentDistinct: true,
      teachingComplete: true, aidUseful: true, reason: "第二段缺少可核对的题干依据。",
    }));

    const lesson = await generateContextualBoardLesson(api, current, scope, suggestion, []);

    expect(lesson.quality).toMatchObject({ status: "safe_fallback", reason: expect.stringContaining("第二段") });
    expect(lesson.blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("Responses 协议使用 JSON 文本调用；候选失败则安全降级", async () => {
    const current = session();
    const api = client({ protocol: "responses" });
    const text = api.textRequest as ReturnType<typeof vi.fn>;
    text.mockResolvedValueOnce("{bad");

    const lesson = await generateContextualBoardLesson(api, current, scope, suggestion, []);

    expect(lesson.quality?.status).toBe("safe_fallback");
    expect(text).toHaveBeenCalledOnce();
    expect(text.mock.calls[0][3]).toBe(true);
  });

  it("用户取消时直接透传取消，不把它误报成安全降级", async () => {
    const current = session();
    const abort = new DOMException("Aborted", "AbortError");
    const api = client({ toolRequest: vi.fn().mockRejectedValue(abort) });

    await expect(generateContextualBoardLesson(api, current, scope, suggestion, [])).rejects.toMatchObject({ name: "AbortError" });
  });
});
