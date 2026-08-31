import { describe, expect, it } from "vitest";
import { readSseResponse } from "@/lib/learning/client-sse";

describe("浏览器 SSE 消费", () => {
  it("同一个网络分片里的正文事件也逐个等待页面绘制", async () => {
    const body = [
      'event: message.delta\ndata: {"text":"第一段"}',
      'event: message.delta\ndata: {"text":"第二段"}',
      'event: complete\ndata: {}',
      "",
    ].join("\n\n");
    const response = new Response(body, { status: 200 });
    const order: string[] = [];
    let activeHandlers = 0;
    let maximumConcurrentHandlers = 0;

    await readSseResponse(response, async (event, data) => {
      activeHandlers += 1;
      maximumConcurrentHandlers = Math.max(maximumConcurrentHandlers, activeHandlers);
      order.push(`${event}:start`);
      await Promise.resolve();
      order.push(`${event}:${String((data as { text?: string }).text ?? "done")}`);
      activeHandlers -= 1;
    });

    expect(maximumConcurrentHandlers).toBe(1);
    expect(order).toEqual([
      "message.delta:start",
      "message.delta:第一段",
      "message.delta:start",
      "message.delta:第二段",
      "complete:start",
      "complete:done",
    ]);
  });

  it("连接没有 complete 事件时仍明确报错", async () => {
    const response = new Response('event: message.delta\ndata: {"text":"残缺"}\n\n', { status: 200 });
    await expect(readSseResponse(response, () => undefined)).rejects.toThrow("流式连接意外中断");
  });
});
