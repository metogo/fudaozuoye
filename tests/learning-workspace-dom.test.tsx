// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningWorkspace } from "@/components/learning-workspace";

const session = {
  schemaVersion: "1.1", requestId: "r1", provider: "doubao", modelId: "model", stage: "learning", currentNodeId: "concept", rootNodeId: "root", originalPassed: false, transferPassed: false,
  problem: { text: "已知 x²=4，求 x", subject: "math", gradeBand: "junior", childWork: "" },
  problemGuide: { goal: "求 x 的值", keyClue: "平方等于 4", approach: "两边开方", firstQuestion: "开方时要注意什么？" },
  nodes: [
    { id: "root", kind: "problem", title: "原题", state: "learning", difficulty: 0, atomic: false, attempts: 0, conceptId: "root", check: { id: "root-check", prompt: "", answer: "", type: "short_text", explanation: "" }, teaching: { explanation: "原题" } },
    { id: "concept", kind: "concept", title: "平方根", state: "unchecked", difficulty: 1, atomic: false, attempts: 0, conceptId: "sqrt", simplification: "先理解平方根", check: { id: "sqrt-check", prompt: "√4 是多少", answer: "2", type: "short_text", explanation: "因为 2²=4" }, teaching: { explanation: "平方根的定义", example: "√9=3", parentPrompt: "平方根是什么？", expectedSignal: "能说出定义", misconception: "不要只取正数" } },
  ], edges: [], evidence: [], flow: { viewedSolution: false, suggestedQuestions: [], boardSuggestion: null, solutionRecallPassed: false, focus: "平方根" }, updatedAt: new Date().toISOString(),
};
const props = () => ({ busy: false, notice: "", focusNodeId: null, expandingNodeId: null, similarNodeId: null, onFocusApplied: vi.fn(), onExpand: vi.fn(), onSimilar: vi.fn(), onVerify: vi.fn(), onGenerateTransfer: vi.fn(), onSolution: vi.fn(async (onDelta) => onDelta("x=±2")), onTutor: vi.fn(async (_scope, _question, onDelta) => onDelta("这是平方根。")), onTutorCancel: vi.fn(), onShare: vi.fn(), onReset: vi.fn() });

describe("学习工作区", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(cleanup);
  it("先展示原题引导，支持就地追问并保留回答", async () => {
    const callbacks = props();
    render(<LearningWorkspace session={session as never} {...callbacks}/>);
    expect(screen.getByText("先看懂这道题")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /针对第 02 段/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("关于 02 · 先抓住这条线索");
    fireEvent.click(screen.getByRole("button", { name: "发送问题" }));
    await waitFor(() => expect(dialog.textContent).toContain("这是平方根。"));
    fireEvent.click(screen.getByRole("button", { name: "关闭追问" }));
    expect(callbacks.onTutorCancel).toHaveBeenCalled();
  });
  it("可直接查看原题答案；关闭后不改变学习进度", async () => {
    const callbacks = props();
    render(<LearningWorkspace session={session as never} {...callbacks}/>);
    fireEvent.click(screen.getByRole("button", { name: "开始一步步做" }));
    await waitFor(() => expect(screen.getAllByText("平方根").length).toBeGreaterThan(1));
    fireEvent.click(screen.getByRole("button", { name: "直接查看原题答案" }));
    expect(await screen.findByText("原题完整答案")).not.toBeNull();
    await screen.findByText("x=±2");
    fireEvent.click(screen.getByRole("button", { name: "关闭答案" }));
    expect(screen.queryByText("原题完整答案")).toBeNull();
    expect(callbacks.onVerify).not.toHaveBeenCalled();
  });
  it("完成后以回溯路径收束，并可生成脱敏报告或开始新题", () => {
    const callbacks = props();
    const completed = { ...session, stage: "complete", originalPassed: true, transferPassed: true, nodes: session.nodes.map((node, index) => index ? { ...node, state: "mastered" } : node) };
    render(<LearningWorkspace session={completed as never} {...callbacks} notice="报告已准备"/>);
    expect(screen.getByRole("heading", { name: /不是做完了/ })).not.toBeNull();
    expect(screen.getByText("报告已准备")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "生成脱敏学习报告" }));
    expect(callbacks.onShare).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "返回首页，学习下一题" }));
    expect(callbacks.onReset).toHaveBeenCalledTimes(1);
  });
});
