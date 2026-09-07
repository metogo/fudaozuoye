import { parseKnowledgeMap, type MapConcept, type MapPoint, type MapRelation, type ProblemKnowledgeMap } from "./knowledge-map";

export interface KnowledgeMapPlan { rootId: string; nodes: { id: string; parents: string[] }[] }
export type KnowledgeMapEvent =
  | { type: "plan"; plan: KnowledgeMapPlan }
  | { type: "node"; node: MapConcept; edges: MapRelation[] };
export interface KnowledgeMapDraft { plan: KnowledgeMapPlan | null; map: ProblemKnowledgeMap | null }

export function parseMapPlan(value: unknown): KnowledgeMapPlan {
  const plan = value as KnowledgeMapPlan | null;
  if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length < 2 || plan.nodes.length > 16) throw new Error("知识清单数量不合法");
  const seen = new Map<string, number>();
  let edges = 0;
  const nodes = plan.nodes.map((n, index) => {
    if (!n || typeof n.id !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(n.id) || ["__proto__", "constructor", "prototype"].includes(n.id) || seen.has(n.id)) throw new Error("知识清单编号不合法");
    if (!Array.isArray(n.parents) || new Set(n.parents).size !== n.parents.length || n.parents.some(id => !seen.has(id))) throw new Error("知识清单必须先给出上层知识");
    if (index === 0 ? n.id !== plan.rootId || n.parents.length !== 0 : n.parents.length === 0) throw new Error("知识清单缺少核心关联");
    const depth = n.parents.length ? Math.max(...n.parents.map(id => seen.get(id)!)) + 1 : 0;
    edges += n.parents.length;
    if (depth > 4 || edges > 24) throw new Error("知识清单关系过多");
    seen.set(n.id, depth);
    return { id: n.id, parents: [...n.parents] };
  });
  return { rootId: plan.rootId, nodes };
}

/** Incomplete nodes/relations never increase displayed progress. */
export function applyMapEvent(draft: KnowledgeMapDraft, event: KnowledgeMapEvent, evidence: string): KnowledgeMapDraft {
  if (event.type === "plan") {
    if (draft.plan) throw new Error("知识清单不能中途改变");
    return { plan: parseMapPlan(event.plan), map: null };
  }
  if (event.type !== "node" || !draft.plan) throw new Error("请先确定知识清单");
  const expected = draft.plan.nodes.find(n => n.id === event.node?.id);
  const received = new Set(draft.map?.nodes.map(n => n.id));
  if (!expected || received.has(expected.id) || !Array.isArray(event.edges)) throw new Error("知识点不在清单中或重复返回");
  if (expected.parents.some(id => !received.has(id))) throw new Error("知识点的上层知识尚未就绪");
  if (event.edges.length !== expected.parents.length || event.edges.some(e => e.to !== expected.id || !expected.parents.includes(e.from))) throw new Error("知识点的关联关系不完整");
  const map = parseKnowledgeMap({ version: 1, overviewOnly: true, rootId: draft.plan.rootId,
    nodes: [...(draft.map?.nodes ?? []), event.node], edges: [...(draft.map?.edges ?? []), ...event.edges],
  }, evidence, true);
  return { plan: draft.plan, map };
}

export function finishMapDraft(draft: KnowledgeMapDraft, evidence: string): ProblemKnowledgeMap {
  if (!draft.plan || draft.map?.nodes.length !== draft.plan.nodes.length) throw new Error("图谱尚未完整生成，已显示的知识点仍可查看");
  return parseKnowledgeMap(draft.map, evidence);
}

/** Plan fixes each slot before content arrives; new nodes never move old ones. */
export function mapPlanPositions(plan: KnowledgeMapPlan): Record<string, MapPoint> {
  const ranks = new Map<string, number>();
  plan.nodes.forEach(n => ranks.set(n.id, n.parents.length ? Math.max(...n.parents.map(id => ranks.get(id)!)) + 1 : 0));
  const positions: Record<string, MapPoint> = {};
  for (const rank of [...new Set(ranks.values())].sort((a, b) => a - b)) {
    const level = plan.nodes.filter(n => ranks.get(n.id) === rank);
    // A narrow viewport pans across a layer; wrapping would route edges through siblings.
    level.forEach((n, i) => { positions[n.id] = { x: (i - (level.length - 1) / 2) * 232, y: rank * 208 }; });
  }
  return positions;
}

export async function readMapStream(response: Response, onEvent: (event: string, data: unknown) => void) {
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error?.message || "图谱暂未生成，请重试");
  }
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("图谱连接未建立，请重试");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", complete = false;
  const parse = (block: string) => {
    const event = block.match(/^event: (.+)$/m)?.[1];
    const data = block.split("\n").filter(l => l.startsWith("data: ")).map(l => l.slice(6)).join("\n");
    if (!event || !data) return;
    const value = JSON.parse(data);
    if (event === "error") throw new Error(value.message || "图谱生成中断，请重试");
    if (complete) throw new Error("图谱结束后收到重复内容");
    onEvent(event, value);
    if (event === "complete") complete = true;
  };
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      if (buffer.length > 100000) throw new Error("图谱数据量异常");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) { parse(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); }
      if (done) { if (buffer.trim()) parse(buffer); break; }
    }
    if (!complete) throw new Error("图谱连接中断，已显示的知识点仍可查看");
  } finally { await reader.cancel(); reader.releaseLock(); }
}
