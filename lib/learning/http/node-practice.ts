import { fail } from "../api";
import { getSessionProviderAdapter } from "../providers";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "../request-guards";
import { consentRateIdentity, openSession } from "../server-state";
import { mapEvidence, parseKnowledgeMap } from "../knowledge-map";
import { parseNodePractice } from "../node-practice";

/** Optional, read-only practice: never changes the original lesson or counters. */
export async function postNodePractice(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertContentLength(request, 200000);
    assertRateLimit(request, 8, `node-practice:${consentRateIdentity(request) ?? request.headers.get("x-real-ip") ?? "local"}`);
    const body = await request.json() as Record<string, unknown>;
    const session = openSession(body.stateToken);
    const map = parseKnowledgeMap(body.map, mapEvidence(session), body.partial === true);
    const concept = map.nodes.find(node => node.id === body.nodeId);
    if (!concept) throw new Error("知识点不存在");
    if (!Array.isArray(body.previous) || body.previous.length > 5 || body.previous.some(text => typeof text !== "string" || text.length > 600)) throw new Error("换题记录不合法");
    const adapter = getSessionProviderAdapter(session, AbortSignal.any([request.signal, AbortSignal.timeout(45000)]));
    if (!adapter.generateNodePractice) throw new Error("当前模型暂不支持知识点练习");
    const practice = parseNodePractice(await adapter.generateNodePractice(session, concept, body.previous));
    return Response.json({ practice }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}
