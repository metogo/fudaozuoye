import type { BoardAnnotation, BoardBlock, BoardConversationMessage, BoardLesson, BoardPlan, BoardSuggestion, BoardVisual, BoardVisualElement, LearningSession, Subject, TutorScope } from "../types";
import { adaptBoardLessonForGrade, assertGradeLanguage, teachingBandOf } from "../grade-pedagogy";
import { createNativeBoardBlocks, createNativeBoardTitle, inferBoardSubject, nativeMoveWhy } from "../board-native-fallback";
import { assertEnhancedBoardContent, enhancedBoardInstructionSignature } from "../board-content-contract";
import { extractBoardEvidenceClauses, isTaskInstructionText } from "../board-evidence";
import { allSubjectBoardMoves, subjectBoardProfileFor } from "../board-subject-engine";
import { assertBalancedLearningMarkup, expandLearningMarkupRange } from "../presentation";
import { explicitAnswerClaimLeak, generatedTextContainsAnswer, isShortTextAnswer, normalizedAnswerMath, protectedAnswerVariants, protectedShortAnswers, shortProtectedAnswerLeak, shortTextAnswerLeak } from "./answer-protection";
import type { JsonObject } from "./model-support";
import { boardPlanSchema, boardPlanVisibleText, createSafeBoardPlan, parseBoardPlan } from "./board-plan";
import { assertDirectedBoardMoves, directBoardBlueprint } from "../board-director";
import { problemEvidenceText } from "../problem-evidence";

export { boardCoreContentSystemPrompt, boardLessonPrompt, boardLessonSystemPrompt } from "./board-prompts";

export function boardLessonTool(): JsonObject {
  return {
    type: "function",
    function: {
      name: "submit_board_lesson",
      description: "提交重新组织后的完整教学板书、精确重点标记与可选教学示意图",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 40 },
          blocks: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                content: { type: "string" },
                tone: { type: "string", enum: ["plain", "key", "example"] },
              },
              required: ["label", "content", "tone"],
              additionalProperties: false,
            },
          },
          annotations: {
            type: "array",
            minItems: 2,
            maxItems: 8,
            items: {
              type: "object",
              properties: {
                blockIndex: { type: "integer", minimum: 0, maximum: 5 },
                target: { type: "string", description: "对应区块中的唯一连续原文，2 到 28 字" },
                kind: { type: "string", enum: ["circle", "underline", "box"] },
                reason: { type: "string" },
              },
              required: ["blockIndex", "target", "kind", "reason"],
              additionalProperties: false,
            },
          },
          visual: boardVisualSchema(),
          plan: boardPlanSchema(),
        },
        required: ["title", "blocks", "annotations", "visual", "plan"],
        additionalProperties: false,
      },
    },
  };
}

export function boardContentTool(): JsonObject {
  return {
    type: "function",
    function: {
      name: "submit_board_content",
      description: "只提交完整板书的标题和动态正文；教学计划、重点标记和配图由独立安全层补充",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 40 },
          blocks: {
            type: "array", minItems: 2, maxItems: 6,
            items: {
              type: "object",
              properties: {
                move: { type: "string", enum: allSubjectBoardMoves() }, label: { type: "string", maxLength: 18 }, evidence: { type: "string", maxLength: 120 }, content: { type: "string", maxLength: 180 }, sourceMessageIds: { type: "array", maxItems: 2, items: { type: "string" } },
                tone: { type: "string", enum: ["plain", "key", "example"] },
              },
              required: ["move", "label", "evidence", "content", "sourceMessageIds", "tone"], additionalProperties: false,
            },
          },
        },
        required: ["title", "blocks"], additionalProperties: false,
      },
    },
  };
}

export function boardAnnotationsTool(blockCount: number): JsonObject {
  return {
    type: "function",
    function: {
      name: "submit_board_annotations",
      description: "只从已完成的板书正文中选择精确重点，不改写正文",
      parameters: {
        type: "object",
        properties: {
          annotations: {
            type: "array", minItems: 2, maxItems: 8,
            items: {
              type: "object",
              properties: {
                blockIndex: { type: "integer", minimum: 0, maximum: blockCount - 1 },
                target: { type: "string" },
                kind: { type: "string", enum: ["circle", "underline", "box"] },
                reason: { type: "string" },
              },
              required: ["blockIndex", "target", "kind", "reason"], additionalProperties: false,
            },
          },
        },
        required: ["annotations"], additionalProperties: false,
      },
    },
  };
}

export function boardAnnotationsPrompt(lesson: BoardLesson): string {
  return JSON.stringify({
    task: "从以下板书正文中选出 2 到 8 个真正影响理解的精确重点；宁少勿滥。target 必须是对应 content 中唯一、连续的 2 到 28 个字，至少覆盖两个区块，不得集中在段首",
    blocks: lesson.blocks.map(({ label, content }, blockIndex) => ({ blockIndex, label, content })),
  });
}

export function parseBoardLesson(value: JsonObject, session: LearningSession, suggestion: BoardSuggestion, context: BoardConversationMessage[] = []): BoardLesson {
  return parseBoardAnnotations(value, parseBoardContent(value, session, suggestion, context), session);
}

export function parseBoardContent(value: JsonObject, session: LearningSession, suggestion: BoardSuggestion, context: BoardConversationMessage[] = []): BoardLesson {
  if (value.plan !== undefined && (!value.plan || typeof value.plan !== "object" || Array.isArray(value.plan) || (value.plan as JsonObject).version !== 2)) throw new Error("模型增强板书必须使用新版学科原生协议");
  const title = text(value.title, "板书标题", 4, 40);
  assertBalancedLearningMarkup(title, "板书标题");
  if (!Array.isArray(value.blocks) || value.blocks.length < 2 || value.blocks.length > 6) throw new Error("板书必须包含 2 到 6 个有明确职责的教学区块");
  const blocks: BoardBlock[] = value.blocks.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("板书区块结构不合法");
    const block = raw as JsonObject;
    const tone = block.tone;
    if (tone !== "plain" && tone !== "key" && tone !== "example") throw new Error("板书区块强调类型不合法");
    const label = text(block.label, "板书区块标题", 2, 18);
    if (/[$\\<>]/.test(label)) throw new Error("板书区块标题必须是无公式、无标记的短标题");
    const content = text(block.content, "板书区块内容", 20, 260);
    assertBalancedLearningMarkup(content, `板书区块“${label}”`);
    return {
      id: `board-${index + 1}`,
      label,
      content,
      tone,
    };
  });
  if (new Set(blocks.map((block) => compact(block.label))).size !== blocks.length) throw new Error("板书区块职责不能重复");
  if (new Set(blocks.map((block) => compact(block.content))).size !== blocks.length) throw new Error("板书区块正文不能重复");
  const visual = parseGeneratedBoardVisual(value.visual);
  const plan = value.plan === undefined ? createSafeBoardPlan(session, blocks) : parseBoardPlan(value.plan, session, blocks, context);
  assertNoAnswerLeak(session, title, blocks, [], visual, plan);
  return {
    title,
    subtitle: safeBoardSubtitle(session, suggestion.reason),
    layout: suggestion.layout,
    blocks,
    annotations: [],
    visual,
    plan,
    returnLabel: session.flow.activeGate?.title ?? "回到刚才的学习任务",
  };
}

export function recoverBoardContentPlan(value: JsonObject, session: LearningSession, suggestion: BoardSuggestion, context: BoardConversationMessage[] = [], scope?: TutorScope): BoardLesson {
  if (!Array.isArray(value.blocks) || value.blocks.length < 2 || value.blocks.length > 6) throw new Error("学科原生板书必须包含 2 到 6 个教学动作");
  const profile = subjectBoardProfileFor(session);
  const requestedMoves = value.blocks.map((block) => block && typeof block === "object" && !Array.isArray(block) ? (block as JsonObject).move : undefined);
  const selectedMoves = requestedMoves.map((move) => profile.moves.find((candidate) => candidate.id === move));
  if (selectedMoves.some((move) => !move)) throw new Error("增强板书包含当前学科蓝图之外的动作");
  const indexes = selectedMoves.map((move) => profile.moves.indexOf(move!));
  if (new Set(indexes).size !== indexes.length || indexes.some((index, position) => position > 0 && index <= indexes[position - 1])) throw new Error("增强板书必须遵循当前学科动作顺序且不能重复");
  if (scope) {
    assertDirectedBoardMoves(session, scope, context, requestedMoves as string[]);
  }
  const trustedEvidenceSources = [problemEvidenceText(session.problem), ...session.nodes.flatMap((node) => node.kind === "concept" && node.diagnosticEvidence ? [node.diagnosticEvidence] : [])];
  const contextById = new Map(context.map((message) => [message.id, message.text]));
  const blocks = value.blocks.map((block, index) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) throw new Error("学科原生板书区块结构不合法");
    const item = block as JsonObject;
    const expectedMove = selectedMoves[index]!;
    if (item.move !== expectedMove.id) throw new Error("增强板书必须逐项落实当前学科动作");
    const requestedEvidence = text(item.evidence, "增强板书证据", 4, 120);
    const proposedContent = stripEmbeddedBoardMeta(text(item.content, "增强板书正文", 20, 180));
    const sourceMessageIds = parseContextSourceIds(item.sourceMessageIds, contextById);
    const evidenceSources = trustedEvidenceSources.concat(sourceMessageIds.map((id) => contextById.get(id)!));
    const evidence = recoverBoardEvidence(requestedEvidence, evidenceSources, index);
    const verifiedSourceMessageIds = sourceMessageIds.filter((id) => contextById.get(id)!.includes(evidence));
    const rawContent = stripUnsupportedNumberSentences(proposedContent, evidenceSources);
    const content = restoreBoardContentContract(rawContent, expectedMove.purpose, evidence);
    assertEnhancedBoardContent(session.problem.subject, content, expectedMove.purpose, evidence, evidenceSources.join("\n"));
    return { ...item, label: expectedMove.label, evidence, content, sourceMessageIds: verifiedSourceMessageIds };
  });
  const signatures = blocks.map((block, index) => enhancedBoardInstructionSignature(String(block.content), selectedMoves[index]!.purpose, String(block.evidence)));
  if (new Set(signatures).size !== signatures.length) throw new Error("增强板书不同动作不能复用同一段学科套话");
  const sceneSources = blocks.map((block) => block.sourceMessageIds as string[]);
  const sourceMessageIds = [...new Set(sceneSources.flat())];
  const plan = {
    version: 2, contentRevision: 2, subject: inferBoardSubject(session), discipline: session.problem.subject,
    thesis: profile.thesis, learningGoal: selectedMoves.map((move) => move!.purpose).join("，"), sourceMessageIds,
    scenes: selectedMoves.map((candidate, index) => {
      const move = candidate!;
      return ({
      intent: intentForRole(move.role), role: move.role, move: move.id, purpose: move.purpose,
      evidence: String(blocks[index].evidence), why: nativeMoveWhy(move.label, move.role), selfCheck: move.selfCheck,
      sourceMessageIds: sceneSources[index] ?? [], visual: { kind: "none" },
      });
    }),
  };
  return parseBoardContent({ ...value, blocks, visual: emptyLegacyVisual(), plan }, session, suggestion, context);
}

function intentForRole(role: string): "extract" | "connect" | "derive" | "compare" | "verify" {
  if (role === "orient") return "extract";
  if (role === "model") return "connect";
  if (role === "reason") return "derive";
  if (role === "misconception" || role === "transfer") return "compare";
  return "verify";
}

function stripUnsupportedNumberSentences(content: string, sources: string[]): string {
  const sourceNumbers = new Set(normalizedNumberTokens(sources.join("\n")));
  const sentences = content.split(/(?<=[。！？!?；;，,：:])/);
  const kept = sentences.filter((sentence) => normalizedNumberTokens(sentence).every((number) => sourceNumbers.has(number))).join("").trim();
  return kept.length >= 20 ? kept : content;
}

function normalizedNumberTokens(value: string): string[] {
  return value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (digit) => "0123456789"["⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(digit)])
    .match(/-?\d+(?:\.\d+)?/g) ?? [];
}

function stripEmbeddedBoardMeta(content: string): string {
  const stripped = content.split(/(?<=[。！？!?；;])/)
    .filter((sentence) => !/^\s*(?:(?:教学)?目的(?:是)?[：:]?|(?:自查|自我检查|检查问题|想一想|思考题)[：:])/.test(sentence))
    .join("").trim();
  return stripped.length >= 20 ? stripped : content;
}

function recoverBoardEvidence(requested: string, sources: string[], index: number): string {
  if (!isTaskInstructionText(requested) && sources.some((source) => source.includes(requested))) return requested;
  const candidates = [...new Set(sources.flatMap(extractBoardEvidenceClauses))]
    .filter((candidate) => candidate.length >= 4 && candidate.length <= 120 && !isTaskInstructionText(candidate));
  const recovered = candidates[index % candidates.length];
  if (!recovered) throw new Error(isTaskInstructionText(requested) ? "增强板书证据不能只是作答指令" : "增强板书没有可验证的题内证据");
  return recovered;
}

function restoreBoardContentContract(content: string, purpose: string, evidence: string): string {
  const prefix = [
    content.includes(purpose) ? "" : `${purpose}。`,
    content.includes(evidence) ? "" : `原题依据：“${evidence}”。`,
  ].join("");
  const restored = ensureSentenceBoundary(ensureSentenceBoundary(`${prefix}${content}`, purpose), evidence);
  if (restored.length > 260) throw new Error("增强板书正文补齐教学目的与原题证据后过长");
  assertBalancedLearningMarkup(restored, "增强板书正文");
  return restored;
}

function ensureSentenceBoundary(content: string, excerpt: string): string {
  const index = content.indexOf(excerpt);
  if (index < 0) return content;
  const end = index + excerpt.length;
  return end >= content.length || /[。！？!?；;，,：:”"'’]/.test(content[end]) ? content : `${content.slice(0, end)}。${content.slice(end)}`;
}

function parseContextSourceIds(value: unknown, contextById: Map<string, string>): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 2 || value.some((id) => typeof id !== "string" || !contextById.has(id))) throw new Error("增强板书引用了不存在的当前对话");
  return [...new Set(value as string[])];
}

export function parseBoardCoreContent(value: JsonObject, session: LearningSession, suggestion: BoardSuggestion, context: BoardConversationMessage[] = []): BoardLesson {
  const plan = value.plan;
  const normalizedPlan = plan && typeof plan === "object" && !Array.isArray(plan)
    ? { ...plan, scenes: Array.isArray((plan as JsonObject).scenes) ? ((plan as JsonObject).scenes as unknown[]).map(withEmptySceneVisual) : (plan as JsonObject).scenes }
    : plan;
  return parseBoardContent({ ...value, visual: emptyLegacyVisual(), plan: normalizedPlan }, session, suggestion, context);
}

export function parseBoardAnnotations(value: JsonObject, lesson: BoardLesson, session: LearningSession): BoardLesson {
  if (!Array.isArray(value.annotations) || value.annotations.length < 2 || value.annotations.length > 8) throw new Error("板书必须包含 2 到 8 个有教学依据的重点");
  const annotations = value.annotations.map((raw) => parseAnnotation(raw, lesson.blocks));
  assertAnnotations(annotations, lesson.blocks);
  assertNoAnswerLeak(session, lesson.title, lesson.blocks, annotations, lesson.visual, lesson.plan);
  return { ...lesson, annotations };
}

export function createSafeBoardLesson(session: LearningSession, scope: TutorScope, suggestion: BoardSuggestion, degradedReason = "完整板书未通过内容验收，当前仅展示可验证的安全学习框架。"): BoardLesson {
  try {
    return finalizeBoardLesson(buildNativeBoardLesson(session, scope, suggestion, { status: "safe_fallback", reason: degradedReason }), session);
  } catch (error) {
    console.warn("学科原生安全板书生成失败", error instanceof Error ? error.message : "未知错误");
    return finalizeBoardLesson(createMinimalSubjectBoardLesson(session, suggestion, degradedReason), session);
  }
}

export function createInstantBoardLesson(session: LearningSession, scope: TutorScope, suggestion: BoardSuggestion, context: BoardConversationMessage[] = []): BoardLesson {
  try {
    return finalizeBoardLesson(buildNativeBoardLesson(session, scope, suggestion, undefined, context), session);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知错误";
    console.warn("即时学科板书生成失败", reason);
    return finalizeBoardLesson(createMinimalSubjectBoardLesson(session, suggestion, `即时板书未通过安全校验：${reason}`), session);
  }
}

export function finalizeBoardLesson(lesson: BoardLesson, session: LearningSession): BoardLesson {
  const band = teachingBandOf(session.problem);
  const visible = adaptBoardLessonForGrade(lesson, band);
  const gradeTexts = [visible.title, visible.subtitle, ...visible.blocks.flatMap((block) => [block.label, block.content]), ...visible.annotations.flatMap((item) => [item.target, item.reason]), ...boardPlanVisibleText(visible.plan).split("\n")];
  for (const text of gradeTexts.filter(Boolean)) assertGradeLanguage(text, band, "板书", session.problem.text, "board");
  assertNoAnswerLeak(session, visible.title, visible.blocks, visible.annotations, visible.visual, visible.plan);
  return visible;
}

function buildNativeBoardLesson(session: LearningSession, scope: TutorScope, suggestion: BoardSuggestion, quality?: BoardLesson["quality"], context: BoardConversationMessage[] = []): BoardLesson {
  const allBlocks = createNativeBoardBlocks(session, scope);
  const selectedIds = new Set(directBoardBlueprint(session, scope, context).map((move) => move.id));
  const profile = subjectBoardProfileFor(session);
  const blocks = allBlocks.filter((_, index) => selectedIds.has(profile.moves[index].id));
  const title = createNativeBoardTitle(session, scope);
  const kinds = ["circle", "underline", "box"] as const;
  const reasons = ["这处内容确定当前学科任务的对象和范围。", "这处内容把题目证据组织成了可检查结构。", "这处内容承载当前学科最关键的推理动作。"];
  const annotations: BoardAnnotation[] = blocks.slice(0, 3).map((block, index) => annotation(block, "", kinds[index], reasons[index]));
  assertAnnotations(annotations, blocks);
  const visual = createSafeBoardVisual(session);
  const plan = createSafeBoardPlan(session, blocks);
  assertNoAnswerLeak(session, title, blocks, annotations, visual, plan);
  return { title, subtitle: safeBoardSubtitle(session, suggestion.reason), layout: suggestion.layout, blocks, annotations, visual, plan, ...(quality ? { quality } : {}), returnLabel: session.flow.activeGate?.title ?? "回到刚才的学习任务" };
}

function safeBoardSubtitle(session: LearningSession, reason: string): string {
  const answer = session.nodes.find((item) => item.id === session.rootNodeId)?.check.answer ?? "";
  const candidate = reason.trim();
  if (!candidate || generatedTextContainsAnswer(candidate, answer) || explicitAnswerClaimLeak(candidate, answer)) return "整理当前学科证据与推理关系。";
  return candidate;
}

export function addSafeBoardAnnotations(lesson: BoardLesson, session: LearningSession): BoardLesson {
  const reasons = [
    "这处信息决定接下来应该关注什么。",
    "这处关系是连接已知与下一步的关键。",
    "这里最容易在动笔时被忽略，需要主动检查。",
  ];
  const kinds: BoardAnnotation["kind"][] = ["circle", "underline", "box"];
  const annotations = lesson.blocks.slice(0, 3).map((block, index) => ({
    blockId: block.id,
    target: uniqueExcerpt(block.content),
    kind: kinds[index],
    reason: reasons[index],
  }));
  assertAnnotations(annotations, lesson.blocks);
  assertNoAnswerLeak(session, lesson.title, lesson.blocks, annotations, lesson.visual, lesson.plan);
  return { ...lesson, annotations };
}

function createMinimalSubjectBoardLesson(session: LearningSession, suggestion: BoardSuggestion, degradedReason: string): BoardLesson {
  const profile = subjectBoardProfileFor(session);
  const selectedMoves = directBoardBlueprint(session, { kind: "problem" });
  const visualFacts = session.problem.visualContext?.related && session.problem.visualContext.affectsSolving ? session.problem.visualContext.facts.map((fact) => fact.text) : [];
  const blocks: BoardBlock[] = selectedMoves.map((move, index) => ({
    id: `board-${index + 1}`,
    label: collisionSafeText(session, [move.label, `学习步骤${index + 1}`], `步骤${index + 1}`),
    content: collisionSafeText(session, [
      ...(visualFacts.length ? [`${move.purpose}。图中条件：${visualFacts[index % visualFacts.length]}。`] : []),
      `${move.purpose}。${minimalSubjectInstruction(session.problem.subject)}，并回到原题核对当前对象、条件与范围。`,
      `第${index + 1}步只核对原题，不生成新的结论。`,
    ], `核对-${index + 1}`),
    tone: index === 1 || index === 4 ? "key" : index === 2 ? "example" : "plain",
  }));
  const scenes = blocks.map((block, index) => {
    const move = selectedMoves[index];
    return {
      id: block.id,
      intent: (["extract", "connect", "derive", "compare", "verify"] as const)[index],
      role: move.role,
      move: move.id,
      title: block.label,
      content: block.content,
      tone: block.tone,
      purpose: collisionSafeText(session, [move.purpose, `完成第${index + 1}步核对`], `目的-${index + 1}`),
      why: collisionSafeText(session, [nativeMoveWhy(move.label, move.role), `这一步只保留可核对的学习顺序。`], `依据-${index + 1}`),
      selfCheck: collisionSafeText(session, [move.selfCheck, `第${index + 1}步是否来自原题？`], `自查-${index + 1}`),
      sourceMessageIds: [],
      visual: null,
    };
  });
  const plan: BoardPlan = {
    version: 2,
    contentRevision: 2,
    subject: inferBoardSubject(session),
    discipline: session.problem.subject,
    thesis: collisionSafeText(session, [profile.thesis, "只保留可核对的学科思考顺序。"], "学习主线"),
    learningGoal: collisionSafeText(session, [`完成${selectedMoves[0].purpose}，再推进后续判断。`, "逐项核对原题中的对象与条件。"], "学习目标"),
    sourceMessageIds: [],
    scenes,
  };
  const lesson: BoardLesson = {
    title: collisionSafeText(session, [`${profile.label}安全板书`, "当前学科安全板书"], "安全板书"),
    subtitle: collisionSafeText(session, ["当前只展示可验证的学科任务，完整内容可稍后重试。", "当前进入只核对原题的安全模式。"], "安全说明"),
    layout: suggestion.layout,
    blocks,
    annotations: [],
    visual: null,
    plan,
    quality: { status: "safe_fallback", reason: collisionSafeText(session, [degradedReason, "当前内容已切换为可核对的安全学习步骤。"], "降级说明") },
    returnLabel: collisionSafeText(session, [session.flow.activeGate?.title ?? "回到刚才的学习任务", "回到当前学习任务"], "返回"),
  };
  const annotations = blocks.slice(0, 3).map((block, index) => ({
    blockId: block.id,
    target: uniqueExcerpt(block.content),
    kind: (["circle", "underline", "box"] as const)[index],
    reason: collisionSafeText(session, [["先确认当前学科任务的对象和范围。", "先确认当前步骤的核对范围。"], ["这里保留当前动作需要核对的证据角色。", "这里只说明当前步骤应核对什么。"], ["这一动作决定后续推理是否仍有题目依据。", "这一处用于检查后续判断的来源。"]][index], `标注-${index + 1}`),
  }));
  assertAnnotations(annotations, blocks);
  assertNoAnswerLeak(session, lesson.title, blocks, annotations, lesson.visual, lesson.plan);
  return { ...lesson, annotations };
}

function minimalSubjectInstruction(subject: Subject): string {
  const instructions: Record<Subject, string> = {
    math: "写出题内对象和它们之间可验证的式子或图形关系",
    physics: "把研究对象、过程、物理量、方向和单位逐一对应",
    chemistry: "按物质身份、反应前后与守恒项目核对证据",
    biology: "沿结构、功能、生命过程和变量关系核对证据",
    chinese: "先摘录原句，再解释词句在语境和结构中的作用",
    english: "Locate the exact words, then connect grammar and meaning in context",
    history: "把史料放回时间、主体和事件过程后再判断",
    geography: "按区域位置、空间尺度、要素和过程组织材料",
    politics: "按设问方向拆出材料主体、行为、观点和依据",
  };
  return instructions[subject];
}

function collisionSafeText(session: LearningSession, candidates: string[], _suffix: string): string {
  void _suffix;
  const root = session.nodes.find((node) => node.id === session.rootNodeId);
  const forbidden = [root?.check.answer ?? "", (root?.check.explanation ?? "").length >= 12 ? root?.check.explanation ?? "" : ""].map(compact).filter(Boolean);
  const candidate = candidates.find((value) => forbidden.every((item) => !compact(value).includes(item) && !item.includes(compact(value))));
  return candidate ?? `学习段-${session.requestId.replace(/[^a-z0-9]/gi, "").slice(-12) || "fallback"}`;
}

export function createSafeBoardVisual(session: LearningSession): BoardVisual | null {
  const problem = problemEvidenceText(session.problem);
  const triangles = [...new Set(Array.from(problem.matchAll(/(?:△|三角形)\s*([A-Z])([A-Z])([A-Z])/gi)).map((match) => match.slice(1, 4).join("").toUpperCase()))];
  const pointLabels = triangles.length === 1 && new Set(triangles[0]).size === 3 ? triangles[0].split("") : [];
  const hasGeometry = pointLabels.length === 3;
  if (!hasGeometry) return null;

  const evidence = exactEvidence(problem);
  const geometryElements: BoardVisualElement[] = [
    { type: "line", x: 18, y: 52, x2: 50, y2: 10 },
    { type: "line", x: 50, y: 10, x2: 82, y2: 52 },
    { type: "line", x: 82, y: 52, x2: 18, y2: 52 },
    { type: "point", x: 50, y: 10, label: pointLabels[0] },
    { type: "point", x: 18, y: 52, label: pointLabels[1] },
    { type: "point", x: 82, y: 52, label: pointLabels[2] },
  ];
  const visual: BoardVisual = {
    kind: "geometry",
    title: "把图形位置先摆清楚",
    evidence,
    caption: "先在示意图上对应题干中的点、边和角，再把条件逐一放回图中；图形不按比例。",
    elements: geometryElements,
  };
  assertNoAnswerLeak(session, "", [], [], visual);
  return visual;
}

function boardVisualSchema(): JsonObject {
  return {
    type: "object",
    description: "旧版配图兼容字段。新板书固定返回 kind=none，其余文字留空、elements 为空数组。",
    properties: {
      kind: { type: "string", enum: ["none"] },
      title: { type: "string" },
      evidence: { type: "string" }, caption: { type: "string" },
      elements: { type: "array", maxItems: 0, items: { type: "object", additionalProperties: false } },
    },
    required: ["kind", "title", "evidence", "caption", "elements"], additionalProperties: false,
  };
}

function parseGeneratedBoardVisual(raw: unknown): null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("板书配图结构不合法");
  const value = raw as JsonObject;
  if (value.kind !== "none" || !Array.isArray(value.elements) || value.elements.length !== 0) throw new Error("新板书的旧版 visual 只能为 none；配图必须使用受限语义计划");
  return null;
}

function withEmptySceneVisual(scene: unknown): unknown {
  return scene && typeof scene === "object" && !Array.isArray(scene)
    ? { ...scene, visual: { kind: "none", title: "", evidence: "", caption: "" } }
    : scene;
}

function emptyLegacyVisual(): JsonObject {
  return { kind: "none", title: "", evidence: "", caption: "", elements: [] };
}

function exactEvidence(problem: string): string {
  const normalized = problem.trim();
  if (normalized.length < 4) throw new Error("原题不足以支持板书配图");
  const sentence = normalized.split(/[。！？!?\n]/).map((item) => item.trim()).find((item) => item.length >= 4);
  return (sentence ?? normalized).slice(0, 80);
}

function parseAnnotation(raw: unknown, blocks: BoardBlock[]): BoardAnnotation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("板书重点结构不合法");
  const item = raw as JsonObject;
  if (!Number.isInteger(item.blockIndex) || Number(item.blockIndex) < 0 || Number(item.blockIndex) >= blocks.length) throw new Error("板书重点没有关联到有效区块");
  const kind = item.kind;
  if (kind !== "circle" && kind !== "underline" && kind !== "box") throw new Error("板书重点标记类型不合法");
  const block = blocks[Number(item.blockIndex)];
  const rawTarget = text(item.target, "板书重点", 2, 28);
  if (!block.content.includes(rawTarget) || block.content.split(rawTarget).length !== 2) throw new Error("板书重点必须是对应区块中唯一、连续的真实原文");
  const target = expandProtectedTarget(block.content, rawTarget);
  if (block.content.split(target).length !== 2) throw new Error("板书重点扩展后必须仍是唯一真实原文");
  const reason = text(item.reason, "重点标记理由", 8, 70);
  assertBalancedLearningMarkup(reason, "重点标记理由");
  return { blockId: block.id, target, kind, reason };
}

function expandProtectedTarget(content: string, target: string): string {
  const start = content.indexOf(target);
  const end = start + target.length;
  const range = expandLearningMarkupRange(content, start, end);
  return content.slice(range.start, range.end);
}

function assertAnnotations(annotations: BoardAnnotation[], blocks: BoardBlock[]) {
  if (new Set(annotations.map((item) => `${item.blockId}:${item.target}`)).size !== annotations.length) throw new Error("板书重点不能重复");
  if (new Set(annotations.map((item) => item.blockId)).size < 2) throw new Error("板书重点不能全部集中在同一个区块");
  if (annotations.some((item) => blocks.find((block) => block.id === item.blockId)?.content.split(item.target).length !== 2)) throw new Error("板书重点必须是对应区块中唯一、连续的真实原文");
  const positions = annotations.map((item) => ({ ...item, start: blocks.find((block) => block.id === item.blockId)!.content.indexOf(item.target) }));
  if (positions.every((item) => item.start <= 2)) throw new Error("板书重点不能机械截取每段开头");
  for (const current of positions) {
    if (positions.some((other) => other !== current && other.blockId === current.blockId && current.start < other.start + other.target.length && other.start < current.start + current.target.length)) throw new Error("同一区块的板书重点不能相互重叠");
  }
}

function assertNoAnswerLeak(session: LearningSession, title: string, blocks: BoardBlock[], annotations: BoardAnnotation[], visual?: BoardVisual | null, plan?: BoardPlan) {
  const root = session.nodes.find((item) => item.id === session.rootNodeId);
  const visibleText = [
    title,
    ...blocks.flatMap((block) => [block.label, block.content]),
    ...annotations.flatMap((annotation) => [annotation.target, annotation.reason]),
    ...(visual ? [visual.title, visual.evidence, visual.caption, ...visual.elements.map((element) => element.label ?? "")] : []),
    boardPlanVisibleText(plan),
  ].join("\n");
  const boardText = compact(visibleText);
  const normalizedMath = normalizedAnswerMath(visibleText);
  const answer = compact(root?.check.answer ?? "");
  const explanation = compact(root?.check.explanation ?? "");
  const rawAnswer = root?.check.answer ?? "";
  const problemEvidence = problemEvidenceText(session.problem);
  const answerAlreadyInProblem = answer.length >= 2 && compact(problemEvidence).includes(answer);
  if (!answerAlreadyInProblem && !isShortTextAnswer(rawAnswer) && answer.length >= 2 && (boardText.includes(answer) || protectedAnswerVariants(rawAnswer).some((variant) => normalizedMath.includes(variant)))) throw new Error("板书不能提前泄露原题最终答案");
  if (explicitAnswerClaimLeak(visibleText, rawAnswer)) throw new Error("板书不能提前泄露原题最终答案");
  if (shortTextAnswerLeak(visibleText, rawAnswer, problemEvidence)) throw new Error("板书不能提前泄露原题最终答案");
  if (protectedShortAnswers(root?.check.answer ?? "").some((candidate) => shortProtectedAnswerLeak(visibleText, candidate, problemEvidence))) throw new Error("板书不能提前泄露原题最终答案");
  if (explanation.length >= 12 && boardText.includes(explanation)) throw new Error("板书不能提前给出原题完整解法");
}

export function boardAuditSystemPrompt(): string {
  return [
    "你是独立的中国 K12 板书事实审校员，不参与生成板书。",
    "逐项核对候选板书是否忠于原题与已验证教学上下文，公式、数值、单位、条件关系和推理方向是否正确。",
    "检查它是否提前泄露最终答案或完整可照抄步骤，检查标记目标和理由是否真是教学重点而非装饰。",
    "检查候选是否真正重组为独立板书：不得整段搬运 citedDialogue；教学职责必须完整且互不重复；辅助内容必须真实降低理解成本。",
    "candidate.plan 中的 purpose、why、selfCheck 是系统提供的固定导航骨架，不要求它们题型专属，也不能据此否决；contentDistinct 与 teachingComplete 必须以五段 block.content 是否包含当前题型的具体对象、关系、推导与边界为准。",
    "必须核对 candidate.plan.discipline 和每个 scene.move 是否落实到正文：若正文仍是跨学科通用的读题、关系、总结模板，只换了标题或学科名，contentDistinct 与 teachingComplete 必须判为 false。",
    "若候选声明来自某段 citedDialogue，必须核对对应消息内容确实支持该场景；错误归因视为 grounded=false。",
    "若候选包含 visual，逐个核对图元、标签、方向、位置关系是否忠于 sourceOfTruth，并确认 evidence 是真实直接依据；无配图时 visualCorrect 与 visualGrounded 返回 true。",
    "不能因为结构完整就通过；任何事实错误、无依据扩写或答案泄露都必须拒绝。只输出严格 JSON。",
  ].join("\n");
}

export function boardAuditPrompt(session: LearningSession, scope: TutorScope, lesson: BoardLesson, recentDialogue: BoardConversationMessage[] = []): string {
  const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
  const root = session.nodes.find((item) => item.id === session.rootNodeId);
  return JSON.stringify({
    sourceOfTruth: node ? {
      problem: session.problem,
      focusNode: { title: node.title, evidence: node.diagnosticEvidence, reason: node.simplification, teaching: node.teaching },
    } : {
      problem: session.problem,
      problemGuide: session.problemGuide,
      verifiedConcepts: session.nodes.filter((item) => item.kind === "concept").map((item) => ({ title: item.title, evidence: item.diagnosticEvidence, reason: item.simplification })),
    },
    protectedAnswer: root ? { answer: root.check.answer, explanation: root.check.explanation } : null,
    candidate: lesson,
    citedDialogue: recentDialogue.filter((message) => lesson.plan?.sourceMessageIds.includes(message.id)),
    output: { correct: true, grounded: true, noAnswerLeak: true, markingRelevant: true, visualCorrect: true, visualGrounded: true, contentDistinct: true, teachingComplete: true, aidUseful: true, reason: "逐项审校依据" },
  });
}

export function boardAuditTool(): JsonObject {
  const properties = {
    correct: { type: "boolean" },
    grounded: { type: "boolean" },
    noAnswerLeak: { type: "boolean" },
    markingRelevant: { type: "boolean" },
    visualCorrect: { type: "boolean" },
    visualGrounded: { type: "boolean" },
    contentDistinct: { type: "boolean" },
    teachingComplete: { type: "boolean" },
    aidUseful: { type: "boolean" },
    reason: { type: "string", maxLength: 160 },
  };
  return {
    type: "function",
    function: {
      name: "submit_board_audit",
      description: "提交板书事实与教学质量审校结果",
      parameters: {
        type: "object",
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
      },
    },
  };
}

export function parseBoardAudit(value: JsonObject): { passed: boolean; reason: string } {
  const fields = ["correct", "grounded", "noAnswerLeak", "markingRelevant", "visualCorrect", "visualGrounded", "contentDistinct", "teachingComplete", "aidUseful"] as const;
  if (fields.some((field) => typeof value[field] !== "boolean")) throw new Error("板书事实审校结果不完整");
  const rawReason = typeof value.reason === "string" ? value.reason.trim() : "";
  const reason = rawReason.length >= 4 ? rawReason.slice(0, 160) : "审校未提供详细说明";
  return { passed: fields.every((field) => value[field] === true), reason };
}

function annotation(block: BoardBlock, preferred: string, kind: BoardAnnotation["kind"], reason: string): BoardAnnotation {
  const preferredIsUnique = block.content.split(preferred).length === 2;
  const target = preferredIsUnique ? preferred : uniqueExcerpt(block.content);
  return { blockId: block.id, target, kind, reason };
}

function uniqueExcerpt(content: string): string {
  const protectedRanges = Array.from(content.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]*`/g))
    .map((match) => ({ start: match.index!, end: match.index! + match[0].length }));
  const plainRanges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const range of protectedRanges) {
    if (cursor < range.start) plainRanges.push({ start: cursor, end: range.start });
    cursor = range.end;
  }
  if (cursor < content.length) plainRanges.push({ start: cursor, end: content.length });
  for (const range of plainRanges) {
    const first = Math.min(range.end - 2, Math.max(range.start, range.start === 0 ? 8 : range.start));
    for (let start = first; start < range.end - 1; start += 1) {
      const candidate = content.slice(start, Math.min(start + 12, range.end)).trim();
      if (candidate.length >= 2 && !/[\s，。、；：]$/.test(candidate) && content.split(candidate).length === 2) return candidate;
    }
  }
  throw new Error("板书区块中没有可精确标记的唯一原文");
}

function text(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label}缺失`);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) throw new Error(`${label}长度不合法`);
  return result;
}

function compact(value: string): string {
  return value.normalize("NFKC").replace(/[\s，。；：、“”‘’（）()\[\]【】]/g, "").toLowerCase();
}
