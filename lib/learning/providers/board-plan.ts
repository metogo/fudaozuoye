import type {
  BoardBlock,
  BoardConceptVisual,
  BoardConversationMessage,
  BoardFunctionVisual,
  BoardFormulaVisual,
  BoardGeometryObject,
  BoardGeometryVisual,
  BoardPlan,
  BoardScene,
  BoardSemanticVisual,
  BoardTeachingRole,
  BoardTeachingSubject,
  LearningSession,
} from "../types";
import katex from "katex";
import { enrichBoardPlanWithSafeAids } from "../board-aids";
import { createNativeBoardFallbackPlan, inferBoardSubject } from "../board-native-fallback";
import { assertBalancedLearningMarkup } from "../presentation";
import { normalizedAnswerMath, protectedAnswerVariants, protectedShortAnswers, shortProtectedAnswerLeak } from "./answer-protection";
import type { JsonObject } from "./model-support";

const sceneIntents = ["extract", "connect", "derive", "compare", "verify"] as const;
const teachingSubjects = ["math", "science", "language", "humanities", "general"] as const;
const teachingRoles = ["orient", "model", "reason", "misconception", "transfer", "recap"] as const;

export function boardPlanSchema(options: { includeVisuals?: boolean } = {}): JsonObject {
  const includeVisuals = options.includeVisuals !== false;
  const sceneProperties = {
    intent: { type: "string", enum: [...sceneIntents] },
    role: { type: "string", enum: [...teachingRoles] },
    purpose: { type: "string", maxLength: 48 },
    evidence: { type: "string", maxLength: 80 },
    why: { type: "string", maxLength: 100 },
    selfCheck: { type: "string", maxLength: 48 },
    sourceMessageIds: { type: "array", maxItems: 4, items: { type: "string" } },
    ...(includeVisuals ? { visual: semanticVisualSchema() } : {}),
  };
  return {
    type: "object",
    properties: {
      version: { const: 2 },
      contentRevision: { const: 1 },
      subject: { type: "string", enum: [...teachingSubjects] },
      thesis: { type: "string", maxLength: 120 },
      learningGoal: { type: "string", maxLength: 80 },
      sourceMessageIds: { type: "array", maxItems: 12, items: { type: "string" } },
      scenes: {
        type: "array", minItems: 5, maxItems: 6,
        items: {
          type: "object",
          properties: sceneProperties,
          required: ["intent", "role", "purpose", "evidence", "why", "selfCheck", "sourceMessageIds", ...(includeVisuals ? ["visual"] : [])],
          additionalProperties: false,
        },
      },
    },
    required: ["version", "contentRevision", "subject", "thesis", "learningGoal", "sourceMessageIds", "scenes"],
    additionalProperties: false,
  };
}

export function parseBoardPlan(
  value: unknown,
  session: LearningSession,
  blocks: BoardBlock[],
  context: BoardConversationMessage[],
): BoardPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("板书教学计划结构不合法");
  const plan = value as JsonObject;
  if (plan.version !== undefined && plan.version !== 2) throw new Error("板书教学计划版本不合法");
  const native = plan.version === 2;
  if (native && plan.contentRevision !== 1) throw new Error("板书教学内容版本不合法");
  const learningGoal = text(plan.learningGoal, "板书学习目标", 4, 80);
  assertBalancedLearningMarkup(learningGoal, "板书学习目标");
  const subject = native ? teachingSubject(plan.subject) : inferBoardSubject(session);
  const thesis = native ? text(plan.thesis, "板书核心结论", 8, 120) : learningGoal;
  assertBalancedLearningMarkup(thesis, "板书核心结论");
  const allowedIds = new Set(context.map((message) => message.id));
  const sourceMessageIds = sourceIds(plan.sourceMessageIds, allowedIds, 12);
  if (!Array.isArray(plan.scenes) || plan.scenes.length !== blocks.length) throw new Error("板书教学计划必须与正文区块逐项对应");
  const evidenceSources = visualEvidenceSources(session);
  const topLevelIds = new Set(sourceMessageIds);
  const contextById = new Map(context.map((message) => [message.id, message.text]));
  const scenes = plan.scenes.map((raw, index) => parseScene(raw, index, blocks[index], topLevelIds, evidenceSources, contextById, native));
  if (new Set(scenes.map((scene) => scene.intent)).size < 2) throw new Error("板书场景必须体现至少两种教学意图");
  const sceneIds = new Set(scenes.flatMap((scene) => scene.sourceMessageIds));
  if (sourceMessageIds.some((id) => !sceneIds.has(id))) throw new Error("板书总来源必须由具体场景实际引用");
  if (native) assertNativeTeachingPlan(scenes, context);
  const result = enrichBoardPlanWithSafeAids(session, { ...(native ? { version: 2 as const, contentRevision: 1 as const } : {}), subject, thesis, learningGoal, sourceMessageIds, scenes });
  assertPlanNoAnswerLeak(session, [result.thesis, result.learningGoal].filter(Boolean).join("\n"), result.scenes);
  return result;
}

export function createSafeBoardPlan(
  session: LearningSession,
  blocks: BoardBlock[],
  options: { contextualAids?: boolean } = {},
): BoardPlan {
  const result = enrichBoardPlanWithSafeAids(session, createNativeBoardFallbackPlan(session, blocks), options);
  assertPlanNoAnswerLeak(session, [result.thesis, result.learningGoal].filter(Boolean).join("\n"), result.scenes);
  return result;
}

export function boardPlanVisibleText(plan?: BoardPlan): string {
  if (!plan) return "";
  return [
    plan.thesis ?? "",
    plan.learningGoal,
    ...plan.scenes.flatMap((scene) => [scene.title, scene.content, scene.purpose ?? "", scene.evidence ?? "", scene.why ?? "", scene.selfCheck ?? "", ...semanticVisualText(scene.visual)]),
  ].join("\n");
}

function parseScene(
  raw: unknown,
  index: number,
  fallbackBlock: BoardBlock | undefined,
  allowedIds: Set<string>,
  evidenceSources: string[],
  contextById: Map<string, string>,
  native: boolean,
): BoardScene {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("板书教学场景结构不合法");
  const item = raw as JsonObject;
  if (!sceneIntents.includes(item.intent as typeof sceneIntents[number])) throw new Error("板书教学意图不合法");
  if (!fallbackBlock) throw new Error("板书教学场景没有对应正文区块");
  const sourceMessageIds = sourceIds(item.sourceMessageIds, allowedIds, 4);
  const nativeFields = native ? parseNativeTeachingFields(item, evidenceSources.concat(sourceMessageIds.map((id) => contextById.get(id) ?? ""))) : {};
  return {
    id: fallbackBlock.id,
    intent: item.intent as BoardScene["intent"],
    ...nativeFields,
    title: fallbackBlock.label,
    content: fallbackBlock.content,
    tone: fallbackBlock.tone,
    sourceMessageIds,
    visual: parseSemanticVisual(item.visual, evidenceSources),
  };
}

function parseNativeTeachingFields(item: JsonObject, evidenceSources: string[]): Pick<BoardScene, "role" | "purpose" | "evidence" | "why" | "selfCheck"> {
  if (!teachingRoles.includes(item.role as BoardTeachingRole)) throw new Error("板书教学单元职责不合法");
  const purpose = text(item.purpose, "板书教学目的", 6, 80);
  const evidence = text(item.evidence, "板书教学依据", 4, 120);
  const why = text(item.why, "板书成立原因", 10, 180);
  const selfCheck = text(item.selfCheck, "板书自查问题", 6, 100);
  if (!evidenceSources.some((source) => source.includes(evidence))) throw new Error("板书教学依据必须逐字来自原题、知识节点或已引用对话");
  for (const [label, value] of [["板书教学目的", purpose], ["板书成立原因", why], ["板书自查问题", selfCheck]] as const) assertBalancedLearningMarkup(value, label);
  return { role: item.role as BoardTeachingRole, purpose, evidence, why, selfCheck };
}

function assertNativeTeachingPlan(scenes: BoardScene[], context: BoardConversationMessage[]) {
  if (scenes.length < 5 || scenes.length > 6) throw new Error("新版板书必须包含 5 到 6 个职责完整的教学单元");
  const roles = scenes.map((scene) => scene.role!);
  for (const required of ["orient", "model", "reason", "recap"] as const) {
    if (!roles.includes(required)) throw new Error(`新版板书缺少 ${required} 教学职责`);
  }
  if (!roles.includes("misconception") && !roles.includes("transfer")) throw new Error("新版板书必须包含易错辨析或迁移应用");
  if (new Set(roles).size !== roles.length) throw new Error("新版板书教学职责不能重复");
  const contents = scenes.map((scene) => compact(scene.content));
  if (new Set(contents).size !== contents.length) throw new Error("新版板书不能重复相同正文");
  for (const [label, values] of [
    ["教学目的", scenes.map((scene) => compact(scene.purpose ?? ""))],
    ["成立原因", scenes.map((scene) => compact(scene.why ?? ""))],
    ["自查问题", scenes.map((scene) => compact(scene.selfCheck ?? ""))],
  ] as const) {
    if (new Set(values).size !== values.length) throw new Error(`新版板书${label}不能重复`);
  }
  for (const scene of scenes) {
    for (const message of context) {
      if (copiesChatParagraph(scene.content, message.text) || copiesChatParagraph(scene.why ?? "", message.text)) throw new Error("新版板书不能整段搬运 Chat 内容");
    }
  }
}

function copiesChatParagraph(candidate: string, source: string): boolean {
  const normalizedCandidate = compact(candidate);
  const normalizedSource = compact(source);
  if (normalizedCandidate.length < 36 || normalizedSource.length < 36) return false;
  if (normalizedSource.includes(normalizedCandidate)) return true;
  return candidate.split(/[。！？；\n]/).some((sentence) => {
    const normalized = compact(sentence);
    return normalized.length >= 36 && normalizedSource.includes(normalized);
  });
}

function teachingSubject(value: unknown): BoardTeachingSubject {
  if (!teachingSubjects.includes(value as BoardTeachingSubject)) throw new Error("板书学科表达类型不合法");
  return value as BoardTeachingSubject;
}

function parseSemanticVisual(value: unknown, evidenceSources: string[]): BoardSemanticVisual | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("板书场景配图结构不合法");
  const visual = value as JsonObject;
  if (visual.kind === "none") return null;
  const common = semanticVisualCommon(visual, evidenceSources);
  if (visual.kind === "concept_graph") return parseConceptVisual(visual, common, evidenceSources);
  if (visual.kind === "formula_chain") return parseFormulaVisual(visual, common);
  if (visual.kind === "geometry_model") return parseGeometryVisual(visual, common);
  if (visual.kind === "function_plot") return parseFunctionVisual(visual, common, evidenceSources);
  throw new Error("板书场景配图类型不合法");
}

function semanticVisualCommon(value: JsonObject, evidenceSources: string[]) {
  const title = text(value.title, "板书场景配图标题", 2, 28);
  const evidence = text(value.evidence, "板书场景配图依据", 4, 100);
  const caption = text(value.caption, "板书场景配图说明", 6, 120);
  if (!evidenceSources.some((source) => source.includes(evidence))) throw new Error("板书场景配图依据必须逐字来自原题或当前知识节点");
  assertBalancedLearningMarkup(title, "板书场景配图标题");
  assertBalancedLearningMarkup(caption, "板书场景配图说明");
  return { title, evidence, caption };
}

function parseConceptVisual(value: JsonObject, common: Omit<BoardConceptVisual, "kind" | "direction" | "nodes" | "edges">, evidenceSources: string[]): BoardConceptVisual {
  const direction = value.direction;
  if (direction !== "top-down" && direction !== "left-right") throw new Error("板书关系图方向不合法");
  if (!Array.isArray(value.nodes) || value.nodes.length < 2 || value.nodes.length > 10) throw new Error("板书关系图节点数量不合法");
  const nodes = value.nodes.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("板书关系图节点不合法");
    const node = raw as JsonObject;
    const role = node.role;
    if (role !== "given" && role !== "relation" && role !== "step" && role !== "check") throw new Error("板书关系图节点角色不合法");
    const id = identifier(node.id, "板书关系图节点");
    const label = plainLabel(node.label, "板书关系图节点标签", 36);
    return { id, label, role: role as BoardConceptVisual["nodes"][number]["role"] };
  });
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error("板书关系图节点不能重复");
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!Array.isArray(value.edges) || value.edges.length < 1 || value.edges.length > 14) throw new Error("板书关系图连线数量不合法");
  const edges = value.edges.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("板书关系图连线不合法");
    const edge = raw as JsonObject;
    const from = identifier(edge.from, "板书关系图起点");
    const to = identifier(edge.to, "板书关系图终点");
    if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) throw new Error("板书关系图连线必须引用不同的真实节点");
    const label = edge.label === undefined || edge.label === "" ? undefined : plainLabel(edge.label, "板书关系图连线标签", 24);
    return { from, to, ...(label ? { label } : {}) };
  });
  const groundedText = compact(evidenceSources.join(" "));
  const genericNode = /^(已知|条件|关系|步骤|检查|验证|目标|任务|结论|未知量|当前问题)$/;
  const neutralEdge = /^(关联|对应|连接|检查|验证)$/;
  if (nodes.some((node) => !genericNode.test(node.label) && !groundedText.includes(compact(node.label)))) throw new Error("板书关系图节点必须由题目或当前知识内容支持");
  if (nodes.some((node) => /^(已知|条件)/.test(node.label) && node.role !== "given" || /^(检查|验证)/.test(node.label) && node.role !== "check")) throw new Error("板书关系图节点角色必须与节点含义一致");
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  if (edges.some((edge) => edge.label && !neutralEdge.test(edge.label) && !explicitEdgeRelation(evidenceSources, labels.get(edge.from) ?? "", edge.label, labels.get(edge.to) ?? ""))) throw new Error("板书关系图的因果或推导方向必须由原文直接支持");
  return { kind: "concept_graph", ...common, direction, nodes, edges };
}

function explicitEdgeRelation(sources: string[], from: string, relation: string, to: string): boolean {
  const left = compact(from);
  const middle = compact(relation);
  const right = compact(to);
  return sources.flatMap((source) => source.split(/[。；;\n]/)).some((clause) => {
    const text = compact(clause);
    return new RegExp(`${escapeRegExp(left)}.{0,16}${escapeRegExp(middle)}.{0,16}${escapeRegExp(right)}`).test(text);
  });
}

function parseGeometryVisual(value: JsonObject, common: Omit<BoardGeometryVisual, "kind" | "points" | "objects">): BoardGeometryVisual {
  if (!Array.isArray(value.points) || value.points.length < 2 || value.points.length > 12) throw new Error("板书几何点数量不合法");
  const points = value.points.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("板书几何点结构不合法");
    const point = raw as JsonObject;
    if (Object.keys(point).some((key) => key !== "id" && key !== "label")) throw new Error("板书几何点只能包含点名，不能包含坐标");
    return {
      id: identifier(point.id, "板书几何点"),
      label: plainLabel(point.label, "板书几何点标签", 8),
    };
  });
  if (new Set(points.map((point) => point.id)).size !== points.length) throw new Error("板书几何点不能重复");
  if (new Set(points.map((point) => point.label.toUpperCase())).size !== points.length) throw new Error("板书几何点标签不能重复");
  const pointIds = new Set(points.map((point) => point.id));
  if (!Array.isArray(value.objects) || value.objects.length < 1 || value.objects.length > 20) throw new Error("板书几何对象数量不合法");
  const objects = value.objects.map((raw) => parseGeometryObject(raw, pointIds));
  const result: BoardGeometryVisual = { kind: "geometry_model", ...common, points, objects };
  assertGeometryGrounded(result);
  return result;
}

function parseGeometryObject(raw: unknown, pointIds: Set<string>): BoardGeometryObject {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("板书几何对象结构不合法");
  const object = raw as JsonObject;
  const type = object.type;
  if (type === "segment" || type === "line" || type === "arrow") {
    const from = pointReference(object.from, pointIds);
    const to = pointReference(object.to, pointIds);
    if (from === to) throw new Error("板书几何对象不能引用同一点");
    const label = object.label === undefined || object.label === "" ? undefined : plainLabel(object.label, "板书几何对象标签", 12);
    return { type, from, to, ...(label ? { label } : {}) };
  }
  if (type === "circle") {
    const center = pointReference(object.center, pointIds);
    const through = object.through === undefined || object.through === "" ? undefined : pointReference(object.through, pointIds);
    const radius = object.radius === undefined ? undefined : finite(object.radius, 0.01, 1_000, "板书圆半径");
    if ((!through && radius === undefined) || (through && radius !== undefined)) throw new Error("板书圆必须且只能使用过点或半径定义");
    if (through === center) throw new Error("板书圆心和过点不能是同一点");
    const label = object.label === undefined || object.label === "" ? undefined : plainLabel(object.label, "板书圆标签", 12);
    return { type, center, ...(through ? { through } : {}), ...(radius !== undefined ? { radius } : {}), ...(label ? { label } : {}) };
  }
  if (type === "right_angle") {
    const vertex = pointReference(object.vertex, pointIds);
    const from = pointReference(object.from, pointIds);
    const to = pointReference(object.to, pointIds);
    if (new Set([vertex, from, to]).size !== 3) throw new Error("板书直角标记必须引用三个不同的点");
    return { type, vertex, from, to };
  }
  throw new Error("板书几何对象类型不合法");
}

function parseFunctionVisual(value: JsonObject, common: Omit<BoardFunctionVisual, "kind" | "domain" | "series">, evidenceSources: string[]): BoardFunctionVisual {
  if (!Array.isArray(value.domain) || value.domain.length !== 2) throw new Error("板书函数定义域不合法");
  const domain: [number, number] = [finite(value.domain[0], -100, 100, "板书函数定义域"), finite(value.domain[1], -100, 100, "板书函数定义域")];
  if (domain[0] >= domain[1]) throw new Error("板书函数定义域顺序不合法");
  if (domain[1] - domain[0] < 1e-6) throw new Error("板书函数定义域跨度过小");
  if (!Array.isArray(value.series) || value.series.length < 1 || value.series.length > 3) throw new Error("板书函数数量不合法");
  const series = value.series.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("板书函数结构不合法");
    const item = raw as JsonObject;
    if (!Array.isArray(item.coefficients) || item.coefficients.length < 1 || item.coefficients.length > 6) throw new Error("板书函数只支持五次以内多项式");
    const color = item.color;
    if (color !== "emerald" && color !== "amber" && color !== "rose") throw new Error("板书函数颜色不合法");
    return {
      id: identifier(item.id, "板书函数"),
      label: plainLabel(item.label, "板书函数标签", 30),
      coefficients: item.coefficients.map((coefficient) => finite(coefficient, -10_000, 10_000, "板书函数系数")),
      color: color as BoardFunctionVisual["series"][number]["color"],
    };
  });
  if (new Set(series.map((item) => item.id)).size !== series.length) throw new Error("板书函数不能重复");
  const result: BoardFunctionVisual = { kind: "function_plot", ...common, domain, series };
  for (const item of series) {
    const assignment = polynomialAssignment(item.coefficients, common.evidence);
    if (!assignment) throw new Error("板书函数系数必须逐项来自配图依据中的多项式");
    if (normalizedAnswerMath(item.label) !== assignment.left) throw new Error("板书函数标签必须与配图依据中的函数名一致");
    const supportingSources = evidenceSources.flatMap((source) => functionContexts(source, item.coefficients, assignment.left));
    assertFunctionDomain(domain, supportingSources, evidenceSources);
  }
  return result;
}

function parseFormulaVisual(value: JsonObject, common: Omit<BoardFormulaVisual, "kind" | "steps">): BoardFormulaVisual {
  if (!Array.isArray(value.steps) || value.steps.length < 2 || value.steps.length > 6) throw new Error("板书公式链步骤数量不合法");
  const steps = value.steps.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("板书公式链步骤不合法");
    const step = raw as JsonObject;
    const expression = text(step.expression, "板书公式", 3, 180);
    const explanation = text(step.explanation, "板书公式说明", 4, 80);
    assertBalancedLearningMarkup(expression, "板书公式");
    assertBalancedLearningMarkup(explanation, "板书公式说明");
    assertValidLatex(expression, "板书公式");
    return { id: identifier(step.id, "板书公式步骤"), expression, explanation };
  });
  if (new Set(steps.map((step) => step.id)).size !== steps.length) throw new Error("板书公式步骤不能重复");
  return { kind: "formula_chain", ...common, steps };
}

function semanticVisualSchema(): JsonObject {
  const common = { title: { type: "string", maxLength: 28 }, evidence: { type: "string", maxLength: 80 }, caption: { type: "string", maxLength: 100 } };
  return { oneOf: [
    { type: "object", properties: { kind: { const: "none" }, ...common }, required: ["kind", "title", "evidence", "caption"], additionalProperties: false },
    { type: "object", properties: { kind: { const: "concept_graph" }, ...common, direction: { type: "string", enum: ["top-down", "left-right"] }, nodes: { type: "array", minItems: 2, maxItems: 10, items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, role: { type: "string", enum: ["given", "relation", "step", "check"] } }, required: ["id", "label", "role"], additionalProperties: false } }, edges: { type: "array", minItems: 1, maxItems: 14, items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } }, required: ["from", "to"], additionalProperties: false } } }, required: ["kind", "title", "evidence", "caption", "direction", "nodes", "edges"], additionalProperties: false },
    { type: "object", properties: { kind: { const: "geometry_model" }, ...common, points: { type: "array", minItems: 2, maxItems: 12, items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false } }, objects: { type: "array", minItems: 1, maxItems: 20, items: { oneOf: [
      { type: "object", properties: { type: { type: "string", enum: ["segment", "line", "arrow"] }, from: { type: "string" }, to: { type: "string" }, label: { type: "string" } }, required: ["type", "from", "to"], additionalProperties: false },
      { type: "object", properties: { type: { const: "circle" }, center: { type: "string" }, through: { type: "string" }, radius: { type: "number" }, label: { type: "string" } }, required: ["type", "center"], additionalProperties: false },
      { type: "object", properties: { type: { const: "right_angle" }, vertex: { type: "string" }, from: { type: "string" }, to: { type: "string" } }, required: ["type", "vertex", "from", "to"], additionalProperties: false },
    ] } } }, required: ["kind", "title", "evidence", "caption", "points", "objects"], additionalProperties: false },
    { type: "object", properties: { kind: { const: "function_plot" }, ...common, domain: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } }, series: { type: "array", minItems: 1, maxItems: 3, items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, coefficients: { type: "array", minItems: 1, maxItems: 6, items: { type: "number" } }, color: { type: "string", enum: ["emerald", "amber", "rose"] } }, required: ["id", "label", "coefficients", "color"], additionalProperties: false } } }, required: ["kind", "title", "evidence", "caption", "domain", "series"], additionalProperties: false },
    { type: "object", properties: { kind: { const: "formula_chain" }, ...common, steps: { type: "array", minItems: 2, maxItems: 6, items: { type: "object", properties: { id: { type: "string" }, expression: { type: "string" }, explanation: { type: "string" } }, required: ["id", "expression", "explanation"], additionalProperties: false } } }, required: ["kind", "title", "evidence", "caption", "steps"], additionalProperties: false },
  ] };
}

function assertPlanNoAnswerLeak(session: LearningSession, learningGoal: string, scenes: BoardScene[]) {
  const root = session.nodes.find((node) => node.id === session.rootNodeId);
  const visibleText = [learningGoal, ...scenes.flatMap((scene) => [scene.title, scene.content, scene.purpose ?? "", scene.evidence ?? "", scene.why ?? "", scene.selfCheck ?? "", ...semanticVisualText(scene.visual)])].join("\n");
  const answer = compact(root?.check.answer ?? "");
  const explanation = compact(root?.check.explanation ?? "");
  const boardText = compact(visibleText);
  const normalizedMath = comparableMath(visibleText);
  if (answer.length >= 2 && (boardText.includes(answer) || protectedAnswerVariants(root?.check.answer ?? "").some((variant) => normalizedMath.includes(variant)))) throw new Error("板书教学计划不能提前泄露原题最终答案");
  if (protectedShortAnswers(root?.check.answer ?? "").some((candidate) => shortProtectedAnswerLeak(visibleText, candidate, session.problem.text))) throw new Error("板书教学计划不能提前泄露原题最终答案");
  if (explanation.length >= 12 && boardText.includes(explanation)) throw new Error("板书教学计划不能提前给出原题完整解法");
}

function semanticVisualText(visual?: BoardSemanticVisual | null): string[] {
  if (!visual) return [];
  const common = [visual.title, visual.evidence, visual.caption];
  if (visual.kind === "concept_graph") return common.concat(visual.nodes.map((node) => node.label), visual.edges.map((edge) => edge.label ?? ""));
  if (visual.kind === "formula_chain") return common.concat(visual.steps.flatMap((step) => [step.expression, step.explanation]));
  if (visual.kind === "geometry_model") return common.concat(visual.points.map((point) => point.label), visual.objects.map((object) => "label" in object ? object.label ?? "" : ""));
  return common.concat(visual.series.map((series) => series.label));
}

function visualEvidenceSources(session: LearningSession): string[] {
  return [session.problem.text, ...session.nodes.flatMap((node) => node.kind === "concept" ? [node.diagnosticEvidence] : [])]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function sourceIds(value: unknown, allowed: Set<string>, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error("板书来源引用不合法");
  const ids = value.map((item) => identifier(item, "板书来源引用"));
  if (ids.some((id) => !allowed.has(id))) throw new Error("板书来源引用必须来自当前对话");
  return Array.from(new Set(ids));
}

function pointReference(value: unknown, allowed: Set<string>): string {
  const id = identifier(value, "板书几何点引用");
  if (!allowed.has(id)) throw new Error("板书几何对象必须引用真实点");
  return id;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value)) throw new Error(`${label}标识不合法`);
  return value;
}

function plainLabel(value: unknown, label: string, maximum: number): string {
  const result = text(value, label, 1, maximum);
  if (/[$\\<>\[\]{}|`]/.test(result)) throw new Error(`${label}不能包含公式或图形语法`);
  return result;
}

function finite(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label}不合法`);
  return value;
}

function text(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label}缺失`);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) throw new Error(`${label}长度不合法`);
  return result;
}

function assertGeometryGrounded(visual: BoardGeometryVisual) {
  const evidence = comparableMath(visual.evidence).toUpperCase();
  if (visual.points.some((point) => !evidence.includes(point.label.toUpperCase()))) throw new Error("板书几何点必须逐字来自配图依据");
  const triangleNames = Array.from(visual.evidence.matchAll(/(?:△|三角形)\s*([A-Z])([A-Z])([A-Z])/gi)).map((match) => match.slice(1, 4).join("").toUpperCase());
  for (const object of visual.objects) {
    if (object.type === "right_angle") {
      const vertex = visual.points.find((point) => point.id === object.vertex)?.label.toUpperCase() ?? "";
      const from = visual.points.find((point) => point.id === object.from)?.label.toUpperCase() ?? "";
      const to = visual.points.find((point) => point.id === object.to)?.label.toUpperCase() ?? "";
      const outerPointsMatch = (left: string, right: string) => new Set([left, right]).size === 2 && [left, right].every((point) => point === from || point === to);
      const explicitAngle = Array.from(visual.evidence.matchAll(/∠\s*([A-Z])([A-Z])([A-Z])\s*=\s*90(?:°|度|\\circ)/gi))
        .some((match) => match[2].toUpperCase() === vertex && outerPointsMatch(match[1].toUpperCase(), match[3].toUpperCase()));
      const singleVertex = new RegExp(`∠\\s*${escapeRegExp(vertex)}\\s*=\\s*90(?:°|度|\\\\circ)`, "i").test(visual.evidence);
      const triangleSupportsRays = triangleNames.some((name) => {
        const otherVertices = name.split("").filter((point) => point !== vertex);
        return name.includes(vertex) && otherVertices.length === 2 && outerPointsMatch(otherVertices[0], otherVertices[1]);
      });
      if (!explicitAngle && !(singleVertex && triangleSupportsRays)) throw new Error("板书直角标记的顶点和两条射线必须由 90° 条件直接支持");
      continue;
    }
    if (object.type === "circle") {
      if (!/[圆⊙]/.test(visual.evidence)) throw new Error("板书圆必须由配图依据中的圆条件直接支持");
      if (object.radius !== undefined) {
        const center = visual.points.find((point) => point.id === object.center)?.label ?? "";
        const namedRadius = new RegExp(`(?:(?:圆|⊙)\\s*${escapeRegExp(center)}[^。；]{0,24}(?:半径|r\\s*=)|以\\s*${escapeRegExp(center)}\\s*为圆心[^。；]{0,16}(?:半径|r\\s*=))[^。；,，]{0,12}(?:^|[^0-9.])${escapeRegExp(String(object.radius))}(?![0-9.])`, "i");
        if (!namedRadius.test(visual.evidence)) throw new Error("板书圆半径必须与明确的圆心或圆名绑定");
      }
      if (object.through) {
        const center = visual.points.find((point) => point.id === object.center)?.label ?? "";
        const through = visual.points.find((point) => point.id === object.through)?.label ?? "";
        const relation = new RegExp(`(?:圆|⊙)\\s*${escapeRegExp(center)}[^。；,，]{0,20}(?:过|经过)\\s*${escapeRegExp(through)}|${escapeRegExp(through)}[^。；,，]{0,12}(?:在|位于)(?:圆|⊙)\\s*${escapeRegExp(center)}(?:上)?`, "i");
        if (!relation.test(visual.evidence)) throw new Error("板书圆的过点关系必须由配图依据直接支持");
      }
      continue;
    }
    const from = visual.points.find((point) => point.id === object.from)?.label.toUpperCase() ?? "";
    const to = visual.points.find((point) => point.id === object.to)?.label.toUpperCase() ?? "";
    if (object.type === "line" && !new RegExp(`(?:直线\\s*${escapeRegExp(from + to)}|${escapeRegExp(from + to)}\\s*所在直线)`, "i").test(visual.evidence)) throw new Error("板书无限直线必须由明确的直线条件支持");
    if (object.type === "arrow" && !new RegExp(`(?:射线|向量|方向)\\s*${escapeRegExp(from + to)}`, "i").test(visual.evidence)) throw new Error("板书方向箭头必须由明确的射线、向量或方向条件支持");
    const isTriangleEdge = triangleNames.some((name) => name.includes(from) && name.includes(to));
    if (!isTriangleEdge && !evidence.includes(`${from}${to}`) && !evidence.includes(`${to}${from}`)) throw new Error("板书线段或方向必须由配图依据直接支持");
  }
}

function polynomialAssignment(coefficients: number[], evidence: string): { left: string } | null {
  return polynomialAssignments(coefficients, evidence)[0] ?? null;
}

function polynomialAssignments(coefficients: number[], evidence: string): Array<{ left: string }> {
  const expression = polynomialExpression(coefficients);
  const normalized = polynomialEvidence(evidence);
  return Array.from(normalized.matchAll(new RegExp(`(?:^|[^a-z0-9])([a-z][a-z0-9]*)=${escapeRegExp(expression)}(?![a-z0-9^+\\-*/.])`, "g")), (match) => ({ left: match[1] }));
}

function polynomialEvidence(value: string): string {
  return value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${Array.from(digits).map((digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(digit)).join("")}`).normalize("NFKC")
    .replace(/\^\{([^{}]+)\}/g, "^$1")
    .replace(/\\(?:left|right|,|;|!|quad|qquad)/g, "")
    .replace(/[${}\s（）()\[\]【】]/g, "")
    .toLowerCase();
}

function functionContexts(source: string, coefficients: number[], left: string): string[] {
  const clauses = splitMathClauses(source);
  const assignmentIndexes = clauses.flatMap((clause, index) => /(?:^|[^a-z0-9])[a-z][a-z0-9]*=/.test(polynomialEvidence(clause)) ? [index] : []);
  const targetIndexes = assignmentIndexes.filter((index) => polynomialAssignments(coefficients, clauses[index]).some((candidate) => candidate.left === left));
  return targetIndexes.map((index) => {
    const position = assignmentIndexes.indexOf(index);
    const next = position + 1 < assignmentIndexes.length ? assignmentIndexes[position + 1] : clauses.length;
    return clauses.slice(index, next).join("，");
  });
}

function splitMathClauses(value: string): string[] {
  const clauses: string[] = [];
  let current = "";
  let bracketDepth = 0;
  for (const character of value) {
    if ("[（(".includes(character)) bracketDepth += 1;
    if ("]）)".includes(character)) bracketDepth = Math.max(0, bracketDepth - 1);
    if (bracketDepth === 0 && /[。；;\n,，]/.test(character)) {
      if (current.trim()) clauses.push(current.trim());
      current = "";
    } else current += character;
  }
  if (current.trim()) clauses.push(current.trim());
  return clauses;
}

function explicitDomain(evidence: string): [number, number] | null {
  const normalized = evidence.normalize("NFKC");
  const interval = normalized.match(/(?:x\s*(?:∈|in)|定义域(?:是|为|:|：)?)\s*\[\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*\]/i);
  if (interval) return [Number(interval[1]), Number(interval[2])];
  const inequality = normalized.match(/(-?\d+(?:\.\d+)?)\s*(?:≤|<=)\s*x\s*(?:≤|<=)\s*(-?\d+(?:\.\d+)?)/i);
  if (inequality) return [Number(inequality[1]), Number(inequality[2])];
  return null;
}

function assertFunctionDomain(domain: [number, number], sources: string[], allEvidenceSources: string[]) {
  const domainMention = /(?:x\s*(?:∈|>|<|≥|≤)|(?:>|<|≥|≤)\s*x|定义域)/i;
  const unsupportedDomain = /(?:∪|\\cup|x\s*∈\s*\{|x\s*∈\s*\[[^\]]*[)）]|x\s*∈\s*[（(][^）)]*[\]］])/i;
  if (sources.some((source) => unsupportedDomain.test(source))) throw new Error("当前函数定义域不是单个闭区间，不能生成函数图");
  const statedDomains = sources.map(explicitDomain).filter((value): value is [number, number] => value !== null);
  if (statedDomains.length > 0 && !statedDomains.some(([minimum, maximum]) => domain[0] === minimum && domain[1] === maximum)) throw new Error("板书函数定义域必须与原题完整条件一致");
  const openConstraint = /(?:x\s*(?:>|<|≥|≤)|(?:>|<|≥|≤)\s*x|x\s*∈\s*[（(]|定义域[^。；]*[（(])/i;
  if (sources.some((source) => openConstraint.test(source)) && statedDomains.length === 0) throw new Error("当前函数定义域不能由闭区间准确表达，不能生成函数图");
  if (sources.some((source) => domainMention.test(source)) && statedDomains.length === 0) throw new Error("当前函数定义域无法可靠转换为单个闭区间，不能生成函数图");
  const anyDomainStatement = allEvidenceSources.some((source) => explicitDomain(source) || domainMention.test(source));
  if (anyDomainStatement && statedDomains.length === 0 && !sources.some((source) => openConstraint.test(source))) throw new Error("原题存在无法与当前函数可靠绑定的定义域，不能生成函数图");
}

function polynomialExpression(coefficients: number[]): string {
  const degree = coefficients.length - 1;
  const terms: string[] = [];
  coefficients.forEach((coefficient, index) => {
    if (coefficient === 0) return;
    const power = degree - index;
    const sign = coefficient < 0 ? "-" : terms.length > 0 ? "+" : "";
    const absolute = Math.abs(coefficient);
    const factor = absolute === 1 && power > 0 ? "" : String(absolute);
    const variable = power === 0 ? "" : power === 1 ? "x" : `x^${power}`;
    terms.push(`${sign}${factor}${variable}`);
  });
  return terms.join("") || "0";
}

function comparableMath(value: string): string {
  return normalizedAnswerMath(value);
}

function assertValidLatex(value: string, label: string) {
  for (const formula of value.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)) {
    const source = formula[1] ?? formula[2] ?? "";
    try { katex.renderToString(source, { throwOnError: true, strict: "error" }); }
    catch { throw new Error(`${label}的 LaTeX 结构不合法`); }
  }
}

function compact(value: string): string {
  return value.normalize("NFKC").replace(/[\s，。；：、“”‘’（）()\[\]【】]/g, "").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
