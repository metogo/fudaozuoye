import type { LearningEmphasis } from "../learning-emphasis";
import type { StepExercise } from "../step-exercise";
import type { BoardConversationMessage, BoardLesson, BoardSuggestion, CheckItem, IllustrationFrame, IllustrationLesson, KnowledgeEdge, KnowledgeNode, LearningSession, ProblemSnapshot, ProviderId, ReasoningLevel, SuggestedQuestion, TutorScope } from "../types";

export type AnalysisPhaseReporter = (key: string, label: string) => void;
export interface ProviderAdapter {
  streamKnowledgeMap?(session: LearningSession, emit: (event: import("../knowledge-map-stream").KnowledgeMapEvent) => void): Promise<import("../knowledge-map").ProblemKnowledgeMap>;
  generateKnowledgeMap?(session: LearningSession): Promise<import("../knowledge-map").ProblemKnowledgeMap>;
  generateKnowledgeDetail?(session: LearningSession, map: import("../knowledge-map").ProblemKnowledgeMap, nodeId: string): Promise<import("../knowledge-map").KnowledgeDetail>;
  selectEmphasis?(session: LearningSession, source: string, context: string): Promise<LearningEmphasis[]>;
  readonly id: ProviderId;
  readonly reasoningLevel: ReasoningLevel;
  readonly modelId: string;
  readonly mode: "demo" | "live";
  recognizeProblem(imageDataUrl: string, subject?: ProblemSnapshot["subject"], gradeBand?: ProblemSnapshot["gradeBand"]): Promise<ProblemSnapshot>;
  recognizeTextProblem(text: string): Promise<ProblemSnapshot>;
  prepareChatSession(problem: ProblemSnapshot, onPhase?: AnalysisPhaseReporter): Promise<LearningSession>;
  completeChatSession(session: LearningSession, imageDataUrl?: string): Promise<LearningSession>;
  diagnoseProblem(session: LearningSession, onPhase?: AnalysisPhaseReporter): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }>;
  analyzeProblem(problem: ProblemSnapshot, onPhase?: AnalysisPhaseReporter): Promise<LearningSession>;
  expandNode(session: LearningSession, targetNodeId: string, onPhase?: AnalysisPhaseReporter): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }>;
  verifyAnswer(check: CheckItem, answer: string): Promise<{ passed: boolean; explanation: string }>;
  generateSimilarCheck(session: LearningSession, nodeId: string): Promise<CheckItem>;
  generateTransferCheck(session: LearningSession): Promise<CheckItem>;
  generateSolutionRecallCheck?(session: LearningSession, solution: string): Promise<CheckItem>;
  generateStepExercise?(session: LearningSession, source: string): Promise<StepExercise>;
  solveProblem(problem: ProblemSnapshot): Promise<string>;
  streamSolution(problem: ProblemSnapshot, onDelta: (text: string) => void, onReset: () => void, signal?: AbortSignal): Promise<void>;
  streamTutorReply(session: LearningSession, scope: TutorScope, question: string, onDelta: (text: string) => void, signal?: AbortSignal, imageDataUrl?: string, imageRole?: "problem" | "student"): Promise<void>;
  suggestQuestions(session: LearningSession, scope: TutorScope, sourceText: string): Promise<SuggestedQuestion[]>;
  transcribeStudentAnswer(imageDataUrl: string, taskPrompt: string): Promise<{ text: string; confidence: number }>;
  decideBoardPresentation(session: LearningSession, scope: TutorScope): Promise<BoardSuggestion>;
  generateBoardLesson(session: LearningSession, scope: TutorScope, suggestion: BoardSuggestion, context?: BoardConversationMessage[]): Promise<BoardLesson>;
  generateIllustrationLesson(session: LearningSession, onFrame: (frame: IllustrationFrame, frameCount: number) => void, signal?: AbortSignal): Promise<IllustrationLesson>;
  cancelPendingRequests(): void;
}
