import { subjects, type BoardLesson, type Subject } from "./types";

export const BOARD_CACHE_VERSION = 2 as const;

export interface StoredBoardCache {
  version: typeof BOARD_CACHE_VERSION;
  requestId: string;
  lesson: BoardLesson;
}

export function isStoredBoardCache(value: unknown, requestId: string): value is StoredBoardCache {
  if (!isRecord(value)) return false;
  return value.version === BOARD_CACHE_VERSION && value.requestId === requestId && isStoredBoardLesson(value.lesson);
}

export function isStoredBoardLesson(value: unknown): value is BoardLesson {
  if (!value || typeof value !== "object") return false;
  const lesson = value as Partial<BoardLesson>;
  const layouts = new Set(["relation", "steps", "comparison", "formula"]);
  return typeof lesson.title === "string"
    && lesson.quality?.status !== "safe_fallback"
    && typeof lesson.subtitle === "string"
    && typeof lesson.returnLabel === "string"
    && layouts.has(String(lesson.layout))
    && Array.isArray(lesson.blocks)
    && lesson.blocks.length > 0
    && lesson.blocks.every((block) => Boolean(block && typeof block.id === "string" && typeof block.label === "string" && typeof block.content === "string" && ["plain", "key", "example"].includes(block.tone)))
    && new Set(lesson.blocks.map((block) => block.id)).size === lesson.blocks.length
    && Array.isArray(lesson.annotations)
    && lesson.annotations.every((annotation) => Boolean(annotation && typeof annotation.blockId === "string" && typeof annotation.target === "string" && typeof annotation.reason === "string" && ["circle", "underline", "box"].includes(annotation.kind)))
    && (lesson.visual === undefined || lesson.visual === null || isStoredLegacyVisual(lesson.visual))
    && (lesson.plan === undefined || isStoredBoardPlan(lesson.plan, lesson.blocks));
}

function isStoredBoardPlan(value: unknown, blocks: BoardLesson["blocks"]): boolean {
  if (!value || typeof value !== "object") return false;
  const plan = value as NonNullable<BoardLesson["plan"]>;
  const native = plan.version === 2 && (plan.contentRevision === 1 || plan.contentRevision === 2);
  const subjectNative = plan.version === 2 && plan.contentRevision === 2;
  if (plan.version !== undefined && plan.version !== 2) return false;
  if (plan.contentRevision !== undefined && plan.contentRevision !== 1 && plan.contentRevision !== 2) return false;
  if (native && (!["math", "science", "language", "humanities", "general"].includes(String(plan.subject)) || typeof plan.thesis !== "string" || plan.thesis.length < 8 || plan.thesis.length > 120)) return false;
  if (subjectNative && (!subjects.includes(plan.discipline as Subject) || plan.discipline === undefined)) return false;
  return typeof plan.learningGoal === "string"
    && Array.isArray(plan.sourceMessageIds)
    && plan.sourceMessageIds.length <= 12
    && plan.sourceMessageIds.every((id) => typeof id === "string")
    && Array.isArray(plan.scenes)
    && plan.scenes.length >= 2 && plan.scenes.length <= 6
    && plan.scenes.length === blocks.length
    && plan.scenes.every((scene, index) => Boolean(scene && scene.id === blocks[index]?.id && scene.title === blocks[index]?.label && scene.content === blocks[index]?.content && scene.tone === blocks[index]?.tone && scene.id.length <= 100 && scene.title.length <= 80 && scene.content.length <= 1_200 && ["extract", "connect", "derive", "compare", "verify"].includes(scene.intent) && Array.isArray(scene.sourceMessageIds) && scene.sourceMessageIds.length <= 4 && scene.sourceMessageIds.every((id) => typeof id === "string" && plan.sourceMessageIds.includes(id)) && (!native || isStoredNativeTeachingScene(scene)) && (!subjectNative || typeof scene.move === "string") && (scene.visual === undefined || scene.visual === null || isStoredSemanticVisual(scene.visual))))
    && (!native || hasCompleteNativeTeachingRoles(plan.scenes))
    && plan.sourceMessageIds.every((id) => plan.scenes.some((scene) => scene.sourceMessageIds.includes(id)));
}

function hasCompleteNativeTeachingRoles(scenes: NonNullable<BoardLesson["plan"]>["scenes"]): boolean {
  const roles = scenes.map((scene) => scene.role);
  const uniqueRoles = new Set<string | undefined>(roles);
  return uniqueRoles.size === roles.length
    && ["orient", "reason"].every((role) => uniqueRoles.has(role));
}

function isStoredNativeTeachingScene(scene: NonNullable<BoardLesson["plan"]>["scenes"][number]): boolean {
  return ["orient", "model", "reason", "misconception", "transfer", "recap"].includes(String(scene.role))
    && typeof scene.purpose === "string" && scene.purpose.length >= 6 && scene.purpose.length <= 80
    && (scene.evidence === undefined || (typeof scene.evidence === "string" && scene.evidence.length >= 4 && scene.evidence.length <= 120))
    && typeof scene.why === "string" && scene.why.length >= 10 && scene.why.length <= 180
    && typeof scene.selfCheck === "string" && scene.selfCheck.length >= 6 && scene.selfCheck.length <= 100;
}

function isStoredSemanticVisual(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const visual = value as Record<string, unknown>;
  if (typeof visual.title !== "string" || typeof visual.evidence !== "string" || typeof visual.caption !== "string") return false;
  if (visual.kind === "concept_graph") {
    if (!Array.isArray(visual.nodes) || visual.nodes.length < 2 || visual.nodes.length > 10 || !Array.isArray(visual.edges) || visual.edges.length < 1 || visual.edges.length > 14 || !["top-down", "left-right"].includes(String(visual.direction))) return false;
    const ids = new Set(visual.nodes.map((node) => isRecord(node) && typeof node.id === "string" ? node.id : ""));
    return !ids.has("") && visual.nodes.every((node) => isRecord(node) && typeof node.label === "string" && ["given", "relation", "step", "check"].includes(String(node.role))) && visual.edges.every((edge) => isRecord(edge) && typeof edge.from === "string" && typeof edge.to === "string" && ids.has(edge.from) && ids.has(edge.to));
  }
  if (visual.kind === "formula_chain") return Array.isArray(visual.steps) && visual.steps.length >= 2 && visual.steps.length <= 6 && hasUniqueIds(visual.steps) && visual.steps.every((step) => isRecord(step) && typeof step.id === "string" && typeof step.expression === "string" && step.expression.length <= 180 && typeof step.explanation === "string" && step.explanation.length <= 80);
  if (visual.kind === "function_plot") return Array.isArray(visual.domain) && visual.domain.length === 2 && visual.domain.every(isFiniteNumber) && Array.isArray(visual.series) && visual.series.length > 0 && visual.series.length <= 3 && visual.series.every((series) => isRecord(series) && typeof series.id === "string" && typeof series.label === "string" && Array.isArray(series.coefficients) && series.coefficients.length > 0 && series.coefficients.length <= 6 && series.coefficients.every(isFiniteNumber) && ["emerald", "amber", "rose"].includes(String(series.color)));
  if (visual.kind === "geometry_model") {
    if (!Array.isArray(visual.points) || visual.points.length < 2 || visual.points.length > 12 || !Array.isArray(visual.objects) || visual.objects.length < 1 || visual.objects.length > 20) return false;
    const ids = new Set(visual.points.map((point) => isRecord(point) && typeof point.id === "string" && typeof point.label === "string" ? point.id : ""));
    return !ids.has("") && visual.objects.every((object) => isStoredGeometryObject(object, ids));
  }
  if (visual.kind === "evidence_chain") return Array.isArray(visual.links) && visual.links.length >= 2 && visual.links.length <= 6 && hasUniqueIds(visual.links) && visual.links.every((link) => isRecord(link) && typeof link.id === "string" && typeof link.quote === "string" && typeof link.meaning === "string");
  if (visual.kind === "timeline") return Array.isArray(visual.events) && visual.events.length >= 2 && visual.events.length <= 8 && hasUniqueIds(visual.events) && visual.events.every((event) => isRecord(event) && typeof event.id === "string" && typeof event.time === "string" && typeof event.event === "string");
  if (visual.kind === "process_flow") return Array.isArray(visual.steps) && visual.steps.length >= 2 && visual.steps.length <= 6 && hasUniqueIds(visual.steps) && visual.steps.every((step) => isRecord(step) && typeof step.id === "string" && typeof step.label === "string" && typeof step.evidence === "string");
  if (visual.kind === "comparison_matrix") return Array.isArray(visual.columns) && visual.columns.length === 2 && visual.columns.every((column) => typeof column === "string") && Array.isArray(visual.rows) && visual.rows.length >= 1 && visual.rows.length <= 6 && hasUniqueIds(visual.rows) && visual.rows.every((row) => isRecord(row) && typeof row.id === "string" && typeof row.aspect === "string" && typeof row.left === "string" && typeof row.right === "string");
  return false;
}

function isStoredGeometryObject(value: unknown, pointIds: Set<string>): boolean {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (["segment", "line", "arrow"].includes(value.type)) return typeof value.from === "string" && typeof value.to === "string" && value.from !== value.to && pointIds.has(value.from) && pointIds.has(value.to);
  if (value.type === "right_angle" || value.type === "angle") return typeof value.vertex === "string" && typeof value.from === "string" && typeof value.to === "string" && new Set([value.vertex, value.from, value.to]).size === 3 && pointIds.has(value.vertex) && pointIds.has(value.from) && pointIds.has(value.to) && (value.type === "right_angle" || value.label === undefined || typeof value.label === "string");
  if (value.type === "circle") return typeof value.center === "string" && pointIds.has(value.center) && ((typeof value.through === "string" && pointIds.has(value.through) && value.radius === undefined) || (isFiniteNumber(value.radius) && Number(value.radius) > 0 && value.through === undefined));
  return false;
}

function isStoredLegacyVisual(value: unknown): boolean {
  if (!isRecord(value) || !["geometry", "optics", "process", "relation"].includes(String(value.kind)) || !Array.isArray(value.elements)) return false;
  return typeof value.title === "string" && typeof value.evidence === "string" && typeof value.caption === "string" && value.elements.every((element) => isRecord(element) && typeof element.type === "string" && isFiniteNumber(element.x) && isFiniteNumber(element.y));
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function hasUniqueIds(values: unknown[]): boolean {
  const ids = values.map((value) => isRecord(value) && typeof value.id === "string" ? value.id : "");
  return !ids.includes("") && new Set(ids).size === ids.length;
}
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
