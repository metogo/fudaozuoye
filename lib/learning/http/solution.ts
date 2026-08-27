import { getProviderAdapter } from "../providers";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "../request-guards";
import { openSession } from "../server-state";
import { sse } from "./sse";

export async function postSolution(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertRateLimit(request, 20);
    assertContentLength(request, 200_000);
    const body = await request.json();
    const session = openSession(body.stateToken);
    const adapter = getProviderAdapter(session.provider);
    return sse(async (send) => {
      send("meta", { schemaVersion: "1.0", provider: session.provider, modelId: adapter.modelId, requestId: session.requestId });
      await adapter.streamSolution(session.problem, (delta) => send("delta", { text: delta }));
      send("complete", { provider: session.provider, modelId: adapter.modelId });
    });
  } catch (error) {
    return Response.json({ schemaVersion: "1.0", data: null, error: { code: "INVALID_REQUEST", message: error instanceof Error ? error.message : "请求失败", retryable: false } }, { status: 400 });
  }
}
