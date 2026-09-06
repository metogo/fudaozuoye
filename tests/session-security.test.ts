import { afterEach, describe, expect, it, vi } from "vitest";
import { postConsent } from "@/lib/learning/http/consent";
import { postSimilarCheck } from "@/lib/learning/http/similar";
import { postVerify as verifyRoute } from "@/lib/learning/http/verify";
import { analyzeMock, recognizeMock, transferCheckMock } from "@/lib/learning/mock-engine";
import { CONSENT_COOKIE, consentRateIdentity, createConsentValue, hasValidConsent, openSession, sealSession, toClientState } from "@/lib/learning/server-state";
import { assertRateLimit, assertSameOrigin } from "@/lib/learning/request-guards";
import { ServiceError } from "@/lib/learning/errors";

describe("无状态学习会话边界", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("只允许配置的生产 H5 跨域调用云函数", () => {
    vi.stubEnv("PUBLIC_APP_ORIGIN", "https://study.example.com");
    expect(() => assertSameOrigin(new Request("https://api.example.com/api/consent", { headers: { Origin: "https://study.example.com" } }))).not.toThrow();
    expect(() => assertSameOrigin(new Request("https://api.example.com/api/consent", { headers: { Origin: "https://attacker.example.com" } }))).toThrow("请求来源不合法");
  });

  it("监护人同意与模型状态在同一次启动请求返回", async () => {
    vi.stubEnv("AI_MOCK_MODE", "true");
    const response = await postConsent(new Request("http://localhost/api/consent", { method: "POST" }));
    const data = await response.json() as { accepted?: boolean; providers?: Array<{ id: string; available: boolean }>; reasoningLevels?: Array<{ id: string; label: string; available: boolean }> };
    expect(response.status).toBe(200);
    expect(data.accepted).toBe(true);
    expect(data.providers?.some((provider) => provider.id === "doubao" && provider.available)).toBe(true);
    expect(data.reasoningLevels?.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "light", label: "轻度" },
      { id: "medium", label: "中" },
      { id: "high", label: "高" },
    ]);
  });

  it("不向浏览器下发标准答案，且令牌被修改后无法使用", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const state = toClientState(session);
    expect(state.session.nodes.every((node) => node.check.answer === "")).toBe(true);
    expect(openSession(state.stateToken).nodes.some((node) => node.check.answer.length > 0)).toBe(true);
    const parts = state.stateToken.split(".");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    expect(() => openSession(parts.join("."))).toThrow(/损坏|修改/);
  });

  it("拒绝会话中的互动选项与真实题目不一致", () => {
    const session = analyzeMock(recognizeMock("physics", "junior"), "doubao");
    const current = session.nodes.find((node) => node.kind === "concept" && node.check.type === "choice")!;
    const forged = {
      ...session,
      flow: {
        ...session.flow,
        activeGate: {
          id: "forged-choice-gate",
          kind: "node_answer" as const,
          title: "请选择",
          prompt: current.check.prompt,
          nodeId: current.id,
          answerChoices: ["非法甲", "非法乙"],
        },
      },
    };

    expect(() => openSession(sealSession(forged))).toThrow(/损坏|修改/);
  });

  it("恢复已看过完整讲解的旧会话时移除重复入口", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    const legacy = {
      ...session,
      flow: {
        ...session.flow,
        stage: "original_attempt" as const,
        viewedSolution: true,
        activeGate: {
          id: "legacy-original-answer",
          kind: "original_answer" as const,
          title: "现在独立完成原题",
          prompt: root.check.prompt,
          nodeId: root.id,
          options: [{ id: "full_solution" as const, label: "看完整讲解", emphasis: "quiet" as const }],
        },
      },
    };
    delete (legacy.flow as { solutionRecallPassed?: boolean }).solutionRecallPassed;

    const restored = openSession(sealSession(legacy as typeof session));
    expect(restored.flow.solutionRecallPassed).toBe(false);
    expect(restored.flow.activeGate?.options).toBeUndefined();
  });

  it("拒绝伪造关键步骤已通过但从未看过完整讲解的状态", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const forged = { ...session, flow: { ...session.flow, solutionRecallPassed: true, viewedSolution: false } };
    expect(() => openSession(sealSession(forged))).toThrow(/损坏|修改/);
  });

  it("拒绝关键步骤完成态仍携带其他互动任务", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const forged = { ...session, flow: { ...session.flow, stage: "reviewed_complete" as const, viewedSolution: true, solutionRecallPassed: true, activeGate: { id: "forged-gate", kind: "understanding" as const, title: "不应存在的任务" } } };
    expect(() => openSession(sealSession(forged))).toThrow(/损坏|修改/);
  });

  it("拒绝绕过当前节点直接验收原题", async () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const request = jsonRequest({ stateToken: sealSession(session), nodeId: session.rootNodeId, answer: "300", source: "system" });
    const response = await verifyRoute(request);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("只能验收当前学习节点");
  });

  it("拒绝空迁移答案", async () => {
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const session = { ...base, stage: "transfer_check" as const, originalPassed: true, currentNodeId: null, transferCheck: transferCheckMock("math", "primary") };
    const response = await verifyRoute(jsonRequest({ stateToken: sealSession(session), nodeId: "__transfer__", answer: "" }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("迁移验收状态不合法");
  });

  it("换相似题后使用新题的受保护答案继续验收", async () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const current = session.nodes.find((node) => node.id === session.currentNodeId)!;
    const response = await postSimilarCheck(jsonRequest({ stateToken: sealSession(session), nodeId: current.id }));
    const body = await response.text();
    const state = sseEvent<{ session: typeof session; stateToken: string }>(body, "graph");
    const clientCheck = state.session.nodes.find((node) => node.id === current.id)!.check;
    const protectedCheck = openSession(state.stateToken).nodes.find((node) => node.id === current.id)!.check;
    expect(clientCheck.id).toMatch(/^similar-/);
    expect(clientCheck.conceptId).toBe(current.conceptId);
    expect(clientCheck.prompt).not.toBe(current.check.prompt);
    expect(clientCheck.answer).toBe("");
    expect(protectedCheck.answer).not.toBe("");
  });

  it("原子点第一次表示不会只切换讲法，第二次客观检查失败才需真人介入", async () => {
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const current = base.nodes.find((node) => node.kind === "concept")!;
    const session = {
      ...base,
      stage: "learning" as const,
      currentNodeId: current.id,
      nodes: base.nodes.map((node) => node.id === current.id ? { ...node, atomic: true } : node),
    };

    const first = await verifyRoute(jsonRequest({ stateToken: sealSession(session), nodeId: current.id, action: "mark_unknown", source: "system" }));
    expect(first.status).toBe(200);
    const firstData = await first.json() as { data: { session: typeof session; stateToken: string } };
    const afterFirst = firstData.data.session.nodes.find((node) => node.id === current.id)!;
    expect(afterFirst.state).toBe("unknown");
    expect(afterFirst.attempts).toBe(1);

    const second = await verifyRoute(jsonRequest({ stateToken: firstData.data.stateToken, nodeId: current.id, answer: "错误答案", source: "system" }));
    expect(second.status).toBe(200);
    const secondData = await second.json() as { data: { session: typeof session } };
    const afterSecond = secondData.data.session.nodes.find((node) => node.id === current.id)!;
    expect(afterSecond.state).toBe("needs_help");
    expect(secondData.data.session.stage).toBe("needs_help");
  });

  it("允许监护人确认可验收的知识点，但不会把该入口用于原题", async () => {
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const current = base.nodes.find((node) => node.id === base.currentNodeId)!;
    const session = {
      ...base,
      stage: "learning" as const,
      currentNodeId: current.id,
      nodes: base.nodes.map((node) => node.id === current.id ? { ...node, state: "learning" as const } : node),
    };
    const response = await verifyRoute(jsonRequest({ stateToken: sealSession(session), nodeId: current.id, source: "parent" }));
    expect(response.status).toBe(200);
    const data = await response.json() as { data: { session: typeof session; assessment: { state: string; passed: boolean } } };
    expect(data.data.assessment).toMatchObject({ passed: true, state: "parent_confirmed" });
    expect(data.data.session.nodes.find((node) => node.id === current.id)?.attempts).toBe(current.attempts);

    const original = {
      ...session,
      stage: "original_check" as const,
      currentNodeId: session.rootNodeId,
      nodes: session.nodes.map((node) => node.kind === "concept" ? { ...node, state: "mastered" as const } : node),
    };
    const denied = await verifyRoute(jsonRequest({ stateToken: sealSession(original), nodeId: original.rootNodeId, source: "parent" }));
    expect(denied.status).toBe(400);
    expect(await denied.text()).toContain("原题必须由学生独立完成");
  });

  it("原题与迁移题的通过和未通过都会回写到同一份受保护会话", async () => {
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = base.nodes.find((node) => node.id === base.rootNodeId)!;
    const ready = {
      ...base,
      stage: "original_check" as const,
      currentNodeId: root.id,
      nodes: base.nodes.map((node) => node.kind === "concept" ? { ...node, state: "mastered" as const } : node),
    };
    const original = await verifyRoute(jsonRequest({ stateToken: sealSession(ready), nodeId: root.id, answer: root.check.answer, source: "system" }));
    expect(original.status).toBe(200);
    const originalData = await original.json() as { data: { stateToken: string; session: typeof ready } };
    expect(originalData.data.session).toMatchObject({ stage: "transfer_check", originalPassed: true, currentNodeId: null });

    const transfer = transferCheckMock("math", "primary");
    const withTransfer = { ...openSession(originalData.data.stateToken), transferCheck: transfer };
    const failed = await verifyRoute(jsonRequest({ stateToken: sealSession(withTransfer), nodeId: "__transfer__", answer: "错误答案" }));
    expect(failed.status).toBe(200);
    const failedData = await failed.json() as { data: { stateToken: string; session: typeof withTransfer } };
    expect(failedData.data.session).toMatchObject({ stage: "transfer_check", transferPassed: false });

    const passed = await verifyRoute(jsonRequest({ stateToken: failedData.data.stateToken, nodeId: "__transfer__", answer: transfer.answer }));
    expect(passed.status).toBe(200);
    expect((await passed.json()) as { data: { session: { stage: string; transferPassed: boolean } } }).toMatchObject({ data: { session: { stage: "complete", transferPassed: true } } });
  });

  it("同一网络下的监护人同意凭证具有独立限流身份", () => {
    const first = createConsentValue();
    const second = createConsentValue();
    const firstRequest = consentRequest(first);
    const secondRequest = consentRequest(second);
    expect(first).not.toBe(second);
    expect(hasValidConsent(firstRequest)).toBe(true);
    expect(hasValidConsent(secondRequest)).toBe(true);
    expect(consentRateIdentity(firstRequest)).not.toBe(consentRateIdentity(secondRequest));
  });

  it("限流是可重试的暂时错误，不会被当成板书内容失效", () => {
    const request = new Request("http://localhost/api/learning/board-cache");
    const identity = `board-cache-${crypto.randomUUID()}`;
    assertRateLimit(request, 1, identity);
    try {
      assertRateLimit(request, 1, identity);
      throw new Error("预期触发限流");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect(error).toMatchObject({ status: 429, code: "RATE_LIMITED", retryable: true });
    }
  });
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/learning/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function sseEvent<T>(body: string, eventName: string): T {
  const block = body.split("\n\n").find((item) => item.includes(`event: ${eventName}`));
  if (!block) throw new Error(`缺少 SSE 事件：${eventName}`);
  const raw = block.match(/^data: (.+)$/m)?.[1];
  if (!raw) throw new Error(`SSE 事件缺少数据：${eventName}`);
  return JSON.parse(raw) as T;
}

function consentRequest(value: string): Request {
  return new Request("http://localhost/api/learning/analyze", { headers: { Cookie: `${CONSENT_COOKIE}=${value}` } });
}
