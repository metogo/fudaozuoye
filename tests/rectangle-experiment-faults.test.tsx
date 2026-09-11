// @vitest-environment jsdom
import { Component, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { subjects } from "@/lib/learning/types";

vi.mock("@/components/rectangle-experiment", () => { throw new Error("模拟实验资源加载失败"); });
vi.mock("@/components/lazy-rich-learning-text", () => ({ preloadLearningText: vi.fn(() => Promise.resolve()), CopyableLearningText: ({ text }: { text: string }) => <p>{text}</p>, RichLearningText: ({ text }: { text: string }) => <p>{text}</p> }));
vi.mock("@/components/comma-companion", () => ({ CommaCompanion: () => null }));
vi.mock("@/components/selection-ask", () => { throw new Error("模拟划词资源加载失败"); });
vi.mock("@/components/conversation-knowledge-map", () => { throw new Error("模拟图谱资源加载失败"); });
vi.mock("@/components/conversation-export", () => { throw new Error("模拟导出资源加载失败"); });
vi.mock("@/components/quote-composer-motion", () => ({ QuoteComposerMotion: () => null }));
import { LearningChat } from "@/components/learning-chat";

// 外层探针不能收到可选功能的异常，否则主解题流程失守。
class PageProbe extends Component<{ children: ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: "" };
  static getDerivedStateFromError(error: Error) { return { failed: true, message: error.message }; }
  render() { return this.state.failed ? <p role="alert" data-error={this.state.message}>故障已逃逸到整页</p> : this.props.children; }
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const cases = subjects.flatMap(subject => (["primary", "junior", "senior"] as const).map(grade => ({ subject, grade })));
it.each(cases)("$subject / $grade：多个可选资源失败仍能阅读和输入", async ({ subject, grade }) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  HTMLElement.prototype.scrollTo = vi.fn();
  const session = analyzeMock(recognizeMock(subject, grade), "doubao");
  session.problem = { ...session.problem, text: subject === "math" && grade === "primary" ? "长方形长8厘米，宽3厘米，求周长和面积。" : session.problem.text, confidence: 1, missingVisualInformation: [], visualContext: undefined };
  session.flow.pathNodeIds = [];
  session.flow.activeGate = { id: "g", kind: "understanding", title: "确认理解", prompt: "明白了吗？", options: [] };
  const noop = vi.fn();
  render(<PageProbe><LearningChat session={session} stateToken="test-token" messages={[{ id: "a", role: "assistant", kind: "assistant", text: "原有教学正文", status: "complete", createdAt: new Date().toISOString() }]} ready busy={false} reasoningLevels={[]} reasoningLevel="light" loadingLabel="" notice="" retryLabel="" reviewProblem={null} onReasoningLevel={noop} onFile={noop} onResponsePhoto={noop} onWhiteboard={noop} onSend={noop} onQuestion={noop} onChoice={noop} onSuggestion={noop} onConfirmProblem={noop} onRetryOriginal={noop} onRequestTransfer={noop} onNewProblem={noop} onRetry={noop}/></PageProbe>);
  if (subject === "math" && grade === "primary") expect(await screen.findByText("小实验暂时不可用")).toBeTruthy();
  else expect(screen.queryByRole("region", { name: "长方形知识小实验" })).toBeNull();
  expect(await screen.findByText("知识图谱暂时不可用")).toBeTruthy();
  expect(await screen.findByText("划词提问暂时不可用")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "导出 PDF" }));
  expect(await screen.findByText("对话导出暂时不可用")).toBeTruthy();
  for (const alert of screen.getAllByRole("alert")) expect(alert.closest(".chat-scroll")).not.toBeNull();
  expect(screen.queryByText("故障已逃逸到整页")).toBeNull();
  expect(screen.getByText("原有教学正文")).toBeTruthy();
  const input = screen.getByRole("textbox", { name: "输入题目或问题" });
  fireEvent.change(input, { target: { value: "继续问原题" } });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
  expect(noop).toHaveBeenCalled();
  expect(session.flow.activeGate.id).toBe("g");
});
