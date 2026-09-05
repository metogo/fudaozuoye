import { analyzeMock, expandMock, isBuiltInMockProblem, recognizeMock, similarCheckMock, solutionMock, transferCheckMock, verifyMock } from "../mock-engine";
import { isSupportedSubjectBand } from "../curriculum";
import { adaptTeachingCopy, teachingBandOf } from "../grade-pedagogy";
import { isConcreteRecallAnswer } from "../solution-recall";
import { subjects, type BoardConversationMessage, type BoardLesson, type BoardSuggestion, type CheckItem, type GradeBand, type IllustrationFrame, type IllustrationLesson, type LearningSession, type ProblemSnapshot, type ProviderId, type ReasoningLevel, type SuggestedQuestion, type TutorScope } from "../types";
import type { AnalysisPhaseReporter, ProviderAdapter } from "./adapter";
import { deterministicAnswerMatch, safeAssessmentFeedback } from "./assessment";
import { createSafeBoardLesson, finalizeBoardLesson } from "./board";
import { pendingChatSession, rootOnlySession } from "./provider-validation";
import { questionSuggestionsMock, tutorReplyMock } from "./tutor";
import { createMockIllustrationLesson } from "./illustration";

export const BUILT_IN_MOCK_IMAGE_DATA_URL = "data:image/jpeg;base64,demo";
export const DEMO_CUSTOM_INPUT_UNSUPPORTED_MESSAGE = "演示模式只支持内置代表题，不支持自定义图片或文字题；请在 .env.local 中设置 AI_MOCK_MODE=false 并配置真实 AI 服务后再试";

export class MockProviderAdapter implements ProviderAdapter {
  readonly modelId: string;
  readonly mode = "demo" as const;

  constructor(readonly id: ProviderId, readonly reasoningLevel: ReasoningLevel = "light") {
    this.modelId = `${id}-demo`;
  }

  async recognizeProblem(imageDataUrl: string, subject: ProblemSnapshot["subject"] = "math", gradeBand: ProblemSnapshot["gradeBand"] = "primary") {
    if (imageDataUrl !== BUILT_IN_MOCK_IMAGE_DATA_URL) throw new Error(DEMO_CUSTOM_INPUT_UNSUPPORTED_MESSAGE);
    return recognizeMock(subject, gradeBand);
  }

  async recognizeTextProblem(text: string) {
    const compact = compactProblemText(text);
    const bands: GradeBand[] = ["primary", "junior", "senior"];
    const sample = subjects.flatMap((subject) => bands.filter((band) => isSupportedSubjectBand(subject, band)).map((band) => recognizeMock(subject, band)))
      .find((candidate) => compactProblemText(candidate.text) === compact);
    if (!sample) throw new Error(DEMO_CUSTOM_INPUT_UNSUPPORTED_MESSAGE);
    return { ...sample, text: text.trim(), childWork: "", confidence: 0.9, userRevised: true } as ProblemSnapshot;
  }

  async prepareChatSession(problem: ProblemSnapshot) {
    if (!isBuiltInMockProblem(problem)) throw new Error(DEMO_CUSTOM_INPUT_UNSUPPORTED_MESSAGE);
    return pendingChatSession(problem, this.id, this.reasoningLevel, this.modelId, this.mode);
  }
  async completeChatSession(session: LearningSession, imageDataUrl?: string) {
    void imageDataUrl;
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
    return adaptMockCheck(similarCheckMock(node), teachingBandOf(session.problem));
  }
  async generateTransferCheck(session: LearningSession) { return adaptMockCheck(transferCheckMock(session.problem.subject, session.problem.gradeBand), teachingBandOf(session.problem)); }
  async solveProblem(problem: ProblemSnapshot) { return adaptTeachingCopy(solutionMock(problem), teachingBandOf(problem)); }
  async streamSolution(problem: ProblemSnapshot, onDelta: (text: string) => void, _onReset: () => void, signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const solution = adaptTeachingCopy(solutionMock(problem), teachingBandOf(problem));
    for (const part of solution.match(/.{1,12}/gs) ?? [solution]) { if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); onDelta(part); }
  }
  async streamTutorReply(session: LearningSession, scope: TutorScope, question: string, onDelta: (text: string) => void, signal?: AbortSignal, imageDataUrl?: string, imageRole?: "problem" | "student") {
    void imageDataUrl;
    void imageRole;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const reply = adaptTeachingCopy(tutorReplyMock(session, scope, question), teachingBandOf(session.problem));
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
    return contextualizeMockBoard(createSafeBoardLesson(session, scope, suggestion), session, context);
  }
  async generateIllustrationLesson(session: LearningSession, onFrame: (frame: IllustrationFrame, frameCount: number) => void, signal?: AbortSignal): Promise<IllustrationLesson> {
    if (signal?.aborted) throw new DOMException("请求已取消", "AbortError");
    const lesson = createMockIllustrationLesson(session);
    lesson.frames.forEach((frame) => onFrame(frame, lesson.frameCount));
    return lesson;
  }
  cancelPendingRequests() {}
}

function contextualizeMockBoard(lesson: BoardLesson, session: LearningSession, context: BoardConversationMessage[]): BoardLesson {
  const match = context.slice().reverse().find((message) => mockContextNote(message.text));
  const note = match ? mockContextNote(match.text) : "";
  if (!match || !note || !lesson.plan || !lesson.blocks[0] || !lesson.plan.scenes[0]) return lesson;
  const content = `${lesson.blocks[0].content} ${note}`;
  return finalizeBoardLesson({
    ...lesson,
    blocks: lesson.blocks.map((block, index) => index === 0 ? { ...block, content } : block),
    plan: {
      ...lesson.plan,
      sourceMessageIds: [match.id],
      scenes: lesson.plan.scenes.map((scene, index) => index === 0 ? { ...scene, content, sourceMessageIds: [match.id] } : scene),
    },
  }, session);
}

function mockContextNote(text: string): string {
  if (/单位/.test(text)) return "结合刚才提到的单位，这里把每个数的单位放回对应位置。";
  if (/总量|每天|工作量/.test(text)) return "结合刚才卡住的总量关系，这里先看总量怎样由每天的量合起来。";
  if (/为什么|理由|依据/.test(text)) return "结合刚才追问的理由，这里会把这一步为什么成立单独说清楚。";
  if (/看不懂|没懂|不会|卡住/.test(text)) return "结合刚才没看懂的地方，这里只拆开当前最关键的一步。";
  return "";
}

function adaptMockCheck(check: CheckItem, band: GradeBand): CheckItem {
  return { ...check, prompt: adaptTeachingCopy(check.prompt, band), explanation: adaptTeachingCopy(check.explanation, band) };
}

function compactProblemText(value: string): string { return value.normalize("NFKC").replace(/[\s，。；：！？?,.!、“”‘’（）()\[\]【】]/g, "").toLowerCase(); }
