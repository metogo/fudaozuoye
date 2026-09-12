import { flowScopeLabel, removeRepeatedSolutionAction } from "../flow";
import { requiresProblemImage } from "../problem-evidence";
import { mergePreparedAnswer } from "../session-preparation";
import { toClientState } from "../server-state";
import { PENDING_ORIGINAL_ANSWER } from "../providers/provider-validation";
import type { ProviderAdapter } from "../providers/provider-contract";
import type { BoardSuggestion, LearningGateKind, LearningSession, LearningTurnInput, SuggestedQuestion, TutorScope } from "../types";
import { pathLabels } from "./turn-support";
type Send = (event: string, data: unknown) => void;
type Adapter = ProviderAdapter;

export function canRequestTransfer(session: LearningSession) {
  if (session.flow.stage === "complete") return session.originalPassed || session.transferPassed;
  return session.flow.solutionRecallPassed && ["solution_recall", "reviewed_complete"].includes(session.flow.stage);
}

export async function streamReply(session: LearningSession, scope: TutorScope, question: string, adapter: Adapter, send: Send, signal: AbortSignal, imageDataUrl?: string, imageRole: "problem" | "student" = "student", onFirstText?: () => void): Promise<string> {
  let emitted = false;
  const startedAt = Date.now();
  const heading = `### ${flowScopeLabel(session, scope)}\n\n`;
  let content = heading;
  send("message.delta", { text: heading });
  await adapter.streamTutorReply(session, scope, question, (text) => {
    const first = !emitted && Boolean(text);
    if (!emitted && text) send("perf.phase", { key: "tutor_first_text", elapsedMs: Date.now() - startedAt });
    emitted = emitted || Boolean(text); content += text; send("message.delta", { text });
    if (first && !signal.aborted) onFirstText?.();
  }, signal, imageDataUrl, imageRole);
  if (!emitted) throw new Error("模型没有返回有效讲解");
  send("message.complete", { scopeLabel: flowScopeLabel(session, scope) });
  return content;
}

export async function offerSuggestions(session: LearningSession, scope: TutorScope, sourceText: string, adapter: Adapter, send: Send, signal: AbortSignal): Promise<LearningSession> {
  let suggestions: SuggestedQuestion[] = [];
  try {
    suggestions = await awaitOptional(adapter.suggestQuestions(session, scope, sourceText), signal, 8_000, () => adapter.cancelPendingRequests());
  } catch (error) {
    if (isAbortError(error)) throw error;
  }
  const next = updateFlow(session, { suggestedQuestions: suggestions });
  if (suggestions.length) send("flow.suggestions", { suggestions });
  emitState(next, send);
  return next;
}

export async function decideBoardPresentation(session: LearningSession, scope: TutorScope, adapter: Adapter, send: Send, signal: AbortSignal): Promise<BoardSuggestion | null> {
  if (signal.aborted) return null;
  try {
    const suggestion = await awaitOptional(adapter.decideBoardPresentation(session, scope), signal, 8_000, () => adapter.cancelPendingRequests());
    const previous = session.flow.boardSuggestion;
    const repeatedForSameFocus = previous?.recommended === true && suggestion.recommended && sameScope(session.flow.focus, scope);
    if (suggestion.recommended && !repeatedForSameFocus) send("presentation.suggestion", suggestion);
    return suggestion;
  } catch (error) {
    if (isAbortError(error)) throw error;
    send("presentation.unavailable", { message: "板书呈现判断暂时不可用，不影响继续学习" });
    return null;
  }
}

export function requestedBoardSuggestion(session: LearningSession): BoardSuggestion {
  const current = session.flow.boardSuggestion;
  if (current?.recommended) return current;
  const focus = session.flow.focus;
  const node = focus.kind === "node"
    ? session.nodes.find((item) => item.id === focus.nodeId && item.kind === "concept")
    : null;
  const context = `${session.problem.text}\n${node?.title ?? ""}\n${node?.diagnosticEvidence ?? ""}`;
  const layout: BoardSuggestion["layout"] = /比较|对比|区别|相同|不同|变化前|变化后/.test(context)
    ? "comparison"
    : /方程|函数|公式|化学式|反应式|=|＋|－|×|÷/.test(context)
      ? "formula"
      : /如图|图形|几何|三角|四边|圆|角|坐标|光路|透镜|电路|受力|杠杆/.test(context)
        ? "relation"
        : "steps";
  return {
    recommended: true,
    reason: "按你的选择，把当前步骤的条件、关系、推理顺序和易错点整理到同一张板书中。",
    layout,
  };
}

export function emitSafeCorrection(send: Send, text: string, scopeLabel: string) {
  send("message.delta", { text });
  send("message.complete", { scopeLabel });
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

export function sameScope(first: TutorScope, second: TutorScope) {
  if (first.kind !== second.kind) return false;
  if (first.kind === "node" && second.kind === "node") return first.nodeId === second.nodeId;
  return first.kind === "problem" && second.kind === "problem" && first.section === second.section;
}

export async function awaitOptional<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs = 60_000, cancelOperation: () => void = () => undefined): Promise<T> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cancelOperation();
      finish(() => reject(new Error("可选能力响应超时")));
    }, timeoutMs);
    const abort = () => finish(() => reject(new DOMException("Aborted", "AbortError")));
    const finish = (complete: () => void) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      complete();
    };
    signal.addEventListener("abort", abort, { once: true });
    operation.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}

export function emitState(session: LearningSession, send: Send) {
  if (!session.flow.activeGate && !["intake", "complete", "reviewed_complete"].includes(session.flow.stage)) {
    throw new Error("下一步学习任务未准备完整，请重试当前操作");
  }
  if (session.flow.pathNodeIds.length > 0) send("path.updated", { nodeIds: session.flow.pathNodeIds, labels: pathLabels(session, session.flow.pathNodeIds) });
  if (session.flow.activeGate) send("flow.gate", session.flow.activeGate);
  send("flow.update", toClientState(session));
}

export function needsPreparedAnswer(input: LearningTurnInput): boolean {
  if (input.type === "answer" || input.type === "image_answer" || input.type === "retry_original") return true;
  return input.type === "choose" && (input.choice === "retry_original" || input.choice === "view_illustration");
}

export async function ensurePreparedAnswer(session: LearningSession, adapter: Adapter): Promise<LearningSession> {
  const root = session.nodes.find((node) => node.id === session.rootNodeId);
  if (!root) throw new Error("学习会话缺少原题节点");
  if (root.check.answer !== PENDING_ORIGINAL_ANSWER) return session;
  if (requiresProblemImage(session.problem)) throw new Error("原题图片尚未完成联合分析，请重新提交题目照片");
  return mergePreparedAnswer(session, await adapter.completeChatSession(session));
}

export function updateFlow(session: LearningSession, patch: Partial<LearningSession["flow"]>): LearningSession {
  return touch({ ...session, flow: removeRepeatedSolutionAction({ ...session.flow, suggestedQuestions: [], ...patch }) });
}

export function touch(session: LearningSession): LearningSession {
  return { ...session, updatedAt: new Date().toISOString() };
}

export function currentConcept(session: LearningSession) {
  return session.nodes.find((item) => item.id === session.currentNodeId && item.kind === "concept") ?? null;
}

export function requireGate(session: LearningSession, gateId: string, expected?: LearningGateKind) {
  const gate = session.flow.activeGate;
  if (!gate || gate.id !== gateId) throw new Error("当前学习任务已变化，请按页面最新提示继续");
  if (expected && gate.kind !== expected) throw new Error("当前学习任务不接受这个操作");
  return gate;
}
