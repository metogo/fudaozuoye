import { describe, expect, it, vi } from "vitest";
import { readSseResponse } from "@/lib/learning/client-sse";

describe("浏览器 SSE 消费", () => {
  it("跨字节分片的中文、CRLF、多行 data 均不丢失，完成后无需等网关关闭", async () => {
    const cancel = vi.fn();
    const bytes = new TextEncoder().encode(': heartbeat\r\n\r\nevent:message.delta\r\ndata: {\r\ndata: "text":"面积与力"}\r\n\r\nevent: complete\r\ndata: {}\r\n\r\n');
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); }, cancel });
    const events: unknown[] = [];
    await readSseResponse(new Response(stream), (event, data) => { events.push([event, data]); });
    expect(events).toEqual([["message.delta", { text: "面积与力" }], ["complete", {}]]);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it.each(["malformed", "handler", "error"])("%s 失败也取消连接并释放锁", async failure => {
    const cancel = vi.fn();
    const frame = failure === "malformed" ? 'event: message.delta\ndata: {bad}\n\n' : failure === "error" ? 'event: error\ndata: {"message":"失败"}\n\n' : 'event: message.delta\ndata: {"text":"正文"}\n\n';
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(frame)); }, cancel });
    await expect(readSseResponse(new Response(stream), () => { throw new Error("handler"); })).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false);
  });

  it("同一分片中完成后的异常事件明确失败", async () => {
    await expect(readSseResponse(new Response('event: complete\ndata: {}\n\nevent: message.delta\ndata: {"text":"重复"}\n\n'), () => {})).rejects.toThrow("重复内容");
  });
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

  it("错误信封、纯文本失败和服务端 error 事件都给出可读错误", async () => {
    await expect(readSseResponse(new Response(JSON.stringify({ error: { message: "模型繁忙" } }), { status: 503 }), () => undefined)).rejects.toThrow("模型繁忙");
    await expect(readSseResponse(new Response("网关暂不可用", { status: 502 }), () => undefined)).rejects.toThrow("网关暂不可用");
    await expect(readSseResponse(new Response('event: error\ndata: {"message":"本次失败"}\n\n', { status: 200 }), () => undefined)).rejects.toThrow("本次失败");
  });

  it("跨网络分片拼合事件，忽略没有完整 event/data 的空块", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: message.delta\ndata: {"text":"跨'));
        controller.enqueue(encoder.encode('片"}\n\n\n\nevent: complete\ndata: {}'));
        controller.enqueue(encoder.encode('\n\n'));
        controller.close();
      },
    });
    const events: string[] = [];
    await readSseResponse(new Response(stream, { status: 200 }), (event, data) => { events.push(`${event}:${String((data as { text?: string }).text ?? "")}`); });
    expect(events).toEqual(["message.delta:跨片", "complete:"]);
  });
});
