import { teachingBandOf } from "../grade-pedagogy";
import type { BoardConversationMessage, BoardLesson, BoardSuggestion, LearningSession, TutorScope } from "../types";
import {
  addSafeBoardAnnotations,
  boardAuditPrompt,
  boardAuditSystemPrompt,
  boardAuditTool,
  boardContentTool,
  boardCoreContentSystemPrompt,
  boardLessonPrompt,
  boardLessonSystemPrompt,
  createSafeBoardLesson,
  finalizeBoardLesson,
  parseBoardAudit,
  parseBoardContent,
  recoverBoardContentPlan,
} from "./board";
import { parseJsonObject, type JsonObject } from "./model-support";

type ToolRequest = (system: string, prompt: string, tool: JsonObject, maxTokens?: number, timeoutMs?: number) => Promise<string>;
type TextRequest = (system: string, prompt: string, imageDataUrl?: string, jsonMode?: boolean, timeoutMs?: number) => Promise<string>;
const candidateTimeoutMs = 30_000;
const candidateRepairTimeoutMs = 18_000;
const auditTimeoutMs = 12_000;
export interface BoardGenerationClient {
  protocol: "chat-completions" | "responses";
  toolRequest: ToolRequest;
  textRequest: TextRequest;
}

export async function generateContextualBoardLesson(
  client: BoardGenerationClient,
  session: LearningSession,
  scope: TutorScope,
  suggestion: BoardSuggestion,
  context: BoardConversationMessage[],
): Promise<BoardLesson> {
  try {
    const lesson = finalizeBoardLesson(await generateCandidate(client, session, scope, suggestion, context), session);
    const auditPrompt = boardAuditPrompt(session, scope, lesson, context);
    const auditRaw = client.protocol === "chat-completions"
      ? await client.toolRequest(boardAuditSystemPrompt(), auditPrompt, boardAuditTool(), 320, auditTimeoutMs)
      : await client.textRequest(boardAuditSystemPrompt(), auditPrompt, undefined, true, auditTimeoutMs);
    const audit = parseBoardAudit(parseJsonObject(auditRaw));
    if (audit.passed) return lesson;
    console.warn("板书候选未通过事实审校，已使用可验证的安全板书", audit.reason);
    return createSafeBoardLesson(session, scope, suggestion, `完整板书未通过内容验收：${audit.reason}`);
  } catch (error) {
    if (isAbortError(error)) throw error;
    const reason = error instanceof Error ? error.message : "未知错误";
    console.warn("板书生成未通过结构校验，已使用可验证的安全板书", reason);
    return createSafeBoardLesson(session, scope, suggestion, /超时|timeout/i.test(reason)
      ? "完整板书生成超时，当前内容已降级。"
      : "完整板书的结构或事实校验未通过，当前内容已降级。");
  }
}

async function generateCandidate(
  client: BoardGenerationClient,
  session: LearningSession,
  scope: TutorScope,
  suggestion: BoardSuggestion,
  context: BoardConversationMessage[],
): Promise<BoardLesson> {
  const learnerBand = teachingBandOf(session.problem);
  const system = boardLessonSystemPrompt(learnerBand);
  const prompt = boardLessonPrompt(session, scope, suggestion, context);
  if (client.protocol === "chat-completions") {
    const first = await client.toolRequest(
      boardCoreContentSystemPrompt(learnerBand),
      `${prompt}\n优先使用 5 个教学单元，直接调用指定函数。`,
      boardContentTool(),
      2400,
      candidateTimeoutMs,
    );
    try {
      return addSafeBoardAnnotations(recoverBoardContentPlan(parseJsonObject(first), session, suggestion, context), session);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "结构不合法";
      if (isAbortError(error) || /超时|timeout/i.test(reason)) throw error;
      const repaired = await client.toolRequest(
        `${boardCoreContentSystemPrompt(learnerBand)}\n这是唯一一次定向修复。必须解决给出的校验错误，不能重复原输出。`,
        `${prompt}\n上一次板书未通过验收：${reason}\n上一次输出：${first.slice(0, 6000)}\n重新完整调用指定函数。`,
        boardContentTool(),
        2400,
        candidateRepairTimeoutMs,
      );
      return addSafeBoardAnnotations(recoverBoardContentPlan(parseJsonObject(repaired), session, suggestion, context), session);
    }
  }
  const content = parseBoardContent(parseJsonObject(await client.textRequest(
    `${system}\n先只输出板书正文与可选配图，不输出重点标记。\n只输出严格 JSON。`,
    `${prompt}\nvisual 不需要时返回 kind=none，其余文字留空、elements 为空数组。\n输出字段：title、blocks、visual、plan。`,
    undefined,
    true,
    candidateTimeoutMs,
  )), session, suggestion, context);
  return addSafeBoardAnnotations(content, session);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
