// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/lazy-rich-learning-text", () => ({ RichLearningText: ({ text }: any) => <>{text}</>, CopyableLearningText: ({ text }: any) => <>{text}</>, preloadLearningText: vi.fn(() => Promise.resolve()) }));
vi.mock("@/components/copyable-learning-text", () => ({ CopyableLearningText: ({ text }: any) => <>{text}</> }));
vi.mock("@/components/home-welcome-hero", () => ({ HomeWelcomeHero: () => <div>欢迎</div> }));
vi.mock("@/components/selection-ask", () => ({ SelectionAsk: ({ disabled, onAsk }: any) => <><button type="button" disabled={disabled} onClick={() => onAsk("判别式大于等于零", {} as Range)}>选择文字提问</button><button type="button" disabled={disabled} onClick={() => onAsk("字".repeat(12001), {} as Range)}>选择超长文字</button></> }));
vi.mock("@/components/quote-composer-motion", () => ({ QuoteComposerMotion: () => null }));
vi.mock("@/components/comma-companion", () => ({ CommaCompanion: () => <i>逗号</i> }));
vi.mock("@/components/step-blank", () => ({ StepBlank: () => <div>填空</div> }));
vi.mock("@/components/conversation-export", () => ({ ConversationExport: ({ onClose }: any) => <div role="dialog">导出预览<button onClick={onClose}>关闭导出</button></div> }));
vi.mock("@/components/problem-knowledge-map", () => ({ ProblemKnowledgeMapPage: ({ onClose }: any) => <div role="dialog">知识图谱页面<button onClick={onClose}>关闭图谱</button></div> }));
import { LearningChat } from "@/components/learning-chat";

const base: any = { messages: [], session: null, stateToken: "", reasoningLevels: [{ id: "light", label: "轻度", available: true }, { id: "high", label: "高", available: false }], reasoningLevel: "light", ready: true, busy: false, loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null, onReasoningLevel: vi.fn(), onFile: vi.fn(), onResponsePhoto: vi.fn(), onWhiteboard: vi.fn(), onSend: vi.fn(), onQuestion: vi.fn(), onChoice: vi.fn(), onSuggestion: vi.fn(), onConfirmProblem: vi.fn(), onRetryOriginal: vi.fn(), onRequestTransfer: vi.fn(), onNewProblem: vi.fn(), onRetry: vi.fn() };
const session: any = { requestId: "r", problem: { text: "题目", gradeBand: "junior" }, nodes: [], flow: { stage: "core_explanation", viewedSolution: false, pathNodeIds: [], suggestedQuestions: [{ id: "s", text: "为什么用判别式？", scopeLabel: "判别式", sourceSummary: "根" }], activeGate: { id: "g", kind: "understanding", title: "确认理解", prompt: "你明白了吗？", options: [{ id: "continue", label: "继续", emphasis: "primary" }, { id: "not_understood", label: "没懂" }] } } };
describe("LearningChat", () => { beforeEach(() => { Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class { observe() {} disconnect() {} } }); Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) }); HTMLElement.prototype.scrollTo = vi.fn(); }); afterEach(cleanup);
 it("首页校验文件、选择推理强度并发送文本题目", () => { const p = { ...base, onFile: vi.fn(), onReasoningLevel: vi.fn(), onSend: vi.fn() }; render(<LearningChat {...p}/>); fireEvent.click(screen.getByRole("button", { name: /轻度/ })); expect(p.onReasoningLevel).toHaveBeenCalledWith("light"); const file = new File(["x"], "a.txt", { type: "text/plain" }); fireEvent.change(screen.getByLabelText("从相册选择题目"), { target: { files: [file] } }); expect(screen.getAllByText("请选择图片文件")).toHaveLength(2); fireEvent.change(screen.getByLabelText("输入题目或问题"), { target: { value: "x+1=2" } }); fireEvent.submit(screen.getByLabelText("输入题目或问题").closest("form")!); expect(p.onSend).toHaveBeenCalledWith("x+1=2"); });
 it("任务卡和建议问题都可操作", () => { const p = { ...base, session, stateToken: "token", messages: [{ id: "a", role: "assistant", kind: "assistant", text: "讲解中断", status: "error", createdAt: new Date().toISOString(), suggestions: session.flow.suggestedQuestions }], onChoice: vi.fn(), onSuggestion: vi.fn() }; render(<LearningChat {...p}/>); fireEvent.click(screen.getByRole("button", { name: "继续" })); expect(p.onChoice).toHaveBeenCalledWith(session.flow.activeGate, "continue"); fireEvent.click(screen.getByRole("button", { name: /为什么用判别式/ })); expect(p.onSuggestion).toHaveBeenCalledWith(session.flow.suggestedQuestions[0]); });
 it("识别待确认时要求图中条件，并将编辑结果回传", () => { const confirm = vi.fn(); const problem: any = { text: "图形题", visualContext: { related: true, affectsSolving: true, facts: [], summary: "" } }; render(<LearningChat {...base} session={session} reviewProblem={problem} onConfirmProblem={confirm}/>); expect(screen.getByText("这道题依赖配图，请补全图中条件或重新拍摄。")).not.toBeNull(); fireEvent.change(screen.getByLabelText("图中信息"), { target: { value: "AB=3" } }); fireEvent.click(screen.getByRole("button", { name: "确认题目，开始讲解" })); expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ userRevised: true })); });
 it("两种完成态都会提供合适的后续学习动作", () => { const transfer = vi.fn(), fresh = vi.fn(), retry = vi.fn(); const completed = { ...session, originalPassed: true, flow: { ...session.flow, stage: "complete", activeGate: null } }; const view = render(<LearningChat {...base} session={completed} onRequestTransfer={transfer} onNewProblem={fresh}/>); expect(screen.getByText("你已经独立解决了这道原题")).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: "再练一道同类题" })); expect(transfer).toHaveBeenCalled(); fireEvent.click(screen.getAllByRole("button", { name: "开始新题" }).at(-1)!); expect(fresh).toHaveBeenCalled(); view.rerender(<LearningChat {...base} session={{ ...session, flow: { ...session.flow, stage: "reviewed_complete", activeGate: null } }} onRetryOriginal={retry} onRequestTransfer={transfer} onNewProblem={fresh}/>); fireEvent.click(screen.getByRole("button", { name: "遮住讲解，重做原题" })); expect(retry).toHaveBeenCalled(); });
 it("对话完成后可打开并关闭 PDF 导出和本题知识图谱", async () => {
   const ready = { ...session, flow: { ...session.flow, activeGate: null } };
   render(<LearningChat {...base} session={ready} stateToken="token" messages={[{ id: "m", role: "assistant", kind: "assistant", text: "讲解", status: "complete", createdAt: new Date().toISOString() }]}/>);
   fireEvent.click(screen.getByRole("button", { name: "导出 PDF" }));
   expect(await screen.findByText("导出预览")).not.toBeNull();
   fireEvent.click(screen.getByRole("button", { name: "关闭导出" }));
   fireEvent.click(screen.getByRole("button", { name: "本题知识图谱" }));
   expect(await screen.findByText("知识图谱页面")).not.toBeNull();
   fireEvent.click(screen.getByRole("button", { name: "关闭图谱" }));
 });
 it("首页拒绝过大图片并可直接进入白板写题", () => {
   const onWhiteboard = vi.fn();
   render(<LearningChat {...base} onWhiteboard={onWhiteboard}/>);
   fireEvent.click(screen.getByRole("button", { name: "白板写题" }));
   expect(onWhiteboard).toHaveBeenCalledWith("question");
   const large = new File([new Uint8Array(21 * 1024 * 1024)], "large.png", { type: "image/png" });
   fireEvent.change(screen.getByLabelText("拍照发题"), { target: { files: [large] } });
   expect(screen.getAllByText("图片不能超过 20MB")).toHaveLength(2);
 });
 it("答案任务支持点击选项、白板和拍照作答，失败消息能在原位置重试", () => {
   const onSend = vi.fn(), onWhiteboard = vi.fn(), onResponsePhoto = vi.fn(), onRetry = vi.fn();
   const answerSession = {
     ...session,
     nodes: [{ id: "n", check: { choices: ["A. 4", "B. 5"] } }],
     flow: { ...session.flow, activeGate: { id: "answer", nodeId: "n", kind: "node_answer", title: "做一道小题", prompt: "请选择答案", options: [{ id: "not_understood", label: "没懂" }] } },
   };
   const view = render(<LearningChat {...base} session={answerSession} onSend={onSend} onWhiteboard={onWhiteboard} onResponsePhoto={onResponsePhoto} messages={[]}/>);
   fireEvent.click(screen.getByRole("button", { name: "A 4" }));
   expect(onSend).toHaveBeenCalledWith("A. 4");
   view.rerender(<LearningChat {...base} session={{ ...answerSession, nodes: [] }} onSend={onSend} onWhiteboard={onWhiteboard} onResponsePhoto={onResponsePhoto} messages={[]}/>);
   fireEvent.click(screen.getByRole("button", { name: "打开白板作答" }));
   expect(onWhiteboard).toHaveBeenCalledWith("answer");
   const photo = new File(["x"], "answer.png", { type: "image/png" });
   fireEvent.change(screen.getByLabelText("拍照作答").querySelector("input")!, { target: { files: [photo] } });
   expect(onResponsePhoto).toHaveBeenCalledWith(photo, "answer");
   view.rerender(<LearningChat {...base} session={answerSession} onRetry={onRetry} retryLabel="重试这一步" retryMessageId="failed" messages={[{ id: "failed", role: "assistant", kind: "assistant", text: "中断", status: "error", createdAt: new Date().toISOString() }]}/>);
   fireEvent.click(screen.getByRole("button", { name: "重试这条消息" }));
   expect(onRetry).toHaveBeenCalledTimes(1);
 });
 it("图像复核可切换为辅助或无关图，避免把空图中条件提交给模型", () => {
   const confirm = vi.fn();
   const problem: any = { text: "图形题", visualContext: { related: true, affectsSolving: true, facts: [], summary: "" } };
   render(<LearningChat {...base} session={session} reviewProblem={problem} onConfirmProblem={confirm}/>);
   const submit = screen.getByRole("button", { name: "确认题目，开始讲解" });
   expect(submit.hasAttribute("disabled")).toBe(true);
   fireEvent.click(screen.getByRole("button", { name: "辅助理解" }));
   expect(submit.hasAttribute("disabled")).toBe(false);
   fireEvent.click(submit);
   expect(confirm).toHaveBeenLastCalledWith(expect.objectContaining({ visualContext: expect.objectContaining({ related: true, affectsSolving: false }) }));
   fireEvent.click(screen.getByRole("button", { name: "与题无关" }));
   fireEvent.click(submit);
   expect(confirm).toHaveBeenLastCalledWith(expect.objectContaining({ visualContext: expect.objectContaining({ related: false, facts: [] }) }));
 });
 it("流式消息、下一步占位、结果和错误反馈都保持在对话主线内", () => {
   const retry = vi.fn();
   const flowing = { ...session, flow: { ...session.flow, activeGate: { ...session.flow.activeGate, kind: "node_answer" } } };
   const messages: any[] = [
     { id: "m", role: "system", kind: "milestone", text: "已找到关键条件", status: "complete", createdAt: new Date().toISOString() },
     { id: "p", role: "system", kind: "path", text: "原题 → 平方根", status: "complete", createdAt: new Date().toISOString() },
     { id: "r", role: "system", kind: "result", text: "✓ 回答正确", status: "complete", createdAt: new Date().toISOString() },
     { id: "a", role: "assistant", kind: "assistant", text: "上一段讲解", status: "finishing", createdAt: new Date().toISOString() },
     { id: "e", role: "assistant", kind: "assistant", text: "中断", status: "error", createdAt: new Date().toISOString(), scopeLabel: "原题完整讲解" },
   ];
   const view = render(<LearningChat {...base} session={flowing} stateToken="token" busy loadingLabel="正在准备" retryLabel="重试这一步" retryMessageId="e" onRetry={retry} messages={messages}/>);
   expect(screen.getByText("已找到关键条件")).not.toBeNull();
   expect(screen.getByText("正在补回缺失的基础")).not.toBeNull();
   expect(screen.getByText("下一步正在准备")).not.toBeNull();
   expect(screen.getByText("完整讲解未完成")).not.toBeNull();
   expect(screen.getByRole("button", { name: "重试这条消息" }).hasAttribute("disabled")).toBe(true);
   view.rerender(<LearningChat {...base} session={flowing} stateToken="token" busy={false} retryLabel="重试这一步" retryMessageId="e" onRetry={retry} messages={messages}/>);
   fireEvent.click(screen.getByRole("button", { name: "重试这条消息" }));
   expect(retry).toHaveBeenCalledTimes(1);
 });
 it("答案任务可切换为针对当前步骤的提问，再无缝回到答案输入", () => {
   const onQuestion = vi.fn(), onSend = vi.fn(), onWhiteboard = vi.fn();
   const answerSession = {
     ...session,
     flow: { ...session.flow, stage: "guided_reasoning", activeGate: { id: "answer", kind: "original_answer", title: "独立作答", prompt: "写出结果", options: [{ id: "not_understood", label: "没懂" }] } },
   };
   render(<LearningChat {...base} session={answerSession} onQuestion={onQuestion} onSend={onSend} onWhiteboard={onWhiteboard}/>);
   expect(screen.getByLabelText("输入你的答案")).not.toBeNull();
   fireEvent.click(screen.getByRole("button", { name: "改为提问" }));
   const question = screen.getByLabelText("询问当前步骤");
   fireEvent.change(question, { target: { value: "为什么先这样列式？" } });
   fireEvent.submit(question.closest("form")!);
   expect(onQuestion).toHaveBeenCalledWith("为什么先这样列式？", undefined);
   const answer = screen.getByLabelText("输入你的答案");
   fireEvent.change(answer, { target: { value: "42" } });
   fireEvent.submit(answer.closest("form")!);
   expect(onSend).toHaveBeenCalledWith("42");
   fireEvent.click(screen.getByRole("button", { name: "打开白板作答" }));
   expect(onWhiteboard).toHaveBeenCalledWith("answer");
 });
 it("选中文字后将提问器绑定到引用，发送或取消都会回收为普通对话", () => {
   const onQuestion = vi.fn();
   render(<LearningChat {...base} session={session} onQuestion={onQuestion}/>);
   fireEvent.click(screen.getByRole("button", { name: "选择文字提问" }));
   expect(screen.getByLabelText("正在引用的文字").textContent).toContain("判别式大于等于零");
   const question = screen.getByLabelText("询问当前步骤");
   fireEvent.change(question, { target: { value: "为什么要满足这个条件？" } });
   fireEvent.submit(question.closest("form")!);
   expect(onQuestion).toHaveBeenCalledWith("为什么要满足这个条件？", "判别式大于等于零");
   expect(screen.queryByLabelText("正在引用的文字")).toBeNull();
   fireEvent.click(screen.getByRole("button", { name: "选择文字提问" }));
   fireEvent.click(screen.getByRole("button", { name: "取消引用" }));
   expect(screen.queryByLabelText("正在引用的文字")).toBeNull();
   expect(screen.getByLabelText("输入题目或问题")).not.toBeNull();
 });
 it("拒绝过长的文字引用而不进入悬浮提问状态", () => {
   render(<LearningChat {...base} session={session}/>);
   fireEvent.click(screen.getByRole("button", { name: "选择超长文字" }));
   expect(screen.getByText("选中文字过长，请将引用控制在 12000 字以内。")).not.toBeNull();
   expect(screen.queryByLabelText("正在引用的文字")).toBeNull();
 });
});
