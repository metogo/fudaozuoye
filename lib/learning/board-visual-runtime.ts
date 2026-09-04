import type { BoardSemanticVisual } from "./types";

export function isUsefulBoardVisual(value: unknown): value is BoardSemanticVisual {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const visual = value as Partial<BoardSemanticVisual>;
  if (!text(visual.title) || !text(visual.evidence) || !text(visual.caption)) return false;
  if (visual.kind === "formula_chain") return ids(visual.steps) && visual.steps.length >= 2 && visual.steps.every((step) => text(step.expression) && text(step.explanation));
  if (visual.kind === "concept_graph") {
    if (!ids(visual.nodes) || visual.nodes.length < 2 || !Array.isArray(visual.edges) || visual.edges.length === 0) return false;
    const nodeIds = new Set(visual.nodes.map((node) => node.id));
    return ["top-down", "left-right"].includes(String(visual.direction)) && visual.nodes.every((node) => text(node.label) && ["given", "relation", "step", "check"].includes(node.role))
      && visual.edges.every((edge) => Boolean(edge) && text(edge.from) && text(edge.to) && edge.from !== edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to));
  }
  if (visual.kind === "evidence_chain") return ids(visual.links) && visual.links.length >= 2 && visual.links.every((link) => text(link.quote) && text(link.meaning));
  if (visual.kind === "geometry_model") {
    if (!ids(visual.points) || visual.points.length < 2 || !visual.points.every((point) => text(point.label)) || !Array.isArray(visual.objects) || visual.objects.length === 0) return false;
    const pointIds = new Set(visual.points.map((point) => point.id));
    return visual.objects.every((object) => validGeometryObject(object, pointIds));
  }
  if (visual.kind === "function_plot") return ids(visual.series) && visual.series.length > 0 && visual.series.every((series) => text(series.label) && Array.isArray(series.coefficients) && series.coefficients.length > 0 && series.coefficients.every(Number.isFinite) && ["emerald", "amber", "rose"].includes(series.color))
    && Array.isArray(visual.domain) && visual.domain.length === 2 && visual.domain.every(Number.isFinite) && visual.domain[0] < visual.domain[1];
  if (visual.kind === "timeline") return ids(visual.events) && visual.events.length >= 2 && visual.events.every((event) => text(event.time) && text(event.event));
  if (visual.kind === "process_flow") return ids(visual.steps) && visual.steps.length >= 2 && visual.steps.every((step) => text(step.label) && text(step.evidence));
  if (visual.kind === "comparison_matrix") return ids(visual.rows) && visual.rows.length > 0 && visual.rows.every((row) => text(row.aspect) && text(row.left) && text(row.right)) && Array.isArray(visual.columns) && visual.columns.length === 2 && visual.columns.every(text);
  return false;
}

function ids(value: unknown): value is Array<{ id: string }> {
  return Array.isArray(value) && value.every((item) => Boolean(item) && typeof item === "object" && text((item as { id?: unknown }).id))
    && new Set(value.map((item) => item.id)).size === value.length;
}

function text(value: unknown): value is string { return typeof value === "string" && Boolean(value.trim()); }

function validGeometryObject(value: unknown, pointIds: Set<string>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  if (["segment", "line", "arrow"].includes(String(object.type))) return text(object.from) && text(object.to) && object.from !== object.to && pointIds.has(object.from) && pointIds.has(object.to);
  if (object.type === "angle" || object.type === "right_angle") return text(object.vertex) && text(object.from) && text(object.to) && new Set([object.vertex, object.from, object.to]).size === 3 && pointIds.has(object.vertex) && pointIds.has(object.from) && pointIds.has(object.to);
  if (object.type === "circle") return text(object.center) && pointIds.has(object.center) && (text(object.through) ? pointIds.has(object.through) : typeof object.radius === "number" && Number.isFinite(object.radius) && object.radius > 0);
  return false;
}
