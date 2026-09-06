import { describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/lib/learning/errors";
import { LiveProviderAdapter } from "@/lib/learning/providers/adapter";
import type { ProviderConfig } from "@/lib/learning/providers/config";

const config = (protocol: ProviderConfig["protocol"] = "chat-completions"): ProviderConfig => ({
  id: protocol === "chat-completions" ? "doubao" : "openai",
  label: "test",
  apiKey: "test-key",
  modelId: "test-model",
  baseUrl: "https://provider.invalid",
  protocol,
  mock: false,
});

const chat = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const tool = (argumentsText: string) => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { arguments: argumentsText } }] } }] }), { status: 200 });

describe("实时模型适配器请求边界", () => {
  it("文本请求会按两种协议读取正文、携带图片并清理完成的请求", async () => {
    const bodies: any[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return bodies.length === 1
        ? chat("{\"ok\":true}")
        : new Response(JSON.stringify({ output_text: "{\"ok\":true}" }), { status: 200 });
    };
    const chatAdapter = new LiveProviderAdapter(config(), fetcher) as any;
    await expect(chatAdapter.textRequest("system", "prompt", "data:image/png;base64,AA==", true)).resolves.toBe("{\"ok\":true}");
    const responseAdapter = new LiveProviderAdapter(config("responses"), fetcher) as any;
    await expect(responseAdapter.textRequest("system", "prompt", undefined, true)).resolves.toBe("{\"ok\":true}");
    expect(bodies[0].messages[1].content[0]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } });
    expect(bodies[0].response_format).toEqual({ type: "json_object" });
    expect(bodies[1]).toMatchObject({ store: false, instructions: "system" });
  });

  it("普通 JSON 校验失败时只修复一次，并允许调用方做受控恢复", async () => {
    const fetcher: typeof fetch = vi.fn()
      .mockResolvedValueOnce(chat("{\"value\":0}"))
      .mockResolvedValueOnce(chat("{\"value\":2}"));
    const adapter = new LiveProviderAdapter(config(), fetcher) as any;
    const parse = (value: { value?: number }) => {
      if (value.value !== 1) throw new Error("value 必须为 1");
      return value.value;
    };
    await expect(adapter.validatedJsonRequest("system", "prompt", parse, undefined, (value: { value?: number }) => value.value)).resolves.toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String((fetcher as any).mock.calls[1][1].body)).toContain("上一次输出未通过校验");
  });

  it("结构函数输出坏掉时会先调用同一函数修复，无法调用函数则回退到 JSON", async () => {
    const directRepair: typeof fetch = vi.fn()
      .mockResolvedValueOnce(tool("{\"value\":0}"))
      .mockResolvedValueOnce(tool("{\"value\":1}"));
    const adapter = new LiveProviderAdapter(config(), directRepair) as any;
    const parse = (value: { value?: number }) => {
      if (value.value !== 1) throw new Error("需要 1");
      return value.value;
    };
    await expect(adapter.validatedStructuredRequest("system", "prompt", { function: { name: "submit", parameters: { type: "object" } } }, parse)).resolves.toBe(1);
    expect(directRepair).toHaveBeenCalledTimes(2);

    const fallback: typeof fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }))
      .mockResolvedValueOnce(chat("{\"value\":1}"));
    const fallbackAdapter = new LiveProviderAdapter(config(), fallback) as any;
    await expect(fallbackAdapter.validatedStructuredRequest("system", "prompt", { function: { name: "submit", parameters: { type: "object" } } }, parse)).resolves.toBe(1);
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(String((fallback as any).mock.calls[1][1].body)).toContain("结构函数输出未通过校验");
  });

  it("HTTP 拒绝与主动取消都会保持可辨识的失败语义", async () => {
    const rejected = new LiveProviderAdapter(config(), async () => new Response("busy", { status: 400 })) as any;
    await expect(rejected.textRequest("system", "prompt")).rejects.toMatchObject({ code: "PROVIDER_ERROR", status: 502 });

    let seenSignal: AbortSignal | undefined;
    const waiting: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      seenSignal = init?.signal as AbortSignal;
      seenSignal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
    });
    const adapter = new LiveProviderAdapter(config(), waiting) as any;
    const pending = adapter.textRequest("system", "prompt");
    await vi.waitFor(() => expect(seenSignal).toBeDefined());
    adapter.cancelPendingRequests();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each([
    ["chat-completions", 'data: {"choices":[{"delta":{"content":"第一段"}}]}\n\ndata: {"choices":[{"delta":{"content":"第二段"},"finish_reason":"stop"}]}\n\n'],
    ["responses", 'data: {"type":"response.output_text.delta","delta":"第一段"}\n\ndata: {"type":"response.output_text.delta","delta":"第二段"}\n\ndata: {"type":"response.completed"}\n\n'],
  ] as const)("%s 流式请求按片段输出并需要终止事件", async (protocol, stream) => {
    const adapter = new LiveProviderAdapter(config(protocol), async () => new Response(stream, { status: 200 })) as any;
    const chunks: string[] = [];
    await adapter.streamTextRequest("system", "prompt", (part: string) => chunks.push(part));
    expect(chunks.join("")).toBe("第一段第二段");
  });

  it("流式响应没有正文或没有结束标记不会被当成成功", async () => {
    const empty = new LiveProviderAdapter(config(), async () => new Response('data: [DONE]\n\n', { status: 200 })) as any;
    await expect(empty.streamTextRequest("system", "prompt", () => undefined)).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    const incomplete = new LiveProviderAdapter(config(), async () => new Response('data: {"choices":[{"delta":{"content":"有内容"}}]}\n\n', { status: 200 })) as any;
    await expect(incomplete.streamTextRequest("system", "prompt", () => undefined)).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("供应商超时错误仍保留给上层的可重试标识", () => {
    const error = new ServiceError("模型响应超时", 504, "PROVIDER_TIMEOUT", true);
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(504);
  });
});
