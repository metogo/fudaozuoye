import { getConcept, isConceptAllowed } from "./curriculum";
import type { KnowledgeEdge, KnowledgeNode, LearningSession, NodeState } from "./types";

const masteredStates = new Set<NodeState>(["known", "mastered", "parent_confirmed"]);

export function isMastered(state: NodeState): boolean {
  return masteredStates.has(state);
}

export function getPrerequisites(session: Pick<LearningSession, "nodes" | "edges">, nodeId: string): KnowledgeNode[] {
  const ids = new Set(session.edges.filter((edge) => edge.to === nodeId).map((edge) => edge.from));
  return session.nodes.filter((node) => ids.has(node.id));
}

export function canVerifyNode(session: Pick<LearningSession, "nodes" | "edges">, nodeId: string): boolean {
  return getPrerequisites(session, nodeId).every((node) => isMastered(node.state));
}

export function assertGraphInvariants(session: Pick<LearningSession, "nodes" | "edges" | "problem">): void {
  const ids = new Set<string>();
  const conceptIds = new Set<string>();
  for (const node of session.nodes) {
    if (ids.has(node.id)) throw new Error(`重复节点 ID：${node.id}`);
    ids.add(node.id);
    if (node.kind === "concept") {
      if (conceptIds.has(node.conceptId)) throw new Error(`重复知识点：${node.conceptId}`);
      conceptIds.add(node.conceptId);
      if (!isConceptAllowed(node.conceptId, session.problem.subject, session.problem.gradeBand)) {
        throw new Error(`知识点不符合学科或学段：${node.conceptId}`);
      }
    }
  }

  const byId = new Map(session.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  for (const edge of session.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) throw new Error("知识关系引用了不存在的节点");
    if (from.id === to.id) throw new Error("知识图不能包含自环");
    if (from.difficulty >= to.difficulty) throw new Error(`前置知识没有严格简化：${from.title} → ${to.title}`);
    outgoing.set(from.id, [...(outgoing.get(from.id) ?? []), to.id]);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("知识图出现循环");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}

export function mergeExpansion(
  session: LearningSession,
  targetNodeId: string,
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
): LearningSession {
  const target = session.nodes.find((node) => node.id === targetNodeId);
  if (!target) throw new Error("要拆解的知识点不存在");
  if (target.atomic) throw new Error("课标原子点不能继续拆解");
  if (isMastered(target.state)) throw new Error("已掌握节点不能继续拆解");

  const existingByConcept = new Map(session.nodes.map((node) => [node.conceptId, node]));
  const freshNodes = nodes.filter((node) => !existingByConcept.has(node.conceptId));
  const allByConcept = new Map(existingByConcept);
  freshNodes.forEach((node) => allByConcept.set(node.conceptId, node));
  const requestedById = new Map(nodes.map((node) => [node.id, node]));
  const acceptedEdges = edges.map((edge) => {
    const requested = requestedById.get(edge.from);
    const canonicalFrom = requested ? allByConcept.get(requested.conceptId)?.id : edge.from;
    return { ...edge, from: canonicalFrom ?? edge.from };
  }).filter((edge) => edge.to === targetNodeId);
  const existingEdgeKeys = new Set(session.edges.map((edge) => `${edge.from}:${edge.to}`));
  const freshEdges = acceptedEdges.filter((edge) => !existingEdgeKeys.has(`${edge.from}:${edge.to}`));
  if (freshEdges.length === 0) {
    throw new Error("拆解结果没有提供有效的新前置知识");
  }
  for (const edge of freshEdges) {
    const from = session.nodes.concat(freshNodes).find((node) => node.id === edge.from);
    if (!from || !catalogAllowsEdge(from.conceptId, target.conceptId)) throw new Error("拆解结果不符合课程目录的直接前置关系");
  }
  const connectedIds = new Set(freshEdges.map((edge) => edge.from));
  const connectedNodes = freshNodes.filter((node) => connectedIds.has(node.id));

  const next: LearningSession = {
    ...session,
    nodes: session.nodes.map((node) => node.id === targetNodeId ? { ...node, state: "learning" as const } : node).concat(connectedNodes),
    edges: session.edges.concat(freshEdges),
    currentNodeId: connectedNodes.slice().sort((a, b) => a.difficulty - b.difficulty)[0]?.id ?? freshEdges[0]?.from ?? targetNodeId,
    stage: "learning",
    updatedAt: new Date().toISOString(),
  };
  assertGraphInvariants(next);
  return next;
}

export function nextReadyNode(session: LearningSession, preferredTargetId?: string): KnowledgeNode | null {
  const candidates = session.nodes.filter((node) =>
    node.kind === "concept" &&
    !isMastered(node.state) &&
    node.state !== "needs_help" &&
    canVerifyNode(session, node.id),
  );
  if (preferredTargetId) {
    const preferred = candidates.find((node) => node.id === preferredTargetId);
    if (preferred) return preferred;
  }
  return candidates.sort((a, b) => a.difficulty - b.difficulty)[0] ?? null;
}

export function isReadyForOriginal(session: LearningSession): boolean {
  const direct = getPrerequisites(session, session.rootNodeId);
  return direct.length > 0 && direct.every((node) => isMastered(node.state));
}

export function catalogAllowsEdge(fromConceptId: string, toConceptId: string): boolean {
  return getConcept(toConceptId)?.prerequisites.includes(fromConceptId) ?? false;
}
