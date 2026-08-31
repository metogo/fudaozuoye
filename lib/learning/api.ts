import { assertGraphInvariants, isReadyForOriginal, nextReadyNode } from "./graph";
import { assertFlowState, removeRepeatedSolutionAction } from "./flow";
import { ServiceError } from "./errors";
import type { ApiEnvelope, LearningSession, ProviderId } from "./types";

export function parseSession(value: unknown): LearningSession {
  if (!value || typeof value !== "object") throw new Error("学习会话不存在");
  const session = value as Partial<LearningSession>;
  if (session.schemaVersion !== "1.1" || !Array.isArray(session.nodes) || !Array.isArray(session.edges) || !session.problem || !session.problemGuide) {
    throw new Error("学习会话结构不合法");
  }
  for (const key of ["goal", "keyClue", "approach", "firstQuestion"] as const) {
    if (typeof session.problemGuide[key] !== "string" || !session.problemGuide[key].trim()) throw new Error("原题引导结构不合法");
  }
  if (typeof session.rootNodeId !== "string" || !session.nodes.some((node) => node.id === session.rootNodeId)) {
    throw new Error("学习会话缺少原题节点");
  }
  if (session.nodes.length > 64 || session.edges.length > 128 || !Array.isArray(session.evidence) || session.evidence.length > 256) throw new Error("学习会话数据量不合法");
  if (typeof session.currentNodeId !== "string" && session.currentNodeId !== null) throw new Error("当前知识点不合法");
  if (session.currentNodeId && !session.nodes.some((node) => node.id === session.currentNodeId)) throw new Error("当前知识点不存在");
  if (session.flow && session.flow.boardSuggestion === undefined) session.flow.boardSuggestion = null;
  if (session.flow && session.flow.suggestedQuestions === undefined) session.flow.suggestedQuestions = [];
  if (session.flow && session.flow.solutionRecallPassed === undefined) session.flow.solutionRecallPassed = false;
  if (session.flow?.activeGate && !session.flow.viewedSolution && ["node_answer", "original_answer", "needs_help"].includes(session.flow.activeGate.kind) && session.flow.activeGate.options === undefined) {
    session.flow.activeGate.options = [{ id: "full_solution", label: "看完整讲解", emphasis: "quiet" }];
  }
  if (session.flow) session.flow = removeRepeatedSolutionAction(session.flow);
  if (session.reasoningLevel === undefined) session.reasoningLevel = "light";
  if (!["light", "medium", "high"].includes(session.reasoningLevel)) throw new Error("推理强度不合法");
  for (const node of session.nodes) {
    if (!node || typeof node !== "object" || typeof node.id !== "string" || typeof node.conceptId !== "string" || typeof node.title !== "string" || !Number.isInteger(node.difficulty) || !Number.isInteger(node.attempts) || node.attempts < 0 || node.attempts > 20) throw new Error("知识节点结构不合法");
    if (!node.check || typeof node.check.prompt !== "string" || typeof node.check.answer !== "string" || !node.teaching || typeof node.teaching.explanation !== "string") throw new Error("知识节点教学内容不合法");
  }
  assertFlowState(session.flow, session.nodes, session.transferCheck);
  assertGraphInvariants(session as LearningSession);
  return session as LearningSession;
}

export function requestId(): string {
  return `req-${crypto.randomUUID().slice(0, 8)}`;
}

export function ok<T>(provider: ProviderId, modelId: string, data: T, id = requestId()) {
  const payload: ApiEnvelope<T> = { schemaVersion: "1.0", requestId: id, provider, modelId, data, error: null };
  return Response.json(payload);
}

export function fail(error: unknown, provider: ProviderId = "doubao", modelId = "unavailable", status = 400) {
  const message = error instanceof Error ? error.message : "请求失败";
  const actualStatus = error instanceof ServiceError ? error.status : status;
  const payload: ApiEnvelope<never> = {
    schemaVersion: "1.0", requestId: requestId(), provider, modelId, data: null,
    error: { code: error instanceof ServiceError ? error.code : actualStatus >= 500 ? "PROVIDER_ERROR" : "INVALID_REQUEST", message, retryable: error instanceof ServiceError ? error.retryable : actualStatus >= 500 },
  };
  return Response.json(payload, { status: actualStatus });
}

export function advanceAfterMastery(session: LearningSession, preferredDependentId?: string): LearningSession {
  if (isReadyForOriginal(session)) {
    return { ...session, currentNodeId: session.rootNodeId, stage: "original_check", updatedAt: new Date().toISOString() };
  }
  const next = nextReadyNode(session, preferredDependentId);
  return { ...session, currentNodeId: next?.id ?? null, stage: "learning", updatedAt: new Date().toISOString() };
}
