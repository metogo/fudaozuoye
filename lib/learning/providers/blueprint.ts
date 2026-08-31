import { getConcept, isCurriculumAncestor } from "../curriculum";
import { assertBalancedLearningMarkup } from "../presentation";
import type { CheckItem, DiagnosticEvidenceSource, KnowledgeNode, ProblemGuide, ProblemSnapshot, TeachingContent } from "../types";

type JsonObject = Record<string, unknown>;

export interface KnowledgeBlueprint {
  conceptId: string;
  evidence: string;
  evidenceSource: DiagnosticEvidenceSource;
  simplification: string;
  teaching: TeachingContent;
  check: Omit<CheckItem, "id" | "conceptId">;
}

export interface KnowledgeSelection {
  conceptId: string;
  evidence: string;
  evidenceSource: DiagnosticEvidenceSource;
  simplification: string;
}

export interface EvidenceSource {
  type: DiagnosticEvidenceSource;
  text: string;
}

export function parseProblemGuide(value: unknown, problemText: string, evidenceQuotes: string[] = [], originalAnswer = "", originalExplanation = ""): ProblemGuide {
  const guide = asObject(value, "原题引导");
  const parsed = {
    goal: cleanUserFacingModelText(requiredString(guide, "goal", 8, 120)),
    keyClue: cleanUserFacingModelText(requiredString(guide, "keyClue", 8, 140)),
    approach: cleanUserFacingModelText(requiredString(guide, "approach", 12, 180)),
    firstQuestion: cleanUserFacingModelText(requiredString(guide, "firstQuestion", 6, 100)),
  };
  Object.entries(parsed).forEach(([key, content]) => assertBalancedLearningMarkup(content, `原题引导 ${key}`));
  if (parsed.goal.length < 8 || parsed.keyClue.length < 8 || parsed.approach.length < 12 || parsed.firstQuestion.length < 6) throw new Error("原题引导清理后内容不完整");
  const keyClue = normalize(parsed.keyClue);
  const problemPhraseLength = Math.min(8, Math.max(1, normalize(problemText).length));
  const grounded = evidenceQuotes.some((evidence) => keyClue.includes(normalize(evidence)))
    || sharesContinuousPhrase(problemText, parsed.keyClue, problemPhraseLength);
  const groundedParsed = grounded ? parsed : {
    ...parsed,
    keyClue: `先看题目里的“${groundedExcerpt(problemText)}”：这是开始推理时必须用到的已知条件。`,
  };
  const guideText = normalize(`${groundedParsed.goal} ${groundedParsed.approach} ${groundedParsed.firstQuestion}`);
  const answerVariants = [originalAnswer, spokenNumberVariant(originalAnswer)].map(normalize).filter(Boolean);
  const explanation = normalize(originalExplanation);
  if (answerVariants.some((answer) => containsCompleteAnswer(guideText, answer)) || (explanation.length >= 12 && guideText.includes(explanation))) {
    return {
      ...parsed,
      goal: "先明确题目要求的未知量或结论，暂时不计算最终结果。",
      keyClue: groundedParsed.keyClue,
      approach: "先根据题干中的关键条件写出未知量和已知量的关系，再只完成第一步推理，暂时不计算最终结果。",
      firstQuestion: "你能先指出未知量，并说出题干中的哪个条件能把它和已知量联系起来吗？",
    };
  }
  return groundedParsed;
}

function spokenNumberVariant(value: string): string {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return value;
  return value.replace(match[0], numberToChinese(match[0]));
}

function numberToChinese(value: string): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer, decimal] = unsigned.split(".");
  const digits = "零一二三四五六七八九";
  const numeric = Number(integer);
  let result: string;
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 9_999) result = [...integer].map((item) => digits[Number(item)] ?? item).join("");
  else if (numeric < 10) result = digits[numeric];
  else {
    const units = ["", "十", "百", "千"];
    const parts: string[] = [];
    let pendingZero = false;
    [...String(numeric)].forEach((item, index, all) => {
      const digit = Number(item);
      const unit = units[all.length - index - 1];
      if (digit === 0) pendingZero = parts.length > 0;
      else {
        if (pendingZero) parts.push("零");
        if (!(digit === 1 && unit === "十" && parts.length === 0)) parts.push(digits[digit]);
        parts.push(unit);
        pendingZero = false;
      }
    });
    result = parts.join("");
  }
  if (decimal) result += `点${[...decimal].map((item) => digits[Number(item)] ?? item).join("")}`;
  return `${negative ? "负" : ""}${result}`;
}

function groundedExcerpt(problemText: string): string {
  const candidates = problemText.split(/[。！？；;\n]/).map((item) => item.trim()).filter((item) => item.length >= 2);
  const selected = candidates.sort((first, second) => clueScore(second) - clueScore(first))[0] ?? problemText.trim();
  return selected.slice(0, 50);
}

function clueScore(value: string): number {
  return Number(/[=<>≤≥+×÷/]|\d/.test(value)) * 10 + Math.min(value.length, 50) / 50;
}

function containsCompleteAnswer(guideText: string, answer: string): boolean {
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startsWithNumber = /^\p{N}/u.test(answer);
  const endsWithNumber = /\p{N}$/u.test(answer);
  const prefix = startsWithNumber ? "(?<![\\p{N}.])" : "";
  const suffix = endsWithNumber ? "(?![\\p{N}.])" : "";
  return new RegExp(`${prefix}${escaped}${suffix}`, "u").test(guideText);
}

function sharesContinuousPhrase(source: string, target: string, size: number): boolean {
  const normalizedSource = normalize(source);
  const normalizedTarget = normalize(target);
  if (normalizedSource.length < size || normalizedTarget.length < size) return false;
  for (let index = 0; index <= normalizedSource.length - size; index += 1) {
    if (normalizedTarget.includes(normalizedSource.slice(index, index + size))) return true;
  }
  return false;
}

export interface BlueprintParseOptions {
  allowedConceptIds: string[];
  evidenceSources: EvidenceSource[];
  min: number;
  max: number;
  existingCheckPrompts?: string[];
  existingContentSignatures?: string[];
  rejectAncestorPairs?: boolean;
}

export function parseKnowledgeSelections(result: JsonObject, options: Omit<BlueprintParseOptions, "existingCheckPrompts" | "existingContentSignatures">): KnowledgeSelection[] {
  const rawSelections = Array.isArray(result.selections) ? result.selections : Array.isArray(result.nodes) ? result.nodes : null;
  if (!rawSelections) throw new Error("模型没有返回知识选择列表 selections");
  if (rawSelections.length < options.min || rawSelections.length > options.max) {
    throw new Error(`知识选择数量必须在 ${options.min} 到 ${options.max} 个之间`);
  }
  const allowed = new Set(options.allowedConceptIds);
  const seen = new Set<string>();
  const selections = rawSelections.map((raw, index) => {
    const value = asObject(raw, `第 ${index + 1} 个知识选择`);
    const draft = {
      conceptId: requiredString(value, "conceptId", 3, 120),
      evidence: requiredString(value, "evidence", 2, 50),
      simplification: cleanUserFacingModelText(requiredString(value, "simplification", 12, 160)),
    };
    if (draft.simplification.length < 12) throw new Error(`节点 ${draft.conceptId} 的简化理由清理后内容不完整`);
    if (!allowed.has(draft.conceptId)) throw new Error(`知识选择不在允许的课程目录中：${draft.conceptId}`);
    if (seen.has(draft.conceptId)) throw new Error(`模型重复选择知识点：${draft.conceptId}`);
    const evidenceSource = validateSelectionGrounding(draft, options.evidenceSources);
    seen.add(draft.conceptId);
    return { ...draft, evidenceSource };
  });
  if (options.rejectAncestorPairs) assertSelectionAntichain(selections);
  return selections;
}

export function repairSelectionReasonGrounding(result: JsonObject): JsonObject {
  const key = Array.isArray(result.selections) ? "selections" : Array.isArray(result.nodes) ? "nodes" : null;
  if (!key) return result;
  const selections = result[key] as unknown[];
  return {
    ...result,
    [key]: selections.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
      const selection = raw as JsonObject;
      const { conceptId, evidence, simplification } = selection;
      if (typeof conceptId !== "string" || typeof evidence !== "string" || typeof simplification !== "string") return raw;
      if (normalize(simplification).includes(normalize(evidence))) return raw;
      const concept = getConcept(conceptId);
      if (!concept) return raw;
      const prefix = `题目中的“${evidence.trim()}”需要先用到${concept.title}。`;
      const detail = cleanUserFacingModelText(simplification);
      const remaining = Math.max(0, 160 - prefix.length);
      return { ...selection, simplification: `${prefix}${detail.slice(0, remaining)}` };
    }),
  };
}

export function parseKnowledgeBlueprints(result: JsonObject, options: BlueprintParseOptions): KnowledgeBlueprint[] {
  if (!Array.isArray(result.nodes)) throw new Error("模型没有返回节点蓝图列表 nodes");
  if (result.nodes.length < options.min || result.nodes.length > options.max) {
    throw new Error(`节点数量必须在 ${options.min} 到 ${options.max} 个之间`);
  }
  const allowed = new Set(options.allowedConceptIds);
  const seenConcepts = new Set<string>();
  const seenChecks = new Set((options.existingCheckPrompts ?? []).map(normalize));
  const seenContent = new Set(options.existingContentSignatures ?? []);
  return result.nodes.map((raw, index) => {
    const blueprint = parseBlueprint(asObject(raw, `第 ${index + 1} 个节点`));
    if (!allowed.has(blueprint.conceptId)) throw new Error(`节点不在允许的课程目录中：${blueprint.conceptId}`);
    if (seenConcepts.has(blueprint.conceptId)) throw new Error(`模型重复返回知识点：${blueprint.conceptId}`);
    validateGrounding(blueprint, options.evidenceSources);
    validateCheck(blueprint, options.evidenceSources, seenChecks);
    const signature = contentSignature(blueprint);
    if (seenContent.has(signature)) throw new Error(`节点内容重复：${blueprint.conceptId}`);
    seenConcepts.add(blueprint.conceptId);
    seenChecks.add(normalize(blueprint.check.prompt));
    seenContent.add(signature);
    return blueprint;
  });
}

export function knowledgeNodeFromBlueprint(blueprint: KnowledgeBlueprint): KnowledgeNode {
  const concept = getConcept(blueprint.conceptId);
  if (!concept) throw new Error(`课程目录中不存在知识点：${blueprint.conceptId}`);
  return {
    id: uid("node"),
    conceptId: concept.id,
    title: concept.title,
    kind: "concept",
    difficulty: concept.difficulty,
    atomic: concept.atomic,
    curriculumVersion: concept.version,
    simplification: blueprint.simplification,
    diagnosticEvidence: blueprint.evidence,
    diagnosticEvidenceSource: blueprint.evidenceSource,
    state: "unchecked",
    attempts: 0,
    teaching: blueprint.teaching,
    check: { ...blueprint.check, id: uid("check"), conceptId: concept.id },
  };
}

export function createProblemRoot(problem: ProblemSnapshot, answer: string, explanation: string): KnowledgeNode {
  return {
    id: uid("root"),
    conceptId: `problem.${problem.subject}`,
    title: "原题",
    kind: "problem",
    difficulty: 10,
    atomic: false,
    curriculumVersion: problem.gradeBand === "senior" ? "cn-highschool-2017-2020" : "cn-compulsory-2022",
    simplification: "从原题倒推必须掌握的直接知识。",
    diagnosticEvidence: problem.text,
    state: "unchecked",
    attempts: 0,
    teaching: {
      explanation: "前置知识已经走通，现在不看提示独立重做。",
      example: "先收起之前的讲解，再从题干独立判断关系。",
      parentPrompt: "你能不看刚才的步骤，解释为什么这样做吗？",
      expectedSignal: "你能独立写出关键关系、计算过程和结论。",
      misconception: "照抄刚才步骤但不能说明数量或学科关系。",
      alternateExplanation: "先口述思路，再独立写出完整过程。",
    },
    check: {
      id: uid("original"),
      prompt: `现在请你独立重做原题：\n\n${problem.text}`,
      type: "short_text",
      answer: answer.trim(),
      explanation: explanation.trim(),
    },
  };
}

export function blueprintContentSignature(blueprint: KnowledgeBlueprint): string {
  return contentSignature(blueprint);
}

function parseBlueprint(value: JsonObject): KnowledgeBlueprint {
  const conceptId = requiredString(value, "conceptId", 3, 120);
  const evidence = requiredString(value, "evidence", 2, 50);
  const evidenceSource = requiredEvidenceSource(value.evidenceSource);
  const simplification = requiredString(value, "simplification", 12, 160);
  const teachingValue = asObject(value.teaching, `节点 ${conceptId} 的 teaching`);
  const checkValue = asObject(value.check, `节点 ${conceptId} 的 check`);
  const teaching: TeachingContent = {
    explanation: requiredString(teachingValue, "explanation", 12, 140),
    example: requiredString(teachingValue, "example", 8, 110),
    parentPrompt: requiredString(teachingValue, "parentPrompt", 6, 70),
    expectedSignal: requiredString(teachingValue, "expectedSignal", 6, 90),
    misconception: requiredString(teachingValue, "misconception", 6, 100),
    alternateExplanation: requiredString(teachingValue, "alternateExplanation", 8, 140),
  };
  const requestedType = checkValue.type;
  if (requestedType !== "choice" && requestedType !== "short_text") throw new Error(`节点 ${conceptId} 的检查题类型无效`);
  const candidateChoices = requestedType === "choice" ? parseChoices(checkValue.choices, conceptId) : undefined;
  const type = requestedType === "choice" && (candidateChoices?.length ?? 0) >= 2 ? "choice" : "short_text";
  const choices = type === "choice" ? candidateChoices : undefined;
  const rawAnswer = requiredString(checkValue, "answer", 1, 80);
  const answer = type === "choice"
    ? choices?.find((choice) => normalizeChoice(choice) === normalizeChoice(rawAnswer)) ?? rawAnswer
    : rawAnswer;
  const checkPrompt = requiredString(checkValue, "prompt", 5, 120);
  const checkExplanation = requiredString(checkValue, "explanation", 6, 100);
  [
    ["简化理由", simplification],
    ["讲解", teaching.explanation],
    ["例子", teaching.example],
    ["引导问题", teaching.parentPrompt],
    ["理解信号", teaching.expectedSignal],
    ["常见误区", teaching.misconception],
    ["换种讲法", teaching.alternateExplanation],
    ["检查题", checkPrompt],
    ["检查说明", checkExplanation],
    ...((choices ?? []).map((choice, index) => [`选项 ${index + 1}`, choice])),
  ].forEach(([label, content]) => assertBalancedLearningMarkup(content, label));
  return {
    conceptId,
    evidence,
    evidenceSource,
    simplification,
    teaching,
    check: {
      prompt: checkPrompt,
      type,
      choices,
      answer,
      explanation: checkExplanation,
    },
  };
}

function validateGrounding(blueprint: KnowledgeBlueprint, sources: EvidenceSource[]): void {
  const actualSource = validateSelectionGrounding(blueprint, sources);
  if (blueprint.evidenceSource !== actualSource) throw new Error(`节点 ${blueprint.conceptId} 的证据来源标注不正确`);
  const concept = getConcept(blueprint.conceptId);
  const terms = concept ? [concept.title, ...concept.aliases].map(normalize) : [];
  const explanation = normalize(blueprint.teaching.explanation);
  if (!terms.some((term) => term.length >= 2 && explanation.includes(term))) {
    throw new Error(`节点 ${blueprint.conceptId} 的讲解没有说明所选课标概念`);
  }
  if (!explanation.includes(normalize(blueprint.evidence))) {
    throw new Error(`节点 ${blueprint.conceptId} 的讲解没有联系已引用的题目证据`);
  }
  const forbiddenTemplates = ["不是要背一句定义", "降低同时处理的信息量", "只保留这一件事"];
  const combined = `${blueprint.simplification}${blueprint.teaching.explanation}${blueprint.teaching.example}`;
  if (forbiddenTemplates.some((template) => combined.includes(template))) {
    throw new Error(`节点 ${blueprint.conceptId} 仍在复用通用教学模板`);
  }
}

function validateSelectionGrounding(selection: Pick<KnowledgeSelection, "conceptId" | "evidence" | "simplification">, sources: EvidenceSource[]): DiagnosticEvidenceSource {
  const evidence = normalize(selection.evidence);
  if (evidence.length < 2) throw new Error(`节点 ${selection.conceptId} 的题目证据过短`);
  if (GENERIC_EVIDENCE.has(evidence)) throw new Error(`节点 ${selection.conceptId} 的题目证据过于笼统`);
  const source = sources.find((candidate) => normalize(candidate.text).includes(evidence));
  if (!source) {
    throw new Error(`节点 ${selection.conceptId} 的证据不是题干、学生作答或父节点中的原文`);
  }
  if (!normalize(selection.simplification).includes(evidence)) {
    throw new Error(`节点 ${selection.conceptId} 的简化理由没有联系已引用的真实原文`);
  }
  const promptLeakage = ["引用上述", "上述题干", "上述evidence", "selected.evidence", "输出结构", "生成要求", "字段要求"];
  if (promptLeakage.some((phrase) => normalize(selection.simplification).includes(normalize(phrase)))) {
    throw new Error(`节点 ${selection.conceptId} 的简化理由泄露了模型生成指令`);
  }
  return source.type;
}

function cleanUserFacingModelText(value: string): string {
  return value
    .replace(/逐字引用(?:题干关键条件)?[：:，,\s]*/g, "")
    .replace(/引用上述(?:题干内容|题干|evidence)[：:，,\s]*/gi, "")
    .replace(/selected\.evidence/gi, "题目条件")
    .replace(/(?:输出结构|生成要求|字段要求)[：:，,\s]*/g, "")
    .replace(/题干关键条件/g, "关键条件")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function validateCheck(blueprint: KnowledgeBlueprint, sources: EvidenceSource[], seenChecks: Set<string>): void {
  const prompt = normalize(blueprint.check.prompt);
  if (seenChecks.has(prompt)) throw new Error(`节点 ${blueprint.conceptId} 的检查题与已有节点重复`);
  const originalProblem = normalize(sources.find((source) => source.type === "problem")?.text ?? "");
  if (originalProblem.length >= 8 && (prompt === originalProblem || prompt.includes(originalProblem) || (prompt.length >= 8 && originalProblem.includes(prompt)) || bigramSimilarity(prompt, originalProblem) >= 0.92)) {
    throw new Error(`节点 ${blueprint.conceptId} 把原题原样当作微型检查，没有降低难度`);
  }
  const concept = getConcept(blueprint.conceptId);
  const checkExplanation = normalize(blueprint.check.explanation);
  const terms = concept ? [concept.title, ...concept.aliases].map(normalize) : [];
  if (!terms.some((term) => term.length >= 2 && checkExplanation.includes(term))) {
    throw new Error(`节点 ${blueprint.conceptId} 的检查题没有说明它如何验收当前概念`);
  }
  if (blueprint.check.type === "choice") {
    const choices = blueprint.check.choices ?? [];
    if (!choices.some((choice) => normalizeChoice(choice) === normalizeChoice(blueprint.check.answer))) {
      throw new Error(`节点 ${blueprint.conceptId} 的选择题标准答案不在选项中`);
    }
  }
}

function parseChoices(raw: unknown, conceptId: string): string[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > 5) throw new Error(`节点 ${conceptId} 的选择题最多 5 个选项`);
  const choices = raw.map((choice) => {
    if (typeof choice !== "string" || !choice.trim()) throw new Error(`节点 ${conceptId} 含空选项`);
    if (choice.trim().length > 60) throw new Error(`节点 ${conceptId} 的选项过长`);
    return choice.trim();
  });
  const unique = choices.filter((choice, index) => choices.findIndex((candidate) => normalizeChoice(candidate) === normalizeChoice(choice)) === index);
  return unique;
}

function contentSignature(blueprint: KnowledgeBlueprint): string {
  return normalize(`${blueprint.teaching.explanation}|${blueprint.teaching.example}|${blueprint.teaching.parentPrompt}|${blueprint.teaching.expectedSignal}|${blueprint.teaching.misconception}`);
}

export function blueprintCheckSignature(blueprint: KnowledgeBlueprint): string {
  return normalize(blueprint.check.prompt);
}

function requiredString(value: JsonObject, key: string, minLength: number, maxLength = Number.POSITIVE_INFINITY): string {
  const raw = value[key];
  if (typeof raw !== "string" || raw.trim().length < minLength) throw new Error(`字段 ${key} 缺失或过短`);
  if (raw.trim().length > maxLength) throw new Error(`字段 ${key} 过长，最多 ${maxLength} 个字符`);
  return raw.trim();
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 不是 JSON 对象`);
  return value as JsonObject;
}

function normalize(value: string): string {
  return value.toLowerCase()
    .replace(/平方厘米/g, "cm2").replace(/平方米/g, "m2").replace(/立方厘米/g, "cm3").replace(/立方米/g, "m3")
    .replace(/千米|公里/g, "km").replace(/厘米/g, "cm").replace(/毫米/g, "mm").replace(/小时/g, "h").replace(/分钟/g, "min").replace(/秒/g, "s")
    .replace(/千克|公斤/g, "kg").replace(/克/g, "g").replace(/牛顿|牛/g, "n").replace(/伏特|伏/g, "v").replace(/安培|安/g, "a").replace(/欧姆/g, "ohm")
    .replace(/²/g, "2").replace(/³/g, "3").replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeChoice(value: string): string {
  return value.toLowerCase()
    .replace(/^\s*[A-H][.．、:：)）]\s*/, "")
    .replace(/平方厘米/g, "cm2").replace(/平方米/g, "m2").replace(/立方厘米/g, "cm3").replace(/立方米/g, "m3")
    .replace(/千米|公里/g, "km").replace(/厘米/g, "cm").replace(/毫米/g, "mm").replace(/小时/g, "h").replace(/分钟/g, "min").replace(/秒/g, "s")
    .replace(/千克|公斤/g, "kg").replace(/克/g, "g").replace(/牛顿|牛/g, "n").replace(/伏特|伏/g, "v").replace(/安培|安/g, "a").replace(/欧姆/g, "ohm")
    .replace(/\\times/g, "×").replace(/\\div/g, "÷").replace(/\\leq/g, "≤").replace(/\\geq/g, "≥")
    .replace(/−/g, "-").replace(/[²]/g, "^2").replace(/[³]/g, "^3")
    .replace(/[$`{}\s，。；;、:：'“”]/g, "");
}

function bigramSimilarity(first: string, second: string): number {
  if (first.length < 2 || second.length < 2) return 0;
  const left = new Set(Array.from({ length: first.length - 1 }, (_, index) => first.slice(index, index + 2)));
  const right = new Set(Array.from({ length: second.length - 1 }, (_, index) => second.slice(index, index + 2)));
  const intersection = [...left].filter((fragment) => right.has(fragment)).length;
  return intersection / Math.max(left.size, right.size);
}

function assertSelectionAntichain(selections: KnowledgeSelection[]): void {
  for (let left = 0; left < selections.length; left += 1) {
    for (let right = left + 1; right < selections.length; right += 1) {
      const first = selections[left].conceptId;
      const second = selections[right].conceptId;
      if (isCurriculumAncestor(first, second) || isCurriculumAncestor(second, first)) {
        throw new Error(`直接前置不能同时包含上下游概念：${first} / ${second}`);
      }
    }
  }
}

function requiredEvidenceSource(value: unknown): DiagnosticEvidenceSource {
  if (value === "problem" || value === "child_work" || value === "parent") return value;
  throw new Error("节点 evidenceSource 缺失或无效");
}

const GENERIC_EVIDENCE = new Set(["多少", "题目", "不会", "求出", "已知", "结果", "计算", "接下来"]);

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
