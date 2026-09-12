import { describe, expect, it, vi } from "vitest";
import { LiveProviderAdapter } from "../lib/learning/providers/adapter";
import type { ProviderConfig } from "../lib/learning/providers/config";
import { recognizeMock } from "../lib/learning/mock-engine";

const visual = { related: true, affectsSolving: true, summary: "图中边长", confidence: 1, facts: [{ text: "正方形边长为3厘米", source: "printed_label", confidence: 1 }] };
const answer = { originalAnswer: "12厘米", originalExplanation: "正方形周长为四条等长边之和，3乘4等于12厘米。" };
describe.each(["chat-completions", "responses"] as const)("%s 图文分析流", protocol => {
  const config: ProviderConfig = { id: "doubao", label: "测试", apiKey: "test", modelId: "test", baseUrl: "https://invalid.test", protocol, mock: false };
  function stream(raw: string, terminal = true) {
    const delta = protocol === "responses" ? { type: "response.output_text.delta", delta: raw } : { choices: [{ delta: { content: raw } }] };
    const end = protocol === "responses" ? { type: "response.completed" } : { choices: [{ finish_reason: "stop" }] };
    return new Response(`data: ${JSON.stringify(delta)}\n\n${terminal ? `data: ${JSON.stringify(end)}\n\n` : ""}`, { headers: { "Content-Type": "text/event-stream" } });
  }
  const plain = (value: unknown) => Response.json(protocol === "responses" ? { output_text: JSON.stringify(value) } : { choices: [{ message: { content: JSON.stringify(value) } }] });
  it("同一次请求输出完整证据和完整答案，不额外调用复核模型", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(stream(JSON.stringify({ visualContext: visual, ...answer })));
    const adapter = new LiveProviderAdapter(config, fetcher);
    const pending = await adapter.prepareChatSession(recognizeMock("math", "primary"));
    const emit = vi.fn();
    const result = await adapter.completeChatSession(pending, "data:image/png;base64,test", emit);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(result.nodes[0].check.answer).toBe("12厘米");
    expect(result.requestId).toBe(pending.requestId);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(sent.stream).toBe(true);
    expect(JSON.stringify(sent)).toContain("data:image/png;base64,test");
  });
  it("没有终止事件的流失败，不把提前证据当完成答案", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(stream(JSON.stringify({ visualContext: visual, ...answer }), false));
    const adapter = new LiveProviderAdapter(config, fetcher);
    const pending = await adapter.prepareChatSession(recognizeMock("math", "primary"));
    await expect(adapter.completeChatSession(pending, "data:image/png;base64,test", vi.fn())).rejects.toThrow("未完整结束");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("残缺结构最多修正一次且保留原图，不能改变已经发布的证据", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(stream(JSON.stringify({ visualContext: visual }))).mockResolvedValueOnce(plain({ visualContext: visual, ...answer }));
    const adapter = new LiveProviderAdapter(config, fetcher);
    const pending = await adapter.prepareChatSession(recognizeMock("math", "primary"));
    const emit = vi.fn();
    await expect(adapter.completeChatSession(pending, "data:image/png;base64,test", emit)).resolves.toBeDefined();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][1]?.body)).toContain("data:image/png;base64,test");
  });
  it("前后证据冲突不触发格式修复", async () => {
    const raw = JSON.stringify({ visualContext: visual, ...answer });
    const conflicting = raw.slice(0, -1) + ',"visualContext":' + JSON.stringify({ ...visual, related: false }) + "}";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(stream(conflicting));
    const adapter = new LiveProviderAdapter(config, fetcher);
    const pending = await adapter.prepareChatSession(recognizeMock("math", "primary"));
    await expect(adapter.completeChatSession(pending, "data:image/png;base64,test", vi.fn())).rejects.toThrow("前后不一致");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
