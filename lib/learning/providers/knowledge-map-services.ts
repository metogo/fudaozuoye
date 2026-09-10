import type { LearningSession } from "../types";
import { parseJsonObject } from "./model-support";
import { requestMapValue } from "./knowledge-map-validation";
import { requestModelText, type TextRequestContext } from "./provider-text-request";
import type { MapConcept } from "../knowledge-map";
import type { KnowledgeMapEvent } from "../knowledge-map-stream";
type TextRequest = (system: string, prompt: string, image?: string, json?: boolean, timeout?: number, signal?: AbortSignal, tokens?: number) => Promise<string>;

export async function streamMapWithContext(context: TextRequestContext, session: LearningSession, emit: (event: KnowledgeMapEvent) => void, onRoot?: (root: MapConcept | null) => void) {
  const { streamKnowledgeMap } = await import("./knowledge-map-stream");
  try {
    return await streamKnowledgeMap(session, (system, prompt, timeoutMs, onDelta) =>
      requestModelText(context, system, prompt, undefined, true, timeoutMs, undefined, 2600, onDelta), emit, onRoot);
  } catch (error) { context.requests.cancelAll(); throw error; }
}

export async function generateKnowledgeMap(session: LearningSession, request: TextRequest) {
    const { knowledgeMapSystem, knowledgeMapPrompt, resolveKnowledgeEvidence } = await import("./knowledge-map");
    const { parseKnowledgeMap, mapEvidence } = await import("../knowledge-map");
    return requestMapValue((system, prompt, timeout) => request(system, prompt, undefined, true, timeout, undefined, 4800),
      knowledgeMapSystem, knowledgeMapPrompt(session),
      value => parseKnowledgeMap({ ...resolveKnowledgeEvidence(value, session), overviewOnly: true }, mapEvidence(session)), 40000);
  }
export async function generateKnowledgeDetail(session: LearningSession, map: import("../knowledge-map").ProblemKnowledgeMap, nodeId: string, request: TextRequest) {
    const { knowledgeDetailSystem, knowledgeMapPrompt } = await import("./knowledge-map");
    const { parseKnowledgeDetail } = await import("../knowledge-map");
    const node = map.nodes.find(n => n.id === nodeId);
    if (!node) throw new Error("知识点不存在");
    const relations = map.edges.filter(e => e.from === nodeId || e.to === nodeId).map(e => ({ ...e, from: map.nodes.find(n => n.id === e.from)?.title, to: map.nodes.find(n => n.id === e.to)?.title }));
    const raw = await request(knowledgeDetailSystem, JSON.stringify({ original: knowledgeMapPrompt(session), node, relations }), undefined, true, 25000, undefined, 1400);
    return parseKnowledgeDetail(parseJsonObject(raw));
  }
