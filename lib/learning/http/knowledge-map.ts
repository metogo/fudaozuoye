import { fail } from "../api";
import { getSessionProviderAdapter } from "../providers";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "../request-guards";
import { consentRateIdentity, openSession } from "../server-state";
import { mapEvidence, parseKnowledgeMap } from "../knowledge-map";

export async function postKnowledgeMap(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertContentLength(request, 200000);
    assertRateLimit(request, 12, `knowledge-map:${consentRateIdentity(request) ?? request.headers.get("x-real-ip") ?? "local"}`);
    const body = await request.json() as Record<string, unknown>;
    const session = openSession(body.stateToken);
    const adapter = getSessionProviderAdapter(session, AbortSignal.any([request.signal, AbortSignal.timeout(45000)]));
    if (body.nodeId !== undefined) {
      const map = parseKnowledgeMap(body.map, mapEvidence(session));
      if (typeof body.nodeId !== "string" || !map.nodes.some(n => n.id === body.nodeId)) throw new Error("知识点不存在");
      if (!adapter.generateKnowledgeDetail) throw new Error("当前模型暂不支持知识详情");
      const detail = await adapter.generateKnowledgeDetail(session, map, body.nodeId);
      return Response.json({ detail }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!adapter.generateKnowledgeMap) throw new Error("演示模式暂不生成知识图谱，请使用已配置的模型");
    // Separate read-only request: never changes gates, answers or mastery state.
    const map = await adapter.generateKnowledgeMap(session);
    return Response.json({ map }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}
