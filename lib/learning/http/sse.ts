export function sse(run: (send: (event: string, data: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const keepalive = setInterval(() => controller.enqueue(encoder.encode(": keepalive\n\n")), 15_000);
      try {
        await run(send);
      } catch (error) {
        send("error", { code: "STREAM_FAILED", message: publicStreamErrorMessage(error), retryable: true });
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}

function publicStreamErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "请求失败";
  if (error instanceof SyntaxError || /JSON|unexpected token|expected property|minus sign|parse/i.test(message)) {
    return "AI 返回内容格式异常，当前学习位置已保留，请重试这一步。";
  }
  const internalMarkers = ["节点 ", "知识选择", "课程目录", "原题引导", "字段 ", "evidence", "selected.", "JSON", "直接前置"];
  if (internalMarkers.some((marker) => message.toLowerCase().includes(marker.toLowerCase()))) {
    return "AI 返回的知识关系没有通过可靠性检查，请重试。";
  }
  return message;
}
