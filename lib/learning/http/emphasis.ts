import { fail } from "../api";
import { getSessionProviderAdapter } from "../providers";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "../request-guards";
import { consentRateIdentity, openSession } from "../server-state";

export async function postEmphasis(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertRateLimit(request, 30, `emphasis:${consentRateIdentity(request) ?? request.headers.get("x-real-ip") ?? "local"}`);
    assertContentLength(request, 210000);
    const body = await request.json() as Record<string, unknown>;
    const session = openSession(body.stateToken);
    if (typeof body.source !== "string" || body.source.length < 30 || body.source.length > 16000 || typeof body.context !== "string" || body.context.length > 24000) throw new Error("重点标记上下文不合法");
    // Independent timeout and adapter: failure cannot cancel the teaching stream.
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20000)]);
    const adapter = getSessionProviderAdapter(session, signal);
    const marks = await adapter.selectEmphasis?.(session, body.source, body.context) ?? [];
    return Response.json({ marks }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}
