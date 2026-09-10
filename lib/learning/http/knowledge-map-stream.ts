import type { ProviderAdapter } from "../providers/adapter";
import type { LearningSession } from "../types";
import { createMapDeadline } from "../knowledge-map-deadline";

/** This stream owns cancellation so closing the canvas stops model work too. */
export function knowledgeMapResponse(adapter: ProviderAdapter, session: LearningSession, requestSignal: AbortSignal, earlyRoot = false): Response {
  const deadline = createMapDeadline();
  const signal = AbortSignal.any([requestSignal, deadline.signal]);
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stop = () => { closed = true; clearInterval(heartbeat); deadline.clear(); adapter.cancelPendingRequests(); };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
      const abort = () => {
        if (closed) return;
        if (signal.reason?.name === "TimeoutError") send("error", { message: "这次整理超时了，已显示的知识点仍可查看。" });
        stop(); controller.close();
      };
      if (signal.aborted) { abort(); return; }
      signal.addEventListener("abort", abort, { once: true });
      heartbeat = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n")); }, 10000);
      try {
        send("map.start", {});
        const map = await adapter.streamKnowledgeMap!(session, event => {
          if (closed) throw signal.reason ?? new DOMException("图谱已关闭", "AbortError");
          if (event.type === "plan") deadline.planned(event.plan.nodes.length);
          send(`map.${event.type}`, event);
        }, earlyRoot ? node => {
          if (closed) throw signal.reason ?? new DOMException("图谱已关闭", "AbortError");
          send("map.root", { node });
        } : undefined);
        send("complete", { total: map.nodes.length });
      } catch (error) {
        send("error", { message: error instanceof SyntaxError ? "知识关系暂未整理完整，已显示的内容仍可查看。" : error instanceof Error ? error.message : "图谱生成中断，请重试" });
      } finally {
        signal.removeEventListener("abort", abort);
        clearInterval(heartbeat);
        deadline.clear();
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel: stop,
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
