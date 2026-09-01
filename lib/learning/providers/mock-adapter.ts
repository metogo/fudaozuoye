import { analyzeMock, expandMock, recognizeMock, similarCheckMock, solutionMock, transferCheckMock, verifyMock } from "../mock-engine";
import { isConcreteRecallAnswer } from "../solution-recall";
import type { BoardConversationMessage, BoardLesson, BoardSuggestion, CheckItem, LearningSession, ProblemSnapshot, ProviderId, ReasoningLevel, SuggestedQuestion, TutorScope } from "../types";
import type { AnalysisPhaseReporter, ProviderAdapter } from "./adapter";
import { deterministicAnswerMatch, safeAssessmentFeedback } from "./assessment";
import { createSafeBoardLesson } from "./board";
import { pendingChatSession, rootOnlySession } from "./provider-validation";
import { questionSuggestionsMock, tutorReplyMock } from "./tutor";

export class MockProviderAdapter implements ProviderAdapter {
  readonly modelId: string;
  readonly mode = "demo" as const;

  constructor(readonly id: ProviderId, readonly reasoningLevel: ReasoningLevel = "light") {
    this.modelId = `${id}-demo`;
  }

  async recognizeProblem(_imageDataUrl: string, subject: ProblemSnapshot["subject"] = "math", gradeBand: ProblemSnapshot["gradeBand"] = "primary") {
    return recognizeMock(subject, gradeBand);
  }

  async recognizeTextProblem(text: string) {
    const subject = /化学|反应|分子|物质|元素|mol|方程式/.test(text) ? "chemistry" : /物理|速度|质量|力|光|电|压强|功率/.test(text) ? "physics" : "math";
    const gradeBand = subject === "math" && /小学|年级|加法|减法|乘法|除法/.test(text) ? "primary" : /高中|函数|导数|向量|动量|摩尔/.test(text) ? "senior" : "junior";
    return { text: text.trim(), childWork: "", subject, gradeBand, confidence: 0.9, userRevised: true } as ProblemSnapshot;
  }

  async prepareChatSession(problem: ProblemSnapshot) { return pendingChatSession(problem, this.id, this.reasoningLevel, this.modelId, this.mode); }
  async completeChatSession(session: LearningSession) {
    const root = session.nodes.find((node) => node.id === session.rootNodeId);
    return root?.check.answer === "等待后台核验" ? rootOnlySession(analyzeMock(session.problem, this.id, this.reasoningLevel)) : session;
  }
  async diagnoseProblem(session: LearningSession) {
    const analyzed = analyzeMock(session.problem, this.id, this.reasoningLevel);
    const nodes = analyzed.nodes.filter((node) => node.kind === "concept");
    return { nodes, edges: nodes.map((node) => ({ from: node.id, to: session.rootNodeId, reason: `完成原题前需要先掌握${node.title}` })) };
  }
  async analyzeProblem(problem: ProblemSnapshot) { return analyzeMock(problem, this.id, this.reasoningLevel); }
  async expandNode(session: LearningSession, targetNodeId: string, onPhase?: AnalysisPhaseReporter) { void onPhase; return expandMock(session, targetNodeId); }
  async verifyAnswer(check: CheckItem, answer: string) {
    const deterministic = deterministicAnswerMatch(check.answer, answer);
    if (deterministic === true) return { passed: true, explanation: "回答正确，关键关系与结果一致。" };
    if (deterministic === false) return safeAssessmentFeedback(check, answer, { passed: false, explanation: "" });
    if (check.id.startsWith("solution-recall-")) {
      const passed = isConcreteRecallAnswer(answer.trim());
      return { passed, explanation: passed ? "已经说出了一个具体的关键步骤。" : "请说出你记得的一个具体操作或关系。" };
    }
    return safeAssessmentFeedback(check, answer, verifyMock(check, answer));
  }
  async generateSimilarCheck(session: LearningSession, nodeId: string) {
    const node = session.nodes.find((item) => item.id === nodeId);
    if (!node || node.kind !== "concept") throw new Error("找不到要换题的知识点");
    return similarCheckMock(node);
  }
  async generateTransferCheck(session: LearningSession) { return transferCheckMock(session.problem.subject, session.problem.gradeBand); }
  async solveProblem(problem: ProblemSnapshot) { return solutionMock(problem); }
  async streamSolution(problem: ProblemSnapshot, onDelta: (text: string) => void, _onReset: () => void, signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const solution = solutionMock(problem);
    for (const part of solution.match(/.{1,12}/gs) ?? [solution]) { if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); onDelta(part); }
  }
  async streamTutorReply(session: LearningSession, scope: TutorScope, question: string, onDelta: (text: string) => void, signal?: AbortSignal, imageDataUrl?: string) {
    void imageDataUrl;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const reply = tutorReplyMock(session, scope, question);
    for (const part of reply.match(/.{1,10}/gs) ?? [reply]) onDelta(part);
  }
  async suggestQuestions(session: LearningSession, scope: TutorScope, sourceText: string): Promise<SuggestedQuestion[]> {
    return questionSuggestionsMock(session, scope, sourceText);
  }
  async transcribeStudentAnswer(imageDataUrl: string, taskPrompt: string) { void imageDataUrl; void taskPrompt; return { text: "3", confidence: 0.96 }; }
  async decideBoardPresentation(session: LearningSession, scope: TutorScope): Promise<BoardSuggestion> {
    const text = `${session.problem.text}${scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId)?.title ?? "" : session.problemGuide.approach}`;
    const relation = /图|角|三角|四边|函数|坐标|光路|电路|受力|结构|关系|步骤|方程|化学式/.test(text);
    return { recommended: relation, reason: relation ? "这一步包含图形、关系或多步变化，用板书拆开更容易看清。" : "当前关系用短文字已经可以讲清楚。", layout: /对比|区别|变化/.test(text) ? "comparison" : /公式|方程|函数|化学式/.test(text) ? "formula" : /图|角|三角|四边|光路|电路|受力/.test(text) ? "relation" : "steps" };
  }
  async generateBoardLesson(session: LearningSession, scope: TutorScope, suggestion: BoardSuggestion, context: BoardConversationMessage[] = []): Promise<BoardLesson> {
    void context;
    return createSafeBoardLesson(session, scope, suggestion);
  }
  cancelPendingRequests() {}
}
