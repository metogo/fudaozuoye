import { describe, expect, it, vi } from "vitest";

// Markup tests exercise the real renderer; async loading is covered separately.
vi.mock("@/components/lazy-rich-learning-text", async () => ({
  ...await import("@/components/rich-learning-text"),
  preloadLearningText: () => import("@/components/rich-learning-text"),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationDocument } from "@/components/conversation-export";
import { LearningChat } from "@/components/learning-chat";
import { conversationExportSnapshot, localExportImage } from "@/lib/learning/conversation-export";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { understandingGate } from "@/lib/learning/flow";
import type { ChatMessage } from "@/lib/learning/types";
import * as Icons from "@/components/icons";

const messages: ChatMessage[] = [
  { id: "question", role: "user", kind: "user", text: "请解释原题", createdAt: "2026-09-06T00:00:00Z", imageUrl: "blob:http://localhost:3000/local-image" },
  { id: "full", role: "assistant", kind: "assistant", scopeLabel: "原题完整讲解", text: "## 解题过程\n\n$\\Delta=36-4k\\geq0$。\n\n最后一个步骤没有省略。", status: "complete", createdAt: "2026-09-06T00:00:01Z", suggestions: [{ id: "q", text: "为什么？", scopeLabel: "判别式", sourceSummary: "条件" }] },
  { id: "ref", role: "user", kind: "user", text: "具体怎么用？", reference: { scopeLabel: "选中文字", sourceSummary: "有两个实数根" }, createdAt: "2026-09-06T00:00:02Z" },
];

describe("本地完整对话导出", () => {
  it("不依赖屏幕可见范围，保留收起讲解、引用、图片与建议", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    session.flow.viewedSolution = true;
    const snapshot = conversationExportSnapshot(messages, session);
    const html = renderToStaticMarkup(<ConversationDocument snapshot={snapshot}/>);
    for (const text of ["最后一个步骤没有省略", "有两个实数根", "为什么？", "local-image", "katex"]) expect(html).toContain(text);
    expect(html).not.toContain("完整讲解已收起");
    expect(snapshot.messages.map((message) => message.id)).toEqual(["question", "full", "ref"]);
    expect(snapshot).not.toHaveProperty("stateToken");
    expect(snapshot).not.toHaveProperty("nodes");
  });
  it("长对话不截断，并只记录已经显示过的填空答案", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    session.flow.activeGate = { id: "blank", kind: "step_answer", title: "填空", prompt: "判别式", stepBlank: { before: "Δ", after: "0", hint: "回忆条件" } };
    const long = Array.from({ length: 250 }, (_, i) => ({ ...messages[0], id: String(i), text: `第${i}条内容` }));
    const snapshot = conversationExportSnapshot(long, session);
    expect(snapshot.messages).toHaveLength(250);
    expect(snapshot.messages.at(-1)?.text).toBe("第249条内容");
    expect(snapshot.task?.revealedAnswer).toBeUndefined();
    session.flow.activeGate.stepAnswer = { answer: "≥", explanation: "有实根" };
    expect(conversationExportSnapshot(long, session).task?.revealedAnswer).toBe("≥");
  });
  it("错误、生成中内容明确标记，恶意HTML不会执行", () => {
    const snapshot = conversationExportSnapshot([
      { ...messages[1], text: '<script>alert(1)</script>\n\n正常文字', status: "error" },
      { ...messages[0], id: "pending", status: "streaming" },
    ], null);
    const html = renderToStaticMarkup(<ConversationDocument snapshot={snapshot}/>);
    expect(html).not.toContain("<script>");
    expect(html).toContain("此条处理未完成");
    expect(html).toContain("此条仍在生成");
    expect(localExportImage("https://other.example/track.png")).toBeUndefined();
    expect(localExportImage("javascript:alert(1)")).toBeUndefined();
  });
  it("旧任务里的板书入口也隐藏，完整讲解和手写仍保留", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    session.flow.activeGate = understandingGate();
    session.flow.activeGate.options!.push({ id: "view_board", label: "用板书讲清楚", emphasis: "secondary" });
    const noop = () => {};
    const html = renderToStaticMarkup(<LearningChat session={session} messages={messages} reasoningLevels={[]} reasoningLevel="light" ready busy={false} loadingLabel="" notice="" retryLabel="" reviewProblem={null} onReasoningLevel={noop} onFile={noop} onResponsePhoto={noop} onWhiteboard={noop} onSend={noop} onQuestion={noop} onChoice={noop} onSuggestion={noop} onConfirmProblem={noop} onRetryOriginal={noop} onRequestTransfer={noop} onReopenBoard={noop} onNewProblem={noop} onRetry={noop}/>);
    expect(html).not.toContain("用板书讲清楚");
    expect(html).not.toContain("再次查看刚才的板书");
    expect(html).toContain("看完整讲解");
    expect(html).toContain("打开白板提问");
    expect(html).toContain('aria-label="导出 PDF"');
  });
  it("图标保持同一规范且不进入辅助技术焦点顺序", () => {
    for (const [name, Icon] of Object.entries(Icons)) {
      const html = renderToStaticMarkup(<Icon className="test-icon"/>);
      // Library glyphs have a 256-unit optical grid; the retained brand mark uses 24.
      expect(html).toContain(name === "NetworkIcon" ? 'viewBox="0 0 24 24"' : 'viewBox="0 0 256 256"');
      expect(html).toContain('width="24"');
      expect(html).toContain('height="24"');
      expect(html).toContain('focusable="false"');
      expect(html).toContain('aria-hidden="true"');
    }
  });
});
