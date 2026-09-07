import { fail } from "../api";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "../request-guards";
import { consentRateIdentity, openSession } from "../server-state";
import { generateExplanationConnection } from "../providers/knowledge-connection";

export async function postKnowledgeConnection(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertContentLength(request, 400000);
    assertRateLimit(request, 20, `knowledge-connection:${consentRateIdentity(request) ?? request.headers.get("x-real-ip") ?? "local"}`);
    const body = await request.json() as Record<string, unknown>;
    const session = openSession(body.stateToken);
    if (typeof body.messageId !== "string" || !body.messageId || body.messageId.length > 160 || typeof body.source !== "string" || body.source.trim().length < 30 || body.source.length > 60000) throw new Error("知识连接的讲解范围不合法");
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(28000)]);
    const connection = await generateExplanationConnection(session, body.source, signal);
    return Response.json({ messageId: body.messageId, connection }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}
