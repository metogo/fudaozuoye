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
  it("迁移验收可生成题目并提交最终答案", () => {
    const callbacks = props();
    const pending = { ...session, stage: "transfer_check", transferCheck: null };
    const view = render(<LearningWorkspace session={pending as never} {...callbacks}/>);
    fireEvent.click(screen.getByRole("button", { name: "生成迁移题" }));
    expect(callbacks.onGenerateTransfer).toHaveBeenCalled();
    const transfer = { ...session, stage: "transfer_check", transferCheck: { id: "transfer", prompt: "若 x²=9，x 是多少？", answer: "±3", type: "short_text", explanation: "开方" } };
    view.rerender(<LearningWorkspace session={transfer as never} {...callbacks}/>);
    fireEvent.change(screen.getByPlaceholderText("写下你的答案"), { target: { value: "±3" } });
    fireEvent.click(screen.getByRole("button", { name: "提交最终答案" }));
    expect(callbacks.onVerify).toHaveBeenCalledWith("__transfer__", "±3");
  });
  it("知识路径和需要帮助状态仍提供可返回的学习出口", async () => {
    const callbacks = props();
    const needsHelp = { ...session, stage: "needs_help", nodes: session.nodes.map((node, index) => index ? { ...node, state: "needs_help" } : node) };
    const view = render(<LearningWorkspace session={needsHelp as never} {...callbacks} focusNodeId="concept"/>);
    expect(await screen.findByText("这个基础点还没有理解")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看原题完整答案" }));
    expect(await screen.findByText("原题完整答案")).not.toBeNull();
    view.unmount();
    render(<LearningWorkspace session={session as never} {...callbacks} focusNodeId="concept"/>);
    fireEvent.click(screen.getByRole("button", { name: /打开知识路径/ }));
    expect(await screen.findByRole("dialog")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭知识路径" }));
  });
  it("学习卡上的检查、下拆、换题和知识路径选择都回到同一个学习点", async () => {
    const callbacks = props();
    const current = { ...session, nodes: session.nodes.map((node) => node.id === "concept" ? { ...node, state: "learning" } : node) };
    const view = render(<LearningWorkspace session={current as never} {...callbacks}/>);
    expect(screen.getByText("平方根的定义")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "这里不会，找更基础的知识" }));
    expect(callbacks.onExpand).toHaveBeenCalledWith("concept");
    fireEvent.click(screen.getByRole("button", { name: "换相似题" }));
    await waitFor(() => expect(callbacks.onSimilar).toHaveBeenCalledWith("concept"));
    fireEvent.change(screen.getByPlaceholderText("写下你的答案"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
    expect(callbacks.onVerify).toHaveBeenCalledWith("concept", "2");
    fireEvent.click(screen.getByRole("button", { name: "问这段" }));
    expect(await screen.findByRole("dialog")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭追问" }));
    fireEvent.click(screen.getByRole("button", { name: /打开知识路径/ }));
    const path = await screen.findByRole("dialog");
    expect(path.textContent).toContain("越往下，越基础");
    fireEvent.click(screen.getByRole("button", { name: "关闭知识路径" }));
    view.unmount();
  });

  it("原子知识点、选择题、旁支预览和下钻加载态各自保留正确的学习出口", async () => {
    const callbacks = props();
    const choiceNode = {
      ...session.nodes[1],
      atomic: true,
      attempts: 1,
      state: "unknown",
      diagnosticEvidence: "4 的平方根",
      diagnosticEvidenceSource: "child_work",
      check: { ...session.nodes[1].check, id: "similar-choice", type: "choice", choices: ["1", "2", "4"] },
      teaching: { ...session.nodes[1].teaching, alternateExplanation: "换一种说法理解平方根" },
    };
    const atomic = { ...session, nodes: [session.nodes[0], choiceNode], currentNodeId: "concept" };
    const view = render(<LearningWorkspace session={atomic as never} {...callbacks}/>);
    expect(screen.getByText("知识路径已拆到学习起点")).not.toBeNull();
    expect(screen.getByText("我的作答原文“4 的平方根”")).not.toBeNull();
    expect(screen.getByText("换一种说法理解平方根")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
    expect(callbacks.onVerify).toHaveBeenCalledWith("concept", "2");

    const sideNode = { ...choiceNode, id: "side", title: "旁支概念", state: "learning", atomic: false, attempts: 0, diagnosticEvidenceSource: "parent" };
    const side = { ...atomic, currentNodeId: "concept", nodes: [session.nodes[0], choiceNode, sideNode] };
    view.rerender(<LearningWorkspace session={side as never} {...callbacks} focusNodeId="side"/>);
    await waitFor(() => expect(screen.getByText("这是旁支预览。回到当前主讲节点后才能继续作答。")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "返回当前主讲节点" }));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    view.rerender(<LearningWorkspace session={side as never} {...callbacks} focusNodeId="concept" expandingNodeId="concept" notice="正在定位"/>);
    expect((await screen.findByRole("status")).textContent).toContain("正在定位");
    const firstAtomic = { ...atomic, nodes: [session.nodes[0], { ...choiceNode, state: "learning", attempts: 0 }] };
    view.rerender(<LearningWorkspace session={firstAtomic as never} {...callbacks} focusNodeId="concept"/>);
    fireEvent.click(screen.getByRole("button", { name: "还是不懂，换种讲法" }));
    expect(callbacks.onVerify).toHaveBeenCalledWith("concept", "__not_known__");
  });

  it("追问失败可原题重发，滚动提示和忙碌态不会让用户失去返回入口", async () => {
    const callbacks = props();
    callbacks.onTutor.mockRejectedValue(new Error("网络暂时不可用"));
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 600 });
    Object.defineProperty(window, "scrollTo", { configurable: true, value: scrollTo });
    const view = render(<LearningWorkspace session={session as never} {...callbacks} focusNodeId="concept"/>);
    fireEvent.scroll(window);
    fireEvent.click(screen.getByRole("button", { name: "问例子" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "发送问题" }));
    expect((await screen.findByRole("alert")).textContent).toContain("网络暂时不可用");
    fireEvent.click(screen.getByRole("button", { name: "保留问题，重新发送" }));
    expect(callbacks.onTutor).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "回到页面顶部" }));
    expect(scrollTo).toHaveBeenCalled();
    view.rerender(<LearningWorkspace session={{ ...session, stage: "transfer_check", transferCheck: null } as never} {...callbacks} busy/>);
    expect(screen.getByRole("button", { name: "正在生成…" }).hasAttribute("disabled")).toBe(true);
  });
});
