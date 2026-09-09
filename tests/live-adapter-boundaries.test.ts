import { describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/lib/learning/errors";
import { LiveProviderAdapter } from "@/lib/learning/providers/adapter";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import type { ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";
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
    const bodies: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return bodies.length === 1
        ? chat("{\"ok\":true}")
        : new Response(JSON.stringify({ output_text: "{\"ok\":true}" }), { status: 200 });
    };
    const chatAdapter = new LiveProviderAdapter(config(), fetcher);
    await expect(chatAdapter["textRequest"]("system", "prompt", "data:image/png;base64,AA==", true)).resolves.toBe("{\"ok\":true}");
    const responseAdapter = new LiveProviderAdapter(config("responses"), fetcher);
    await expect(responseAdapter["textRequest"]("system", "prompt", undefined, true)).resolves.toBe("{\"ok\":true}");
    expect(bodies[0]).toHaveProperty("messages.1.content.0", { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } });
    expect(bodies[0].response_format).toEqual({ type: "json_object" });
    expect(bodies[1]).toMatchObject({ store: false, instructions: "system" });
  });

  it("普通 JSON 校验失败时只修复一次，并允许调用方做受控恢复", async () => {
    const fetcher: typeof fetch = vi.fn()
      .mockResolvedValueOnce(chat("{\"value\":0}"))
      .mockResolvedValueOnce(chat("{\"value\":2}"));
    const adapter = new LiveProviderAdapter(config(), fetcher);
    const parse = (value: { value?: number }) => {
      if (value.value !== 1) throw new Error("value 必须为 1");
      return value.value;
    };
    await expect(adapter["validatedJsonRequest"]("system", "prompt", parse, undefined, (value: { value?: number }) => value.value)).resolves.toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetcher).mock.calls[1][1]?.body)).toContain("上一次输出未通过校验");
  });

  it("结构函数输出坏掉时会先调用同一函数修复，无法调用函数则回退到 JSON", async () => {
    const directRepair: typeof fetch = vi.fn()
      .mockResolvedValueOnce(tool("{\"value\":0}"))
      .mockResolvedValueOnce(tool("{\"value\":1}"));
    const adapter = new LiveProviderAdapter(config(), directRepair);
    const parse = (value: { value?: number }) => {
      if (value.value !== 1) throw new Error("需要 1");
      return value.value;
    };
    await expect(adapter["validatedStructuredRequest"]("system", "prompt", { function: { name: "submit", parameters: { type: "object" } } }, parse)).resolves.toBe(1);
    expect(directRepair).toHaveBeenCalledTimes(2);

    const fallback: typeof fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }))
      .mockResolvedValueOnce(chat("{\"value\":1}"));
    const fallbackAdapter = new LiveProviderAdapter(config(), fallback);
    await expect(fallbackAdapter["validatedStructuredRequest"]("system", "prompt", { function: { name: "submit", parameters: { type: "object" } } }, parse)).resolves.toBe(1);
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fallback).mock.calls[1][1]?.body)).toContain("结构函数输出未通过校验");
  });

  it("HTTP 拒绝与主动取消都会保持可辨识的失败语义", async () => {
    const rejected = new LiveProviderAdapter(config(), async () => new Response("busy", { status: 400 }));
    await expect(rejected["textRequest"]("system", "prompt")).rejects.toMatchObject({ code: "PROVIDER_ERROR", status: 502 });

    let seenSignal: AbortSignal | undefined;
    const waiting: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      seenSignal = init?.signal as AbortSignal;
      seenSignal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
    });
    const adapter = new LiveProviderAdapter(config(), waiting);
    const pending = adapter["textRequest"]("system", "prompt");
    await vi.waitFor(() => expect(seenSignal).toBeDefined());
    adapter.cancelPendingRequests();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each([
    ["chat-completions", 'data: {"choices":[{"delta":{"content":"第一段"}}]}\n\ndata: {"choices":[{"delta":{"content":"第二段"},"finish_reason":"stop"}]}\n\n'],
    ["responses", 'data: {"type":"response.output_text.delta","delta":"第一段"}\n\ndata: {"type":"response.output_text.delta","delta":"第二段"}\n\ndata: {"type":"response.completed"}\n\n'],
  ] as const)("%s 流式请求按片段输出并需要终止事件", async (protocol, stream) => {
    const adapter = new LiveProviderAdapter(config(protocol), async () => new Response(stream, { status: 200 }));
    const chunks: string[] = [];
    await adapter["streamTextRequest"]("system", "prompt", (part: string) => chunks.push(part));
    expect(chunks.join("")).toBe("第一段第二段");
  });

  it("流式响应没有正文或没有结束标记不会被当成成功", async () => {
    const empty = new LiveProviderAdapter(config(), async () => new Response('data: [DONE]\n\n', { status: 200 }));
    await expect(empty["streamTextRequest"]("system", "prompt", () => undefined)).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    const incomplete = new LiveProviderAdapter(config(), async () => new Response('data: {"choices":[{"delta":{"content":"有内容"}}]}\n\n', { status: 200 }));
    await expect(incomplete["streamTextRequest"]("system", "prompt", () => undefined)).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("供应商超时错误仍保留给上层的可重试标识", () => {
    const error = new ServiceError("模型响应超时", 504, "PROVIDER_TIMEOUT", true);
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(504);
  });

  it("图谱详情、手写转写与板书决策均走同一受控请求边界", async () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const map: ProblemKnowledgeMap = {
      version: 1,
      rootId: "core",
      nodes: [{ id: "core", title: "单位量", summary: "", application: "", evidence: session.problem.text.slice(0, 8) }],
      edges: [],
    };
    const responses: typeof fetch = vi.fn()
      .mockResolvedValueOnce(chat(JSON.stringify({ summary: "单位量表示每一份的数量。", application: "这道题先用总量除以份数。" })))
      .mockResolvedValueOnce(chat(JSON.stringify({ text: "180÷3=60", confidence: 0.94 })))
      .mockResolvedValueOnce(tool(JSON.stringify({ recommended: true, reason: "多个数量关系需要按步骤对应展示。", layout: "steps" })));
    const adapter = new LiveProviderAdapter(config(), responses);
    await expect(adapter.generateKnowledgeDetail!(session, map, "core")).resolves.toMatchObject({ summary: "单位量表示每一份的数量。" });
    await expect(adapter.transcribeStudentAnswer("data:image/png;base64,AA==", "写出单位量")).resolves.toEqual({ text: "180÷3=60", confidence: 0.94 });
    await expect(adapter.decideBoardPresentation(session, { kind: "problem" })).resolves.toEqual({ recommended: true, reason: "多个数量关系需要按步骤对应展示。", layout: "steps" });
    await expect(adapter.generateKnowledgeDetail!(session, map, "missing")).rejects.toThrow("知识点不存在");
  });

  it("在发起模型请求前先处理可确定的答案、无效目标与取消信号", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const adapter = new LiveProviderAdapter(config(), fetcher);
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const concept = session.nodes.find((node) => node.kind === "concept");
    expect(concept).toBeDefined();

    const deterministic = { id: "check", conceptId: "c", type: "short_text" as const, prompt: "写出结果", answer: "42", explanation: "结果为42" };
    await expect(adapter.verifyAnswer(deterministic, "42")).resolves.toMatchObject({ passed: true });
    await expect(adapter.verifyAnswer(deterministic, "41")).resolves.toMatchObject({ passed: false });

    const recall = { id: "solution-recall-step", conceptId: "c", type: "short_text" as const, prompt: "说出操作", answer: "等式两边同时除以3", explanation: "说明具体操作" };
    await expect(adapter.verifyAnswer(recall, "我懂了")).resolves.toMatchObject({ passed: false });
    await expect(adapter.verifyAnswer(recall, "等式两边同时除以3")).resolves.toMatchObject({ passed: true });

    await expect(adapter.generateSimilarCheck(session, "missing-node")).rejects.toThrow("找不到要换题的知识点");
    await expect(adapter.generateTransferCheck({ ...session, nodes: session.nodes.filter((node) => node.kind !== "concept"), edges: [] })).rejects.toThrow("找不到迁移题");
    await expect(adapter.generateBoardLesson(session, { kind: "problem" }, { recommended: false, reason: "无需板书", layout: "steps" })).rejects.toThrow("不需要切换板书");
    const signal = new AbortController();
    signal.abort();
    await expect(adapter.generateIllustrationLesson(session, () => undefined, signal.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("同知识点练习、关键步骤回忆与步骤填空均经由结构校验后返回", async () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const concept = session.nodes.find((node) => node.kind === "concept")!;
    const source = "先把总路程除以时间，得到每小时行驶的路程。";
    const fetcher: typeof fetch = vi.fn()
      .mockResolvedValueOnce(tool(JSON.stringify({
        prompt: "小车2小时行驶80千米，平均每小时行驶多少千米？",
        type: concept.check.type,
        choices: concept.check.type === "choice" ? ["40千米", "80千米", "160千米"] : undefined,
        answer: "40千米",
        explanation: "80除以2，得到每小时40千米。",
      })))
      .mockResolvedValueOnce(chat(JSON.stringify({ matchesConcept: true, distinct: true, reason: "同样先求单位时间的量，题干数据不同。" })))
      .mockResolvedValueOnce(chat(JSON.stringify({
        sourceQuote: "先把总路程除以时间",
        question: "为什么这里先用总路程除以时间？",
        answer: "因为这样能得到每小时的路程。",
        explanation: "说明总量除以对应份数能得到一份的量。",
      })))
      .mockResolvedValueOnce(chat(JSON.stringify({
        sourceId: "step-source-1",
        instruction: "补全先求每小时路程的算式。",
        before: "每小时路程 = 总路程 ÷ ",
        after: "。",
        answer: "时间",
        explanation: "总路程除以时间得到每小时的路程。",
        hint: "想想每一份代表多长时间。",
      })));
    const adapter = new LiveProviderAdapter(config(), fetcher);
    await expect(adapter.generateSimilarCheck(session, concept.id)).resolves.toMatchObject({ answer: "40千米", conceptId: concept.conceptId });
    await expect(adapter.generateSolutionRecallCheck!(session, `${source}\n再用每小时路程完成后续计算。`)).resolves.toMatchObject({ prompt: expect.stringContaining("先把总路程除以时间") });
    await expect(adapter.generateStepExercise!(session, source)).resolves.toMatchObject({ check: { answer: "时间" } });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
