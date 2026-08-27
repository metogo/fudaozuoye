"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sse = sse;
function sse(run) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event, data) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            const keepalive = setInterval(() => controller.enqueue(encoder.encode(": keepalive\n\n")), 15_000);
            try {
                await run(send);
            }
            catch (error) {
                send("error", { code: "STREAM_FAILED", message: error instanceof Error ? error.message : "请求失败", retryable: true });
            }
            finally {
                clearInterval(keepalive);
                controller.close();
            }
        },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
