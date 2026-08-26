import { getProviderAdapter } from "@/lib/learning/providers";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "@/lib/learning/request-guards";
import { openSession } from "@/lib/learning/server-state";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertRateLimit(request, 20); assertContentLength(request, 200_000);
    const body = await request.json();
    const session = openSession(body.stateToken);
    const adapter = getProviderAdapter(session.provider);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        try {
          send("meta", { schemaVersion: "1.0", provider: session.provider, modelId: adapter.modelId, requestId: session.requestId });
          await adapter.streamSolution(session.problem, (delta) => send("delta", { text: delta }));
          send("complete", { provider: session.provider, modelId: adapter.modelId });
        } catch (error) {
          send("error", { code: "SOLUTION_FAILED", message: error instanceof Error ? error.message : "答案生成失败", retryable: true });
        } finally { controller.close(); }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" } });
  } catch (error) {
    return Response.json({ schemaVersion: "1.0", data: null, error: { code: "INVALID_REQUEST", message: error instanceof Error ? error.message : "请求失败", retryable: false } }, { status: 400 });
  }
}
