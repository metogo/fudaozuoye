import type { MapConcept, ProblemKnowledgeMap } from "./knowledge-map";

export interface MapFocus { title: string; id?: string }

export function findMapFocus(nodes: MapConcept[], focus?: MapFocus): MapConcept | undefined {
  if (!focus) return undefined;
  const matches = nodes.filter(n => n.title.replace(/\s/g, "") === focus.title.replace(/\s/g, ""));
  if (focus.id) return matches.find(n => n.id === focus.id);
  return matches.length === 1 ? matches[0] : undefined;
}

export function mapFocusAncestors(map: ProblemKnowledgeMap, focus?: MapFocus): Set<string> {
  const target = findMapFocus(map.nodes, focus);
  const ancestors = new Set<string>();
  if (!target) return ancestors;
  const queue = [target.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of map.edges) if (edge.to === id && !ancestors.has(edge.from)) { ancestors.add(edge.from); queue.push(edge.from); }
  }
  return ancestors;
}
