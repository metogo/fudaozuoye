import { mapEvidence, type MapConcept, type MapRelation } from "../knowledge-map";
import { MAX_EVIDENCE_LENGTH } from "../evidence-segments";
import { parseMapPlan } from "../knowledge-map-stream";
import type { LearningSession } from "../types";
import { resolveKnowledgeEvidence } from "./knowledge-map";
import { parseJsonObject } from "./model-support";

export type MapRequest = (system: string, prompt: string, timeoutMs?: number, onDelta?: (text: string) => void) => Promise<string>;

/** Repair only invalid model content, once, within the original stage budget. */
export async function requestMapValue<T>(request: MapRequest, system: string, prompt: string,
  validate: (value: Record<string, unknown>) => T, budgetMs: number): Promise<T> {
  const started = Date.now();
  let input = prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining <= 0) throw new DOMException("图谱生成超时", "TimeoutError");
    // Transport already has bounded transient retries; cancellation is never a repair trigger.
    const raw = await request(system, input, remaining);
    try { return validate(parseJsonObject(raw)); }
    catch (error) {
      if (attempt === 1) throw error;
      input = JSON.stringify({ originalInput: JSON.parse(prompt), previousOutput: raw,
        validationError: error instanceof Error ? error.message : "结构不完整",
        instruction: "只修正当前输出中不符合要求的字段，返回完整JSON。不得编造题目条件、证据编号或增加无关知识。" });
    }
  }
  throw new Error("知识图谱修正未完成");
}

export function validateMapPlan(value: Record<string, unknown>, session: LearningSession) {
  const plan = parseMapPlan(value);
  const concepts = resolveKnowledgeEvidence(value, session).nodes as MapConcept[];
  const source = mapEvidence(session).replace(/\s+/g, "");
  const titles = new Set<string>();
  concepts.forEach((node, index) => {
    if (typeof node.title !== "string" || !node.title.trim() || node.title.length > 30 || titles.has(node.title.trim())) throw new Error("知识清单名称不完整或重复");
    titles.add(node.title.trim());
    if (node.evidence.length > MAX_EVIDENCE_LENGTH || (node.evidence && !source.includes(node.evidence.replace(/\s+/g, "")))) throw new Error("知识点引用未对应本题原文");
    if ((index === 0 || plan.nodes[index].parents.includes(plan.rootId)) && !node.evidence) throw new Error(`知识点${node.id}缺少有效evidenceId，请从原题证据清单选择，不得编造`);
  });
  return { plan, concepts };
}

export function validateMapRelations(value: Record<string, unknown>, node: { id: string; parents: string[] }): MapRelation[] {
  if (!Array.isArray(value.relations) || value.relations.length !== node.parents.length) throw new Error("知识点的关系未完整返回");
  return value.relations.map((edge, i) => {
    if (!edge || (edge.kind !== "prerequisite" && edge.kind !== "application")) throw new Error("知识点关系类型不合法");
    if (typeof edge.reason !== "string" || !edge.reason.trim() || edge.reason.length > 180) throw new Error("知识点关系说明不完整或过长");
    return { kind: edge.kind, reason: edge.reason.trim(), from: node.parents[i], to: node.id };
  });
}
