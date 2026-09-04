import { afterEach, describe, expect, it, vi } from "vitest";
import { assertGraphInvariants } from "@/lib/learning/graph";
import { LiveProviderAdapter, MockProviderAdapter } from "@/lib/learning/providers/adapter";
import { parseProblemGuide } from "@/lib/learning/providers/blueprint";
import { getProviderConfig, listReasoningAvailability, type ProviderConfig } from "@/lib/learning/providers/config";
import { assertConfirmedVisualFactsPreserved, parseAuditedProblemSolution } from "@/lib/learning/providers/problem-image-analysis";
import { parseProblem, parseProblemSolution, problemEvidenceSources } from "@/lib/learning/providers/provider-validation";
import type { ProviderId } from "@/lib/learning/types";

describe("三模型统一适配器契约", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("三档推理强度使用各自的豆包模型 ID", () => {
    vi.stubEnv("AI_MOCK_MODE", "false");
    vi.stubEnv("DOUBAO_API_KEY", "test-key");
    vi.stubEnv("DOUBAO_MODEL_ID", "light-model");
    vi.stubEnv("DOUBAO_MODEL_ID_MEDIUM", "medium-model");
    vi.stubEnv("DOUBAO_MODEL_ID_HIGH", "high-model");

    expect(getProviderConfig("doubao", "light").modelId).toBe("light-model");
    expect(getProviderConfig("doubao", "medium").modelId).toBe("medium-model");
    expect(getProviderConfig("doubao", "high").modelId).toBe("high-model");
    expect(listReasoningAvailability()).toEqual([
      { id: "light", label: "轻度", available: true },
      { id: "medium", label: "中", available: true },
      { id: "high", label: "高", available: true },
    ]);
  });

  it("未配置的推理强度不会被伪装成可用", () => {
    vi.stubEnv("AI_MOCK_MODE", "false");
    vi.stubEnv("DOUBAO_API_KEY", "test-key");
    vi.stubEnv("DOUBAO_MODEL_ID", "light-model");
    vi.stubEnv("DOUBAO_MODEL_ID_MEDIUM", "");
    vi.stubEnv("DOUBAO_MODEL_ID_HIGH", "");

    expect(listReasoningAvailability().map(({ id, available }) => ({ id, available }))).toEqual([
      { id: "light", available: true },
      { id: "medium", available: false },
      { id: "high", available: false },
    ]);
  });

  it("推理强度会写入会话并在后续轮次保持不变", async () => {
    const adapter = new MockProviderAdapter("doubao", "high");
    const session = await adapter.analyzeProblem(await adapter.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    expect(session.reasoningLevel).toBe("high");
  });

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
    const similar = await adapter.generateSimilarCheck(session, node.id);
    expect(similar.conceptId).toBe(node.conceptId);
    expect(similar.prompt).not.toBe(node.check.prompt);
    const transfer = await adapter.generateTransferCheck(session);
    expect(transfer.prompt.length).toBeGreaterThan(5);
    expect(await adapter.solveProblem(problem)).not.toBe("");
  });

  it("实时模型只返回与当前讲解绑定且不索要答案的猜你想问", async () => {
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "physics", "junior"));
    const fetcher: typeof fetch = async () => chatJsonResponse({ recommended: true, questions: ["为什么这个条件会决定第一步？", "直接告诉我最终答案", "如果少了这个条件会怎样？"] });
    const suggestions = await new LiveProviderAdapter(liveConfig(), fetcher).suggestQuestions(session, { kind: "problem", section: "keyClue" }, "先抓住焦距和物距的关系，再判断成像区间。");
    expect(suggestions.map((item) => item.text)).toEqual(["为什么这个条件会决定第一步？", "如果少了这个条件会怎样？"]);
    expect(suggestions.every((item) => item.scopeLabel === "关键线索")).toBe(true);
    expect(suggestions.every((item) => item.sourceSummary.includes("焦距"))).toBe(true);
  });
});

describe("原题引导答案防泄露", () => {
  const guide = {
    goal: "求出平均分组后每组分到的数量。",
    keyClue: "题干给出“48盒彩笔平均分给6个小组”。",
    approach: "先想平均分要用哪种运算，再说出算式。",
    firstQuestion: "你觉得这里求每份应该用哪种运算？",
  };

  it("不会把 48 盒中的 8 盒误判为答案", () => {
    expect(() => parseProblemGuide(guide, "48盒彩笔平均分给6个小组，每组分到多少盒？", [], "8盒", "48÷6=8。")).not.toThrow();
  });

  it("完整答案出现在引导中时改为安全的第一步", () => {
    const parsed = parseProblemGuide({ ...guide, approach: "直接计算后可知每组是8盒彩笔。" }, "48盒彩笔平均分给6个小组，每组分到多少盒？", [], "8盒", "48÷6=8。");
    expect(parsed.approach).not.toContain("8盒");
    expect(parsed.approach).toContain("第一步");
  });

  it("单个数字答案出现在引导中也会被拦截", () => {
    const parsed = parseProblemGuide({ ...guide, approach: "先完成求导并代入后，可知导数就是0。" }, "函数f(x)=x³-3x在x=1处的导数是多少？", [], "0", "先求导再代入x=1。");
    expect(parsed.approach).not.toContain("0");
    expect(parsed.approach).toContain("第一步");
  });

  it("中文数字形式的答案也不会混入首讲", () => {
    const parsed = parseProblemGuide({ ...guide, approach: "平均分完成后，每组会得到八盒彩笔。" }, "48盒彩笔平均分给6个小组，每组分到多少盒？", [], "8盒", "48÷6=8。");
    expect(parsed.approach).not.toContain("八盒");
    expect(parsed.approach).toContain("第一步");
  });

  it("模型没有逐字落到题干时改用题干中的可核验条件", () => {
    const parsed = parseProblemGuide({ ...guide, keyClue: "先找最重要的条件，再决定方法。" }, "解方程：3(x-2)=18。", [], "8", "两边同除以3后求解。");
    expect(parsed.keyClue).toContain("3(x-2)=18");
  });
});

describe("原题答案结构兼容", () => {
  it("接受模型常见的 answer/explanation 字段", () => {
    expect(parseProblemSolution({ answer: "8盒", explanation: "48÷6=8。" })).toEqual({ originalAnswer: "8盒", originalExplanation: "48÷6=8。" });
    expect(parseProblemSolution({ output: { correctAnswer: "酸性", reasoning: ["pH 小于 7", "因此呈酸性"] } })).toEqual({ originalAnswer: "酸性", originalExplanation: "pH 小于 7；因此呈酸性" });
  });

  it("不接受没有解题依据的空结果", () => {
    expect(() => parseProblemSolution({ answer: "8盒" })).toThrow("缺少原题标准答案或解题依据");
  });
});

describe("真实供应商协议契约", () => {
  it("首讲准备只请求模型一次，同时得到核验答案与安全引导", async () => {
    let calls = 0;
    let requestBody = "";
    const fetcher: typeof fetch = async (_input, init) => {
      calls += 1;
      requestBody = String(init?.body);
      const output = {
        originalAnswer: "300千米",
        originalExplanation: "先用180÷3求每小时路程，再乘5得到总路程。",
      };
      return new Response(JSON.stringify({
        choices: [{ message: { tool_calls: [{ function: { name: "submit_problem_solution", arguments: JSON.stringify(output) } }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const problem = { text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "", subject: "math" as const, gradeBand: "primary" as const, confidence: 1, userRevised: true };
    const adapter = new LiveProviderAdapter(liveConfig(), fetcher);
    const pending = await adapter.prepareChatSession(problem);
    expect(calls).toBe(0);
    const session = await adapter.completeChatSession(pending);

    expect(calls).toBe(1);
    expect(requestBody).toContain("submit_problem_solution");
    expect(session.nodes.find((node) => node.kind === "problem")?.check.answer).toBe("300千米");
    expect(session.problemGuide.approach).not.toContain("300千米");
  });

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
    expect(session.problemGuide.keyClue).toContain("3小时行驶180千米");
  });

  it("实时追问只携带当前题目与节点上下文并使用模型流", async () => {
    let requestBody = "";
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body);
      return new Response('data: {"choices":[{"delta":{"content":"先看题干里的已知条件。"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { "Content-Type": "text/event-stream" } });
    };
    const session = await new MockProviderAdapter("doubao").analyzeProblem(await new MockProviderAdapter("doubao").recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    const node = session.nodes.find((item) => item.kind === "concept")!;
    let reply = "";
    await new LiveProviderAdapter(liveConfig(), fetcher).streamTutorReply(session, { kind: "node", nodeId: node.id }, "这一步为什么这样做？", (delta) => { reply += delta; });
    const parsed = JSON.parse(requestBody) as { stream?: boolean; thinking?: unknown };
    expect(parsed.stream).toBe(true);
    expect(parsed.thinking).toEqual({ type: "disabled" });
    expect(requestBody).toContain(session.problem.text);
    expect(requestBody).toContain(node.title);
    expect(requestBody).not.toContain(`\\"answer\\":\\"${session.nodes.find((item) => item.kind === "problem")?.check.answer}`);
    expect(reply).toBe("先看题干里的已知条件。");
  });

  it("后续上传的学生草图不会被误当成原题照片", async () => {
    let requestBody = "";
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body);
      return new Response('data: {"choices":[{"delta":{"content":"先看你刚上传的草图。"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { "Content-Type": "text/event-stream" } });
    };
    const mock = new MockProviderAdapter("doubao");
    const original = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    const session = { ...original, problem: { ...original.problem, visualContext: { related: true, affectsSolving: true, summary: "题图", confidence: 1, facts: [{ text: "图中标有12米", source: "printed_label" as const, confidence: 1 }] } } };
    await new LiveProviderAdapter(liveConfig(), fetcher).streamTutorReply(session, { kind: "problem" }, "看我的草图", () => undefined, undefined, "data:image/png;base64,AA==", "student");
    expect(requestBody).toContain("当前作答或草图");
    expect(requestBody).not.toContain("附图是当前原题照片");
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
      if (body.includes("找出学生独立完成")) return analysisResponse(body);
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
      if (body.includes("找出学生独立完成")) {
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

  it("原题引导夹带生成用语时清理元话语且保留题干依据", async () => {
    let selectionCalls = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      if (body.includes("找出学生独立完成") || body.includes("上一次输出未通过校验")) {
        selectionCalls += 1;
        const payload = selectionPayload();
        return chatJsonResponse(selectionCalls === 1
          ? { ...payload, problemGuide: { ...problemGuidePayload(), keyClue: "逐字引用题干关键条件：照这样的速度说明汽车保持相同速度。" } }
          : payload);
      }
      return analysisResponse(body);
    };
    const session = await new LiveProviderAdapter(liveConfig(), fetcher).analyzeProblem({ text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "180÷5×3=108", subject: "math", gradeBand: "primary", confidence: 1, userRevised: true });
    expect(selectionCalls).toBe(1);
    expect(session.problemGuide.keyClue).not.toContain("逐字引用");
    expect(session.problemGuide.keyClue).toContain("照这样的速度");
  });

  it("原题引导提前泄露最终答案时直接改为安全引导", async () => {
    let selectionCalls = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      if (body.includes("找出学生独立完成") || body.includes("上一次输出未通过校验")) {
        selectionCalls += 1;
        const payload = selectionPayload();
        return chatJsonResponse(selectionCalls === 1
          ? { ...payload, problemGuide: { ...problemGuidePayload(), approach: "先算每小时60千米，再乘5，最终答案是300千米。" } }
          : payload);
      }
      return analysisResponse(body);
    };
    const session = await new LiveProviderAdapter(liveConfig(), fetcher).analyzeProblem({ text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "不会", subject: "math", gradeBand: "primary", confidence: 1, userRevised: true });
    expect(selectionCalls).toBe(1);
    expect(session.problemGuide.approach).not.toContain("300千米");
  });

  it("知识节点理由夹带生成用语时清理元话语且保留证据", async () => {
    let selectionCalls = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      if (body.includes("找出学生独立完成") || body.includes("上一次输出未通过校验")) {
        selectionCalls += 1;
        const payload = selectionPayload();
        return chatJsonResponse(selectionCalls === 1
          ? { ...payload, selections: payload.selections.map((node) => ({ ...node, simplification: `引用上述题干内容，“${node.evidence}”说明要先学这个概念。` })) }
          : payload);
      }
      return analysisResponse(body);
    };
    const session = await new LiveProviderAdapter(liveConfig(), fetcher).analyzeProblem({ text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "180÷5×3=108", subject: "math", gradeBand: "primary", confidence: 1, userRevised: true });
    expect(selectionCalls).toBe(1);
    expect(session.nodes.find((node) => node.kind === "concept")?.simplification).not.toContain("引用上述");
    expect(session.nodes.find((node) => node.kind === "concept")?.simplification).toContain("照这样的速度");
  });

  it("同模型修复后仍漏写原文时只补齐已验证证据，不放过伪造证据", async () => {
    let selectionCalls = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      if (body.includes("找出学生独立完成")) {
        selectionCalls += 1;
        const payload = selectionPayload();
        return chatJsonResponse({
          ...payload,
          selections: payload.selections.map((node) => ({ ...node, simplification: "先掌握正比例关系，才能继续理解这一步。" })),
        });
      }
      return analysisResponse(body);
    };
    const adapter = new LiveProviderAdapter(liveConfig(), fetcher);
    const problem = { text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", childWork: "不会", subject: "math" as const, gradeBand: "primary" as const, confidence: 1, userRevised: true };
    const session = await adapter.analyzeProblem(problem);
    const reason = session.nodes.find((node) => node.kind === "concept")?.simplification ?? "";
    expect(selectionCalls).toBe(2);
    expect(reason).toContain("照这样的速度");
    expect(reason).toContain("正比例关系");
  });

  it("并行生成的兄弟节点也不能复用同一道检查题", async () => {
    const unitRate = siblingNode("math.rate.unit-rate", "3小时行驶180千米", "单位量", "先用单位量求出每小时路程。", "共同检查题");
    const multiplication = siblingNode("math.arithmetic.multiplication", "180÷5×3=108", "乘法的意义", "乘法的意义能表示相同单位量取多次。", "共同检查题");
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      if (body.includes("找出学生独立完成")) return chatJsonResponse({
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
      if (body.includes("找出学生独立完成")) return chatJsonResponse({
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
      if (body.includes("找出学生独立完成")) return chatJsonResponse(selectionPayload());
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
      const fetcher: typeof fetch = async (_input, init) => String(init?.body).includes("找出学生独立完成")
        ? chatJsonResponse({ selections: [selectionFromNode(node)], originalAnswer: "答案", originalExplanation: "可核验解法。", problemGuide: problemGuidePayload(evidence) })
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
      const content = JSON.stringify({ recognized: true, failureReason: "", text: "解方程 x+1=2", childWork: "x=1", subject: "math", gradeBand: "junior", confidence: 0.98, visualContext: { related: false, affectsSolving: false, summary: "", facts: [], confidence: 0.99 } });
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

  it("会把属于当前题目的配图条件保留为后续可信证据", () => {
    const problem = parseProblem({
      recognized: true,
      failureReason: "",
      text: "如图，一块正方形草地两侧铺路，求长方形周长。",
      childWork: "",
      subject: "math",
      gradeBand: "primary",
      confidence: 0.98,
      visualContext: {
        related: true,
        affectsSolving: true,
        summary: "正方形草地位于长方形右侧，另外两侧为道路。",
        confidence: 0.97,
        facts: [
          { text: "长方形横向总长标为15米", source: "printed_label", confidence: 0.99 },
          { text: "正方形草地边长标为12米", source: "printed_label", confidence: 0.99 },
          { text: "道路位于正方形草地的左侧和下侧", source: "visual_relation", confidence: 0.96 },
        ],
      },
    });
    expect(problem.visualContext?.affectsSolving).toBe(true);
    expect(problemEvidenceSources(problem).map((item) => item.text)).toContain("正方形草地边长标为12米");
  });

  it("接受模型返回的自然学段名称", () => {
    const problem = parseProblem({
      recognized: true,
      failureReason: "",
      text: "计算长方形周长。",
      childWork: "",
      subject: "mathematics",
      gradeBand: "小学三年级",
      confidence: 0.98,
      visualContext: { related: false, affectsSolving: false, summary: "", facts: [], confidence: 0.99 },
    });
    expect(problem.subject).toBe("math");
    expect(problem.gradeBand).toBe("primary");
  });

  it("题图影响求解却没有可核验条件时拒绝继续", () => {
    expect(() => parseProblem({
      recognized: true,
      failureReason: "",
      text: "如图，求阴影部分面积。",
      childWork: "",
      subject: "math",
      gradeBand: "primary",
      confidence: 0.95,
      visualContext: { related: true, affectsSolving: true, summary: "存在一个图形", facts: [], confidence: 0.9 },
    })).toThrow("没有识别出可核验条件");
  });

  it("二次复核允许把说明性插图判为相关但不影响求解", () => {
    const audited = parseAuditedProblemSolution({
      originalAnswer: "中心思想是珍惜时间。",
      originalExplanation: "根据文章中的人物行为与结尾点题句概括。",
      visualContext: { related: true, affectsSolving: false, summary: "课文情境插图", facts: [], confidence: 0.96 },
    });
    expect(audited.visualContext.related).toBe(true);
    expect(audited.visualContext.affectsSolving).toBe(false);
  });

  it("二次复核不接受未经人工确认的低置信度图中条件", () => {
    expect(() => parseAuditedProblemSolution({
      originalAnswer: "54米",
      originalExplanation: "根据图中尺寸计算。",
      visualContext: { related: true, affectsSolving: true, summary: "尺寸模糊", facts: [{ text: "长度疑似为12米", source: "printed_label", confidence: 0.4 }], confidence: 0.7 },
    })).toThrow("关键条件仍不清楚");
  });

  it("首次识别已确认题图是解题必要条件时，二次复核不得降成普通插图", () => {
    expect(() => parseAuditedProblemSolution({
      originalAnswer: "54米",
      originalExplanation: "根据图中尺寸计算。",
      visualContext: { related: true, affectsSolving: false, summary: "普通插图", facts: [], confidence: 0.99 },
    }, true, true)).toThrow("丢失了当前题目必需的题图条件");
  });

  it("未经人工确认的首次视觉判断允许由原图二次复核纠正", () => {
    const audited = parseAuditedProblemSolution({
      originalAnswer: "按题干作答",
      originalExplanation: "右侧图片属于邻题，不参与当前题求解。",
      visualContext: { related: false, affectsSolving: false, summary: "", facts: [], confidence: 0.99 },
    }, true, false);
    expect(audited.visualContext.related).toBe(false);
  });

  it("用户确认的题图事实必须在二次复核中逐条保留", () => {
    const problem = {
      text: "如图求周长。", childWork: "", subject: "math" as const, gradeBand: "primary" as const, confidence: 1, userRevised: true,
      visualContext: { related: true, affectsSolving: true, summary: "", confidence: 1, facts: [{ text: "15米标注线从外框左边界到正方形右边界", source: "printed_label" as const, confidence: 1 }] },
    };
    expect(() => assertConfirmedVisualFactsPreserved(problem, {
      related: true, affectsSolving: true, summary: "", confidence: 1,
      facts: [{ text: "整块长方形总长为15米", source: "printed_label", confidence: 1 }],
    })).toThrow("与已确认的图中条件不一致");
  });

  it("用户确认后的二次复核不能在原事实之外追加条件", () => {
    const problem = {
      text: "如图求周长。", childWork: "", subject: "math" as const, gradeBand: "primary" as const, confidence: 1, userRevised: true,
      visualContext: { related: true, affectsSolving: true, summary: "", confidence: 1, facts: [{ text: "正方形边长为12米", source: "printed_label" as const, confidence: 1 }] },
    };
    expect(() => assertConfirmedVisualFactsPreserved(problem, {
      related: true, affectsSolving: true, summary: "", confidence: 1,
      facts: [
        { text: "正方形边长为12米", source: "printed_label", confidence: 1 },
        { text: "整块长方形总长为17米", source: "printed_label", confidence: 1 },
      ],
    })).toThrow("与已确认的图中条件不一致");
  });

  it.each([
    ["doubao", "chat-completions"],
    ["openai", "responses"],
  ] as const)("%s 首次标准答案生成会让原题图片参与 %s 多模态分析", async (id, protocol) => {
    let requestBody: Record<string, unknown> = {};
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const content = JSON.stringify({
        originalAnswer: "长方形周长为54米",
        originalExplanation: "联合图中15米和12米可知另一边也是12米，周长为(15+12)×2。",
        visualContext: {
          related: true,
          affectsSolving: true,
          summary: "题图给出长方形与正方形的尺寸对应关系",
          confidence: 0.99,
          facts: [
            { text: "整块长方形水平总长为15米", source: "printed_label", confidence: 0.99 },
            { text: "正方形草地边长为12米且其高度等于长方形的宽", source: "visual_relation", confidence: 0.98 },
          ],
        },
      });
      return new Response(JSON.stringify(protocol === "responses" ? { output_text: content } : { choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const mock = new MockProviderAdapter("doubao");
    const base = await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary");
    const problem = { ...base, visualContext: { related: true, affectsSolving: true, summary: "题图包含必要尺寸", confidence: 0.99, facts: [{ text: "总长15米", source: "printed_label" as const, confidence: 0.99 }] } };
    const pending = await mock.prepareChatSession(problem);
    const config: ProviderConfig = { id, label: id, apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol, mock: false };
    await new LiveProviderAdapter(config, fetcher).completeChatSession(pending, "data:image/jpeg;base64,AA==");
    const serialized = JSON.stringify(requestBody);
    expect(serialized).toContain("data:image/jpeg;base64,AA==");
    expect(serialized).toContain("visualContext");
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
      const content = JSON.stringify({ recognized: true, failureReason: "", text: "疑似题干", childWork: "", subject: "math", gradeBand: "primary", confidence: 0.31, visualContext: { related: false, affectsSolving: false, summary: "", facts: [], confidence: 0.9 } });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const config: ProviderConfig = { id: "doubao", label: "豆包", apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol: "chat-completions", mock: false };
    await expect(new LiveProviderAdapter(config, fetcher).recognizeProblem("data:image/jpeg;base64,AA==", "math", "primary")).rejects.toThrow("置信度过低");
  });

  it.each([
    ["doubao", "chat-completions", chatSolutionStream()],
    ["openai", "responses", responsesSolutionStream()],
  ] as const)("%s 的自由文本使用上游 SSE", async (id, protocol, streamBody) => {
    let requestedStream = false;
    let requestBody: Record<string, unknown> = {};
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestedStream = requestBody.stream === true;
      return new Response(streamBody, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    };
    const config: ProviderConfig = { id, label: id, apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol, mock: false };
    const adapter = new LiveProviderAdapter(config, fetcher);
    let output = "";
    await adapter.streamSolution(
      { text: "1+1=?", childWork: "", subject: "math", gradeBand: "primary", confidence: 1, userRevised: false },
      (delta) => { output += delta; },
      () => { output = ""; },
    );
    expect(requestedStream).toBe(true);
    expect(requestBody).not.toHaveProperty("max_output_tokens");
    expect(requestBody).not.toHaveProperty("max_tokens");
    expect(JSON.stringify(protocol === "responses" ? requestBody.instructions : requestBody.messages)).toContain("分步推导");
    expect(output).toContain("### 分步推导");
  });

  it("完整讲解结构不合格时原位重置，并自动带原因流式重写", async () => {
    const requests: string[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      requests.push(String(init?.body ?? ""));
      return new Response(requests.length === 1
        ? 'data: {"choices":[{"delta":{"content":"只有一句答案。"}}]}\n\ndata: [DONE]\n\n'
        : chatSolutionStream(), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    };
    let output = "";
    let resets = 0;
    await new LiveProviderAdapter(liveConfig(), fetcher).streamSolution(
      { text: "1+1=?", childWork: "", subject: "math", gradeBand: "primary", confidence: 1, userRevised: false },
      (delta) => { output += delta; },
      () => { resets += 1; output = ""; },
    );

    expect(requests).toHaveLength(2);
    expect(resets).toBe(1);
    expect(requests[1]).toContain("validationIssues");
    expect(output).not.toContain("只有一句答案");
    expect(output).toContain("### 易错提醒");
  });

  it("完整讲解在上游结束前就转发正文，不等待整篇验收后再回放", async () => {
    const encoder = new TextEncoder();
    let finishStream = () => undefined;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: validSolution } }] })}\n\n`));
        finishStream = () => {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        };
      },
    });
    const fetcher: typeof fetch = async () => new Response(upstream, { headers: { "Content-Type": "text/event-stream" } });
    let output = "";
    let completed = false;
    const pending = new LiveProviderAdapter(liveConfig(), fetcher).streamSolution(
      { text: "1+1=?", childWork: "", subject: "math", gradeBand: "primary", confidence: 1, userRevised: false },
      (delta) => { output += delta; },
      () => { output = ""; },
    ).then(() => { completed = true; });

    await vi.waitFor(() => expect(output).toContain("### 解题思路"));
    expect(completed).toBe(false);
    finishStream();
    await pending;
    expect(completed).toBe(true);
  });

  it("上游因长度限制结束时拒绝把半截讲解当作成功", async () => {
    const fetcher: typeof fetch = async () => new Response('data: {"choices":[{"delta":{"content":"### 解题思路\\n半截内容"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { "Content-Type": "text/event-stream" } });
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).streamSolution({ text: "1+1=?", childWork: "", subject: "math", gradeBand: "primary", confidence: 1, userRevised: false }, () => undefined, () => undefined)).rejects.toThrow("长度限制");
  });

  it("拒绝把非 JSON 的代理错误文案当作模型正文", async () => {
    const fetcher: typeof fetch = async () => new Response("data: upstream temporarily unavailable\n\ndata: [DONE]\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).streamSolution({ text: "1+1=?", childWork: "", subject: "math", gradeBand: "primary", confidence: 1, userRevised: false }, () => undefined, () => undefined)).rejects.toThrow("流式响应格式异常");
  });

  it("上游 SSE 没有任何文本时明确失败而不是假完成", async () => {
    const fetcher: typeof fetch = async () => new Response("data: [DONE]\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
    const session = await new MockProviderAdapter("doubao").analyzeProblem(await new MockProviderAdapter("doubao").recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).streamTutorReply(session, { kind: "problem" }, "第一步看哪里？", () => undefined)).rejects.toThrow("没有返回讲解内容");
  });

  it("每次实时辅导请求都携带结构和教学深度要求", async () => {
    let requestBody = "";
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return new Response('data: {"choices":[{"delta":{"content":"### 先看当前一步\\n\\n**为什么：** 先说明关系。\\n\\n> 你能说出下一步吗？"}}]}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
    };
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    await new LiveProviderAdapter(liveConfig(), fetcher).streamTutorReply(session, { kind: "problem", section: "approach" }, "下一步为什么这样做？", () => undefined);
    expect(requestBody).toContain("系统会在正文前显示当前讲解范围");
    expect(requestBody).toContain("本轮只推进一个动作和一个理由");
    expect(requestBody).toContain("需要举例时，直接换用本题对象和更小的数字");
    expect(requestBody).toContain("只讲当前一步，不公布最终答案");
  });

  it("上游 SSE 有半截文本但没有完成事件时明确失败", async () => {
    const fetcher: typeof fetch = async () => new Response('data: {"choices":[{"delta":{"content":"只返回了半句"}}]}\n\n', { status: 200, headers: { "Content-Type": "text/event-stream" } });
    const session = await new MockProviderAdapter("doubao").analyzeProblem(await new MockProviderAdapter("doubao").recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).streamTutorReply(session, { kind: "problem" }, "第一步看哪里？", () => undefined)).rejects.toThrow("传输未完整结束");
  });

  it("拒绝把上游 SSE 的纯文本数据行当作正常模型正文", async () => {
    const fetcher: typeof fetch = async () => new Response("data: - 先看已知条件\n\ndata: [DONE]\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
    const session = await new MockProviderAdapter("doubao").analyzeProblem(await new MockProviderAdapter("doubao").recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).streamTutorReply(session, { kind: "problem" }, "第一步看哪里？", () => undefined)).rejects.toThrow("流式响应格式异常");
  });

  it("迁移题结构修复一次后还需经过独立审校", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      if (calls === 3) return chatJsonResponse({ sameKnowledgeAndMethod: true, distinct: true, comparableDifficulty: true, grounded: true, reason: "考查方法相同且题面不同。" });
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
    expect(calls).toBe(3);
    expect(check.answer).toBe("120千米");
  });

  it("结构函数连续返回损坏 JSON 时改用同模型严格 JSON", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      if (calls <= 2) return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_transfer_check", arguments: "{损坏" } }] } }] }), { status: 200 });
      return chatJsonResponse({ recommended: true, reason: "多个条件关系需要放在同一视野中梳理。", layout: "relation" });
    };
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    const result = await new LiveProviderAdapter(liveConfig(), fetcher).decideBoardPresentation(session, { kind: "problem", section: "keyClue" });
    expect(result.recommended).toBe(true);
    expect(calls).toBe(3);
  });

  it("豆包迁移题使用必填字段函数约束", async () => {
    let generationBody: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (!requestBody.tools) return chatJsonResponse({ sameKnowledgeAndMethod: true, distinct: true, comparableDifficulty: true, grounded: true, reason: "方法一致且情境不同。" });
      generationBody = requestBody;
      const argumentsText = JSON.stringify({ prompt: "新的迁移题", answer: "答案", explanation: "依据" });
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_transfer_check", arguments: argumentsText } }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const config: ProviderConfig = { id: "doubao", label: "豆包", apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol: "chat-completions", mock: false };
    const problem = await new MockProviderAdapter("doubao").recognizeProblem("data:image/jpeg;base64,demo", "math", "primary");
    const session = await new MockProviderAdapter("doubao").analyzeProblem(problem);
    await new LiveProviderAdapter(config, fetcher).generateTransferCheck(session);
    const tools = generationBody?.tools as Array<{ function?: { parameters?: { required?: string[] } } }>;
    expect(tools[0]?.function?.parameters?.required).toEqual(["prompt", "answer", "explanation"]);
    expect(generationBody?.tool_choice).toEqual({ type: "function", function: { name: "submit_transfer_check" } });
  });

  it("迁移题只匹配局部知识或只是原题换皮时拒绝使用", async () => {
    const fetcher: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (!body.tools) return chatJsonResponse({ sameKnowledgeAndMethod: false, distinct: false, comparableDifficulty: true, grounded: true, reason: "只考查了局部前置概念，而且题面与原题过于接近。" });
      const argumentsText = JSON.stringify({ prompt: "原题只替换一个数字", answer: "答案", explanation: "只用了局部概念。" });
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_transfer_check", arguments: argumentsText } }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).generateTransferCheck(session)).rejects.toThrow("未通过独立审校");
  });

  it("豆包板书判断使用受约束函数而不是自由 JSON", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const argumentsText = JSON.stringify({ recommended: true, reason: "多个图形条件需要放在同一视野里梳理关系。", layout: "relation" });
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "submit_board_decision", arguments: argumentsText } }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "junior"));
    const result = await new LiveProviderAdapter(liveConfig(), fetcher).decideBoardPresentation(session, { kind: "problem", section: "keyClue" });
    const tools = requestBody?.tools as Array<{ function?: { name?: string; parameters?: { required?: string[] } } }>;
    expect(result).toEqual({ recommended: true, reason: "多个图形条件需要放在同一视野里梳理关系。", layout: "relation" });
    expect(tools[0]?.function?.parameters?.required).toEqual(["recommended", "reason", "layout"]);
    expect(requestBody?.tool_choice).toEqual({ type: "function", function: { name: "submit_board_decision" } });
  });

  it("模型板书暂时不可用时仍返回经过本地校验的安全板书", async () => {
    const fetcher: typeof fetch = async () => new Response("unavailable", { status: 503, headers: { "Retry-After": "0" } });
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    const board = await new LiveProviderAdapter(liveConfig(), fetcher).generateBoardLesson(session, { kind: "problem", section: "keyClue" }, { recommended: true, reason: "多个条件关系适合结构化展示。", layout: "relation" });
    expect(board.blocks.length).toBeGreaterThanOrEqual(2);
    expect(board.annotations.length).toBeGreaterThanOrEqual(2);
    expect(board.blocks.map((block) => block.content).join(" ")).not.toContain(session.nodes.find((node) => node.id === session.rootNodeId)?.check.answer);
  });

  it("豆包板书正文使用当前对话和学生学段生成", async () => {
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "junior"));
    session.problem.learnerBand = "primary";
    const bodies: string[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      bodies.push(String(init?.body));
      return new Response("unavailable", { status: 503, headers: { "Retry-After": "0" } });
    };
    const context = [{ id: "assistant-current", role: "assistant" as const, text: "学生卡在总量与每天工作量的联系。" }];
    const board = await new LiveProviderAdapter(liveConfig(), fetcher).generateBoardLesson(session, { kind: "problem", section: "keyClue" }, { recommended: true, reason: "数量关系适合用示意图呈现。", layout: "relation" }, context);
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0]).toContain("学生卡在总量与每天工作量的联系");
    expect(bodies[0]).toContain("当前学生学段：小学");
    const request = JSON.parse(bodies[0]) as { tools: Array<{ function: { parameters: { properties: { blocks: { items: { properties: Record<string, unknown>; required: string[] } } } } } }> };
    expect(request.tools[0].function.parameters.properties.blocks.items.properties).toHaveProperty("sourceMessageIds");
    expect(request.tools[0].function.parameters.properties.blocks.items.required).toContain("sourceMessageIds");
    expect(board.quality?.status).toBe("safe_fallback");
    expect(board.plan?.discipline).toBe("math");
    expect(board.plan?.scenes.length).toBe(board.blocks.length);
  });

  it("板书模型超时会在前端空闲时限前返回安全内容", async () => {
    vi.useFakeTimers();
    const fetcher: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    const pending = new LiveProviderAdapter(liveConfig(), fetcher).generateBoardLesson(session, { kind: "problem" }, { recommended: true, reason: "整理关系。", layout: "steps" });
    const assertion = expect(pending).resolves.toMatchObject({ quality: { status: "safe_fallback" } });
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it("用户取消板书请求时直接中止，不伪装成安全降级", async () => {
    const request = new AbortController();
    const fetcher: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    const pending = new LiveProviderAdapter(liveConfig(), fetcher, "light", request.signal).generateBoardLesson(session, { kind: "problem" }, { recommended: true, reason: "整理关系。", layout: "steps" });
    request.abort();
    await expect(pending).rejects.toThrow(/Aborted/);
  });

  it("小学实时辅导已经完整流出后，不再把文案问题伪装成请求失败", async () => {
    const abstract = "先确认定义域，再做等价变换。";
    const fetcher: typeof fetch = async () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: abstract } }] })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    let visible = "";
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).streamTutorReply(session, { kind: "problem" }, "怎么做？", (text) => { visible += text; })).resolves.toBeUndefined();
    expect(visible).toBe(abstract);
  });

  it("持续发送小片段也不能让流式请求无限占用连接", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setInterval> | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const push = () => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "继续说明。" } }] })}\n\n`));
          push();
          interval = setInterval(push, 20_000);
          init?.signal?.addEventListener("abort", () => { if (interval) clearInterval(interval); controller.error(new DOMException("Aborted", "AbortError")); }, { once: true });
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
    };
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    const pending = new LiveProviderAdapter(liveConfig(), fetcher).streamTutorReply(session, { kind: "problem" }, "怎么做？", () => undefined);
    const assertion = expect(pending).rejects.toThrow("总时长超限");
    await vi.advanceTimersByTimeAsync(180_001);
    await assertion;
  });

  it("异常超长的流式正文达到上限时会中止", async () => {
    const huge = "字".repeat(60_001);
    const fetcher: typeof fetch = async () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: huge } }] })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    const mock = new MockProviderAdapter("doubao");
    const session = await mock.analyzeProblem(await mock.recognizeProblem("data:image/jpeg;base64,demo", "math", "primary"));
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).streamTutorReply(session, { kind: "problem" }, "怎么做？", () => undefined)).rejects.toThrow("超过安全长度");
  });

  it("上游短暂限流时原样重试一次", async () => {
    vi.useRealTimers();
    let attempts = 0;
    const fetcher: typeof fetch = async () => {
      attempts += 1;
      if (attempts === 1) return new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } });
      return chatJsonResponse({ passed: true, explanation: "关系和结果一致。" });
    };
    const check = { id: "semantic", prompt: "判断结论", type: "short_text" as const, answer: "酸性", explanation: "pH 小于 7。" };
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).verifyAnswer(check, "呈酸性")).resolves.toMatchObject({ passed: true });
    expect(attempts).toBe(2);
  });

  it("关键步骤回忆使用过程性评分，不要求学生复述完整参考思路", async () => {
    let requestBody = "";
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body);
      return chatJsonResponse({ passed: true, evidence: "两边同时除以3", explanation: "两边同时除以 3 是正确且可执行的第一步。" });
    };
    const check = {
      id: "solution-recall-root",
      prompt: "第一步可以对等式两边做什么运算？",
      type: "short_text" as const,
      answer: "利用等式基本性质，或先展开括号后逐步化简。",
      explanation: "说出一个可行的关键步骤即可。",
    };

    await expect(new LiveProviderAdapter(liveConfig(), fetcher).verifyAnswer(check, "等式两边同时除以3，得到 x-2=6。"))
      .resolves.toMatchObject({ passed: true });
    expect(requestBody).toContain("key_step_recall");
    expect(requestBody).toContain("不需要复述完整参考思路");
  });

  it.each(["300", "答案A", "懂了"])("关键步骤回忆不接受只有结论或空泛确认：%s", async (answer) => {
    const fetcher = vi.fn<typeof fetch>();
    const check = { id: "solution-recall-root", prompt: "第一步怎么做？", type: "short_text" as const, answer: "完整参考", explanation: "说出具体步骤。" };
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).verifyAnswer(check, answer)).resolves.toMatchObject({ passed: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["把180平均分成3份", "两边同时÷3", "用总路程除时间", "配成2，1，2"])("关键步骤回忆不会用固定动词白名单误杀具体步骤：%s", async (answer) => {
    const fetcher: typeof fetch = async () => chatJsonResponse({ passed: true, evidence: answer, explanation: "这是一个具体且可执行的步骤。" });
    const check = { id: "solution-recall-root", prompt: "说出一个关键步骤", type: "short_text" as const, answer: "完整参考", explanation: "说出具体步骤。" };
    await expect(new LiveProviderAdapter(liveConfig(), fetcher).verifyAnswer(check, answer)).resolves.toMatchObject({ passed: true });
  });

  it("关键步骤回忆直接接受完整讲解中的正确步骤，不再受模型随机误判影响", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const step = "先求出车辆的行驶速度：根据速度等于路程除以时间，用180除以3得到60千米每小时";
    const check = {
      id: "solution-recall-root",
      prompt: "先说出一个关键步骤",
      type: "short_text" as const,
      answer: `当前原题：行程问题\n完整解法依据：${step}\n再乘5得到总路程`,
      explanation: "说出一个具体且正确的步骤。",
    };

    await expect(new LiveProviderAdapter(liveConfig(), fetcher).verifyAnswer(check, step)).resolves.toMatchObject({ passed: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("浏览器中止当前请求后会立即中止对应模型调用", async () => {
    const request = new AbortController();
    const fetcher: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const pending = new LiveProviderAdapter(liveConfig(), fetcher, "light", request.signal).recognizeTextProblem("解方程 2x=4");
    request.abort();
    await expect(pending).rejects.toThrow(/超时|中止|Aborted/);
  });

  it("可选能力超时后会真正取消底层模型调用", async () => {
    let aborted = false;
    const fetcher: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
    const adapter = new LiveProviderAdapter(liveConfig(), fetcher);
    const pending = adapter.recognizeTextProblem("解方程 2x=4");
    adapter.cancelPendingRequests();
    await expect(pending).rejects.toThrow(/超时|中止|Aborted/);
    expect(aborted).toBe(true);
  });

  it("结构化调用被取消后不会再启动文本降级请求", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const adapter = new LiveProviderAdapter(liveConfig(), fetcher);
    const current = await new MockProviderAdapter("doubao").analyzeProblem(await new MockProviderAdapter("doubao").recognizeProblem("data:image/jpeg;base64,demo"));
    const pending = adapter.decideBoardPresentation(current, { kind: "problem", section: "keyClue" });
    adapter.cancelPendingRequests();
    await expect(pending).rejects.toThrow(/超时|中止|Aborted/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

function liveConfig(): ProviderConfig {
  return { id: "doubao", label: "豆包", apiKey: "test-key", modelId: "test-model", baseUrl: "https://provider.invalid", protocol: "chat-completions", mock: false };
}

const validSolution = "### 解题思路\n\n先看题目要求的量与已知条件之间的关系。选择能直接连接它们的方法。这里需要说明为什么这样列式，而不是只写最终答案。\n\n### 分步推导\n\n1. 先整理已知条件，写出它们与待求量之间的关系，并确认每个量的意义和单位。\n2. 再把已知值代入关系式逐步计算，同时检查中间结果是否符合题目条件。\n3. 最后用得到的结果反向代回原关系，确认等式成立且数量级合理。\n\n### 结论\n\n由完整推导可以得到题目要求的结果，并且反向检查与所有已知条件一致。\n\n### 易错提醒\n\n不要跳过决定答案的中间关系；代入前要检查单位和符号，完成后还要反向验算。";

function chatSolutionStream(): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: validSolution } }] })}\n\ndata: [DONE]\n\n`;
}

function responsesSolutionStream(): string {
  return `data: ${JSON.stringify({ type: "response.output_text.delta", delta: validSolution })}\n\ndata: ${JSON.stringify({ type: "response.completed" })}\n\n`;
}

function chatJsonResponse(payload: unknown): Response {
  const normalized = payload && typeof payload === "object" && !Array.isArray(payload) && "originalAnswer" in payload && !("problemGuide" in payload)
    ? { ...payload, problemGuide: problemGuidePayload() }
    : payload;
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(normalized) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function problemGuidePayload(evidence = "3小时行驶180千米") {
  return {
    goal: "这道题要根据不变的速度，求出五小时行驶的总路程。",
    keyClue: `题目中的“${evidence}”说明数量之间要保持同一个关系。`,
    approach: "先求一小时行驶的单位路程，再用相同速度推到五小时，但暂时不计算最终结果。",
    firstQuestion: "三小时一共行驶180千米，怎样先知道一小时行驶多少？",
  };
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
  if (body.includes("找出学生独立完成")) return chatJsonResponse(selectionPayload());
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
      expectedSignal: "学生能说清数量关系，并独立写出对应算式。",
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
      expectedSignal: "学生能说清数量关系并写出对应算式。",
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
