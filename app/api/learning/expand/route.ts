import { fail } from "@/lib/learning/api";
import { mergeExpansion } from "@/lib/learning/graph";
import { getProviderAdapter } from "@/lib/learning/providers";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "@/lib/learning/request-guards";
import { openSession, toClientState } from "@/lib/learning/server-state";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertRateLimit(request); assertContentLength(request, 200_000);
    const body = await request.json();
    const session = openSession(body.stateToken);
    if (typeof body.targetNodeId !== "string" || body.targetNodeId !== session.currentNodeId) throw new Error("只能拆解当前学习节点");
    const adapter = getProviderAdapter(session.provider);
    return sse(async (send) => {
      send("phase", { key: "locating", label: "正在检查这个知识点还缺哪些更简单的前置" });
      const expansion = await adapter.expandNode(session, body.targetNodeId, (key, label) => send("phase", { key, label }));
      const next = mergeExpansion(session, body.targetNodeId, expansion.nodes, expansion.edges);
      send("graph", toClientState(next));
      send("complete", { provider: session.provider, modelId: adapter.modelId, mode: adapter.mode });
    });
  } catch (error) { return fail(error); }
}

function sse(run: (send: (event: string, data: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const keepalive = setInterval(() => controller.enqueue(encoder.encode(": keepalive\n\n")), 15_000);
      try { await run(send); }
      catch (error) { send("error", { code: "EXPAND_FAILED", message: error instanceof Error ? error.message : "拆解失败", retryable: true }); }
      finally { clearInterval(keepalive); controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" } });
}
