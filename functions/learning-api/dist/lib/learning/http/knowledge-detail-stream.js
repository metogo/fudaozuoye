"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeDetailResponse = knowledgeDetailResponse;
function knowledgeDetailResponse(adapter, session, map, nodeId, signal) {
    const encoder = new TextEncoder();
    let closed = false;
    let heartbeat;
    const stop = () => { closed = true; clearInterval(heartbeat); adapter.cancelPendingRequests(); };
    const body = new ReadableStream({
        async start(controller) {
            const send = (event, data) => { if (!closed)
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
            const abort = () => { if (!closed) {
                send("error", { message: "知识说明已中断，请重试" });
                stop();
                controller.close();
            } };
            if (signal.aborted) {
                abort();
                return;
            }
            signal.addEventListener("abort", abort, { once: true });
            heartbeat = setInterval(() => { if (!closed)
                controller.enqueue(encoder.encode(": keepalive\n\n")); }, 10000);
            try {
                send("detail.start", {});
                const detail = await adapter.streamKnowledgeDetail(session, map, nodeId, summary => send("detail.summary", { summary }));
                send("complete", { detail });
            }
            catch {
                send("error", { message: "知识说明未完整生成，请重试" });
            }
            finally {
                signal.removeEventListener("abort", abort);
                clearInterval(heartbeat);
                if (!closed) {
                    closed = true;
                    controller.close();
                }
            }
        },
        cancel: stop,
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
