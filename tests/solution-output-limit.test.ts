import { describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/lib/learning/errors";
import { LiveProviderAdapter } from "@/lib/learning/providers/adapter";
import { chatBody, chatToolBody, emitProviderDelta, responsesBody, solutionSystemPrompt } from "@/lib/learning/providers/model-support";
import { generateValidatedSolution, streamValidatedSolution } from "@/lib/learning/providers/solution";
import type { ProblemSnapshot } from "@/lib/learning/types";

const problem: ProblemSnapshot = { text: "计算 1+1。", childWork: "", subject: "math", gradeBand: "primary", confidence: 1, userRevised: false };
const complete = [
  "### 解题思路", "把两个数表示的数量合在一起，再检查每个数是否都已使用。这里先确认运算符号是加号，所以要把两份数量相加。",
  "### 分步推导", "1. 先拿出一个物体，它表示第一个加数 1。再拿出另一个物体，它表示第二个加数 1；两份数量都来自题目的条件。",
  "2. 把两份物体放到一起，从第一个开始依次数，数到第二个结束，所以合起来有两个。这说明算式 $1+1=2$ 成立。",
  "### 结论", "最终结果是 2，可以分别数一遍合并前后的物体进行核对。",
  "### 易错提醒", "不要漏掉第二份，也不要把同一个物体重复数两遍；每个加数都需要在计算中使用一次。",
].join("\n\n");
const limitError = () => new ServiceError("输出长度限制", 502, "PROVIDER_OUTPUT_LIMIT", true);

describe("完整讲解按需输出", () => {
  it("null 仅显式省略额度，普通请求与工具请求保持原额度", () => {
    expect(chatBody("m", "s", "p")).toHaveProperty("max_tokens", 3000);
    expect(chatBody("m", "s", "p", undefined, false, false, 500)).toHaveProperty("max_tokens", 500);
    expect(chatBody("m", "s", "p", undefined, false, false, null)).not.toHaveProperty("max_tokens");
    expect(chatToolBody("m", "s", "p", { function: { name: "submit" } })).toHaveProperty("max_tokens", 3000);
    expect(responsesBody("m", "s", "p", undefined, 500)).toHaveProperty("max_output_tokens", 500);
    expect(responsesBody("m", "s", "p", undefined, null)).not.toHaveProperty("max_output_tokens");
    expect(solutionSystemPrompt("primary")).not.toMatch(/600|1000/);
  });

  it.each(["chat-completions", "responses"] as const)("%s 截断后携带完整前文续写，不清空或重播", async (protocol) => {
    const split = complete.indexOf("1+1=2") + 3;
    const prefix = complete.slice(0, split);
    const suffix = complete.slice(split);
    const requests: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      const first = requests.length === 1;
      const content = first ? prefix : suffix;
      const events = protocol === "chat-completions"
        ? [{ choices: [{ delta: { content }, finish_reason: first ? "length" : "stop" }] }]
        : [{ type: "response.output_text.delta", delta: content }, first
          ? { type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }
          : { type: "response.completed" }];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
    };
    const reset = vi.fn();
    const deltas: string[] = [];
    await new LiveProviderAdapter({ id: "doubao", label: "test", apiKey: "test-key", modelId: "test", baseUrl: "https://provider.invalid", protocol, mock: false }, fetcher)
      .streamSolution(problem, (text) => deltas.push(text), reset);
    expect(deltas).toEqual([prefix, suffix]);
    expect(deltas.join("")).toBe(complete);
    expect(reset).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);
    for (const body of requests) {
      expect(body).not.toHaveProperty("max_tokens");
      expect(body).not.toHaveProperty("max_output_tokens");
    }
    const body = requests[1];
    const rawPrompt = protocol === "responses"
      ? (body.input as Array<{ content: Array<{ text: string }> }>)[0].content[0].text
      : (body.messages as Array<{ content: Array<{ text: string }> }>)[1].content[0].text;
    expect(JSON.parse(rawPrompt)).toMatchObject({ originalPrompt: JSON.stringify(problem), previousDraft: prefix });
  });

  it.each(["content_filter", "other", undefined])("Responses 非额度 incomplete（%s）不误报长度截断", (reason) => {
    const line = `data: ${JSON.stringify({ type: "response.incomplete", response: { incomplete_details: { reason } } })}`;
    expect(() => emitProviderDelta(line, "responses", () => undefined)).toThrow(expect.objectContaining({ code: "PROVIDER_INCOMPLETE" }));
  });

  it.each([
    new ServiceError("提供方拒绝", 502, "PROVIDER_ERROR", true),
    new ServiceError("没有完整结束", 502, "PROVIDER_INCOMPLETE", true),
    new DOMException("已取消", "AbortError"),
  ])("非额度错误或用户取消不触发续写", async (error) => {
    const request = vi.fn(async (_system, _prompt, emit) => { emit(complete); throw error; });
    await expect(generateValidatedSolution(problem, request)).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("无正文的额度截断直接失败", async () => {
    const request = vi.fn(async () => { throw limitError(); });
    await expect(generateValidatedSolution(problem, request)).rejects.toMatchObject({ code: "PROVIDER_OUTPUT_LIMIT" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    limitError(),
    new ServiceError("模型流式输出等待超时", 504, "PROVIDER_TIMEOUT", true),
    new ServiceError("模型讲解传输未完整结束", 502, "PROVIDER_ERROR", true),
    new DOMException("已取消", "AbortError"),
  ])("续写即使结构完整，二次截断、传输失败和取消仍不能假成功", async (error) => {
    let calls = 0;
    const request = vi.fn(async (_system, _prompt, emit) => {
      emit(calls++ === 0 ? complete.slice(0, 100) : complete.slice(100));
      throw calls === 1 ? limitError() : error;
    });
    await expect(generateValidatedSolution(problem, request)).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("累计安全长度涵盖首次输出和续写，超限片段不展示", async () => {
    let calls = 0;
    const emit = vi.fn();
    await expect(streamValidatedSolution(problem, async (_system, _prompt, delta) => {
      delta("字".repeat(calls++ === 0 ? 40_000 : 20_001));
      throw limitError();
    }, emit, vi.fn())).rejects.toThrow("安全长度");
    expect(calls).toBe(2);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("累计超限会关闭续写上游连接", async () => {
    const signals: AbortSignal[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      signals.push(init!.signal as AbortSignal);
      const first = signals.length === 1;
      const event = { choices: [{ delta: { content: "字".repeat(first ? 40_000 : 20_001) }, finish_reason: first ? "length" : "stop" }] };
      return new Response(`data: ${JSON.stringify(event)}\n\n`);
    };
    const adapter = new LiveProviderAdapter({ id: "doubao", label: "test", apiKey: "test-key", modelId: "test", baseUrl: "https://provider.invalid", protocol: "chat-completions", mock: false }, fetcher);
    await expect(adapter.streamSolution(problem, () => undefined, () => undefined)).rejects.toThrow("安全长度");
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("续写前文不在 14000 字处裁剪", async () => {
    const prefix = `${"条件依据。".repeat(4000)}\n`;
    let calls = 0;
    await generateValidatedSolution(problem, async (_system, prompt, emit, maxTokens) => {
      expect(maxTokens).toBeNull();
      if (calls++ === 0) { emit(prefix); throw limitError(); }
      expect(JSON.parse(prompt).previousDraft).toBe(prefix);
      emit(complete);
    });
    expect(calls).toBe(2);
  });

  it("续写后仍验收小问覆盖与公式闭合，修复失败不可交付", async () => {
    let calls = 0;
    const multiQuestion = { ...problem, text: "（1）计算 1+1。\n（2）计算 2+2。" };
    await expect(generateValidatedSolution(multiQuestion, async (_system, prompt, emit) => {
      calls += 1;
      if (calls === 1) { emit(complete.slice(0, 100)); throw limitError(); }
      if (calls === 2) { emit(`${complete.slice(100)}\n$x`); return; }
      expect(JSON.parse(prompt).validationIssues).toContain("小问");
      emit(complete);
    })).rejects.toThrow("小问");
    expect(calls).toBe(3);
  });
});
