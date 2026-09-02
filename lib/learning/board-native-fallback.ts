import { createSubjectNativeBlocks, subjectBoardProfileFor } from "./board-subject-engine";
import { assertBalancedLearningMarkup } from "./presentation";
import { extractBoardEvidenceClauses } from "./board-evidence";
import { generatedTextContainsAnswer } from "./providers/answer-protection";
import type { BoardBlock, BoardPlan, BoardScene, BoardTeachingSubject, LearningSession, TutorScope } from "./types";

export function inferBoardSubject(session: LearningSession): BoardTeachingSubject {
  if (session.problem.subject === "math") return "math";
  if (session.problem.subject === "chinese" || session.problem.subject === "english") return "language";
  if (session.problem.subject === "history" || session.problem.subject === "politics") return "humanities";
  return "science";
}

export function createNativeBoardFallbackPlan(session: LearningSession, blocks: BoardBlock[]): BoardPlan {
  const profile = subjectBoardProfileFor(session);
  const evidence = boardEvidenceCandidates(session);
  const scenes = blocks.map((block, index): BoardScene => {
    const move = profile.moves[index] ?? profile.moves.at(-1)!;
    return {
      id: block.id,
      intent: (["extract", "connect", "derive", "compare", "verify"] as const)[index] ?? "verify",
      role: move.role,
      move: move.id,
      title: block.label,
      content: block.content,
      tone: block.tone,
      purpose: move.purpose,
      evidence: evidence.find((candidate) => block.content.includes(candidate)) ?? evidence[0],
      why: nativeMoveWhy(move.label, move.role),
      selfCheck: move.selfCheck,
      sourceMessageIds: [],
      visual: null,
    };
  });
  return {
    version: 2,
    contentRevision: 2,
    subject: inferBoardSubject(session),
    discipline: session.problem.subject,
    thesis: profile.thesis,
    learningGoal: `${profile.moves[0].purpose}，再${profile.moves[2].purpose}。`,
    sourceMessageIds: [],
    scenes,
  };
}

export function createNativeBoardBlocks(session: LearningSession, scope: TutorScope): BoardBlock[] {
  return createSubjectNativeBlocks(session, scope);
}

export function createNativeBoardTitle(session: LearningSession, scope: TutorScope): string {
  const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
  const answer = session.nodes.find((item) => item.id === session.rootNodeId)?.check.answer ?? "";
  return node?.title && !generatedTextContainsAnswer(node.title, answer) ? node.title : subjectBoardProfileFor(session).label;
}

function boardEvidenceCandidates(session: LearningSession): string[] {
  const values = [session.problem.text, ...session.nodes.flatMap((node) => node.kind === "concept" && node.diagnosticEvidence ? [node.diagnosticEvidence] : [])]
    .flatMap(extractBoardEvidenceClauses).map((value) => value.trim().replace(/\s+/g, " ")).filter((value) => value.length >= 4);
  const unique = Array.from(new Set(values)).map((value) => safeSlice(value, 120));
  return unique;
}

export function nativeMoveWhy(label: string, role: BoardScene["role"]): string {
  if (role === "orient") return `先完成“${label}”，后续判断才不会连接到错误对象或错误范围。`;
  if (role === "model") return `“${label}”把题目中的证据组织成可检查结构，避免只凭关键词或印象下结论。`;
  if (role === "reason") return `展开“${label}”能暴露中间依据，判断当前推理是否真的由题目条件支持。`;
  if (role === "misconception") return `用“${label}”检查适用条件和证据边界，可以阻止正确术语被用在错误对象上。`;
  if (role === "transfer") return `“${label}”保留的是判断顺序，而不是这道题的表面词句，因此能用于新的材料。`;
  return `“${label}”把关系重新解释回题目情境，用来检查是否真正理解而非只记住页面。`;
}

function safeSlice(value: string, maximum: number): string {
  if (value.length <= maximum) return balancedOrPlain(value);
  for (let end = maximum; end >= Math.min(12, maximum); end -= 1) {
    const candidate = value.slice(0, end).replace(/[，、：；\s]+$/, "");
    if (isBalanced(candidate)) return candidate;
  }
  return value.replace(/[$`\\]/g, "").slice(0, maximum).trim();
}

function balancedOrPlain(value: string): string { return isBalanced(value) ? value : value.replace(/[$`\\]/g, ""); }
function isBalanced(value: string): boolean { try { assertBalancedLearningMarkup(value, "安全板书文本"); return true; } catch { return false; } }
