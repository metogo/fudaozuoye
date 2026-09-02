import { isSupportedSubjectBand } from "../curriculum";
import { assertGraphInvariants } from "../graph";
import { createInitialFlow } from "../flow";
import { subjectPendingGuide } from "../subject-learning-guide";
import { subjects, type BoardSuggestion, type KnowledgeNode, type LearningSession, type ProblemGuide, type ProblemSnapshot, type ProviderId, type ReasoningLevel } from "../types";
import {
  blueprintCheckSignature,
  blueprintContentSignature,
  createProblemRoot,
  knowledgeNodeFromBlueprint,
  parseKnowledgeSelections,
  parseProblemGuide,
  type EvidenceSource,
  type KnowledgeBlueprint,
} from "./blueprint";
import type { JsonObject } from "./model-support";

export const PENDING_ORIGINAL_ANSWER = "等待后台核验";

export class NonRepairableValidationError extends Error {}

export function parseProblemSolution(value: JsonObject) {
  const objects = nestedObjects(value);
  const originalAnswer = firstField(objects, ["originalAnswer", "answer", "standardAnswer", "correctAnswer", "finalAnswer", "resultAnswer", "标准答案", "答案"]);
  const originalExplanation = firstField(objects, ["originalExplanation", "explanation", "solutionExplanation", "solution", "analysis", "reasoning", "steps", "rationale", "解题依据", "解析", "解法", "推理过程"]);
  if (!originalAnswer || !originalExplanation) throw new Error("缺少原题标准答案或解题依据");
  return { originalAnswer, originalExplanation };
}

function nestedObjects(root: JsonObject): JsonObject[] {
  const firstLevel = Object.values(root).filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  const secondLevel = firstLevel.flatMap((item) => Object.values(item).filter((nested): nested is JsonObject => Boolean(nested) && typeof nested === "object" && !Array.isArray(nested)));
  return [root, ...firstLevel, ...secondLevel];
}

function firstField(objects: JsonObject[], keys: string[]): string {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        const joined = value.map((item) => item.trim()).filter(Boolean).join("；");
        if (joined) return joined;
      }
    }
  }
  return "";
}

export function parseInitialAnalysisSelection(value: JsonObject, problem: ProblemSnapshot, allowed: { id: string }[]) {
  const selections = parseKnowledgeSelections(value, {
    allowedConceptIds: allowed.map((item) => item.id), evidenceSources: problemEvidenceSources(problem),
    min: 1, max: 4, rejectAncestorPairs: true,
  });
  if (typeof value.originalAnswer !== "string" || !value.originalAnswer.trim() || typeof value.originalExplanation !== "string" || !value.originalExplanation.trim()) throw new Error("缺少原题标准答案或解题依据");
  return {
    selections, originalAnswer: value.originalAnswer, originalExplanation: value.originalExplanation,
    problemGuide: parseProblemGuide(value.problemGuide, problem.text, selections.filter((item) => item.evidenceSource === "problem").map((item) => item.evidence), value.originalAnswer, value.originalExplanation, subjectPendingGuide(problem)),
  };
}

export function expansionSelectionOptions(problem: ProblemSnapshot, target: KnowledgeNode, allowedConceptIds: string[]) {
  return { allowedConceptIds, evidenceSources: expansionEvidenceSources(problem, target), min: 1, max: allowedConceptIds.length };
}

export function isRecoverableReasonGroundingError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("简化理由没有联系已引用的真实原文");
}

export function parseProblem(result: JsonObject): ProblemSnapshot {
  if (result.recognized !== true) {
    const reason = typeof result.failureReason === "string" && result.failureReason.trim() ? `：${result.failureReason.trim()}` : "";
    throw new NonRepairableValidationError(`照片中没有识别到清晰完整的一道题${reason}，请重新拍摄并只保留题目区域`);
  }
  if (typeof result.text !== "string" || result.text.trim().length < 3) throw new Error("没有识别到完整题干");
  const subject = normalizedSubject(result.subject);
  const gradeBand = normalizedGradeBand(result.gradeBand);
  const confidence = normalizedConfidence(result.confidence);
  if (typeof result.childWork !== "string" || !subject || !gradeBand || confidence === null) throw new Error("模型识别结果结构不合法");
  if (confidence < 0.55) throw new NonRepairableValidationError("照片识别置信度过低，请重新拍摄并确保题干清晰、完整、无反光");
  if (!isSupportedSubjectBand(subject, gradeBand)) throw new Error("识别到不支持的学科学段组合");
  return { text: result.text.trim(), childWork: result.childWork.trim(), subject, gradeBand, confidence, userRevised: false };
}

export function parseTextProblem(result: JsonObject, originalText: string): ProblemSnapshot {
  if (result.recognized !== true) {
    const reason = typeof result.failureReason === "string" && result.failureReason.trim() ? `：${result.failureReason.trim()}` : "";
    throw new NonRepairableValidationError(`没有识别到一道完整的题目${reason}`);
  }
  const subject = normalizedSubject(result.subject);
  const gradeBand = normalizedGradeBand(result.gradeBand);
  const confidence = normalizedConfidence(result.confidence);
  if (!subject || !gradeBand || confidence === null) throw new Error("模型分类结果结构不合法");
  if (!isSupportedSubjectBand(subject, gradeBand)) throw new Error("识别到不支持的学科学段组合");
  return { text: originalText.trim(), childWork: "", subject, gradeBand, confidence, userRevised: true };
}

function normalizedSubject(value: unknown): ProblemSnapshot["subject"] | null {
  const aliases: Record<string, ProblemSnapshot["subject"]> = { math: "math", 数学: "math", physics: "physics", 物理: "physics", chemistry: "chemistry", 化学: "chemistry", biology: "biology", 生物: "biology", chinese: "chinese", 语文: "chinese", english: "english", 英语: "english", history: "history", 历史: "history", geography: "geography", 地理: "geography", politics: "politics", 政治: "politics", 道德与法治: "politics" };
  const normalized = aliases[String(value ?? "").trim().toLowerCase()];
  return normalized && subjects.includes(normalized) ? normalized : null;
}

function normalizedGradeBand(value: unknown): ProblemSnapshot["gradeBand"] | null {
  const aliases: Record<string, ProblemSnapshot["gradeBand"]> = { primary: "primary", 小学: "primary", junior: "junior", 初中: "junior", senior: "senior", 高中: "senior" };
  return aliases[String(value ?? "").trim().toLowerCase()] ?? null;
}

function normalizedConfidence(value: unknown): number | null {
  const confidence = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null;
}

export function parseBoardSuggestion(result: JsonObject): BoardSuggestion {
  if (typeof result.recommended !== "boolean" || typeof result.reason !== "string" || result.reason.trim().length < 6 || result.reason.trim().length > 100 || !["relation", "steps", "comparison", "formula"].includes(String(result.layout))) throw new Error("板书呈现判断结构不合法");
  return { recommended: result.recommended, reason: result.reason.trim(), layout: result.layout as BoardSuggestion["layout"] };
}

export function buildSession(problem: ProblemSnapshot, provider: ProviderId, reasoningLevel: ReasoningLevel, modelId: string, blueprints: KnowledgeBlueprint[], originalAnswer: string, originalExplanation: string, problemGuide: ProblemGuide): LearningSession {
  const root = createProblemRoot(problem, originalAnswer, originalExplanation);
  const nodes = blueprints.map(knowledgeNodeFromBlueprint);
  const now = new Date().toISOString();
  const session: LearningSession = {
    schemaVersion: "1.1", provider, reasoningLevel, modelId, mode: "live",
    requestId: `req-${crypto.randomUUID().slice(0, 8)}`, problem, problemGuide, flow: createInitialFlow(),
    nodes: [root, ...nodes], edges: nodes.map((node, index) => ({ from: node.id, to: root.id, reason: edgeReason(node, blueprints[index], "原题") })),
    rootNodeId: root.id, currentNodeId: nodes.slice().sort((a, b) => a.difficulty - b.difficulty)[0]?.id ?? null,
    stage: "diagnosing", evidence: [], transferCheck: null, originalPassed: false, transferPassed: false, createdAt: now, updatedAt: now,
  };
  assertGraphInvariants(session);
  return session;
}

export function rootOnlySession(session: LearningSession): LearningSession {
  const root = session.nodes.find((node) => node.id === session.rootNodeId);
  if (!root) throw new Error("学习会话缺少原题节点");
  return { ...session, nodes: [root], edges: [], currentNodeId: null };
}

export function pendingChatSession(problem: ProblemSnapshot, provider: ProviderId, reasoningLevel: ReasoningLevel, modelId: string, mode: LearningSession["mode"]): LearningSession {
  return { ...buildSession(problem, provider, reasoningLevel, modelId, [], PENDING_ORIGINAL_ANSWER, "标准解正在与首讲并行准备。", subjectPendingGuide(problem)), mode };
}

export function edgeReason(node: KnowledgeNode, blueprint: KnowledgeBlueprint | undefined, targetTitle: string): string {
  const evidence = blueprint?.evidence ?? node.diagnosticEvidence ?? node.title;
  return `“${evidence}”表明${node.title}是理解${targetTitle}所需的直接前置`;
}

export function assertBlueprintBatchUnique(blueprints: KnowledgeBlueprint[]): void {
  const checks = new Set<string>();
  const content = new Set<string>();
  for (const blueprint of blueprints) {
    const check = blueprintCheckSignature(blueprint);
    const signature = blueprintContentSignature(blueprint);
    if (checks.has(check)) throw new Error(`模型为多个知识点生成了重复检查题：${blueprint.check.prompt}`);
    if (content.has(signature)) throw new Error(`模型为多个知识点生成了重复教学内容：${blueprint.conceptId}`);
    checks.add(check); content.add(signature);
  }
}

export function normalizeBlueprintDetail(value: JsonObject, expectedConceptId: string): JsonObject {
  const matches = findBlueprintDetails(value, 0);
  if (matches.length > 1) throw new Error("模型返回了多个教学节点，无法确认哪一个属于当前概念");
  const nested = matches[0];
  if (nested) {
    if (nested.conceptId !== undefined && nested.conceptId !== expectedConceptId) throw new Error("教学内容对应了错误的课程概念");
    return nested;
  }
  if (value.check && typeof value.check === "object" && !Array.isArray(value.check)) {
    const explanation = typeof value.teaching === "string" ? value.teaching : typeof value.explanation === "string" ? value.explanation : undefined;
    if (explanation) return { teaching: { explanation, example: value.example, parentPrompt: value.parentPrompt, expectedSignal: value.expectedSignal, misconception: value.misconception, alternateExplanation: value.alternateExplanation }, check: value.check };
  }
  return value;
}

function findBlueprintDetails(value: unknown, depth: number): JsonObject[] {
  if (!value || typeof value !== "object" || depth > 3) return [];
  if (Array.isArray(value)) return value.flatMap((item) => findBlueprintDetails(item, depth + 1));
  const object = value as JsonObject;
  if (object.teaching && typeof object.teaching === "object" && !Array.isArray(object.teaching) && object.check && typeof object.check === "object" && !Array.isArray(object.check)) return [object];
  return Object.values(object).flatMap((child) => findBlueprintDetails(child, depth + 1));
}

export function problemEvidenceSources(problem: ProblemSnapshot): EvidenceSource[] {
  return [{ type: "problem", text: problem.text }, ...(problem.childWork ? [{ type: "child_work" as const, text: problem.childWork }] : [])];
}

export function expansionEvidenceSources(problem: ProblemSnapshot, target: KnowledgeNode): EvidenceSource[] {
  return [...problemEvidenceSources(problem), { type: "parent", text: target.title }, { type: "parent", text: target.simplification }, { type: "parent", text: target.teaching.explanation }];
}

export function evidenceCandidates(sources: EvidenceSource[]): EvidenceSource[] {
  const candidates = sources.flatMap((source) => {
    const parts = source.text.split(/[，。；：？！,;:?!\n]+/).map((part) => part.trim()).filter((part) => part.length >= 2 && part.length <= 50);
    return [...(source.text.trim().length <= 50 ? [{ ...source, text: source.text.trim() }] : []), ...parts.map((text) => ({ ...source, text }))];
  });
  return candidates.filter((candidate, index) => candidates.findIndex((item) => item.type === candidate.type && item.text === candidate.text) === index).slice(0, 16);
}
