import type { ProblemKnowledgeMap } from "./knowledge-map";

/** Exactly the node context sent to the model; unrelated graph growth is not a change. */
export function knowledgeDetailContext(map: ProblemKnowledgeMap, nodeId: string) {
  const node = map.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error("知识点不存在");
  const relations = map.edges.filter(e => e.from === nodeId || e.to === nodeId).map(e => ({ ...e,
    from: map.nodes.find(n => n.id === e.from)?.title,
    to: map.nodes.find(n => n.id === e.to)?.title,
  }));
  return { node, relations };
}

export function knowledgeDetailIdentity(map: ProblemKnowledgeMap, nodeId: string) {
  return JSON.stringify(knowledgeDetailContext(map, nodeId));
}
