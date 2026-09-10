// @vitest-environment jsdom
import type { ComponentProps } from "react";
import type { LearningSession, ProblemSnapshot, ChatMessage } from "@/lib/learning/types";
import type { SelectionAsk } from "@/components/selection-ask";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/lazy-rich-learning-text", () => ({ RichLearningText: ({ text }: { text: string }) => <>{text}</>, CopyableLearningText: ({ text }: { text: string }) => <>{text}</>, preloadLearningText: vi.fn(() => Promise.resolve()) }));
vi.mock("@/components/copyable-learning-text", () => ({ CopyableLearningText: ({ text }: { text: string }) => <>{text}</> }));
vi.mock("@/components/home-welcome-hero", () => ({ HomeWelcomeHero: () => <div>欢迎</div> }));
vi.mock("@/components/selection-ask", () => ({ SelectionAsk: ({ disabled, onAsk }: ComponentProps<typeof SelectionAsk>) => <><button type="button" disabled={disabled} onClick={() => onAsk("判别式大于等于零", {} as Range)}>选择文字提问</button><button type="button" disabled={disabled} onClick={() => onAsk("字".repeat(12001), {} as Range)}>选择超长文字</button></> }));
vi.mock("@/components/quote-composer-motion", () => ({ QuoteComposerMotion: () => null }));
vi.mock("@/components/comma-companion", () => ({ CommaCompanion: () => <i>逗号</i> }));
vi.mock("@/components/step-blank", () => ({ StepBlank: () => <div>填空</div> }));
vi.mock("@/components/conversation-export", () => ({ ConversationExport: ({ onClose, messages }: { onClose: () => void; messages: ChatMessage[] }) => <div role="dialog" data-original-text={messages[0]?.text}>导出预览<button onClick={onClose}>关闭导出</button></div> }));
vi.mock("@/components/problem-knowledge-map", () => ({ KnowledgeMapDialog: ({ onClose }: { onClose: () => void }) => <div role="dialog">知识图谱页面<button onClick={onClose}>关闭图谱</button></div> }));
import { LearningChat } from "@/components/learning-chat";
import { UiLanguageProvider } from "@/components/ui-language";
import { UI_LOCALE_KEY } from "@/lib/ui-copy";

const base: ComponentProps<typeof LearningChat> = { messages: [], session: null, stateToken: "", reasoningLevels: [{ id: "light", label: "轻度", available: true }, { id: "high", label: "高", available: false }], reasoningLevel: "light", ready: true, busy: false, loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null, onReasoningLevel: vi.fn(), onFile: vi.fn(), onResponsePhoto: vi.fn(), onWhiteboard: vi.fn(), onSend: vi.fn(), onQuestion: vi.fn(), onChoice: vi.fn(), onSuggestion: vi.fn(), onConfirmProblem: vi.fn(), onRetryOriginal: vi.fn(), onRequestTransfer: vi.fn(), onNewProblem: vi.fn(), onRetry: vi.fn() };
const initialSession = analyzeMock(recognizeMock("math", "junior"), "doubao");
describe("缺图补拍入口", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    HTMLElement.prototype.scrollTo = vi.fn();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("展示具体缺失条件、保留题干，补图复用文件校验而不是让用户确认放行", () => {
    const onFile = vi.fn();
    const problem = { ...initialSession.problem, text: "如图，求阴影部分面积。", missingVisualInformation: ["阴影区域的边界"] };
    render(<LearningChat {...base} reviewProblem={problem} onFile={onFile}/>);
    expect(screen.getByText("阴影区域的边界")).not.toBeNull();
    expect(screen.getByText(problem.text)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "确认题目，开始讲解" })).toBeNull();
    const input = screen.getByLabelText("补拍或上传完整题目和配图");
    fireEvent.change(input, { target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] } });
    expect(onFile).not.toHaveBeenCalled();
    const file = new File(["x"], "diagram.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });
});
const session: LearningSession = { ...initialSession, requestId: "r", problem: { ...initialSession.problem, text: "题目", gradeBand: "junior" }, nodes: [], flow: { ...initialSession.flow, stage: "core_explanation", viewedSolution: false, pathNodeIds: [], suggestedQuestions: [{ id: "s", text: "为什么用判别式？", scopeLabel: "判别式", sourceSummary: "根" }], activeGate: { id: "g", kind: "understanding", title: "确认理解", prompt: "你明白了吗？", options: [{ id: "continue", label: "继续", emphasis: "primary" }, { id: "not_understood", label: "没懂", emphasis: "secondary" }] } } };
describe("LearningChat", () => { beforeEach(() => { Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class { observe() {} disconnect() {} } }); Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) }); HTMLElement.prototype.scrollTo = vi.fn(); }); afterEach(cleanup);
 it("进入对话即在消息前预留图谱，首页与缺图确认不显示", () => {
   const view = render(<LearningChat {...base}/>);
   expect(screen.queryByRole("region", { name: "本题知识脉络" })).toBeNull();
   const message: ChatMessage = { id: "q", role: "user", kind: "user", text: "一道新题", status: "complete", createdAt: new Date().toISOString() };
   view.rerender(<LearningChat {...base} busy messages={[message]}/>);
   const preview = screen.getByRole("region", { name: "本题知识脉络" });
   expect(screen.queryByText("一道新题")).toBeNull();
   expect(screen.getByRole("button", { name: "查看原题" }).compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
   view.rerender(<LearningChat {...base} busy messages={[message]} reviewProblem={{ ...session.problem, missingVisualInformation: ["缺少长边标注"] }}/>);
   expect(screen.queryByRole("region", { name: "本题知识脉络" })).toBeNull();
 });
 it("讲解仍在输出时自动图谱已经挂载，不等待 busy 结束", async () => {
   const view = render(<LearningChat {...base} busy session={session} stateToken="token" messages={[{ id: "a", role: "assistant", kind: "assistant", text: "讲解继续", status: "streaming", createdAt: new Date().toISOString() }]}/>);
   expect(await screen.findByRole("button", { name: "展开本题知识图谱" })).not.toBeNull();
   expect(screen.getByText("讲解继续")).not.toBeNull();
   view.unmount();
 });
 it("首次读题只有一处等待状态，空流与入场提示不打断原位讲解", async () => {
   const createdAt = new Date().toISOString();
   const original: ChatMessage = { id: "q", role: "user", kind: "user", text: "合成测试题", status: "complete", createdAt };
   const milestone: ChatMessage = { id: "intake", role: "system", kind: "milestone", text: "先抓住这道题的核心", status: "complete", createdAt };
   const empty: ChatMessage = { id: "first", role: "assistant", kind: "assistant", text: "", status: "streaming", createdAt };
   const view = render(<LearningChat {...base} busy loadingLabel="正在读题" messages={[original]}/>);
   expect(screen.getAllByRole("status")).toHaveLength(1);
   expect(screen.getByText("正在读懂这道题")).not.toBeNull();
   expect(document.querySelector(".chat-thinking-card")).toBeNull();
   expect(screen.queryByText("正在找出核心知识…")).toBeNull();
   view.rerender(<LearningChat {...base} busy loadingLabel="正在准备讲解" messages={[original, milestone, empty]}/>);
   expect(screen.queryByText(milestone.text)).toBeNull();
   expect(document.querySelector(".first-explanation-pending")).not.toBeNull();
   expect(document.querySelector(".chat-message--teacher")).toBeNull();
   view.rerender(<LearningChat {...base} busy loadingLabel="正在继续讲解" messages={[original, milestone, { ...empty, text: "### 关键线索\n\n" }]}/>);
   expect(screen.getByRole("heading", { name: "关键线索" })).not.toBeNull();
   expect(screen.queryByText("正在继续讲解")).toBeNull();
   expect(document.querySelector(".first-explanation-pending")).not.toBeNull();
   expect(document.querySelector(".chat-message--teacher")).toBeNull();
   view.rerender(<LearningChat {...base} busy messages={[original, milestone, { ...empty, text: "先看每小时的路程。" }]}/>);
   expect(screen.getByText("先看每小时的路程。")).not.toBeNull();
   expect(document.querySelector(".first-explanation-pending")).toBeNull();
   expect(document.querySelector(".chat-thinking")).toBeNull();
 });
 it("讲解完成及后续追问不再生成重复知识连接，顶部导读和图谱入口仍可用", async () => {
   const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("验收不调用真实模型", { status: 503 }));
   const lesson: ChatMessage = { id: "lesson", role: "assistant", kind: "assistant", text: "三个根各自满足原方程，把三个等式左右分别相加，就能得到幂和的关系，不需要单独求每个根。", status: "complete", createdAt: new Date().toISOString() };
   try {
     const view = render(<LearningChat {...base} session={session} stateToken="token" messages={[lesson]}/>);
     expect(await screen.findByRole("button", { name: "展开本题知识图谱" })).not.toBeNull();
     await new Promise(resolve => setTimeout(resolve, 20));
     view.rerender(<LearningChat {...base} session={session} stateToken="token" messages={[lesson, { ...lesson, id: "follow-up", text: `${lesson.text}再检查一次等式两边。` }]}/>);
     await new Promise(resolve => setTimeout(resolve, 20));
     expect(screen.queryByRole("complementary", { name: "本段知识连接" })).toBeNull();
     expect(screen.queryByText("把知识连起来")).toBeNull();
     expect(screen.getByText(lesson.text)).not.toBeNull();
     expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/knowledge-connection"))).toBe(false);
     fireEvent.click(screen.getByRole("button", { name: "展开本题知识图谱" }));
     expect(await screen.findByText("知识图谱页面")).not.toBeNull();
   } finally { cleanup(); fetchSpy.mockRestore(); }
 });
 it("首页校验文件、选择推理强度并发送文本题目", () => { const p = { ...base, onFile: vi.fn(), onReasoningLevel: vi.fn(), onSend: vi.fn() }; render(<LearningChat {...p}/>); fireEvent.click(screen.getByRole("button", { name: /轻度/ })); expect(p.onReasoningLevel).toHaveBeenCalledWith("light"); const file = new File(["x"], "a.txt", { type: "text/plain" }); fireEvent.change(screen.getByLabelText("从相册选择题目"), { target: { files: [file] } }); expect(screen.getAllByText("请选择图片文件")).toHaveLength(2); fireEvent.change(screen.getByLabelText("输入题目或问题"), { target: { value: "x+1=2" } }); fireEvent.submit(screen.getByLabelText("输入题目或问题").closest("form")!); expect(p.onSend).toHaveBeenCalledWith("x+1=2"); });
 it("中英入口只在首页显示，进入对话和返回首页不丢失语言选择", () => {
   localStorage.removeItem(UI_LOCALE_KEY);
   const page = (props: Partial<ComponentProps<typeof LearningChat>> = {}) => <UiLanguageProvider><LearningChat {...base} {...props}/></UiLanguageProvider>;
   const view = render(page());
   expect(screen.getByRole("group", { name: "界面语言" })).not.toBeNull();
   fireEvent.click(screen.getByRole("button", { name: "English interface" }));
   const messages: ChatMessage[] = [{ id: "question", role: "user", kind: "user", text: "中文题目不应被翻译", status: "complete", createdAt: new Date().toISOString() }];
   view.rerender(page({ messages, busy: true }));
   expect(screen.queryByRole("group", { name: /界面语言|Interface language/ })).toBeNull();
   view.rerender(page({ messages, session }));
   expect(screen.queryByRole("button", { name: "English interface" })).toBeNull();
   expect(screen.getByRole("button", { name: "Export PDF" })).not.toBeNull();
   fireEvent.click(screen.getByRole("button", { name: "View original question" }));
   expect(screen.getByText("中文题目不应被翻译")).not.toBeNull();
   expect(localStorage.getItem(UI_LOCALE_KEY)).toBe("en");
   view.rerender(page());
   expect(screen.getByRole("button", { name: "English interface" }).getAttribute("aria-pressed")).toBe("true");
   fireEvent.click(screen.getByRole("button", { name: "中文界面" }));
   expect(screen.getByRole("group", { name: "界面语言" })).not.toBeNull();
   localStorage.removeItem(UI_LOCALE_KEY);
 });
 it("原题默认折叠且不重复显示，后续追问正常显示，展开状态随消息更新保留，导出仍含原题", async () => {
   const original: ChatMessage = { id: "original", role: "user", kind: "user", text: "请解这道原题", imageUrl: "/question.png", createdAt: "2026-09-10", status: "complete" };
   const followup: ChatMessage = { ...original, id: "followup", text: "为什么这样算", imageUrl: undefined };
   const messages = [original, followup];
   const view = render(<LearningChat {...base} session={session} messages={messages}/>);
   expect(screen.queryByText(original.text)).toBeNull();
   expect(screen.queryByRole("img", { name: "学生发送的题目" })).toBeNull();
   expect(screen.getByText(followup.text)).not.toBeNull();
   fireEvent.click(screen.getByRole("button", { name: "查看原题" }));
   expect(screen.getAllByText(original.text)).toHaveLength(1);
   expect(screen.getByRole("img", { name: "学生发送的题目" }).getAttribute("src")).toBe(original.imageUrl);
   view.rerender(<LearningChat {...base} session={session} messages={[...messages, { ...followup, role: "assistant", kind: "assistant", id: "reply", text: "新讲解" }]}/>);
   expect(screen.getByRole("button", { name: "收起原题" }).getAttribute("aria-expanded")).toBe("true");
   fireEvent.click(screen.getByRole("button", { name: "收起原题" }));
   fireEvent.click(screen.getByRole("button", { name: "导出 PDF" }));
   expect((await screen.findByRole("dialog")).getAttribute("data-original-text")).toBe(original.text);
 });
 it("原题失败或待确认时不隐藏题目和重试入口", () => {
   const original: ChatMessage = { id: "original", role: "user", kind: "user", text: "识别失败的原题", createdAt: "2026-09-10", status: "error" };
   const retry = vi.fn();
   const view = render(<LearningChat {...base} messages={[original]} retryLabel="重试" retryMessageId="original" onRetry={retry}/>);
   expect(screen.queryByRole("button", { name: "查看原题" })).toBeNull();
   expect(screen.getByText(original.text)).not.toBeNull();
   fireEvent.click(screen.getByRole("button", { name: "重试这条消息" }));
   expect(retry).toHaveBeenCalledOnce();
   view.rerender(<LearningChat {...base} messages={[{ ...original, status: "complete" }]} reviewProblem={{ ...session.problem, missingVisualInformation: ["配图未拍全"] }}/>);
   expect(screen.queryByRole("button", { name: "查看原题" })).toBeNull();
   expect(screen.getByText(original.text)).not.toBeNull();
 });
 it("只剩引用追问的历史不把追问误当原题折叠", () => {
   const message: ChatMessage = { id: "quote", role: "user", kind: "user", text: "这句是什么意思？", createdAt: "2026-09-10", reference: { scopeLabel: "核心思路", sourceSummary: "两边相等" } };
   render(<LearningChat {...base} session={session} messages={[message]}/>);
   expect(screen.queryByRole("button", { name: "查看原题" })).toBeNull();
   expect(screen.getByText(message.text)).not.toBeNull();
   expect(screen.getByText("两边相等")).not.toBeNull();
 });
 it("第一段讲解出现后收起两条已完成的读题提示，不删后续进度或失败提示", () => {
   const createdAt = "2026-09-10";
   const original: ChatMessage = { id: "q", role: "user", kind: "user", text: "原题", createdAt };
   const milestones: ChatMessage[] = ["题目已经读懂，先从核心思路开始", "先抓住这道题的核心"].map((text, i) => ({ id: `m${i}`, role: "system", kind: "milestone", status: "complete", text, createdAt }));
   const lesson: ChatMessage = { id: "a", role: "assistant", kind: "assistant", text: "开始讲解", status: "streaming", createdAt };
   const view = render(<LearningChat {...base} messages={[original, ...milestones]}/>);
   expect(screen.getByText(milestones[0].text)).not.toBeNull();
   view.rerender(<LearningChat {...base} messages={[original, ...milestones, lesson, { ...milestones[0], id: "later", text: "独立练习已开始" }]}/>);
   expect(screen.queryByText(milestones[0].text)).toBeNull();
   expect(screen.queryByText(milestones[1].text)).toBeNull();
   expect(screen.getByText("独立练习已开始")).not.toBeNull();
   view.rerender(<LearningChat {...base} messages={[original, ...milestones, { ...lesson, status: "error" }]}/>);
   expect(screen.getByText(milestones[0].text)).not.toBeNull();
 });
 it("尚未建立会话的识别确认和缺图页面也不显示语言切换", () => {
   const view = render(<LearningChat {...base} reviewProblem={initialSession.problem}/>);
   expect(screen.queryByRole("button", { name: "English interface" })).toBeNull();
   view.rerender(<LearningChat {...base} reviewProblem={{ ...initialSession.problem, missingVisualInformation: ["阴影区域的边界"] }}/>);
   expect(screen.queryByRole("button", { name: "English interface" })).toBeNull();
 });
 it("任务卡和建议问题都可操作", () => { const p = { ...base, session, stateToken: "token", messages: [{ id: "a", role: "assistant", kind: "assistant", text: "讲解中断", status: "error", createdAt: new Date().toISOString(), suggestions: session.flow.suggestedQuestions } satisfies ChatMessage], onChoice: vi.fn(), onSuggestion: vi.fn() }; render(<LearningChat {...p}/>); fireEvent.click(screen.getByRole("button", { name: "继续" })); expect(p.onChoice).toHaveBeenCalledWith(session.flow.activeGate, "continue"); fireEvent.click(screen.getByRole("button", { name: /为什么用判别式/ })); expect(p.onSuggestion).toHaveBeenCalledWith(session.flow.suggestedQuestions[0]); });
 it("识别待确认时要求图中条件，并将编辑结果回传", () => { const confirm = vi.fn(); const problem: ProblemSnapshot = { ...initialSession.problem, text: "图形题", visualContext: { related: true, affectsSolving: true, confidence: 0.5, facts: [], summary: "" } }; render(<LearningChat {...base} session={session} reviewProblem={problem} onConfirmProblem={confirm}/>); expect(screen.getByText("这道题依赖配图，请补全图中条件或重新拍摄。")).not.toBeNull(); fireEvent.change(screen.getByLabelText("图中信息"), { target: { value: "AB=3" } }); fireEvent.click(screen.getByRole("button", { name: "确认题目，开始讲解" })); expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ userRevised: true })); });
 it("两种完成态都会提供合适的后续学习动作", () => { const transfer = vi.fn(), fresh = vi.fn(), retry = vi.fn(); const completed: LearningSession = { ...session, originalPassed: true, flow: { ...session.flow, stage: "complete", activeGate: null } }; const view = render(<LearningChat {...base} session={completed} onRequestTransfer={transfer} onNewProblem={fresh}/>); expect(screen.getByText("你已经独立解决了这道原题")).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: "再练一道同类题" })); expect(transfer).toHaveBeenCalled(); fireEvent.click(screen.getAllByRole("button", { name: "开始新题" }).at(-1)!); expect(fresh).toHaveBeenCalled(); view.rerender(<LearningChat {...base} session={{ ...session, flow: { ...session.flow, stage: "reviewed_complete", activeGate: null } }} onRetryOriginal={retry} onRequestTransfer={transfer} onNewProblem={fresh}/>); fireEvent.click(screen.getByRole("button", { name: "遮住讲解，重做原题" })); expect(retry).toHaveBeenCalled(); });
 it("知识图谱作为轮到你了的操作紧跟完整讲解，点击不推进学习", async () => {
   const onChoice = vi.fn();
   const withSolution: LearningSession = { ...session, flow: { ...session.flow, activeGate: { ...session.flow.activeGate!, options: [...session.flow.activeGate!.options!, { id: "full_solution", label: "看完整讲解", emphasis: "quiet" }] } } };
   const view = render(<LearningChat {...base} session={withSolution} stateToken="token" onChoice={onChoice}/>);
   const task = screen.getByRole("region", { name: "当前学习任务" });
   const helpers = within(task).getByRole("group", { name: "辅助讲解" });
   expect(within(helpers).getAllByRole("button").map(button => button.textContent)).toEqual(["看完整讲解", "查看完整知识图谱"]);
   expect(screen.getAllByRole("button", { name: "本题知识图谱" })).toHaveLength(1);
   fireEvent.click(within(helpers).getByRole("button", { name: "本题知识图谱" }));
   expect(await screen.findByText("知识图谱页面")).not.toBeNull();
   expect(onChoice).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole("button", { name: "关闭图谱" }));
   expect(within(task).getByRole("button", { name: "本题知识图谱" })).not.toBeNull();
   view.rerender(<LearningChat {...base} session={{ ...withSolution, flow: { ...withSolution.flow, viewedSolution: true } }} stateToken="token"/>);
   expect(screen.queryByRole("button", { name: "看完整讲解" })).toBeNull();
   expect(within(screen.getByRole("region", { name: "当前学习任务" })).getByRole("button", { name: "本题知识图谱" })).not.toBeNull();
 });
 it.each([
   { busy: true }, { retryLabel: "重试这一步" }, { stateToken: "" }, { reviewProblem: session.problem },
 ])("图谱入口迁入任务区后仍遵守不可用状态 %j", overrides => {
   render(<LearningChat {...base} session={session} stateToken="token" {...overrides}/>);
   expect(screen.queryByRole("button", { name: "本题知识图谱" })).toBeNull();
 });
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
   const answerSession: LearningSession = {
     ...session,
     nodes: [{ ...initialSession.nodes[0], id: "n", check: { ...initialSession.nodes[0].check!, choices: ["A. 4", "B. 5"] } }],
     flow: { ...session.flow, activeGate: { id: "answer", nodeId: "n", kind: "node_answer", title: "做一道小题", prompt: "请选择答案", options: [{ id: "not_understood", label: "没懂", emphasis: "secondary" }] } },
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
   const problem: ProblemSnapshot = { ...initialSession.problem, text: "图形题", visualContext: { related: true, affectsSolving: true, confidence: 0.5, facts: [], summary: "" } };
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
   const flowing: LearningSession = { ...session, flow: { ...session.flow, activeGate: { ...session.flow.activeGate!, kind: "node_answer" } } };
   const messages: ChatMessage[] = [
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
   const answerSession: LearningSession = {
     ...session,
     flow: { ...session.flow, stage: "guided_reasoning", activeGate: { id: "answer", kind: "original_answer", title: "独立作答", prompt: "写出结果", options: [{ id: "not_understood", label: "没懂", emphasis: "secondary" }] } },
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
 it("当猜你想问或新讲解在可视区域下方时，跳转提示会精确带到对应内容", async () => {
   const scrollTo = vi.fn();
   HTMLElement.prototype.scrollTo = scrollTo;
   const originalRect = HTMLElement.prototype.getBoundingClientRect;
   vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
     if (this.getAttribute("aria-label") === "对话内容") return { top: 0, bottom: 100, width: 320, height: 100 } as DOMRect;
     if (this.closest(".suggested-question-trail")) return { top: 140, bottom: 180, width: 240, height: 40 } as DOMRect;
     return originalRect.call(this);
   });
   const message: ChatMessage = { id: "assistant-1", role: "assistant", kind: "assistant", text: "先确认题干条件。", status: "complete", createdAt: new Date().toISOString(), suggestions: session.flow.suggestedQuestions };
   const view = render(<LearningChat {...base} session={session} messages={[message]}/>);
   fireEvent(window, new Event("resize"));
   const suggestionJump = await screen.findByRole("button", { name: "下面有猜你想问 ↓" });
   fireEvent.click(suggestionJump);
   expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));

   const area = screen.getByLabelText("对话内容");
   Object.defineProperties(area, { scrollHeight: { configurable: true, value: 800 }, clientHeight: { configurable: true, value: 100 }, scrollTop: { configurable: true, writable: true, value: 0 } });
   fireEvent.scroll(area);
   view.rerender(<LearningChat {...base} session={{ ...session, flow: { ...session.flow, suggestedQuestions: [] } }} messages={[message, { ...message, id: "assistant-2", text: "补充一条新的讲解。" }]}/>);
   await waitFor(() => expect(screen.getByRole("button", { name: "有新讲解 ↓" })).not.toBeNull());
   fireEvent.click(screen.getByRole("button", { name: "有新讲解 ↓" }));
   expect(scrollTo).toHaveBeenLastCalledWith({ top: 800, behavior: "smooth" });
 });
});
