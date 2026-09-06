import { requiresProblemImage } from "./problem-evidence";
import type { ChatMessage, ClientSessionState, LearningTurnInput } from "./types";

export interface StoredChatRetry {
  version: 1;
  requestId: string;
  stateToken: string;
  messageId: string | null;
  input: LearningTurnInput;
}

// Store data, never closures. Bind replay to the exact unadvanced session state.
export function restoreChatRetry(value: unknown, current: ClientSessionState, messages: ChatMessage[]): StoredChatRetry | null {
  const latest = [...messages].reverse().find((message) => message.surface !== "board" && message.role !== "system");
  if (value && typeof value === "object") {
    const item = value as Partial<StoredChatRetry>;
    if (item.version !== 1 || item.requestId !== current.session.requestId || item.stateToken !== current.stateToken) return null;
    if (item.messageId !== null && (typeof item.messageId !== "string" || latest?.id !== item.messageId || latest.role !== "assistant")) return null;
    const input = safeInput(item.input, current);
    return input ? { version: 1, requestId: item.requestId, stateToken: item.stateToken, messageId: item.messageId, input } as StoredChatRetry : null;
  }
  // Older builds did not save the action. Only intake has an unambiguous replay:
  // no task has started yet. Never guess a question/answer from partial prose.
  if (current.session.flow.stage === "intake" && !current.session.flow.activeGate && !requiresProblemImage(current.session.problem) && latest?.role === "assistant" && (latest.status === "error" || latest.status === "streaming")) {
    return { version: 1, requestId: current.session.requestId, stateToken: current.stateToken, messageId: latest.id, input: { type: "start" } };
  }
  return null;
}

function safeInput(value: unknown, current: ClientSessionState): LearningTurnInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const session = current.session, gate = session.flow.activeGate;
  const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 20000;
  if (input.type === "start") return session.flow.stage === "intake" && !gate && !requiresProblemImage(session.problem) ? { type: "start" } : null;
  if (session.flow.stage === "intake") return null;
  if (input.type === "question" && text(input.text) && (input.quote === undefined || text(input.quote))) return { type: "question", text: input.text, ...(input.quote === undefined ? {} : { quote: input.quote }) };
  if (input.type === "choose" && input.gateId === gate?.id && !input.boardContext) {
    const option = gate?.options?.find((option) => option.id === input.choice);
    if (option && !["view_board", "view_illustration", "practice_similar"].includes(option.id)) return { type: "choose", gateId: gate!.id, choice: option.id };
    if (input.choice === "continue" && gate?.kind === "step_answer" && session.stepCheck && session.stepAnswerViewedFor === session.stepCheck.id) return { type: "choose", gateId: gate.id, choice: "continue" };
  }
  if (input.type === "answer" && input.gateId === gate?.id && gate && ["step_answer", "node_answer", "solution_recall_answer", "original_answer", "transfer_answer"].includes(gate.kind) && text(input.answer)) return { type: "answer", gateId: gate.id, answer: input.answer };
  if (input.type === "choose_suggestion" && session.flow.suggestedQuestions.some((suggestion) => suggestion.id === input.suggestionId)) return { type: "choose_suggestion", suggestionId: input.suggestionId as string };
  if (input.type === "retry_original" && session.flow.solutionRecallPassed && session.flow.stage === "reviewed_complete") return { type: "retry_original" };
  return null;
}
