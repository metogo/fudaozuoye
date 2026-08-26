import { describe, expect, it } from "vitest";
import { assertGraphInvariants } from "@/lib/learning/graph";
import { LiveProviderAdapter, MockProviderAdapter } from "@/lib/learning/providers/adapter";
import type { ProviderConfig } from "@/lib/learning/providers/config";
import type { ProviderId } from "@/lib/learning/types";

describe("三模型统一适配器契约", () => {
  it.each(["doubao", "openai", "xai"] as ProviderId[])("%s 使用相同接口且不跨模型", async (provider) => {
    const adapter = new MockProviderAdapter(provider);
    const problem = await adapter.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary");
    const session = await adapter.analyzeProblem(problem);
    expect(session.provider).toBe(provider);
    expect(session.modelId).toBe(`${provider}-demo`);
    expect(() => assertGraphInvariants(session)).not.toThrow();
    const node = session.nodes.find((item) => item.kind === "concept")!;
    const result = await adapter.verifyAnswer(node.check, node.check.answer);
    expect(result.passed).toBe(true);
    const transfer = await adapter.generateTransferCheck(session);
    expect(transfer.prompt.length).toBeGreaterThan(5);
    expect(await adapter.solveProblem(problem)).not.toBe("");
  });
});

describe("真实供应商协议契约", () => {
  it("真实分析使用当前题生成节点内容，不再读取 Mock 固定卡片", async () => {
    const fetcher = analysisFetcher();
    const adapter = new LiveProviderAdapter(liveConfig(), fetcher);
    const problem = { text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "180÷5×3=108", subject: "math" as const, gradeBand: "primary" as const, confidence: 1, userRevised: true };
    const session = await adapter.analyzeProblem(problem);
    const proportional = session.nodes.find((node) => node.conceptId === "math.ratio.proportional")!;
    expect(proportional.diagnosticEvidence).toBe("照这样的速度");
    expect(proportional.diagnosticEvidenceSource).toBe("problem");
    expect(proportional.teaching.explanation).toContain("照这样的速度");
    expect(proportional.check.prompt).toContain("4小时");
    expect(session.edges.find((edge) => edge.from === proportional.id)?.reason).toContain("照这样的速度");
  });

  it("向下展开继续生成题目相关内容并只使用目录声明的直接前置", async () => {
    const multiplication = nodePayload({
      conceptId: "math.arithmetic.multiplication",
      evidence: "照这样的速度",
      simplification: "“照这样的速度”表示每小时路程要重复相加，先理解乘法的意义才能把5个单位量合并。",
      explanation: "题目说“照这样的速度”，乘法的意义在这里是把同一个每小时路程连续取5次。",
      checkPrompt: "每袋有6个球，4袋一共有多少个球？",
      answer: "24个",
      choices: ["24个", "10个", "2个"],
    });
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      if (body.includes("找出孩子独立完成")) return analysisResponse(body);
      if (body.includes("真正缺失的直接前置")) return chatJsonResponse({ selections: [selectionFromNode(multiplication)] });
      if (body.includes("math.arithmetic.multiplication")) return chatJsonResponse(teachingFromNode(multiplication));
      return analysisResponse(body);
    };
    const adapter = new LiveProviderAdapter(liveConfig(), fetcher);
    const problem = { text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "180÷5×3=108", subject: "math" as const, gradeBand: "primary" as const, confidence: 1, userRevised: true };
    const session = await adapter.analyzeProblem(problem);
    const target = session.nodes.find((node) => node.conceptId === "math.ratio.proportional")!;
    const expansion = await adapter.expandNode(session, target.id);
    expect(expansion.nodes.map((node) => node.conceptId)).toEqual(["math.arithmetic.multiplication"]);
    expect(expansion.nodes[0].teaching.explanation).toContain("每小时路程");
    expect(expansion.edges[0].reason).toContain("照这样的速度");
  });

  it("节点无题目依据时只调用同一模型修复一次", async () => {
    let selectionCalls = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      if (body.includes("找出孩子独立完成")) {
        selectionCalls += 1;
        const payload = selectionPayload();
        return chatJsonResponse(selectionCalls === 1
          ? { ...payload, selections: payload.selections.map((node) => ({ ...node, evidence: "并不存在的原文", simplification: "并不存在的原文，所以要先学这个概念。" })) }
          : payload);
      }
      return analysisResponse(body);
    };
    const adapter = new LiveProviderAdapter(liveConfig(), fetcher);
    await adapter.analyzeProblem({ text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "180÷5×3=108", subject: "math", gradeBand: "primary", confidence: 1, userRevised: true });
    expect(selectionCalls).toBe(2);
  });

  it("并行生成的兄弟节点也不能复用同一道检查题", async () => {
    const unitRate = siblingNode("math.rate.unit-rate", "3小时行驶180千米", "单位量", "先用单位量求出每小时路程。", "共同检查题");
    const multiplication = siblingNode("math.arithmetic.multiplication", "180÷5×3=108", "乘法的意义", "乘法的意义能表示相同单位量取多次。", "共同检查题");
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      if (body.includes("找出孩子独立完成")) return chatJsonResponse({
        selections: [selectionFromNode(unitRate), selectionFromNode(multiplication)],
        originalAnswer: "300千米",
        originalExplanation: "180÷3=60，60×5=300。",
      });
      return chatJsonResponse(teachingFromNode(body.includes("math.rate.unit-rate") ? unitRate : multiplication));
    };
    const adapter = new LiveProviderAdapter(liveConfig(), fetcher);
    await expect(adapter.analyzeProblem({ text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "180÷5×3=108", subject: "math", gradeBand: "primary", confidence: 1, userRevised: true })).rejects.toThrow(/重复检查题|重复教学内容|检查题与已有节点重复/);
  });

  it("兄弟节点首轮检查题冲突时只重生成冲突节点", async () => {
    const unitRate = siblingNode("math.rate.unit-rate", "3小时行驶180千米", "单位量", "先用单位量求出每小时路程。", "共同检查题");
    const multiplication = siblingNode("math.arithmetic.multiplication", "180÷5×3=108", "乘法的意义", "乘法的意义能表示相同单位量取多次。", "共同检查题");
    let multiplicationDetails = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      if (body.includes("找出孩子独立完成")) return chatJsonResponse({
        selections: [selectionFromNode(unitRate), selectionFromNode(multiplication)],
        originalAnswer: "300千米",
        originalExplanation: "180÷3=60，60×5=300。",
      });
      if (body.includes("math.rate.unit-rate")) return chatJsonResponse(teachingFromNode(unitRate));
      multiplicationDetails += 1;
      const candidate = multiplicationDetails === 1 ? multiplication : { ...multiplication, check: { ...multiplication.check, prompt: "每盒6支笔，4盒一共多少支？" } };
      return chatJsonResponse(teachingFromNode(candidate));
    };
    const session = await new LiveProviderAdapter(liveConfig(), fetcher).analyzeProblem({ text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "180÷5×3=108", subject: "math", gradeBand: "primary", confidence: 1, userRevised: true });
    expect(session.nodes.filter((node) => node.kind === "concept")).toHaveLength(2);
    expect(multiplicationDetails).toBe(2);
  });

  it("第二阶段不能覆盖第一阶段锁定的概念和证据", async () => {
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      if (body.includes("找出孩子独立完成")) return chatJsonResponse(selectionPayload());
      return chatJsonResponse({
        ...teachingFromNode(analysisPayload().nodes[0]),
        conceptId: "math.ratio.proportional",
        evidence: "伪造证据",
        simplification: "伪造证据要求先学加法的意义。",
      });
    };
    const adapter = new LiveProviderAdapter(liveConfig(), fetcher);
    const session = await adapter.analyzeProblem({ text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "180÷5×3=108", subject: "math", gradeBand: "primary", confidence: 1, userRevised: true });
    expect(session.nodes.some((node) => node.conceptId === "math.ratio.proportional" && node.diagnosticEvidence === "照这样的速度")).toBe(true);
    expect(session.nodes.some((node) => node.diagnosticEvidence === "伪造证据")).toBe(false);
  });

  it("同一概念面对不同原题时生成不同例子和检查题", async () => {
    const run = async (problemText: string, evidence: string, example: string, checkPrompt: string) => {
      const node = siblingNode("math.rate.unit-rate", evidence, "单位量", `单位量要联系当前题：${evidence}。`, checkPrompt);
      node.teaching.example = example;
      const fetcher: typeof fetch = async (_input, init) => String(init?.body).includes("找出孩子独立完成")
        ? chatJsonResponse({ selections: [selectionFromNode(node)], originalAnswer: "答案", originalExplanation: "可核验解法。" })
        : chatJsonResponse(teachingFromNode(node));
      const session = await new LiveProviderAdapter(liveConfig(), fetcher).analyzeProblem({ text: problemText, childWork: "不会", subject: "math", gradeBand: "primary", confidence: 1, userRevised: true });
      return session.nodes.find((item) => item.conceptId === "math.rate.unit-rate")!;
    };
    const speed = await run("小车2小时行驶80千米，每小时多少千米？", "2小时行驶80千米", "把80千米平均分到2小时。", "6小时行驶180千米，每小时多少千米？");
    const price = await run("4支笔共12元，每支笔多少元？", "4支笔共12元", "把12元平均分给4支笔。", "5本本子共20元，每本多少元？");
    expect(speed.teaching.example).not.toBe(price.teaching.example);
    expect(speed.check.prompt).not.toBe(price.check.prompt);
    expect(speed.teaching.explanation).toContain("2小时行驶80千米");
    expect(price.teaching.explanation).toContain("4支笔共12元");
  });

  it.each([
    ["doubao", "chat-completions"],
    ["openai", "responses"],
    ["xai", "responses"],
  ] as const)("%s 图片识别请求符合 %s 协议且禁用服务端留存", async (id, protocol) => {
    let requestBody: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const content = JSON.stringify({ recognized: true, failureReason: "", text: "解方程 x+1=2", childWork: "x=1", subject: "math", gradeBand: "junior", confidence: 0.98 });
      return new Response(JSON.stringify(protocol === "responses" ? { output_text: content } : { choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const config: ProviderConfig = { id, label: id, apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol, mock: false };
    const adapter = new LiveProviderAdapter(config, fetcher);
    const problem = await adapter.recognizeProblem("data:image/jpeg;base64,AA==", "math", "junior");
    expect(problem.text).toContain("x+1");
    expect(requestBody?.model).toBe("test-model");
    if (protocol === "responses") expect(requestBody?.store).toBe(false);
    else {
      expect(requestBody?.stream).toBe(false);
      expect(requestBody?.response_format).toEqual({ type: "json_object" });
      expect(requestBody?.thinking).toEqual({ type: "disabled" });
    }
  });

  it("无关或不可读照片必须拒绝，不能编造题目", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      const content = JSON.stringify({ recognized: false, failureReason: "画面中只有天花板", text: "", childWork: "", subject: "math", gradeBand: "primary", confidence: 0 });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const config: ProviderConfig = { id: "doubao", label: "豆包", apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol: "chat-completions", mock: false };
    await expect(new LiveProviderAdapter(config, fetcher).recognizeProblem("data:image/jpeg;base64,AA==", "math", "primary")).rejects.toThrow("没有识别到清晰完整的一道题");
    expect(calls).toBe(1);
  });

  it("置信度低于门槛时拒绝进入知识路径", async () => {
    const fetcher: typeof fetch = async () => {
      const content = JSON.stringify({ recognized: true, failureReason: "", text: "疑似题干", childWork: "", subject: "math", gradeBand: "primary", confidence: 0.31 });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const config: ProviderConfig = { id: "doubao", label: "豆包", apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol: "chat-completions", mock: false };
    await expect(new LiveProviderAdapter(config, fetcher).recognizeProblem("data:image/jpeg;base64,AA==", "math", "primary")).rejects.toThrow("置信度过低");
  });

  it.each([
    ["doubao", "chat-completions", 'data: {"choices":[{"delta":{"content":"第一步"}}]}\n\ndata: [DONE]\n\n'],
    ["openai", "responses", 'data: {"type":"response.output_text.delta","delta":"第一步"}\n\ndata: [DONE]\n\n'],
  ] as const)("%s 的自由文本使用上游 SSE", async (id, protocol, streamBody) => {
    let requestedStream = false;
    const fetcher: typeof fetch = async (_input, init) => {
      requestedStream = (JSON.parse(String(init?.body)) as { stream?: boolean }).stream === true;
      return new Response(streamBody, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    };
    const config: ProviderConfig = { id, label: id, apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol, mock: false };
    const adapter = new LiveProviderAdapter(config, fetcher);
    let output = "";
    await adapter.streamSolution({ text: "1+1=?", childWork: "", subject: "math", gradeBand: "primary", confidence: 1, userRevised: false }, (delta) => { output += delta; });
    expect(requestedStream).toBe(true);
    expect(output).toBe("第一步");
  });

  it("结构合法但缺字段时只调用同一模型修复一次", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      const argumentsText = calls === 1
        ? JSON.stringify({ question: "字段名错误" })
        : JSON.stringify({ prompt: "每小时60千米，2小时多少千米？", answer: "120千米", explanation: "仍考查单位量。" });
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_transfer_check", arguments: argumentsText } }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const config: ProviderConfig = { id: "doubao", label: "豆包", apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol: "chat-completions", mock: false };
    const adapter = new LiveProviderAdapter(config, fetcher);
    const problem = await new MockProviderAdapter("doubao").recognizeProblem("data:image/jpeg;base64,demo", "math", "primary");
    const session = await new MockProviderAdapter("doubao").analyzeProblem(problem);
    const check = await adapter.generateTransferCheck(session);
    expect(calls).toBe(2);
    expect(check.answer).toBe("120千米");
  });

  it("豆包迁移题使用必填字段函数约束", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const argumentsText = JSON.stringify({ prompt: "新的迁移题", answer: "答案", explanation: "依据" });
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_transfer_check", arguments: argumentsText } }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const config: ProviderConfig = { id: "doubao", label: "豆包", apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol: "chat-completions", mock: false };
    const problem = await new MockProviderAdapter("doubao").recognizeProblem("data:image/jpeg;base64,demo", "math", "primary");
    const session = await new MockProviderAdapter("doubao").analyzeProblem(problem);
    await new LiveProviderAdapter(config, fetcher).generateTransferCheck(session);
    const tools = requestBody?.tools as Array<{ function?: { parameters?: { required?: string[] } } }>;
    expect(tools[0]?.function?.parameters?.required).toEqual(["prompt", "answer", "explanation"]);
    expect(requestBody?.tool_choice).toEqual({ type: "function", function: { name: "submit_transfer_check" } });
  });
});

function liveConfig(): ProviderConfig {
  return { id: "doubao", label: "豆包", apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol: "chat-completions", mock: false };
}

function chatJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function analysisPayload() {
  return {
    nodes: [
      nodePayload({
        conceptId: "math.ratio.proportional",
        evidence: "照这样的速度",
        simplification: "题目说“照这样的速度”，说明速度不变，要用正比例关系从1小时推到5小时。",
        explanation: "题目说“照这样的速度”，正比例关系表示时间变成原来的几倍，路程也随相同倍数变化。",
        checkPrompt: "每小时走30千米，4小时走多少千米？",
        answer: "120千米",
        choices: ["120千米", "34千米", "7.5千米"],
      }),
    ],
    originalAnswer: "300千米",
    originalExplanation: "180÷3=60千米/小时，60×5=300千米。",
  };
}

function selectionPayload() {
  const payload = analysisPayload();
  return {
    selections: payload.nodes.map(selectionFromNode),
    originalAnswer: payload.originalAnswer,
    originalExplanation: payload.originalExplanation,
  };
}

function selectionFromNode(node: { conceptId: string; evidence: string; simplification: string }) {
  return { conceptId: node.conceptId, evidence: node.evidence, simplification: node.simplification };
}

function teachingFromNode(node: { conceptId: string; teaching: unknown; check: unknown }) {
  return { conceptId: node.conceptId, evidenceSource: "problem", teaching: node.teaching, check: node.check };
}

function analysisFetcher(): typeof fetch {
  return async (_input, init) => analysisResponse(String(init?.body));
}

function analysisResponse(body: string): Response {
  if (body.includes("找出孩子独立完成")) return chatJsonResponse(selectionPayload());
  const nodes = analysisPayload().nodes;
  const node = nodes[0];
  return chatJsonResponse({ result: teachingFromNode(node) });
}

function nodePayload(input: { conceptId: string; evidence: string; simplification: string; explanation: string; checkPrompt: string; answer: string; choices: string[] }) {
  return {
    conceptId: input.conceptId,
    evidence: input.evidence,
    simplification: input.simplification,
    teaching: {
      explanation: input.explanation,
      example: `换成更小的数理解：${input.checkPrompt}`,
      parentPrompt: `这里为什么需要${input.conceptId.includes("unit-rate") ? "先求每小时" : "保持同一关系"}？`,
      expectedSignal: "孩子能说清数量关系，并独立写出对应算式。",
      misconception: "只看到数字就相乘，不能说明每个数代表的量。",
      alternateExplanation: "用相同长度的小线段画出每一份，再数清总共有几份。",
    },
    check: {
      prompt: input.checkPrompt,
      type: "choice",
      choices: input.choices,
      answer: input.answer,
      explanation: `答案正确且能解释${conceptTitle(input.conceptId)}，才说明掌握。`,
    },
  };
}

function conceptTitle(conceptId: string) {
  if (conceptId === "math.ratio.proportional") return "正比例关系";
  if (conceptId === "math.arithmetic.multiplication") return "乘法的意义";
  return "当前概念";
}

function siblingNode(conceptId: string, evidence: string, title: string, explanation: string, checkPrompt: string) {
  return {
    conceptId,
    evidence,
    simplification: `题目中的“${evidence}”需要先理解${title}，才能继续完成当前关系。`,
    teaching: {
      explanation: `题目中的“${evidence}”说明这里要用${title}；${explanation}`,
      example: `${title}的更小数字例子，先只处理一个关系。`,
      parentPrompt: `这里为什么需要${title}？`,
      expectedSignal: "孩子能说清数量关系并写出对应算式。",
      misconception: "只看到数字就运算，却说不出数量关系。",
      alternateExplanation: `用线段图重新解释${title}。`,
    },
    check: {
      prompt: checkPrompt,
      type: "short_text",
      answer: "24",
      explanation: `这道题只验收${title}，能说明运算关系才算掌握。`,
    },
  };
}
