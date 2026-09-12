import type { ProviderAdapter } from "../providers/provider-contract";
import type { LearningSession } from "../types";
import type { ProblemKnowledgeMap } from "../knowledge-map";

export function knowledgeDetailResponse(adapter: ProviderAdapter, session: LearningSession, map: ProblemKnowledgeMap, nodeId: string, signal: AbortSignal) {
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stop = () => { closed = true; clearInterval(heartbeat); adapter.cancelPendingRequests(); };
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
      const abort = () => { if (!closed) { send("error", { message: "知识说明已中断，请重试" }); stop(); controller.close(); } };
      if (signal.aborted) { abort(); return; }
      signal.addEventListener("abort", abort, { once: true });
      heartbeat = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n")); }, 10000);
      try {
        send("detail.start", {});
        const detail = await adapter.streamKnowledgeDetail!(session, map, nodeId, summary => send("detail.summary", { summary }));
        send("complete", { detail });
      } catch { send("error", { message: "知识说明未完整生成，请重试" }); }
      finally { signal.removeEventListener("abort", abort); clearInterval(heartbeat); if (!closed) { closed = true; controller.close(); } }
    },
    cancel: stop,
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
